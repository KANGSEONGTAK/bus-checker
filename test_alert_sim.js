// 시뮬레이션: 버스가 세교13단지(seq 13)에 있을 때的大시보드 (🚨 포함)
// 실제 코드와 동일한 형식

const https = require('https');
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8899818668:AAHbj1i46Wn4GQB39IQe4g1O0BU5Dj7_Hzw';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1767425874';

function sendTelegram(message) {
  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const postData = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' });
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { console.log('전송:', data.substring(0, 60)); resolve(); });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  const msg = `🚌 <b>1311번 출근 알림</b>
2026-09-17 (목) 07:36
☀️ 맑음 22.7°C 습도50%
━━━━━━━━━━

🚌 <b>2층 버스</b> 경기77바1063
현재 <b>60석</b> · <b>4분 후 도착</b>
──────────────────
🟢 한라.이림아파트
🟢 세교칸타빌더퍼스트
🟢 오산초등학교
🟢 세교2지구12단지
🟢 남촌오거리.세교2지구12단지
🟢 남촌오거리
🟢 오산대학
🟢 꿈빛나래청소년문화의집
🟢 궐리사.대우아파트
🟢 대우아파트
🟢 오산대역.물향기수목원
🟢 수청초등학교앞
<b>▶️▶️ 🟢 세교13단지 🚌 60석</b>
🟢 세교고인돌공원
🟢 죽미마을입구
🏠 <b>세마중고교</b> (4분후 도착)
🟢 세마역
  🔴 북오산TG
  🟡 동탄JC
  🟢 기흥동탄IC
  🟡 수원신갈IC
  🟡 신갈JC
  🔴 죽전
  🔴 금곡
  🔴 서울TG
  🟡 판교IC
  🔴 서울진입
  🔴 청계산입구역
  🔴 양재IC
🟢 KCC사옥
🟢 신논현역.인터파크
🟢 강남역.지오다노
🟢 강남역10번출구
🟢 강남역도시에빛
──────────────────
★ 도착 예상 - 통계 수집 중
🚨 <b>집에서 출발하세요!</b>

🚌 <b>5104번 (서울역)</b> [12분 후 / 30석]

━━━━━━━━━━
🏠 내정류장 🟢 원활 🟠 서행 🔴 정체`;

  console.log(msg);
  await sendTelegram(msg);
}

main().catch(console.error);
