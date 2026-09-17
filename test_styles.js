// 버스 위치 강조 방법 5가지 비교
const https = require('https');
const { STATIONS } = require('./stations');
const { GRADE_NAMES } = require('./highway');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8899818668:AAHbj1i46Wn4GQB39IQe4g1O0BU5Dj7_Hzw';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1767425874';

const mockBuses = [{ stationSeq: '13', remainSeatCnt: '15', lowPlate: '2', plateNo: '경기77바1234' }];
const mockPassedBuses = [{ stationSeq: '33', remainSeatCnt: '5', lowPlate: '0', plateNo: '경기77바8888' }];
const mockAvgWait = { 10: 1, 11: 2, 12: 3, 13: 12, 14: 2, 15: 8, 16: 5 };
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

function getColor(seq) {
  if ([11, 32].includes(seq)) return '🔴';
  if ([10, 13, 33].includes(seq)) return '🟠';
  return '🟢';
}

function buildStations(emphasisStyle) {
  const stations = STATIONS['1311'];
  let lines = [];
  
  const busAtStation = {};
  mockBuses.forEach(bus => { busAtStation[parseInt(bus.stationSeq)] = { ...bus, passed: false }; });
  mockPassedBuses.forEach(bus => { busAtStation[parseInt(bus.stationSeq)] = { ...bus, passed: true }; });
  
  stations.forEach((st) => {
    if (st.isHighway) {
      mockHighway.sections.forEach(s => {
        lines.push(`  ${GRADE_NAMES[s.grade]} ${s.name}`);
      });
      return;
    }
    
    const isMyStation = st.seq === 16;
    const bus = busAtStation[st.seq];
    const wait = mockAvgWait[st.seq];
    const color = getColor(st.seq);
    
    let name = st.name;
    let marker = color;
    if (isMyStation) marker = '🏠';
    
    let waitStr = wait ? ` 👤${wait}` : '';
    
    if (bus) {
      const seats = parseInt(bus.remainSeatCnt);
      const isDouble = parseInt(bus.lowPlate) === 2;
      const busIcon = isDouble ? '🚌' : '🚐';
      let busInfo = ` ${busIcon} ${seats}석`;
      
      if (emphasisStyle === 'A') {
        // A: 📍 큰 마커 + 굵게
        lines.push(`📍 <b>${color} ${name}${waitStr}${busInfo}</b>`);
      } else if (emphasisStyle === 'B') {
        // B: ▶▶ 화살표 + 굵게
        lines.push(`<b>▶▶ ${color} ${name}${waitStr}${busInfo}</b>`);
      } else if (emphasisStyle === 'C') {
        // C: 별도 박스 (위아래 줄바꿈)
        lines.push(`━━━━━━━━━━`);
        lines.push(`<b>� ${color} ${name}${waitStr}${busInfo}</b>`);
        lines.push(`━━━━━━━━━━`);
      } else if (emphasisStyle === 'D') {
        // D: ⬇️ 큰 화살표 + 굵게
        lines.push(`<b>⬇️ ${color} ${name}${waitStr}${busInfo} ⬇️</b>`);
      } else if (emphasisStyle === 'E') {
        // E: 🔶 노란 다이아몬드 + 굵게
        lines.push(`<b>🔶 ${color} ${name}${waitStr}${busInfo}</b>`);
      }
    } else {
      lines.push(`${marker} ${name}${waitStr}`);
    }
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
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
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
  const styles = [
    { key: 'A', name: '📍 마커 + 굵게' },
    { key: 'B', name: '▶▶ 화살표 + 굵게' },
    { key: 'C', name: '🚏 박스 (줄바꿈)' },
    { key: 'D', name: '⬇️ 큰 화살표 양쪽' },
    { key: 'E', name: '🔶 노란 다이아몬드' }
  ];
  
  for (const style of styles) {
    let message = `🚌 <b>스타일 ${style.name}</b>\n`;
    message += `━━━━━━━━━━\n\n`;
    message += buildStations(style.key);
    message += `\n\n━━━━━━━━━━`;
    
    console.log(`\n=== ${style.name} ===\n${message}\n`);
    await sendTelegram(message);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('5개 스타일 전송 완료!');
}

main().catch(console.error);
