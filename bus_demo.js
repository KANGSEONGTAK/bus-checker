// 세마중고교 버스 예측기 - 데모 버전 (API 키 없이 테스트)
// 실제 데이터 대신 가상 데이터로 작동 확인

// === 가상 버스 위치 데이터 ===
const MOCK_BUS_DATA = {
  '1311': {
    busLocationList: [
      {
        plateNo: '경기70아1234',
        stationSeq: '12',       // 현재 12번 정류장
        remainSeatCnt: '15',    // 빈 좌석 15석
        crowded: '2',            // 보통
        stationId: '223000301'
      },
      {
        plateNo: '경기70아5678',
        stationSeq: '8',        // 더 뒤에 있는 버스
        remainSeatCnt: '25',
        crowded: '1',            // 여유
        stationId: '223000280'
      }
    ]
  },
  '5104': {
    busLocationList: [
      {
        plateNo: '경기70마9012',
        stationSeq: '3',        // 현재 3번 정류장
        remainSeatCnt: '30',     // 빈 좌석 30석
        crowded: '1',            // 여유
        stationId: '223000260'
      }
    ]
  }
};

// 노선 정보
const ROUTES = {
  '1311': {
    name: '1311 (오산→강남)',
    myStationSeq: 16,
    destination: '강남역',
    type: '직행좌석'
  },
  '5104': {
    name: '5104 (오산→서울역)',
    myStationSeq: 6,
    destination: '서울역',
    type: '직행좌석'
  }
};

// 정류장별 시간대별 평균 승차 인원 (아침 7-9시 기준)
const STATION_AVG_BOARDING = {
  '1311': {
    1: 5, 2: 3, 3: 8, 4: 6, 5: 4, 6: 5, 7: 7, 8: 3, 9: 4, 10: 5,
    11: 6, 12: 4, 13: 8, 14: 5, 15: 6, 16: 10
  },
  '5104': {
    1: 4, 2: 6, 3: 5, 4: 3, 5: 4, 6: 12
  }
};

function predictSeats(busData, routeKey) {
  const route = ROUTES[routeKey];
  const avgBoarding = STATION_AVG_BOARDING[routeKey];

  const buses = busData.busLocationList || [];
  const approachingBuses = buses.filter(bus => {
    return parseInt(bus.stationSeq) < route.myStationSeq;
  });

  if (approachingBuses.length === 0) {
    return { status: 'no_bus' };
  }

  // 내 정류장에 가장 가까운 버스
  const nearestBus = approachingBuses.reduce((nearest, bus) => {
    return parseInt(bus.stationSeq) > parseInt(nearest.stationSeq) ? bus : nearest;
  });

  const currentSeq = parseInt(nearestBus.stationSeq);
  const remainStations = route.myStationSeq - currentSeq;
  const currentSeats = parseInt(nearestBus.remainSeatCnt);
  const crowded = parseInt(nearestBus.crowded);

  // 내 정류장까지 오는 동안 예상 승차 인원
  let estimatedBoarding = 0;
  let detailBoarding = [];
  for (let i = currentSeq; i < route.myStationSeq; i++) {
    const boarding = avgBoarding[i] || 5;
    estimatedBoarding += boarding;
    detailBoarding.push(`정류장${i}: +${boarding}명`);
  }

  const estimatedSeats = Math.max(0, currentSeats - estimatedBoarding);
  const crowdedText = { 1: '여유', 2: '보통', 3: '혼잡', 4: '매우혼잡' }[crowded] || '알수없음';

  return {
    busNo: nearestBus.plateNo,
    currentStation: currentSeq,
    remainStations,
    currentSeats,
    crowded: crowdedText,
    estimatedBoarding,
    estimatedSeats,
    canBoard: estimatedSeats > 0,
    detailBoarding
  };
}

function printResult(routeKey, prediction) {
  const route = ROUTES[routeKey];
  console.log('\n=====================================');
  console.log(`🚌 ${route.name} (${route.type})`);
  console.log(`   목적지: ${route.destination}`);
  console.log(`   내 정류장: 세마중고교 (${route.myStationSeq}번째)`);
  console.log('=====================================');

  if (prediction.status === 'no_bus') {
    console.log('⏳ 현재 접근 중인 버스가 없습니다.');
    return;
  }

  console.log(`\n📍 버스 번호: ${prediction.busNo}`);
  console.log(`📍 현재 위치: ${prediction.currentStation}번 정류장`);
  console.log(`🚏 내 정류장까지: ${prediction.remainStations}정류장 남음`);
  console.log(`💺 현재 빈 좌석: ${prediction.currentSeats}석`);
  console.log(`📊 현재 혼잡도: ${prediction.crowded}`);

  console.log('\n📈 정류장별 예상 승차:');
  prediction.detailBoarding.forEach(d => console.log(`   ${d}`));

  console.log(`\n👥 총 예상 승차: ${prediction.estimatedBoarding}명`);
  console.log(`💺 도착 시 예상 빈 좌석: ${prediction.estimatedSeats}석`);
  console.log(`🎯 탑승 가능: ${prediction.canBoard ? '✅ 가능' : '❌ 어려움'}`);

  if (prediction.canBoard) {
    if (prediction.estimatedSeats >= 5) {
      console.log('\n→ 여유있게 탈 수 있음! 천천히 가도 됨.');
    } else {
      console.log('\n→ 탈 수는 있지만 빠르게 가야 함!');
    }
  } else {
    console.log('\n→ 이미 만석일 가능성 높음. 다음 버스 고려.');
  }
}

// 실행
console.log('\n');
console.log('╔═══════════════════════════════════╗');
console.log('║   세마중고교 버스 예측기 (데모)   ║');
console.log('╚═══════════════════════════════════╝');
console.log(`시간: ${new Date().toLocaleString('ko-KR')}`);

printResult('1311', predictSeats(MOCK_BUS_DATA['1311'], '1311'));
printResult('5104', predictSeats(MOCK_BUS_DATA['5104'], '5104'));

console.log('\n=====================================');
console.log('※ 이것은 데모 데이터입니다.');
console.log('※ 실제 사용시 공공데이터포털 API 키 필요.');
console.log('=====================================');
