// 버스 승차 인원 자동 수집기
// 매 5분마다 실행되어 버스 위치를 추적하고 승차 인원을 계산
// GitHub Actions에서 자동 실행

const http = require('http');
const fs = require('fs');
const path = require('path');

// === 설정 ===
const SERVICE_KEY = process.env.BUS_API_KEY || '874mgo%2FQ8RDcM%2FhTJn3YI3AEPtV9bXYsuB60MpCxvQBG0ehkCinIQHpp%2BCJhAjzgFUaWVD1l6qXi%2F7P%2FmS5w1Q%3D%3D';

// 추적할 노선
const ROUTES = {
  '1311': {
    routeId: '234001251',
    name: '1311',
    direction: '오산→강남',
    myStationSeq: 16  // 세마중고교
  },
  '5104': {
    routeId: '223000150',
    name: '5104',
    direction: '오산→서울역',
    myStationSeq: 6   // 세마중고교
  }
};

const DATA_DIR = path.join(__dirname, 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const STATS_FILE = path.join(DATA_DIR, 'boarding_stats.json');

// === 디렉토리 생성 ===
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// === API 호출 ===
function fetchBusLocation(routeId) {
  return new Promise((resolve, reject) => {
    const url = `http://apis.data.go.kr/6410000/buslocationservice/v2/getBusLocationListv2?format=json&serviceKey=${SERVICE_KEY}&routeId=${routeId}`;

    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// === 현재 시간 정보 ===
function getTimeInfo() {
  const now = new Date();
  // 한국 시간 (UTC+9)
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const hour = String(kst.getUTCHours()).padStart(2, '0');
  const minute = String(kst.getUTCMinutes()).padStart(2, '0');
  
  const dateStr = `${year}-${month}-${day}`;
  const timeStr = `${hour}:${minute}`;
  const hourStr = hour;  // 시간대 (예: "07")
  
  // 요일 (0=일, 1=월, ..., 6=토)
  const dayOfWeek = kst.getUTCDay();
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = dayNames[dayOfWeek];
  
  return {
    dateStr,
    timeStr,
    hourStr,
    dayName,
    timestamp: kst.toISOString()
  };
}

// === Raw 데이터 저장 (매 실행 시 스냅샷) ===
function saveRawSnapshot(routeKey, busData, timeInfo) {
  ensureDir(RAW_DIR);
  const filename = `${routeKey}_${timeInfo.dateStr.replace(/-/g, '')}.jsonl`;
  const filepath = path.join(RAW_DIR, filename);
  
  const record = {
    timestamp: timeInfo.timestamp,
    time: timeInfo.timeStr,
    hour: timeInfo.hourStr,
    dayName: timeInfo.dayName,
    buses: busData
  };
  
  fs.appendFileSync(filepath, JSON.stringify(record) + '\n');
}

// === 승차 인원 계산 (핵심 로직) ===
// 이전 스냅샷과 비교하여 각 버스의 정류장 이동 시 승차 인원 계산
function calculateBoarding(routeKey, currentBuses, timeInfo) {
  // 이전 상태 파일 로드
  const stateFile = path.join(DATA_DIR, `state_${routeKey}.json`);
  let prevState = {};
  
  if (fs.existsSync(stateFile)) {
    try {
      prevState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch (e) {
      prevState = {};
    }
  }
  
  const boardings = [];
  const newState = {};
  
  if (!currentBuses || !currentBuses.busLocationList) {
    return { boardings, newState };
  }
  
  const buses = Array.isArray(currentBuses.busLocationList)
    ? currentBuses.busLocationList
    : [currentBuses.busLocationList];
  
  buses.forEach(bus => {
    const vehId = bus.vehId;
    const currentSeq = parseInt(bus.stationSeq);
    const currentSeats = parseInt(bus.remainSeatCnt);
    const stateCd = parseInt(bus.stateCd);  // 1=정류장 도착, 2=정류장 출발
    
    newState[vehId] = {
      stationSeq: currentSeq,
      remainSeatCnt: currentSeats,
      stateCd: stateCd,
      timestamp: timeInfo.timestamp
    };
    
    // 이전 상태가 있으면 비교
    if (prevState[vehId]) {
      const prevSeq = prevState[vehId].stationSeq;
      const prevSeats = prevState[vehId].remainSeatCnt;
      
      // 정류장이 변경되었고, 빈좌석이 감소했으면 승차 발생
      if (currentSeq > prevSeq && currentSeats >= 0 && prevSeats >= 0) {
        const boarding = prevSeats - currentSeats;
        if (boarding > 0) {
          // prevSeq 정류장에서 boarding명 승차
          boardings.push({
            vehId: vehId,
            plateNo: bus.plateNo,
            fromStationSeq: prevSeq,
            toStationSeq: currentSeq,
            prevSeats: prevSeats,
            currentSeats: currentSeats,
            boardingCount: boarding,
            hour: timeInfo.hourStr,
            dayName: timeInfo.dayName,
            date: timeInfo.dateStr,
            time: timeInfo.timeStr
          });
        }
      }
    }
  });
  
  return { boardings, newState };
}

// === 통계 데이터 업데이트 ===
function updateStats(routeKey, boardings) {
  ensureDir(DATA_DIR);
  
  let stats = {};
  if (fs.existsSync(STATS_FILE)) {
    try {
      stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
    } catch (e) {
      stats = {};
    }
  }
  
  if (!stats[routeKey]) stats[routeKey] = {};
  
  boardings.forEach(b => {
    // 요일별 + 시간대별 + 정류장별 승차 인원 누적
    const dayKey = b.dayName;
    const hourKey = b.hour;
    const stationKey = `station_${b.fromStationSeq}`;
    
    if (!stats[routeKey][dayKey]) stats[routeKey][dayKey] = {};
    if (!stats[routeKey][dayKey][hourKey]) stats[routeKey][dayKey][hourKey] = {};
    if (!stats[routeKey][dayKey][hourKey][stationKey]) {
      stats[routeKey][dayKey][hourKey][stationKey] = {
        totalBoarding: 0,
        count: 0,
        samples: []
      };
    }
    
    const s = stats[routeKey][dayKey][hourKey][stationKey];
    s.totalBoarding += b.boardingCount;
    s.count += 1;
    s.samples.push({
      date: b.date,
      time: b.time,
      boarding: b.boardingCount,
      vehId: b.vehId
    });
    
    // 샘플 최대 50개만 보관
    if (s.samples.length > 50) {
      s.samples = s.samples.slice(-50);
    }
  });
  
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

// === 상태 저장 ===
function saveState(routeKey, state) {
  ensureDir(DATA_DIR);
  const stateFile = path.join(DATA_DIR, `state_${routeKey}.json`);
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

// === 메인 실행 ===
async function main() {
  const timeInfo = getTimeInfo();
  console.log(`[${timeInfo.timestamp}] 데이터 수집 시작`);
  console.log(`날짜: ${timeInfo.dateStr} (${timeInfo.dayName}), 시간: ${timeInfo.timeStr}`);
  
  ensureDir(DATA_DIR);
  ensureDir(RAW_DIR);
  
  for (const [routeKey, route] of Object.entries(ROUTES)) {
    try {
      console.log(`\n--- ${route.name} (${route.direction}) ---`);
      const busData = await fetchBusLocation(route.routeId);
      
      const response = busData.response || busData;
      
      if (response.msgHeader && response.msgHeader.resultCode !== 0) {
        console.log(`API 오류: ${response.msgHeader.resultMessage}`);
        continue;
      }
      
      // Raw 스냅샷 저장
      saveRawSnapshot(routeKey, response, timeInfo);
      
      const buses = response.msgBody ? response.msgBody.busLocationList : null;
      const busCount = Array.isArray(buses) ? buses.length : (buses ? 1 : 0);
      console.log(`버스 ${busCount}대 운행 중`);
      
      // 승차 인원 계산 (msgBody 전달)
      const msgBody = response.msgBody || {};
      const { boardings, newState } = calculateBoarding(routeKey, msgBody, timeInfo);
      
      if (boardings.length > 0) {
        console.log(`승차 감지: ${boardings.length}건`);
        boardings.forEach(b => {
          console.log(`  정류장 ${b.fromStationSeq}→${b.toStationSeq}: ${b.boardingCount}명 승차 (좌석 ${b.prevSeats}→${b.currentSeats})`);
        });
        
        // 통계 업데이트
        updateStats(routeKey, boardings);
      }
      
      // 상태 저장
      saveState(routeKey, newState);
      
    } catch (error) {
      console.log(`${route.name} 오류: ${error.message}`);
    }
  }
  
  console.log('\n수집 완료');
}

main().catch(console.error);
