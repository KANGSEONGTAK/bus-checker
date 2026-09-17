// 기상청 API 테스트 (공공데이터포털 기존 키)
const http = require('http');
const key = '874mgo%2FQ8RDcM%2FhTJn3YI3AEPtV9bXYsuB60MpCxvQBG0ehkCinIQHpp%2BCJhAjzgFUaWVD1l6qXi%2F7P%2FmS5w1Q%3D%3D';

const now = new Date();
const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
const y = kst.getUTCFullYear();
const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
const d = String(kst.getUTCDate()).padStart(2, '0');
const h = String(kst.getUTCHours()).padStart(2, '0');
const dateStr = `${y}${m}${d}`;
const timeStr = `${h}00`;

console.log(`조회: ${dateStr} ${timeStr}, 격자 nx=60, ny=121 (오산)`);

const url = `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${key}&pageNo=1&numOfRows=10&dataType=JSON&base_date=${dateStr}&base_time=${timeStr}&nx=60&ny=121`;

http.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const j = JSON.parse(data);
      if (j.response && j.response.body && j.response.body.items) {
        const items = j.response.body.items.item || [];
        console.log('\n기상 정보 (오산):');
        items.forEach(it => {
          const names = {
            T1H: '기온', RN1: '1시간 강수량', REH: '습도',
            PTY: '강수형태', VEC: '풍향', WSD: '풍속',
            UUU: '동서풍', VVV: '남북풍', LGT: '낙뢰'
          };
          const ptyValues = { 0: '맑음', 1: '비', 2: '비/눈', 3: '눈', 5: '빗방울', 6: '빗방울/눈날림', 7: '눈날림' };
          let val = it.obsrValue;
          if (it.category === 'PTY') val = ptyValues[val] || val;
          console.log(`  ${names[it.category] || it.category}: ${val}`);
        });
      } else {
        console.log(JSON.stringify(j, null, 2).substring(0, 2000));
      }
    } catch (e) {
      console.log(data.substring(0, 2000));
    }
  });
}).on('error', e => console.log(e));
