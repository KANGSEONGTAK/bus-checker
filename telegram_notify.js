// 텔레그램 버스 알림 스크립트
// predict_bus.js의 결과를 텔레그램으로 전송

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const SERVICE_KEY = process.env.BUS_API_KEY || '874mgo%2FQ8RDcM%2FhTJn3YI3AEPtV9bXYsuB60MpCxvQBG0ehkCinIQHpp%2BCJhAjzgFUaWVD1l6qXi%2F7P%2FmS5w1Q%3D%3D';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8899818668:AAHbj1i46Wn4GQB39IQe4g1O0BU5Dj7_Hzw';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1767425874';

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
        console.log('텔레그램 전송 결과:', data.substring(0, 200));
        resolve();
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function getRouteStatus(routeKey) {
  const route = ROUTES[routeKey];
  const timeInfo = getTimeInfo();
  
  try {
    const data = await fetchBusLocation(route.routeId);
    const response = data.response || data;
    const buses = response.msgBody ? response.msgBody.busLocationList : null;
    
    if (!buses) {
      return `🚌 <b>${route.name}번 (${route.direction})</b>\n   ⏳ 접근 중인 버스 없음`;
    }
    
    const busList = Array.isArray(buses) ? buses : [buses];
    const approaching = busList.filter(b => parseInt(b.stationSeq) < route.myStationSeq);
    
    if (approaching.length === 0) {
      return `🚌 <b>${route.name}번 (${route.direction})</b>\n   ⏳ 접근 중인 버스 없음`;
    }
    
    const nearest = approaching.reduce((a, b) => 
      parseInt(b.stationSeq) > parseInt(a.stationSeq) ? b : a
    );
    
    const currentSeq = parseInt(nearest.stationSeq);
    const currentSeats = parseInt(nearest.remainSeatCnt);
    const isDoubleDeck = parseInt(nearest.lowPlate) === 2;
    const crowded = { 0:'?', 1:'여유', 2:'보통', 3:'혼잡', 4:'매우혼잡' }[parseInt(nearest.crowded)] || '?';
    const remainStations = route.myStationSeq - currentSeq;
    
    let msg = `🚌 <b>${route.name}번 (${route.direction})</b>\n`;
    msg += `   차량: ${isDoubleDeck ? '双层 버스' : '일반 버스'} ${nearest.plateNo}\n`;
    msg += `   위치: ${currentSeq}번 정류장 (남은 ${remainStations}개)\n`;
    msg += `   현재 빈좌석: <b>${currentSeats}석</b> (${crowded})\n`;
    
    const stats = getAvgBoarding(routeKey, timeInfo.dayName, timeInfo.hour, currentSeq, route.myStationSeq);
    
    if (stats) {
      const estimatedSeats = Math.max(0, currentSeats - stats.avgBoarding);
      msg += `   예상 승차: ${stats.avgBoarding}명 (샘플 ${stats.samples})\n`;
      msg += `   도착 시 예상: <b>${estimatedSeats}석</b>\n`;
      msg += `   탑승: ${estimatedSeats > 0 ? '✅ 가능' : '❌ 어려움'}\n`;
    } else {
      msg += `   📊 통계 수집 중...\n`;
    }
    
    // 다음 버스
    const nextBuses = approaching
      .filter(b => parseInt(b.stationSeq) < currentSeq)
      .sort((a, b) => parseInt(b.stationSeq) - parseInt(a.stationSeq));
    
    if (nextBuses.length > 0) {
      const next = nextBuses[0];
      const nextSeats = parseInt(next.remainSeatCnt);
      const nextSeq = parseInt(next.stationSeq);
      const nextDouble = parseInt(next.lowPlate) === 2;
      msg += `\n   🚌 다음: ${nextDouble ? '2층' : '일반'} ${next.plateNo}\n`;
      msg += `      위치: ${nextSeq}번 (남은 ${route.myStationSeq - nextSeq}개), ${nextSeats}석`;
    }
    
    return msg;
  } catch (error) {
    return `🚌 <b>${route.name}번</b> ❌ 오류: ${error.message}`;
  }
}

async function main() {
  const timeInfo = getTimeInfo();
  let message = `🚌 <b>세마중고교 버스 알림</b>\n`;
  message += `📅 ${timeInfo.dateStr} (${timeInfo.dayName}) ${timeInfo.timeStr}\n`;
  message += `${'─'.repeat(30)}\n\n`;
  
  const status1 = await getRouteStatus('1311');
  const status2 = await getRouteStatus('5104');
  
  message += status1 + '\n\n';
  message += status2 + '\n\n';
  message += `${'─'.repeat(30)}\n`;
  message += `※ 매 5분 자동 수집 중`;
  
  console.log('전송할 메시지:\n' + message);
  await sendTelegram(message);
}

main().catch(console.error);
