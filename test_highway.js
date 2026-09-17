// 한국도로공사 API - 경부선 전체 구간 조회
const https = require('https');
const key = '8417546986';

// 경부선 (routeNo=0010) 상행(S) 전체 구간
const url = `https://data.ex.co.kr/openapi/odtraffic/trafficAmountByRealtime?key=${key}&type=json&routeNo=0010&updownTypeCode=S`;

const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
};

https.get(url, options, (res) => {
  console.log('상태코드:', res.statusCode);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const j = JSON.parse(data);
      console.log('총 구간 수:', j.count);
      console.log('메시지:', j.message);
      if (j.list && j.list.length > 0) {
        console.log('\n구간별 소통 현황:');
        j.list.forEach((item, i) => {
          const gradeNames = { 1: '🟢 원활', 2: '🟡 서행', 3: '🔴 정체' };
          const grade = gradeNames[item.grade] || '?';
          console.log(`${i+1}. ${item.conzoneName} | ${grade} | ${item.speed}km/h | 교통량 ${item.trafficAmout}`);
        });
      }
    } catch (e) {
      console.log(data.substring(0, 3000));
    }
  });
}).on('error', e => console.log('오류:', e));
