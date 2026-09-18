// 텔레그램 버스 알림 - 출근용 (7:35)
// 1311번 중심, 탑승 어려울 때 5104번 대안 안내

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { STATIONS, TURN_SEQ } = require('./stations');
const { getWeather } = require('./weather');
const { getHighwayTraffic, GRADE_NAMES, ROUTE_SECTIONS } = require('./highway');
const { getHolidayInfo } = require('./holidays');

const SERVICE_KEY = process.env.BUS_API_KEY || '874mgo%2FQ8RDcM%2FhTJn3YI3AEPtV9bXYsuB60MpCxvQBG0ehkCinIQHpp%2BCJhAjzgFUaWVD1l6qXi%2F7P%2FmS5w1Q%3D%3D';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8899818668:AAHbj1i46Wn4GQB39IQe4g1O0BU5Dj7_Hzw';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1767425874';

const ROUTES = {
  '1311': {
    routeId: '234001251',
    name: '1311',
    direction: '오산→강남',
    myStationSeq: 16,
    myStationId: '223000331',
    checkStationSeq: 13,
    destStationSeq: 34,
    destStationId: '121000942',
    destination: '강남역'
  },
  '5104': {
    routeId: '223000150',
    name: '5104',
    direction: '오산→서울역',
    myStationSeq: 6,
    myStationId: '223000331',
    destination: '서울역'
  }
};

const DATA_DIR = path.join(__dirname, 'data');
const STATS_FILE = path.join(DATA_DIR, 'boarding_stats.json');
const TRAVEL_STATS_FILE = path.join(DATA_DIR, 'travel_stats.json');

function getTimeInfo() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hour = String(kst.getUTCHours()).padStart(2, '0');
  const dayOfWeek = kst.getUTCDay();
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  return {
    hour,
    dayName: dayNames[dayOfWeek],
    timeStr: `${String(kst.getUTCHours()).padStart(2,'0')}:${String(kst.getUTCMinutes()).padStart(2,'0')}`,
    dateStr: `${kst.getUTCFullYear()}-${String(kst.getUTCMonth()+1).padStart(2,'0')}-${String(kst.getUTCDate()).padStart(2,'0')}`
  };
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

// 정류장 도착정보 조회 (실제 예측시간/좌석)
function fetchBusArrival(stationId, routeId, staOrder) {
  return new Promise((resolve) => {
    const url = `http://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalItemv2?format=json&serviceKey=${SERVICE_KEY}&stationId=${stationId}&routeId=${routeId}&staOrder=${staOrder}`;
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// 수집된 이동시간 데이터로 남은 구간 ETA 계산
function getEstimatedETA(routeKey, fromSeq, toSeq, dayName, hour) {
  if (!fs.existsSync(TRAVEL_STATS_FILE)) return null;
  let stats;
  try { stats = JSON.parse(fs.readFileSync(TRAVEL_STATS_FILE, 'utf8')); } catch (e) { return null; }
  const dayData = stats[routeKey] && stats[routeKey][dayName] ? stats[routeKey][dayName] : {};
  
  let totalMin = 0;
  let found = 0;
  for (let seq = fromSeq; seq < toSeq; seq++) {
    const segmentKey = `seg_${seq}_${seq + 1}`;
    for (const h of [hour, String(parseInt(hour)-1).padStart(2,'0'), String(parseInt(hour)+1).padStart(2,'0')]) {
      if (dayData[h] && dayData[h][segmentKey] && dayData[h][segmentKey].count > 0) {
        totalMin += dayData[h][segmentKey].totalTime / dayData[h][segmentKey].count;
        found++;
        break;
      }
    }
  }
  return found > 0 ? Math.round(totalMin) : null;
}

function getAvgBoarding(routeKey, dayName, hour, fromSeq, toSeq) {
  if (!fs.existsSync(STATS_FILE)) return null;
  let stats;
  try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); } catch (e) { return null; }
  if (!stats[routeKey] || !stats[routeKey][dayName]) return null;
  
  const dayData = stats[routeKey][dayName];
  let totalBoarding = 0;
  let totalSamples = 0;
  
  for (let seq = fromSeq; seq < toSeq; seq++) {
    const stationKey = `station_${seq}`;
    for (const h of [hour, String(parseInt(hour)-1).padStart(2,'0'), String(parseInt(hour)+1).padStart(2,'0')]) {
      if (dayData[h] && dayData[h][stationKey]) {
        const s = dayData[h][stationKey];
        if (s.count > 0) {
          totalBoarding += s.totalBoarding / s.count;
          totalSamples += s.count;
          break;
        }
      }
    }
  }
  
  if (totalSamples === 0) return null;
  return { avgBoarding: Math.round(totalBoarding), samples: totalSamples };
}

function sendTelegram(message) {
  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const postData = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    });
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('텔레그램 전송:', data.substring(0, 80));
        resolve();
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// 버스 상태 추정 (지체 + 평소 대비 이동시간)
function getBusStatus(routeKey, dayName, hour) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = `${kst.getUTCFullYear()}${String(kst.getUTCMonth()+1).padStart(2,'0')}${String(kst.getUTCDate()).padStart(2,'0')}`;
  const filepath = path.join(DATA_DIR, 'raw', `${routeKey}_${dateStr}.jsonl`);
  
  const result = { delays: {}, slowSegments: {} };
  
  if (!fs.existsSync(filepath)) return result;
  
  const lines = fs.readFileSync(filepath, 'utf8').split('\n').filter(l => l.trim());
  if (lines.length === 0) return result;
  
  // 각 버스별로 정류장 시퀀스 변화 추적
  const busHistory = {}; // vehId -> [{seq, time}]
  
  lines.forEach(line => {
    try {
      const record = JSON.parse(line);
      const buses = record.buses?.msgBody?.busLocationList;
      if (!buses) return;
      const busList = Array.isArray(buses) ? buses : [buses];
      const ts = new Date(record.timestamp).getTime();
      
      busList.forEach(bus => {
        const vehId = bus.vehId;
        const seq = parseInt(bus.stationSeq);
        if (!busHistory[vehId]) busHistory[vehId] = [];
        busHistory[vehId].push({ seq, time: ts });
      });
    } catch (e) {}
  });
  
  // 1. 같은 정류장에 머문 시간 계산 (지체)
  Object.values(busHistory).forEach(history => {
    if (history.length < 2) return;
    
    for (let i = 1; i < history.length; i++) {
      const prev = history[i-1];
      const curr = history[i];
      if (prev.seq === curr.seq) {
        const delayMin = Math.round((curr.time - prev.time) / 60000);
        if (delayMin >= 2) {
          if (!result.delays[prev.seq] || delayMin > result.delays[prev.seq]) {
            result.delays[prev.seq] = delayMin;
          }
        }
      }
    }
  });
  
  // 2. 정류장 간 이동시간 계산 + 평소 대비 비교
  let travelStats = {};
  if (fs.existsSync(TRAVEL_STATS_FILE)) {
    try { travelStats = JSON.parse(fs.readFileSync(TRAVEL_STATS_FILE, 'utf8')); } catch (e) {}
  }
  const routeTravelStats = travelStats[routeKey] && travelStats[routeKey][dayName] ? travelStats[routeKey][dayName] : {};
  
  function getAvgTravelTime(fromSeq, toSeq) {
    const segmentKey = `seg_${fromSeq}_${toSeq}`;
    for (const h of [hour, String(parseInt(hour)-1).padStart(2,'0'), String(parseInt(hour)+1).padStart(2,'0')]) {
      if (routeTravelStats[h] && routeTravelStats[h][segmentKey] && routeTravelStats[h][segmentKey].count > 0) {
        const s = routeTravelStats[h][segmentKey];
        return Math.round(s.totalTime / s.count);
      }
    }
    return null;
  }
  
  Object.values(busHistory).forEach(history => {
    if (history.length < 2) return;
    
    for (let i = 1; i < history.length; i++) {
      const prev = history[i-1];
      const curr = history[i];
      if (prev.seq !== curr.seq) {
        const travelMin = Math.round((curr.time - prev.time) / 60000);
        if (travelMin > 0 && travelMin <= 30) {
          const avgMin = getAvgTravelTime(prev.seq, curr.seq);
          if (avgMin && travelMin > avgMin + 1) { // 평소보다 1분 이상 느리면
            const diff = travelMin - avgMin;
            if (!result.slowSegments[prev.seq] || diff > result.slowSegments[prev.seq].diff) {
              result.slowSegments[prev.seq] = {
                fromSeq: prev.seq,
                toSeq: curr.seq,
                todayMin: travelMin,
                avgMin: avgMin,
                diff: diff
              };
            }
          }
        }
      }
    }
  });
  
  return result;
}

// 세마중고교(16)→신논현역(34) 구간 분석: 오늘 앞 버스 실측 + 과거 평소 + 느린 구간
function getArrivalForecast(routeKey) {
  const rawDir = path.join(DATA_DIR, 'raw');
  if (!fs.existsSync(rawDir)) return null;
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayYmd = `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, '0')}${String(kst.getUTCDate()).padStart(2, '0')}`;
  const files = fs.readdirSync(rawDir).filter(f => f.startsWith(routeKey + '_') && f.endsWith('.jsonl'));

  // 차량별: 세마중고교 통과(마지막 seq≤16) → 신논현역 도착(첫 seq≥34) 시간
  function rideStats(veh) {
    const rides = [];
    const segs = {};
    Object.values(veh).forEach(h => {
      let lastBelow16 = null;
      let done = false;
      for (let i = 0; i < h.length; i++) {
        if (done) break;
        const { seq, t } = h[i];
        if (seq <= 16) {
          lastBelow16 = t;
        } else if (seq >= 34) {
          if (lastBelow16 !== null) {
            const m = (t - lastBelow16) / 60000;
            if (m >= 10 && m <= 90) rides.push(Math.round(m));
          }
          done = true;
        } else if (i > 0) {
          const prev = h[i - 1];
          if (prev.seq >= 16 && prev.seq < seq) {
            const dm = (t - prev.t) / 60000;
            if (dm > 0 && dm <= 30) {
              const k = `${prev.seq}_${seq}`;
              if (!segs[k]) segs[k] = { total: 0, count: 0 };
              segs[k].total += dm;
              segs[k].count++;
            }
          }
        }
      }
    });
    return { rides, segs };
  }

  let today = null;
  const pastRides = [];
  const pastSegs = {};
  const todayDow = new Date(
    parseInt(todayYmd.slice(0, 4)), parseInt(todayYmd.slice(4, 6)) - 1, parseInt(todayYmd.slice(6, 8))
  ).getDay();
  files.forEach(f => {
    const veh = {};
    fs.readFileSync(path.join(rawDir, f), 'utf8').split('\n').filter(Boolean).forEach(line => {
      try {
        const rec = JSON.parse(line);
        const list = rec.buses && rec.buses.msgBody && rec.buses.msgBody.busLocationList;
        if (!list) return;
        (Array.isArray(list) ? list : [list]).forEach(b => {
          if (!b || b.vehId === undefined) return;
          if (!veh[b.vehId]) veh[b.vehId] = [];
          veh[b.vehId].push({ seq: parseInt(b.stationSeq), t: new Date(rec.timestamp).getTime() });
        });
      } catch (e) {}
    });
    const r = rideStats(veh);
    if (f.includes(todayYmd)) { today = r; return; }
    const m = f.match(/_(\d{8})\.jsonl$/);
    if (m) {
      const fd = new Date(parseInt(m[1].slice(0, 4)), parseInt(m[1].slice(4, 6)) - 1, parseInt(m[1].slice(6, 8)));
      if (fd.getDay() !== todayDow) return; // 같은 요일 데이터만 평소 기준으로 사용
    }
    pastRides.push(...r.rides);
    Object.entries(r.segs).forEach(([k, v]) => {
      if (!pastSegs[k]) pastSegs[k] = { total: 0, count: 0 };
      pastSegs[k].total += v.total;
      pastSegs[k].count += v.count;
    });
  });

  const todayAvg = today && today.rides.length
    ? Math.round(today.rides.reduce((a, b) => a + b, 0) / today.rides.length) : null;
  const pastAvg = pastRides.length
    ? Math.round(pastRides.reduce((a, b) => a + b, 0) / pastRides.length) : null;

  // 오늘 느린 구간 (평소 대비, 탑승 구간 16~34)
  let worst = null;
  if (today && Object.keys(pastSegs).length > 0) {
    Object.entries(today.segs).forEach(([k, v]) => {
      const p = pastSegs[k];
      if (p && p.count > 0 && v.count > 0) {
        const diff = Math.round(v.total / v.count - p.total / p.count);
        if (!worst || diff > worst.diff) worst = { seg: k, diff };
      }
    });
  }
  return { todayAvg, pastAvg, todayCount: today ? today.rides.length : 0, worst };
}

// 정류장 일자 표시 (앱 스타일: 색상 + 인원, 버스는 ▶▶ 굵게)
function renderStationList(routeKey, buses, myStationSeq, dayName, hour, busStatus, highway, arrivalEta) {
  const stations = STATIONS[routeKey];
  if (!stations) return '';
  
  const delays = busStatus?.delays || {};
  const slowSegments = busStatus?.slowSegments || {};
  
  // 버스 위치 매핑 (접근 중 + 지나간 버스)
  const busAtStation = {};
  if (buses && buses.length > 0) {
    buses.forEach(bus => {
      const seq = parseInt(bus.stationSeq);
      busAtStation[seq] = bus;
    });
  }
  
  // 평균 대기 인원 로드
  let stats = {};
  if (fs.existsSync(STATS_FILE)) {
    try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); } catch (e) {}
  }
  const routeStats = stats[routeKey] && stats[routeKey][dayName] ? stats[routeKey][dayName] : {};
  
  function getAvgWait(seq) {
    const stationKey = `station_${seq}`;
    for (const h of [hour, String(parseInt(hour)-1).padStart(2,'0'), String(parseInt(hour)+1).padStart(2,'0')]) {
      if (routeStats[h] && routeStats[h][stationKey] && routeStats[h][stationKey].count > 0) {
        const s = routeStats[h][stationKey];
        return Math.round(s.totalBoarding / s.count);
      }
    }
    return null;
  }
  
  // 정류장 색상 판단 (지체/평소대비 기준)
  function getStationColor(seq) {
    const slow = slowSegments[seq];
    const delay = delays[seq];
    if (slow && slow.diff >= 5) return '🔴';
    if (slow && slow.diff >= 2) return '🟠';
    if (delay && delay >= 5) return '🔴';
    if (delay && delay >= 2) return '🟠';
    return '🟢';
  }
  
  let lines = [];

  // 고속도로 구간별 소통 데이터 (구간명 -> 데이터)
  const secMap = {};
  if (highway && highway.sections) {
    highway.sections.forEach(s => { secMap[s.name] = s; });
  }
  const busStr = b => {
    const seats = parseInt(b.remainSeatCnt);
    const icon = parseInt(b.lowPlate) === 2 ? '🚌' : '🚐';
    return `${icon} ${seats >= 0 ? seats + '석' : '?'}`;
  };

  stations.forEach((st) => {
    // 고속도로 경유 지점 (실제 정류장명, 색상은 해당 구간 소통 등급)
    if (st.isHighway) {
      const secName = st.sec !== undefined ? ROUTE_SECTIONS[st.sec] : null;
      const secData = secName ? secMap[secName] : null;
      const bus = busAtStation[st.seq];

      // 소통 데이터 없는 지점은 버스 있을 때만 표시
      if (!secData && !bus) return;

      const color = secData ? (GRADE_NAMES[secData.grade] || '⚪') : '⚪';
      if (bus) {
        lines.push(`  <b>▶️▶️ ${color} ${st.name} ${busStr(bus)}</b>`);
      } else {
        lines.push(`  ${color} ${st.name}`);
      }
      return;
    }
    
    const isMyStation = st.seq === myStationSeq;
    const bus = busAtStation[st.seq];
    const wait = getAvgWait(st.seq);
    const color = getStationColor(st.seq);
    
    let name = st.name;
    let marker = color;
    
    if (isMyStation) {
      marker = '🏠';
      name = `<b>${name}</b>${arrivalEta ? ` (${arrivalEta}분후 도착)` : ''}`;
    }
    
    let waitStr = wait ? ` 👤${wait}` : '';
    
    // 버스가 있으면 ▶▶ + 굵게
    if (bus) {
      const seats = parseInt(bus.remainSeatCnt);
      const isDouble = parseInt(bus.lowPlate) === 2;
      const seatStr = seats >= 0 ? `${seats}석` : '?';
      const busIcon = isDouble ? '🚌' : '🚐';
      lines.push(`<b>▶️▶️ ${color} ${name}${waitStr} ${busIcon} ${seatStr}</b>`);
    } else {
      lines.push(`${marker} ${name}${waitStr}`);
    }
  });
  
  return lines.join('\n');
}

async function getRouteInfo(routeKey) {
  const route = ROUTES[routeKey];
  const timeInfo = getTimeInfo();
  
  try {
    const fetches = [
      fetchBusLocation(route.routeId),
      fetchBusArrival(route.myStationId, route.routeId, route.myStationSeq)
    ];
    if (route.destStationId) {
      fetches.push(fetchBusArrival(route.destStationId, route.routeId, route.destStationSeq));
    }
    const [data, arrivalData, destArrivalData] = await Promise.all(fetches);
    const response = data.response || data;
    const buses = response.msgBody ? response.msgBody.busLocationList : null;
    const ar = arrivalData && arrivalData.response && arrivalData.response.msgBody
      ? arrivalData.response.msgBody.busArrivalItem : null;
    const destAr = destArrivalData && destArrivalData.response && destArrivalData.response.msgBody
      ? destArrivalData.response.msgBody.busArrivalItem : null;
    
    if (!buses) {
      return { status: 'no_bus', route, arrival: ar };
    }
    
    const busList = Array.isArray(buses) ? buses : [buses];
    const beforeMyStation = busList.filter(b => parseInt(b.stationSeq) <= route.myStationSeq);
    const passedBuses = busList.filter(b => parseInt(b.stationSeq) > route.myStationSeq);
    const approaching = beforeMyStation;
    
    if (beforeMyStation.length === 0) {
      return { status: 'no_bus', route, allBuses: busList, passedBuses, arrival: ar };
    }
    
    const nearest = beforeMyStation.reduce((a, b) => 
      parseInt(b.stationSeq) > parseInt(a.stationSeq) ? b : a
    );
    
    const currentSeq = parseInt(nearest.stationSeq);
    const currentSeats = parseInt(nearest.remainSeatCnt);
    const isDoubleDeck = parseInt(nearest.lowPlate) === 2;
    const crowded = { 0:'?', 1:'여유', 2:'보통', 3:'혼잡', 4:'매우혼잡' }[parseInt(nearest.crowded)] || '?';
    const remainStations = route.myStationSeq - currentSeq;
    
    // 세교13단지 도착 시 예상 좌석
    let checkStationInfo = '';
    if (route.checkStationSeq) {
      const checkStats = getAvgBoarding(routeKey, timeInfo.dayName, timeInfo.hour, currentSeq, route.checkStationSeq);
      const remainToCheck = route.checkStationSeq - currentSeq;
      
      if (currentSeq >= route.checkStationSeq) {
        checkStationInfo = `세교13단지 통과`;
      } else if (checkStats) {
        const seatsAtCheck = Math.max(0, currentSeats - checkStats.avgBoarding);
        checkStationInfo = `세교13단지 도착 시 예상 <b>${seatsAtCheck}석</b> (승차 ${checkStats.avgBoarding}명)`;
      } else {
        checkStationInfo = `세교13단지 도착 예상 - 통계 수집 중`;
      }
    }
    
    // 세마중고교 도착 시 예상 좌석
    const stats = getAvgBoarding(routeKey, timeInfo.dayName, timeInfo.hour, currentSeq, route.myStationSeq);
    let arrivalInfo = '';
    let canBoard = null;
    let estimatedSeats = null;
    
    if (stats) {
      estimatedSeats = currentSeats - stats.avgBoarding;
      arrivalInfo = `도착 시 예상 <b>${Math.max(0, estimatedSeats)}석</b> (승차 ${stats.avgBoarding}명, 샘플 ${stats.samples})`;
      canBoard = estimatedSeats > 0;
    } else {
      arrivalInfo = `도착 예상 - 통계 수집 중`;
    }
    
    // 도착정보 API 실제 예측시간 우선, 없으면 수집 데이터 → 정류장 수 추정
    let eta;
    if (ar && ar.predictTime1 !== undefined && ar.predictTime1 !== '') {
      eta = parseInt(ar.predictTime1);
    } else {
      eta = getEstimatedETA(routeKey, currentSeq, route.myStationSeq, timeInfo.dayName, timeInfo.hour);
      if (eta === null) eta = remainStations * 2;
    }
    
    // 다음 버스 (2번째 도착 예정)
    const nextBus = (ar && ar.predictTime2 !== undefined && ar.predictTime2 !== '')
      ? { eta: parseInt(ar.predictTime2), seats: parseInt(ar.remainSeatCnt2) }
      : null;
    
    return {
      status: 'ok',
      route,
      allBuses: busList,
      approaching,
      passedBuses,
      plateNo: nearest.plateNo,
      isDoubleDeck,
      currentSeq,
      currentSeats,
      crowded,
      remainStations,
      eta,
      nextBus,
      checkStationInfo,
      arrivalInfo,
      canBoard,
      estimatedSeats,
      destArrival: destAr
    };
  } catch (error) {
    return { status: 'error', route, error: error.message };
  }
}

// 날씨·고속도로는 변동이 느려 10분 캐시 (워치 모드 API 호출 절약)
const _cache = { weather: { t: 0, v: null }, highway: { t: 0, v: null } };
async function cachedCall(key, fn) {
  if (Date.now() - _cache[key].t < 10 * 60 * 1000) return _cache[key].v;
  _cache[key] = { t: Date.now(), v: await fn() };
  return _cache[key].v;
}

async function runOnce() {
  // 공휴일 체크 — 스케줄 실행 시 공휴일은 알림 없음
  const holidayInfo = await getHolidayInfo();
  const isScheduled = process.env.GITHUB_ACTIONS && process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch';
  if (holidayInfo.isHoliday && isScheduled) {
    console.log(`오늘(${holidayInfo.today})은 공휴일 — 알림 스킵`);
    return { done: true };
  }

  const timeInfo = getTimeInfo();
  const info1 = await getRouteInfo('1311');
  const info2 = await getRouteInfo('5104');
  const weather = await cachedCall('weather', getWeather);
  const busStatus = getBusStatus('1311', timeInfo.dayName, timeInfo.hour);
  const highway = await cachedCall('highway', getHighwayTraffic);
  
  let message = `🚌 <b>1311번 출근 알림</b>\n`;
  message += `${timeInfo.dateStr} (${timeInfo.dayName}) ${timeInfo.timeStr}\n`;
  
  // 기상 정보
  if (weather) {
    const weatherIcons = { '맑음': '☀️', '비': '🌧️', '비/눈': '🌨️', '눈': '❄️', '빗방울': '💧', '빗방울/눈날림': '🌨️', '눈날림': '❄️' };
    const icon = weatherIcons[weather.ptyName] || '🌤️';
    message += `${icon} ${weather.ptyName} ${weather.temp}°C 습도${weather.humidity}%\n`;
    
    // 악천후 시 정체 경고
    if (weather.isBadWeather) {
      message += `⚠️ <b>기상 악화 - 정체 가능성 높음</b>\n`;
    }
  }
  
  // 공휴일 전날 표시 (평소와 다른 패턴 가능)
  if (holidayInfo.isDayBeforeHoliday) {
    message += `📅 <b>공휴일 전날</b> — 평소보다 여유롭거나 다른 패턴 가능\n`;
  }
  
  // 버스 지체/지연 요약
  const delayCount = Object.keys(busStatus.delays || {}).length;
  const slowCount = Object.keys(busStatus.slowSegments || {}).length;
  if (slowCount > 0) {
    const maxDiff = Math.max(...Object.values(busStatus.slowSegments).map(s => s.diff));
    message += `⏱️ <b>평소보다 느린 구간 ${slowCount}곳</b> (최대 +${maxDiff}분)\n`;
  } else if (delayCount > 0) {
    const maxDelay = Math.max(...Object.values(busStatus.delays));
    message += `⏱️ <b>버스 지체 ${delayCount}구간</b> (최대 ${maxDelay}분)\n`;
  }
  
  message += `━━━━━━━━━━\n\n`;
  
  // 1311번 (메인)
  if (info1.status === 'no_bus') {
    message += `⏳ 접근 버스 없음\n`;
    if (info1.arrival && info1.arrival.predictTime1 !== undefined && info1.arrival.predictTime1 !== '') {
      const seats = parseInt(info1.arrival.remainSeatCnt1);
      message += `다음 버스 <b>${info1.arrival.predictTime1}분 후</b> 도착 (${seats >= 0 ? seats + '석' : '좌석 ?'})\n`;
    }
    if (info1.allBuses && info1.allBuses.length > 0) {
      // 강남 방면 버스만 (회차 후 복귀 방면 제외)
      const forward = info1.allBuses.filter(b => parseInt(b.stationSeq) <= TURN_SEQ['1311']);
      message += `(운행 ${forward.length}대, 이미 지나감)\n`;
      message += `──────────────────\n`;
      message += renderStationList('1311', forward, info1.route.myStationSeq, timeInfo.dayName, timeInfo.hour, busStatus, highway);
      message += `\n──────────────────\n`;
    }
  } else if (info1.status === 'error') {
    message += `❌ 오류: ${info1.error}\n`;
  } else {
    // 1층 버스면 주의 표시
    if (info1.isDoubleDeck) {
      message += `🚌 <b>2층 버스</b> ${info1.plateNo}\n`;
    } else {
      message += `⚠️ <b>1층 버스</b> ${info1.plateNo}\n`;
      message += `❗ 평소와 다른 1층 버스\n`;
    }
    message += `현재 <b>${info1.currentSeats}석</b> · <b>${info1.eta}분 후 도착</b>\n`;
    message += `──────────────────\n`;
    
    // 접근 중 버스 + 지나간 버스 합쳐서 전달
    const allBusesForDisplay = [...(info1.approaching || []), ...(info1.passedBuses || [])];
    message += renderStationList('1311', allBusesForDisplay, info1.route.myStationSeq, timeInfo.dayName, timeInfo.hour, busStatus, highway, info1.eta);
    message += `\n──────────────────\n`;
    
    message += `★ ${info1.arrivalInfo}\n`;
    
    // 버스가 세교13단지~세교고인돌공원 구간이면 출발 신호, 죽미마을입구(직전)면 도착 임박
    if (info1.currentSeq === 16) {
      message += `🏠 <b>세마중고교 도착 — 지금 타세요!</b>\n`;
    } else if (info1.currentSeq === 15) {
      message += `📍 <b>직전 정류장 도착 — 서둘러세요!</b>\n`;
    } else if (info1.currentSeq >= 13 && info1.currentSeq <= 14) {
      message += `🚨 <b>집에서 출발하세요!</b>\n`;
    }
    
    // 좌석 부족 경고 (예상 도착 좌석 기준, 평소 대비 약 +10명 초과 승차 상당)
    if (info1.estimatedSeats !== null) {
      if (info1.estimatedSeats <= 0) {
        message += `❌ <b>탑승 어려움 — 5104 확인</b>\n`;
      } else if (info1.estimatedSeats <= 10) {
        message += `⚠️ <b>탑승 빠듯 — 예상 ${info1.estimatedSeats}석</b>\n`;
      }
    }
    
    // 신논현역 하차 예상 (오늘 앞 버스 실측 > 평소 > 도착 API)
    const forecast = getArrivalForecast('1311');
    const rideMin = forecast ? (forecast.todayAvg || forecast.pastAvg) : null;
    const fmtKst = min => {
      const d = new Date(Date.now() + min * 60000 + 9 * 3600 * 1000);
      return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    };
    if (rideMin) {
      message += `🎯 하차 예상 <b>${fmtKst(info1.eta + rideMin)}</b> (신논현역 · ${rideMin}분${forecast.todayCount > 0 ? ` · 오늘 앞버스 ${forecast.todayCount}대 실측` : ''})`;
      if (forecast.pastAvg && rideMin - forecast.pastAvg >= 2) {
        message += ` — 평소 ${forecast.pastAvg}분보다 <b>+${rideMin - forecast.pastAvg}분</b>`;
      }
      message += `\n`;
    } else {
      // 도착 API는 정류장 기준 "다음 도착 버스"를 주므로 내 버스 차량번호와 매칭 필요
      const dp = info1.destArrival;
      const myPlate = (info1.plateNo || '').replace(/\s/g, '');
      let destMin = null;
      if (dp) {
        if ((dp.plateNo1 || '').replace(/\s/g, '') === myPlate && dp.predictTime1 !== undefined && dp.predictTime1 !== '') {
          destMin = parseInt(dp.predictTime1);
        } else if ((dp.plateNo2 || '').replace(/\s/g, '') === myPlate && dp.predictTime2 !== undefined && dp.predictTime2 !== '') {
          destMin = parseInt(dp.predictTime2);
        }
      }
      if (destMin !== null) {
        message += `🎯 하차 예상 <b>${fmtKst(destMin)}</b> (신논현역 · 도착 API 기준)\n`;
      } else {
        message += `🎯 하차 예상 — 데이터 수집 중 (신논현역)\n`;
      }
    }
    if (forecast && forecast.worst && forecast.worst.diff >= 2) {
      const [a, b] = forecast.worst.seg.split('_');
      const st = STATIONS['1311'];
      const na = (st.find(s => s.seq === parseInt(a)) || {}).name || `정류장${a}`;
      const nb = (st.find(s => s.seq === parseInt(b)) || {}).name || `정류장${b}`;
      message += `⏱️ 오늘 정체: ${na}→${nb} +${forecast.worst.diff}분\n`;
    }
    
    // 특이사항 요약 (지체/평소대비)
    const slowList = Object.entries(busStatus.slowSegments || {})
      .filter(([seq, s]) => s.diff >= 2)
      .sort((a, b) => b[1].diff - a[1].diff);
    if (slowList.length > 0) {
      const notes = slowList.slice(0, 2).map(([seq, s]) => {
        const st = STATIONS['1311'].find(x => x.seq === parseInt(seq));
        const stName = st ? st.name : `정류장${seq}`;
        return `${stName} +${s.diff}분`;
      });
      message += `⏱️ ${notes.join(', ')} 지연\n`;
    }
    
    if (info1.canBoard === true) {
      message += `\n✅ <b>탑승 가능</b>\n`;
    } else if (info1.canBoard === false) {
      message += `\n❌ <b>탑승 어려움</b>\n`;
    }
  }
  
  // 5104번 (대안) - 실제 도착정보 API 기반
  const fmt5104 = () => {
    const seat = info2.currentSeats;
    const next = info2.nextBus ? `, 다음 ${info2.nextBus.eta}분` : '';
    return `🚌 <b>5104번 (서울역)</b> [${info2.eta}분 후 / ${seat}석${next}]\n`;
  };
  message += `\n`;
  if (info1.canBoard === false) {
    if (info2.status === 'ok') {
      message += fmt5104();
      if (info2.canBoard === true) {
        message += `✅ <b>5104번 탑승 추천</b>\n`;
      } else if (info2.canBoard === false) {
        message += `❌ 5104번도 어려움\n`;
      }
    } else if (info2.status === 'no_bus') {
      message += `🚌 <b>5104번</b> ⏳ 접근 버스 없음\n`;
    } else {
      message += `🚌 <b>5104번</b> ❌ 오류\n`;
    }
  } else if (info1.canBoard === true) {
    message += `💡 1311번 탑승 가능\n`;
  } else {
    if (info2.status === 'ok') {
      message += fmt5104();
    } else if (info2.status === 'no_bus') {
      message += `🚌 <b>5104번</b> ⏳ 접근 버스 없음\n`;
    }
  }
  
  message += `\n━━━━━━━━━━\n`;
  message += `🏠 내정류장 🟢 원활 🟠 서행 🔴 정체`;

  // ── 시간대별 유동적 알림 결정 ──
  // ~07:29 기상 악화 시 사전 알림 / 07:30~08:30 대시보드 (출발·직전·1층 상황 포함)
  const alertFile = path.join(DATA_DIR, `alert_state_${timeInfo.dateStr}.json`);
  let state = {};
  try { state = JSON.parse(fs.readFileSync(alertFile, 'utf8')); } catch (e) {}

  const minutes = parseInt(timeInfo.hour) * 60 + parseInt(timeInfo.timeStr.split(':')[1]);
  // --watch 모드는 항상 조건부 발송 (로컬/수동 실행이어도 40초 스팸 방지)
  const isManual = !process.argv.includes('--watch') &&
    (!process.env.GITHUB_ACTIONS || process.env.GITHUB_EVENT_NAME === 'workflow_dispatch');
  let toSend = null;

  // 지연 수준: 당일 지체(같은 정류장 체류) vs 평소대비 이동시간, 큰 쪽
  const dwellArr = Object.values(busStatus.delays || {});
  const maxDwell = dwellArr.length ? Math.max(...dwellArr) : 0;
  const slowArr = Object.values(busStatus.slowSegments || {});
  const maxSlow = slowArr.length ? Math.max(...slowArr.map(s => s.diff)) : 0;
  const worstDelay = Math.max(maxDwell, maxSlow);

  if (isManual) {
    toSend = message; // 로컬/수동 실행은 무조건 대시보드
  } else if (minutes < 450) {
    // 07:00~07:29: 기상 악화 사전 알림 (1회)
    if (weather && weather.isBadWeather && !state.weather) {
      toSend = `🌧️ <b>기상 악화 알림</b>\n${timeInfo.dateStr} (${timeInfo.dayName})\n`;
      toSend += `${weather.ptyName} ${weather.temp}°C 습도${weather.humidity}%\n\n`;
      toSend += `오늘 아침 버스 정체 가능성 높음\n7:30에 버스 상태 알림 예정`;
      state.weather = true;
    }
  } else if (minutes <= 510) {
    // 07:30~08:30: 대시보드 발송 (1층 여부는 첫 대시보드 헤더에 표시)
    const ar = info1.arrival;
    const arLoc = ar && ar.locationNo1 !== '' ? parseInt(ar.locationNo1) : null;
    // 버스 위치: 세교13단지~세교고인돌공원(13~14) / 죽미마을입구 직전(15)
    const busAtDepart = (info1.status === 'ok' && info1.currentSeq >= 13 && info1.currentSeq <= 14) ||
                       (arLoc >= 2 && arLoc <= 3);
    // 직전 정류장(15) 또는 정류장 도착(16) — 16은 폴링이 15를 건너뛴 경우의 안전망
    const busAtPrev = (info1.status === 'ok' && info1.currentSeq >= 15 && info1.currentSeq <= 16) ||
                     (arLoc !== null && arLoc <= 1);

    if (!state.dash) {
      // 첫 대시보드 (1회) — 7:30~40 조회 차량이 1층이면 ⚠️ 경고 헤더 포함됨
      toSend = message;
      state.dash = true;
      // 첫 대시보드에 실린 마커만 소비 — 13단지(🚨) 발송돼도 직전(📍) 알림은 남겨둠
      if (busAtPrev) { state.depart = true; state.prevStn = true; }
      else if (busAtDepart) { state.depart = true; }
      if (info1.estimatedSeats !== null && info1.estimatedSeats <= 10) state.overcrowd = true;
      if (worstDelay >= 5) state.delay = true;
    } else if (busAtPrev && !state.prevStn) {
      // 직전 정류장(죽미마을입구) 도착 → 📍 포함된 대시보드 재발송 (1회)
      toSend = message;
      state.prevStn = true;
      state.depart = true; // 이미 13단지 알림은 의미 없음
    } else if (busAtDepart && !state.depart) {
      // 세교13단지 도착 → 🚨 포함된 대시보드 재발송 (1회)
      toSend = message;
      state.depart = true;
    } else if (info1.estimatedSeats !== null && info1.estimatedSeats <= 10 && !state.overcrowd) {
      // 예상 좌석 부족 (≤10석) → ⚠️/❌ 포함된 대시보드 재발송 (1회)
      toSend = message;
      state.overcrowd = true;
    } else if (worstDelay >= 5 && !state.delay) {
      // 심한 정체 (당일 지체 5분+ 또는 평소대비 +5분) → ⏱️ 포함된 대시보드 재발송 (1회)
      toSend = message;
      state.delay = true;
    }
  }

  if (!toSend) {
    console.log(`발송 조건 없음 (${timeInfo.timeStr})`);
    return state;
  }

  console.log('전송할 메시지:\n' + toSend);
  await sendTelegram(toSend);
  try { fs.writeFileSync(alertFile, JSON.stringify(state)); } catch (e) {}
  return state;
}

// --watch: 07:00~08:35 KST 동안 40초마다 조건 체크 (정류장 도착 순간 포착용)
const WATCH_POLL_MS = 40 * 1000;
const WATCH_START_MIN = 7 * 60;      // 07:00 KST
const WATCH_END_MIN = 8 * 60 + 35;   // 08:35 KST

async function main() {
  if (!process.argv.includes('--watch')) {
    return runOnce();
  }
  console.log('워치 모드 시작 — 07:00~08:35 KST, 40초 간격 감시');
  // cron이 일찍 실행되면 07:00까지 대기 (GitHub 스케줄 지연 흡수)
  while (true) {
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    const mins = kst.getUTCHours() * 60 + kst.getUTCMinutes() + kst.getUTCSeconds() / 60;
    if (mins >= WATCH_START_MIN) break;
    await new Promise(r => setTimeout(r, 30000));
  }
  while (true) {
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    const mins = kst.getUTCHours() * 60 + kst.getUTCMinutes();
    if (mins > WATCH_END_MIN) { console.log('08:35 경과 — 워치 종료'); break; }
    try {
      const st = await runOnce();
      // 직전 정류장/도착 알림까지 나갔으면 더 볼 알림 없음 — 즉시 종료
      if (st && (st.prevStn || st.done)) { console.log('마지막 알림 발송 완료 — 워치 종료'); break; }
    } catch (e) { console.log('체크 오류:', e.message); }
    const kst2 = new Date(Date.now() + 9 * 3600 * 1000);
    if (kst2.getUTCHours() * 60 + kst2.getUTCMinutes() > WATCH_END_MIN) break;
    await new Promise(r => setTimeout(r, WATCH_POLL_MS));
  }
}

main().catch(console.error);
