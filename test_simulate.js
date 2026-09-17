// 텔레그램 알림 시뮬레이션 (평소 대비 이동시간 표시)
const { STATIONS } = require('./stations');

// 가상의 버스 데이터 (세교13단지에 있는 버스)
const mockBuses = [
  { stationSeq: '13', remainSeatCnt: '15', lowPlate: '2', plateNo: '경기77바1234' }
];

// 가상의 버스 상태 (지체 + 평소 대비 느린 구간)
const mockBusStatus = {
  delays: {
    11: 3  // 오산대역에서 3분 지체
  },
  slowSegments: {
    11: { fromSeq: 10, toSeq: 11, todayMin: 8, avgMin: 3, diff: 5 },  // 대우아파트→오산대역: 평소 3분, 오늘 8분
    13: { fromSeq: 12, toSeq: 13, todayMin: 6, avgMin: 2, diff: 4 }   // 수청초교→세교13단지: 평소 2분, 오늘 6분
  }
};

function renderStationList(routeKey, buses, myStationSeq, busStatus) {
  const stations = STATIONS[routeKey];
  if (!stations) return '';
  
  const delays = busStatus?.delays || {};
  const slowSegments = busStatus?.slowSegments || {};
  
  const busAtStation = {};
  if (buses && buses.length > 0) {
    buses.forEach(bus => {
      const seq = parseInt(bus.stationSeq);
      busAtStation[seq] = bus;
    });
  }
  
  let lines = [];
  
  stations.forEach((st) => {
    if (st.isHighway) return;
    
    const isMyStation = st.seq === myStationSeq;
    const bus = busAtStation[st.seq];
    const delay = delays[st.seq];
    const slow = slowSegments[st.seq];
    
    let marker = '○';
    let name = st.name;
    
    if (isMyStation) {
      marker = '★';
      name = `<b>${name}</b>`;
    }
    
    let line = `${marker} ${name}`;
    
    if (bus) {
      const seats = parseInt(bus.remainSeatCnt);
      const isDouble = parseInt(bus.lowPlate) === 2;
      const seatStr = seats >= 0 ? `${seats}석` : '?';
      const busIcon = isDouble ? '🚌' : '🚐';
      line = `📍 <b>${name}</b> ${busIcon} ${seatStr}`;
    }
    
    lines.push(line);
    
    // 평소 대비 이동시간 표시 (데이터 축적 후)
    if (slow && slow.diff >= 2) {
      lines.push(`  ⏱️ 평소 ${slow.avgMin}분 → 오늘 ${slow.todayMin}분 (+${slow.diff}분)`);
    } else if (delay && delay >= 2) {
      lines.push(`  ⏱️ ${delay}분 지체 중`);
    }
  });
  
  return lines.join('\n');
}

let message = `🚌 <b>1311번 출근 알림</b>\n`;
message += `2026-09-17 (목) 07:35\n`;
message += `🌧️ 비 18°C 습도85%\n`;
message += `⚠️ <b>기상 악화 - 정체 가능성 높음</b>\n`;
message += `⏱️ <b>평소보다 느린 구간 2곳</b> (최대 +5분)\n`;
message += `━━━━━━━━━━\n\n`;

message += `🚌 <b>2층 버스</b> 경기77바1234\n`;
message += `현재 <b>15석</b> (보통)\n`;
message += `──────────────────\n`;

message += renderStationList('1311', mockBuses, 16, mockBusStatus);
message += `\n──────────────────\n`;

message += `★ 도착 시 예상 <b>0석</b> (승차 15명, 샘플 12)\n`;
message += `\n❌ <b>탑승 어려움</b>\n`;

message += `\n🚌 <b>5104번 (서울역)</b>\n`;
message += `🚐 1층 경기74자9421 | <b>30석</b>\n`;
message += `도착 시 예상 <b>18석</b>\n`;
message += `\n✅ <b>5104번 탑승 추천</b>\n`;

message += `\n━━━━━━━━━━\n`;
message += `★내정류장 📍현재위치 ⏱️지체`;

console.log(message);
