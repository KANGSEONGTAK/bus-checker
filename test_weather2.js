const http = require('http');
const K = '874mgo%2FQ8RDcM%2FhTJn3YI3AEPtV9bXYsuB60MpCxvQBG0ehkCinIQHpp%2BCJhAjzgFUaWVD1l6qXi%2F7P%2FmS5w1Q%3D%3D';
const now = new Date();
const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
const y = kst.getUTCFullYear();
const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
const d = String(kst.getUTCDate()).padStart(2, '0');
const h = String(kst.getUTCHours()).padStart(2, '0');
const url = `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${K}&pageNo=1&numOfRows=10&dataType=JSON&base_date=${y}${m}${d}&base_time=${h}00&nx=60&ny=121`;
console.log('base_time:', h + '00');
http.get(url, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => console.log('응답:', data.substring(0, 800)));
}).on('error', e => console.log('에러:', e.message));
