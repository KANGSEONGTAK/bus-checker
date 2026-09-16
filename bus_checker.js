// 세마중고교 버스 예측기
// 1311번 (강남행), 5104번 (서울역행) 실시간 확인

const https = require('https');

// === 설정 ===
// 공공데이터포털에서 발급받은 API 키를 여기에 넣으세요
// https://www.data.go.kr/data/15080648/openapi.do (버스위치정보)
// https://www.data.go.kr/data/15080647/openapi.do (버스도착정보)
const SERVICE_KEY = process.env.BUS_API_KEY || '여기에_API키_입력';

// 노선 정보
const ROUTES = {
  '1311': {
    routeId: '234001251',
    name: '1311 (오산→강남)',
    myStationId: '223000331',  // 세마중고교 (오산 방면)
    myStationSeq: 16,           // 16번째 정류장
    destination: '강남역',
    type: '직행좌석'
  },
  '5104': {
    routeId: '223000150',
    name: '5104 (오산→서울역)',
    myStationId: '223000331',  // 세마중고교 (오산 방면)
    myStationSeq: 6,            // 6번째 정류장
    destination: '서울역',
    type: '직행좌석'
  }
};

// 정류장별 시간대별 평균 승차 인원 (과거 통계 기반 추정치)
// 실제는 공공데이터 "정류장별 이용량" API로 가져와야 함
// 여기서는 예시 데이터 (아침 7-9시 기준)
const STATION_AVG_BOARDING = {
  '1311': {
    // 정류장 순서별 평균 승차 인원 (아침 첨두 시간)
    1: 5, 2: 3, 3: 8, 4: 6, 5: 4, 6: 5, 7: 7, 8: 3, 9: 4, 10: 5,
    11: 6, 12: 4, 13: 8, 14: 5, 15: 6, 16: 10  // 세마중고교
  },
  '5104': {
    1: 4, 2: 6, 3: 5, 4: 3, 5: 4, 6: 12  // 세마중고교
  }
};

// === API 호출 함수 ===

function fetchBusLocation(routeId) {
  return new Promise((resolve, reject) => {
    const url = `http://apis.data.go.kr/6410000/buslocationservice/v2/getBusLocationListv2?format=json&serviceKey=${encodeURIComponent(SERVICE_KEY)}&routeId=${routeId}`;

    https.get(url, (res) => {
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

function fetchBusArrival(stationId, routeId, staOrder) {
  return new Promise((resolve, reject) => {
    const url = `http://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalItemv2?format=json&serviceKey=${encodeURIComponent(SERVICE_KEY)}&stationId=${stationId}&routeId=${routeId}&staOrder=${staOrder}`;

    https.get(url, (res) => {
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

// === 예측 로직 ===

function predictSeats(busLocation, routeKey) {
  const route = ROUTES[routeKey];
  const avgBoarding = STATION_AVG_BOARDING[routeKey];

  if (!busLocation || !busLocation.busLocationList) {
    return null;
  }

  const buses = Array.isArray(busLocation.busLocationList)
    ? busLocation.busLocationList
    : [busLocation.busLocationList];

  // 내 정류장에 도착할 버스들 필터링
  // 내 정류장 순서보다 이전에 있는 버스만 (아직 안 지나감)
  const approachingBuses = buses.filter(bus => {
    const seq = parseInt(bus.stationSeq);
    return seq < route.myStationSeq;
  });

  if (approachingBuses.length === 0) {
    return { status: 'no_bus', message: '현재 접근 중인 버스가 없습니다.' };
  }

  // 가장 가까운 버스 찾기 (내 정류장에 가장 먼저 도착할 버스)
  const nearestBus = approachingBuses.reduce((nearest, bus) => {
    const seq = parseInt(bus.stationSeq);
    const nearestSeq = parseInt(nearest.stationSeq);
    return seq > nearestSeq ? bus : nearest;
  });

  const currentSeq = parseInt(nearestBus.stationSeq);
  const remainStations = route.myStationSeq - currentSeq;
  const remainSeatCnt = parseInt(nearestBus.remainSeatCnt);
  const crowded = parseInt(nearestBus.crowded);

  // 내 정류장까지 오는 동안 예상 승차 인원
  let estimatedBoarding = 0;
  for (let i = currentSeq; i < route.myStationSeq; i++) {
    estimatedBoarding += (avgBoarding[i] || 5);  // 기본값 5명
  }

  // 예상 빈 좌석
  const estimatedSeats = Math.max(0, remainSeatCnt - estimatedBoarding);

  // 혼잡도 텍스트
  const crowdedText = { 1: '여유', 2: '보통', 3: '혼잡', 4: '매우혼잡' }[crowded] || '알수없음';

  return {
    status: 'ok',
    busNo: nearestBus.plateNo,
    currentStation: `정류장 #${currentSeq}`,
    remainStations: remainStations,
    currentSeats: remainSeatCnt,
    crowded: crowdedText,
    estimatedBoarding: estimatedBoarding,
    estimatedSeats: estimatedSeats,
    canBoard: estimatedSeats > 0,
    confidence: remainStations <= 3 ? '높음' : remainStations <= 6 ? '보통' : '낮음'
  };
}

// === 메인 실행 ===

async function checkBus(routeKey) {
  const route = ROUTES[routeKey];
  console.log(`\n🚌 ${route.name} (${route.type})`);
  console.log(`   목적지: ${route.destination}`);
  console.log(`   내 정류장: 세마중고교 (${route.myStationSeq}번째)`);

  try {
    const locationData = await fetchBusLocation(route.routeId);

    if (locationData.msgHeader && locationData.msgHeader.resultCode !== '0') {
      console.log(`   ❌ API 오류: ${locationData.msgHeader.resultMessage}`);
      return;
    }

    const prediction = predictSeats(locationData, routeKey);

    if (!prediction) {
      console.log('   ❌ 데이터를 가져올 수 없습니다.');
      return;
    }

    if (prediction.status === 'no_bus') {
      console.log(`   ⏳ ${prediction.message}`);
      return;
    }

    console.log(`\n   📍 현재 버스 위치: ${prediction.currentStation}`);
    console.log(`   🚏 내 정류장까지: ${prediction.remainStations}정류장 남음`);
    console.log(`   💺 현재 빈 좌석: ${prediction.currentSeats}석`);
    console.log(`   📊 현재 혼잡도: ${prediction.crowded}`);
    console.log(`   👥 예상 승차 인원: ${prediction.estimatedBoarding}명`);
    console.log(`   💺 예상 빈 좌석: ${prediction.estimatedSeats}석`);
    console.log(`   🎯 탑승 가능: ${prediction.canBoard ? '✅ 가능' : '❌ 어려움'}`);
    console.log(`   📏 예측 신뢰도: ${prediction.confidence}`);

    if (prediction.canBoard) {
      console.log(`\n   → 이 버스 탈 수 있을 것 같음!`);
    } else {
      console.log(`\n   → 이 버스는 이미 만석일 수 있음. 다음 버스 고려.`);
    }

  } catch (error) {
    console.log(`   ❌ 오류: ${error.message}`);
  }
}

async function main() {
  console.log('=====================================');
  console.log('  세마중고교 버스 예측기');
  console.log('=====================================');
  console.log(`  시간: ${new Date().toLocaleString('ko-KR')}`);

  if (SERVICE_KEY === '여기에_API키_입력') {
    console.log('\n⚠️  API 키가 설정되지 않았습니다!');
    console.log('   1. https://www.data.go.kr 접속');
    console.log('   2. 회원가입 후 로그인');
    console.log('   3. "경기도 버스위치정보 조회" 검색');
    console.log('   4. 활용신청 후 서비스키 발급');
    console.log('   5. 환경변수 BUS_API_KEY 설정:');
    console.log('      set BUS_API_KEY=발급받은키');
    console.log('   6. 다시 실행');
    return;
  }

  await checkBus('1311');
  await checkBus('5104');

  console.log('\n=====================================');
}

main();
