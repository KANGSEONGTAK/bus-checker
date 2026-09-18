// 버스 승차 인원 자동 수집기 (루프 버전)
// 7:30에 실행되어 30분간 매 1분마다 API 호출
// 정류장별 승차 인원을 정확하게 추적

const http = require('http');
const fs = require('fs');
const path = require('path');
const { getHolidayInfo } = require('./holidays');

const SERVICE_KEY = process.env.BUS_API_KEY || '874mgo%2FQ8RDcM%2FhTJn3YI3AEPtV9bXYsuB60MpCxvQBG0ehkCinIQHpp%2BCJhAjzgFUaWVD1l6qXi%2F7P%2FmS5w1Q%3D%3D';

const ROUTES = {
  '1311': {
    routeId: '234001251',
    name: '1311',
    direction: '오산→강남',
    myStationSeq: 16
  },
  '5104': {
    routeId: '223000150',
    name: '5104',
    direction: '오산→서울역',
    myStationSeq: 6
  }
};

const DATA_DIR = path.join(__dirname, 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const STATS_FILE = path.join(DATA_DIR, 'boarding_stats.json');
const TRAVEL_STATS_FILE = path.join(DATA_DIR, 'travel_stats.json');

// 수집 설정 — KST 고정 시간창 (cron 지연 흡수: 일찍 시작하면 대기, 늦으면 남은 시간만)
const POLL_INTERVAL_MS = 60 * 1000;  // 1분 간격
const KST_START_MIN = 6 * 60 + 30;   // 06:30 KST
const KST_END_MIN = 8 * 60 + 30;     // 08:30 KST
function kstMinutes() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function fetchBusLocation(routeId) {
  return new Promise((resolve, reject) => {
    const url = `http://apis.data.go.kr/6410000/buslocationservice/v2/getBusLocationListv2?format=json&serviceKey=${SERVICE_KEY}&routeId=${routeId}`;
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function getTimeInfo() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hour = String(kst.getUTCHours()).padStart(2, '0');
  const minute = String(kst.getUTCMinutes()).padStart(2, '0');
  const dayOfWeek = kst.getUTCDay();
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  return {
    hour,
    minute,
    timeStr: `${hour}:${minute}`,
    dayName: dayNames[dayOfWeek],
    dateStr: `${kst.getUTCFullYear()}-${String(kst.getUTCMonth()+1).padStart(2,'0')}-${String(kst.getUTCDate()).padStart(2,'0')}`,
    timestamp: kst.toISOString()
  };
}

function saveRawSnapshot(routeKey, busData, timeInfo) {
  ensureDir(RAW_DIR);
  const filename = `${routeKey}_${timeInfo.dateStr.replace(/-/g, '')}.jsonl`;
  const filepath = path.join(RAW_DIR, filename);
  const record = {
    timestamp: timeInfo.timestamp,
    time: timeInfo.timeStr,
    hour: timeInfo.hour,
    dayName: timeInfo.dayName,
    buses: busData
  };
  fs.appendFileSync(filepath, JSON.stringify(record) + '\n', 'utf8');
}

function calculateBoarding(routeKey, currentBuses, timeInfo) {
  const stateFile = path.join(DATA_DIR, `state_${routeKey}.json`);
  let prevState = {};
  if (fs.existsSync(stateFile)) {
    try { prevState = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (e) { prevState = {}; }
  }
  
  const boardings = [];
  const travels = []; // 정류장 간 이동시간
  const newState = {};
  
  if (!currentBuses || !currentBuses.busLocationList) {
    return { boardings, travels, newState };
  }
  
  const buses = Array.isArray(currentBuses.busLocationList)
    ? currentBuses.busLocationList
    : [currentBuses.busLocationList];
  
  const currentTime = new Date(timeInfo.timestamp).getTime();
  
  buses.forEach(bus => {
    const vehId = bus.vehId;
    const currentSeq = parseInt(bus.stationSeq);
    const currentSeats = parseInt(bus.remainSeatCnt);
    
    newState[vehId] = {
      stationSeq: currentSeq,
      remainSeatCnt: currentSeats,
      stateCd: parseInt(bus.stateCd),
      timestamp: timeInfo.timestamp
    };
    
    if (prevState[vehId]) {
      const prevSeq = prevState[vehId].stationSeq;
      const prevSeats = prevState[vehId].remainSeatCnt;
      const prevTime = new Date(prevState[vehId].timestamp).getTime();
      
      // 승차 인원 계산
      if (currentSeq > prevSeq && currentSeats >= 0 && prevSeats >= 0) {
        const boarding = prevSeats - currentSeats;
        if (boarding > 0) {
          boardings.push({
            vehId: vehId,
            plateNo: bus.plateNo,
            fromStationSeq: prevSeq,
            toStationSeq: currentSeq,
            prevSeats: prevSeats,
            currentSeats: currentSeats,
            boardingCount: boarding,
            hour: timeInfo.hour,
            dayName: timeInfo.dayName,
            date: timeInfo.dateStr,
            time: timeInfo.timeStr
          });
        }
      }
      
      // 정류장 간 이동시간 계산 (정류장이 변경된 경우)
      if (currentSeq !== prevSeq) {
        const travelTimeMin = Math.round((currentTime - prevTime) / 60000);
        if (travelTimeMin > 0 && travelTimeMin <= 30) { // 30분 이하만 유효
          travels.push({
            vehId: vehId,
            fromStationSeq: prevSeq,
            toStationSeq: currentSeq,
            travelTimeMin: travelTimeMin,
            hour: timeInfo.hour,
            dayName: timeInfo.dayName,
            date: timeInfo.dateStr,
            time: timeInfo.timeStr
          });
        }
      }
    }
  });
  
  return { boardings, travels, newState };
}

function updateStats(routeKey, boardings) {
  ensureDir(DATA_DIR);
  let stats = {};
  if (fs.existsSync(STATS_FILE)) {
    try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); } catch (e) { stats = {}; }
  }
  if (!stats[routeKey]) stats[routeKey] = {};
  
  boardings.forEach(b => {
    const dayKey = b.dayName;
    const hourKey = b.hour;
    const stationKey = `station_${b.fromStationSeq}`;
    
    if (!stats[routeKey][dayKey]) stats[routeKey][dayKey] = {};
    if (!stats[routeKey][dayKey][hourKey]) stats[routeKey][dayKey][hourKey] = {};
    if (!stats[routeKey][dayKey][hourKey][stationKey]) {
      stats[routeKey][dayKey][hourKey][stationKey] = { totalBoarding: 0, count: 0, samples: [] };
    }
    
    const s = stats[routeKey][dayKey][hourKey][stationKey];
    s.totalBoarding += b.boardingCount;
    s.count += 1;
    s.samples.push({ date: b.date, time: b.time, boarding: b.boardingCount, vehId: b.vehId });
    if (s.samples.length > 50) s.samples = s.samples.slice(-50);
  });
  
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8');
}

// 정류장 간 이동시간 통계 업데이트
function updateTravelStats(routeKey, travels) {
  ensureDir(DATA_DIR);
  let stats = {};
  if (fs.existsSync(TRAVEL_STATS_FILE)) {
    try { stats = JSON.parse(fs.readFileSync(TRAVEL_STATS_FILE, 'utf8')); } catch (e) { stats = {}; }
  }
  if (!stats[routeKey]) stats[routeKey] = {};
  
  travels.forEach(t => {
    const dayKey = t.dayName;
    const hourKey = t.hour;
    const segmentKey = `seg_${t.fromStationSeq}_${t.toStationSeq}`;
    
    if (!stats[routeKey][dayKey]) stats[routeKey][dayKey] = {};
    if (!stats[routeKey][dayKey][hourKey]) stats[routeKey][dayKey][hourKey] = {};
    if (!stats[routeKey][dayKey][hourKey][segmentKey]) {
      stats[routeKey][dayKey][hourKey][segmentKey] = { totalTime: 0, count: 0, samples: [] };
    }
    
    const s = stats[routeKey][dayKey][hourKey][segmentKey];
    s.totalTime += t.travelTimeMin;
    s.count += 1;
    s.samples.push({ date: t.date, time: t.time, travelMin: t.travelTimeMin, vehId: t.vehId });
    if (s.samples.length > 50) s.samples = s.samples.slice(-50);
  });
  
  fs.writeFileSync(TRAVEL_STATS_FILE, JSON.stringify(stats, null, 2), 'utf8');
}

function saveState(routeKey, state) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(path.join(DATA_DIR, `state_${routeKey}.json`), JSON.stringify(state, null, 2), 'utf8');
}

// 단일 수집 사이클 (공휴일 전날은 raw만 수집 — 통계 집계 스킵)
async function collectOnce(skipStats) {
  const timeInfo = getTimeInfo();
  console.log(`\n[${timeInfo.timeStr}] 수집 중...`);
  
  for (const [routeKey, route] of Object.entries(ROUTES)) {
    try {
      const data = await fetchBusLocation(route.routeId);
      const response = data.response || data;
      
      if (response.msgHeader && response.msgHeader.resultCode !== 0) {
        console.log(`  ${route.name}: API 오류`);
        continue;
      }
      
      saveRawSnapshot(routeKey, response, timeInfo);
      
      const msgBody = response.msgBody || {};
      const { boardings, travels, newState } = calculateBoarding(routeKey, msgBody, timeInfo);
      
      const buses = msgBody.busLocationList;
      const busCount = buses ? (Array.isArray(buses) ? buses.length : 1) : 0;
      console.log(`  ${route.name}: ${busCount}대`);
      
      if (!skipStats) {
        if (boardings.length > 0) {
          boardings.forEach(b => {
            console.log(`    📍 정류장 ${b.fromStationSeq}→${b.toStationSeq}: ${b.boardingCount}명 승차`);
          });
          updateStats(routeKey, boardings);
        }
        
        if (travels.length > 0) {
          travels.forEach(t => {
            console.log(`    ⏱️ 정류장 ${t.fromStationSeq}→${t.toStationSeq}: ${t.travelTimeMin}분 소요`);
          });
          updateTravelStats(routeKey, travels);
        }
      }
      
      saveState(routeKey, newState);
    } catch (error) {
      console.log(`  ${route.name}: 오류 - ${error.message}`);
    }
  }
}

// 메인: 2시간 동안 매 1분마다 수집
async function main() {
  console.log('╔══════════════════════════════════╗');
  console.log('║  버스 데이터 수집 (2시간 루프)   ║');
  console.log('╚══════════════════════════════════╝');
  
  // 공휴일 체크 — 공휴일은 수집 스킵, 전날은 통계 집계만 스킵
  const holiday = await getHolidayInfo();
  if (holiday.isHoliday) {
    console.log(`오늘(${holiday.today})은 공휴일 — 수집 스킵`);
    return;
  }
  const skipStats = holiday.isDayBeforeHoliday;
  if (skipStats) {
    console.log(`내일이 공휴일 — raw만 수집 (통계 집계 스킵, 평소 왜곡 방지)`);
  }
  
  // 06:30 전에 시작했으면 시작 시각까지 대기 (cron이 일찍/늦게 떠도 KST 창 고정)
  const startWait = (KST_START_MIN - kstMinutes()) * 60000;
  if (startWait > 0) {
    console.log(`KST 06:30까지 ${Math.round(startWait / 60000)}분 대기`);
    await new Promise(r => setTimeout(r, startWait));
  }

  const endTime = Date.now() + Math.max(0, (KST_END_MIN - kstMinutes()) * 60000);
  let cycle = 0;
  
  ensureDir(DATA_DIR);
  ensureDir(RAW_DIR);
  
  while (Date.now() < endTime) {
    cycle++;
    console.log(`\n=== 사이클 ${cycle} ===`);
    await collectOnce(skipStats);
    
    if (Date.now() < endTime) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
  
  console.log('\n╔══════════════════════════════════╗');
  console.log('║  수집 완료                        ║');
  console.log('╚══════════════════════════════════╝');
}

main().catch(console.error);
