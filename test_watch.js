// 접근 버스(세마중고교 전)가 나타나면 telegram_notify.js 실행
const http = require('http');
const K = '874mgo%2FQ8RDcM%2FhTJn3YI3AEPtV9bXYsuB60MpCxvQBG0ehkCinIQHpp%2BCJhAjzgFUaWVD1l6qXi%2F7P%2FmS5w1Q%3D%3D';
function check() {
  const url = `http://apis.data.go.kr/6410000/buslocationservice/v2/getBusLocationListv2?format=json&serviceKey=${K}&routeId=234001251`;
  http.get(url, res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      try {
        const j = JSON.parse(data);
        const list = j.response && j.response.msgBody ? j.response.msgBody.busLocationList : null;
        const buses = list ? (Array.isArray(list) ? list : [list]) : [];
        const before = buses.filter(b => parseInt(b.stationSeq) <= 16);
        console.log(new Date().toLocaleTimeString(), '버스', buses.length, '대 / 접근', before.length, '대', before.map(b => b.stationSeq).join(','));
        if (before.length > 0) {
          console.log('접근 버스 발견 — 알림 실행');
          process.exit(0);
        }
        setTimeout(check, 60000);
      } catch (e) { console.log('에러', e.message); setTimeout(check, 60000); }
    });
  }).on('error', e => { console.log('에러', e.message); setTimeout(check, 60000); });
}
check();
