// 세마중고교 버스 예측기 (수집된 데이터 기반)
// 사용법: node predict_bus.js

const http = require('http');
const fs = require('fs');
const path = require('path');

const SERVICE_KEY = process.env.BUS_API_KEY || '874mgo%2FQ8RDcM%2FhTJn3YI3AEPtV9bXYsuB60MpCxvQBG0ehkCinIQHpp%2BCJhAjzgFUaWVD1l6qXi%2F7P%2FmS5w1Q%3D%3D';

const ROUTES = {
  '1311': {
    routeId: '234001251',
    name: '1311',
    direction: '오산→강남',
    myStationSeq: 16,
    destination: '강남역'
  },
  '5104': {
    routeId: '223000150',
    name: '5104',
    direction: '오산→서울역',
    myStationSeq: 6,
    destination: '서울역'
  }
};

const DATA_DIR = path.join(__dirname, 'data');
const STATS_FILE = path.join(DATA_DIR, 'boarding_stats.json');

// 한국 시간 기준 요일/시간
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

// 수집된 통계에서 특정 요일/시간대의 정류장별 평균 승차 인원 조회
function getAvgBoarding(routeKey, dayName, hour, fromSeq, toSeq) {
  if (!fs.existsSync(STATS_FILE)) return null;
  
  let stats;
  try {
    stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  } catch (e) { return null; }
  
  if (!stats[routeKey] || !stats[routeKey][dayName]) return null;
  
  // 정확한 시간대 또는 인접 시간대 조회
  const dayData = stats[routeKey][dayName];
  let totalBoarding = 0;
  let totalSamples = 0;
  
  for (let seq = fromSeq; seq < toSeq; seq++) {
    const stationKey = `station_${seq}`;
    // 현재 시간대 또는 ±1시간 범위
    for (const h of [hour, String(parseInt(hour)-1).padStart(2,'0'), String(parseInt(hour)+1).padStart(2,'0')]) {
      if (dayData[h] && dayData[h][stationKey]) {
        const s = dayData[h][stationKey];
        if (s.count > 0) {
          totalBoarding += s.totalBoarding / s.count;
          totalSamples += s.count;
          break;  // 가장 가까운 시간대 하나만
        }
      }
    }
  }
  
  if (totalSamples === 0) return null;
  return { avgBoarding: Math.round(totalBoarding), samples: totalSamples };
}

function predictRoute(routeKey) {
  return new Promise(async (resolve) => {
    const route = ROUTES[routeKey];
    const timeInfo = getTimeInfo();
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🚌 ${route.name}번 (${route.direction}) → ${route.destination}`);
    console.log(`   내 정류장: 세마중고교 (${route.myStationSeq}번째)`);
    console.log(`   현재: ${timeInfo.dateStr} (${timeInfo.dayName}) ${timeInfo.timeStr}`);
    console.log(`${'='.repeat(50)}`);
    
    try {
      const data = await fetchBusLocation(route.routeId);
      const response = data.response || data;
      const buses = response.msgBody ? response.msgBody.busLocationList : null;
      
      if (!buses) {
        console.log('❌ 데이터 없음');
        return resolve();
      }
      
      const busList = Array.isArray(buses) ? buses : [buses];
      
      // 내 정류장에 도착할 버스 필터링 (내 정류장 순서보다 이전)
      const approaching = busList.filter(b => parseInt(b.stationSeq) < route.myStationSeq);
      
      if (approaching.length === 0) {
        console.log('⏳ 현재 접근 중인 버스 없음 (이미 지나갔거나 아직 출발 안 함)');
        return resolve();
      }
      
      // 가장 가까운 버스 (가장 큰 stationSeq)
      const nearest = approaching.reduce((a, b) => 
        parseInt(b.stationSeq) > parseInt(a.stationSeq) ? b : a
      );
      
      const currentSeq = parseInt(nearest.stationSeq);
      const currentSeats = parseInt(nearest.remainSeatCnt);
      const isDoubleDeck = parseInt(nearest.lowPlate) === 2;
      const crowded = { 0:'알수없음', 1:'여유', 2:'보통', 3:'혼잡', 4:'매우혼잡' }[parseInt(nearest.crowded)] || '알수없음';
      const remainStations = route.myStationSeq - currentSeq;
      
      console.log(`\n📍 가장 가까운 버스: ${nearest.plateNo}`);
      console.log(`   차량: ${isDoubleDeck ? '2층 버스' : '일반 버스'}`);
      console.log(`   현재 위치: ${currentSeq}번 정류장`);
      console.log(`   남은 정류장: ${remainStations}개`);
      console.log(`   현재 빈 좌석: ${currentSeats}석`);
      console.log(`   현재 혼잡도: ${crowded}`);
      
      // 수집된 통계로 예상 승차 인원 계산
      const stats = getAvgBoarding(routeKey, timeInfo.dayName, timeInfo.hour, currentSeq, route.myStationSeq);
      
      if (stats) {
        const estimatedSeats = Math.max(0, currentSeats - stats.avgBoarding);
        console.log(`\n📈 ${timeInfo.dayName}요일 ${timeInfo.hour}시 통계:`);
        console.log(`   예상 승차 인원: ${stats.avgBoarding}명 (샘플 ${stats.samples}개)`);
        console.log(`   도착 시 예상 빈 좌석: ${estimatedSeats}석`);
        console.log(`   탑승 가능: ${estimatedSeats > 0 ? '✅ 가능' : '❌ 어려움'}`);
        
        if (estimatedSeats >= 5) {
          console.log(`   → 여유있게 탈 수 있음`);
        } else if (estimatedSeats > 0) {
          console.log(`   → 탈 수는 있지만 빠르게 이동 필요`);
        } else {
          console.log(`   → 만석 예상, 다음 버스 고려`);
        }
      } else {
        console.log(`\n⚠️ 아직 통계 데이터 부족`);
        console.log(`   현재 빈 좌석 ${currentSeats}석, ${remainStations}정류장 남음`);
        console.log(`   데이터 수집 중... (며칠 후 예측 가능)`);
      }
      
      // 다음 버스도 확인
      const nextBuses = approaching
        .filter(b => parseInt(b.stationSeq) < currentSeq)
        .sort((a, b) => parseInt(b.stationSeq) - parseInt(a.stationSeq));
      
      if (nextBuses.length > 0) {
        const next = nextBuses[0];
        const nextSeats = parseInt(next.remainSeatCnt);
        const nextSeq = parseInt(next.stationSeq);
        const nextDouble = parseInt(next.lowPlate) === 2;
        console.log(`\n🚌 다음 버스: ${next.plateNo} (${nextDouble ? '2층' : '일반'})`);
        console.log(`   위치: ${nextSeq}번 정류장 (내 정류장까지 ${route.myStationSeq - nextSeq}개)`);
        console.log(`   현재 빈 좌석: ${nextSeats}석`);
      }
      
    } catch (error) {
      console.log(`❌ 오류: ${error.message}`);
    }
    resolve();
  });
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   세마중고교 버스 예측기   ║');
  console.log('╚══════════════════════════════════════╝');
  
  await predictRoute('1311');
  await predictRoute('5104');
  
  console.log('\n' + '='.repeat(50));
  console.log('※ 통계 데이터는 매 5분 자동 수집 중');
  console.log('※ 며칠 후 요일별/시간대별 예측 정확도 향상');
  console.log('='.repeat(50));
}

main();
