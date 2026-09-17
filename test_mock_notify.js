// 데이터 축적 후 가상 알림 테스트 (앱 스타일)
const https = require('https');
const { STATIONS } = require('./stations');
const { GRADE_NAMES } = require('./highway');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8899818668:AAHbj1i46Wn4GQB39IQe4g1O0BU5Dj7_Hzw';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1767425874';

// 가상 버스 데이터 (세교13단지에 2층 버스)
const mockBuses = [
  { stationSeq: '13', remainSeatCnt: '15', lowPlate: '2', plateNo: '경기77바1234' }
];

// 가상 버스 상태 (데이터 축적 후 가정)
const mockBusStatus = {
  delays: {},
  slowSegments: {
    10: { fromSeq: 9, toSeq: 10, todayMin: 5, avgMin: 2, diff: 3 },   // 궐리사→대우아파트
    11: { fromSeq: 10, toSeq: 11, todayMin: 8, avgMin: 3, diff: 5 },   // 대우아파트→오산대역
    13: { fromSeq: 12, toSeq: 13, todayMin: 6, avgMin: 2, diff: 4 },  // 수청초교→세교13단지
    32: { fromSeq: 17, toSeq: 32, todayMin: 25, avgMin: 15, diff: 10 },// 세마역→KCC사옥 (고속도로)
    33: { fromSeq: 32, toSeq: 33, todayMin: 8, avgMin: 5, diff: 3 }   // KCC사옥→신논현역
  }
};

// 가상 고속도로 데이터
const mockHighway = {
  sections: [
    { name: '서오산JC-북오산IC', speed: 50, grade: 2 },
    { name: '북오산IC-동탄JC', speed: 70, grade: 2 },
    { name: '기흥IC-수원신갈IC', speed: 55, grade: 2 },
    { name: '수원신갈IC-신갈JC', speed: 48, grade: 2 },
    { name: '신갈JC-서울TG', speed: 30, grade: 3 },
    { name: '서울TG-판교IC', speed: 25, grade: 3 },
    { name: '판교JC-청계TG', speed: 23, grade: 3 },
    { name: '금토JC-양재IC', speed: 18, grade: 3 }
  ]
};

// 가상 평균 대기 인원
const mockAvgWait = {
  10: 1,  // 대우아파트
  11: 2,  // 오산대역
  12: 3,  // 수청초등학교앞
  13: 12, // 세교13단지
  14: 2,  // 세교고인돌공원
  15: 8,  // 죽미마을입구
  16: 5   // 세마중고교
};

function renderStationList(routeKey, buses, myStationSeq, busStatus, highway) {
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
  
  function getAvgWait(seq) {
    return mockAvgWait[seq] || null;
  }
  
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
  
  stations.forEach((st) => {
    if (st.isHighway) {
      if (highway && highway.sections && highway.sections.length > 0) {
        const problemSections = highway.sections.filter(s => (s.grade === 2 || s.grade === 3) && s.speed >= 0);
        if (problemSections.length > 0) {
          problemSections.forEach(s => {
            lines.push(`  ${GRADE_NAMES[s.grade]} ${s.name} ${s.speed}km/h`);
          });
        }
      }
      return;
    }
    
    const isMyStation = st.seq === myStationSeq;
    const bus = busAtStation[st.seq];
    const wait = getAvgWait(st.seq);
    const color = getStationColor(st.seq);
    const slow = slowSegments[st.seq];
    const delay = delays[st.seq];
    
    let name = st.name;
    let marker = color;
    
    if (isMyStation) {
      marker = '🏠';
      name = `<b>${name}</b>`;
    }
    
    let line = `${marker} ${name}`;
    
    if (wait) {
      line += ` 👤${wait}`;
    }
    
    if (bus) {
      const seats = parseInt(bus.remainSeatCnt);
      const isDouble = parseInt(bus.lowPlate) === 2;
      const seatStr = seats >= 0 ? `${seats}석` : '?';
      const busIcon = isDouble ? '🚌' : '🚐';
      line = `${color} <b>${name}</b>${wait ? ` 👤${wait}` : ''} ${busIcon} <b>${seatStr}</b>`;
    }
    
    if (slow && slow.diff >= 2) {
      line += ` ⏱️(+${slow.diff}분)`;
    } else if (delay && delay >= 2) {
      line += ` ⏱️(+${delay}분)`;
    }
    
    lines.push(line);
  });
  
  return lines.join('\n');
}

function sendTelegram(message) {
  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const postData = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    });
    
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  let message = `🚌 <b>1311번 출근 알림</b>\n`;
  message += `2026-09-17 (목) 07:35\n`;
  message += `🌧️ 비 18°C 습도85%\n`;
  message += `⚠️ <b>기상 악화 - 정체 가능성 높음</b>\n`;
  
  const slowCount = Object.keys(mockBusStatus.slowSegments).length;
  const maxDiff = Math.max(...Object.values(mockBusStatus.slowSegments).map(s => s.diff));
  message += `⏱️ <b>평소보다 느린 구간 ${slowCount}곳</b> (최대 +${maxDiff}분)\n`;
  
  message += `━━━━━━━━━━\n\n`;
  
  message += `🚌 <b>2층 버스</b> 경기77바1234\n`;
  message += `현재 <b>15석</b> (보통)\n`;
  message += `──────────────────\n`;
  
  message += renderStationList('1311', mockBuses, 16, mockBusStatus, mockHighway);
  message += `\n──────────────────\n`;
  
  message += `★ 도착 시 예상 <b>0석</b> (승차 15명, 샘플 12)\n`;
  message += `\n❌ <b>탑승 어려움</b>\n`;
  
  message += `\n🚌 <b>5104번 (서울역)</b>\n`;
  message += `🚐 1층 경기74자9421\n`;
  message += `현재 <b>30석</b>\n`;
  message += `도착 시 예상 <b>18석</b>\n`;
  message += `\n✅ <b>5104번 탑승 추천</b>\n`;
  
  message += `\n━━━━━━━━━━\n`;
  message += `🏠내정류장 🟢원활 🟠서행 �정체 ⏱️평소대비`;
  
  console.log('전송할 메시지:\n' + message);
  const result = await sendTelegram(message);
  console.log('\n텔레그램 전송:', result);
}

main().catch(console.error);
