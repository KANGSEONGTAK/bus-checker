// 기상 정보 조회 모듈
const http = require('http');
const SERVICE_KEY = '874mgo%2FQ8RDcM%2FhTJn3YI3AEPtV9bXYsuB60MpCxvQBG0ehkCinIQHpp%2BCJhAjzgFUaWVD1l6qXi%2F7P%2FmS5w1Q%3D%3D';

// 오산시 격자 좌표 (nx=60, ny=121)
const OSAN_NX = 60;
const OSAN_NY = 121;

// 강수형태 코드
const PTY_NAMES = {
  0: '맑음', 1: '비', 2: '비/눈', 3: '눈',
  5: '빗방울', 6: '빗방울/눈날림', 7: '눈날림'
};

// 기상 정보 조회 (초단기실황)
function getWeather() {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    // 초단기실황은 매 시 45분 이후 전 시간 데이터 조회 가능 → 1시간 전 사용
    const prevHour = new Date(kst.getTime() - 60 * 60 * 1000);
    const y = prevHour.getUTCFullYear();
    const m = String(prevHour.getUTCMonth() + 1).padStart(2, '0');
    const d = String(prevHour.getUTCDate()).padStart(2, '0');
    const h = String(prevHour.getUTCHours()).padStart(2, '0');
    const dateStr = `${y}${m}${d}`;
    const timeStr = `${h}00`;
    
    const url = `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${SERVICE_KEY}&pageNo=1&numOfRows=10&dataType=JSON&base_date=${dateStr}&base_time=${timeStr}&nx=${OSAN_NX}&ny=${OSAN_NY}`;
    
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.response && j.response.body && j.response.body.items) {
            const items = j.response.body.items.item || [];
            const weather = {};
            
            items.forEach(it => {
              if (it.category === 'T1H') weather.temp = parseFloat(it.obsrValue);
              if (it.category === 'RN1') weather.rain = parseFloat(it.obsrValue);
              if (it.category === 'REH') weather.humidity = parseFloat(it.obsrValue);
              if (it.category === 'PTY') {
                weather.ptyCode = parseInt(it.obsrValue);
                weather.ptyName = PTY_NAMES[weather.ptyCode] || '알수없음';
              }
              if (it.category === 'WSD') weather.windSpeed = parseFloat(it.obsrValue);
            });
            
            weather.isRaining = weather.ptyCode > 0;
            weather.isBadWeather = weather.ptyCode === 1 || weather.ptyCode === 2 || weather.ptyCode === 3;
            
            resolve(weather);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

module.exports = { getWeather };
