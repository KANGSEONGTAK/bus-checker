// 한국 공휴일 확인 모듈
// 고정 공휴일 하드코딩 + 특일정보 API (한국천문연구원)
// API 승인 전에는 고정 공휴일만 판별 (음력 공휴일은 API 필요)

const http = require('http');
const fs = require('fs');
const path = require('path');

const SERVICE_KEY = process.env.BUS_API_KEY || '874mgo%2FQ8RDcM%2FhTJn3YI3AEPtV9bXYsuB60MpCxvQBG0ehkCinIQHpp%2BCJhAjzgFUaWVD1l6qXi%2F7P%2FmS5w1Q%3D%3D';
const DATA_DIR = path.join(__dirname, 'data');

// 고정날짜 공휴일 (MMDD)
const FIXED_HOLIDAYS = ['0101', '0301', '0505', '0606', '0815', '1003', '1009', '1225'];

function getKstDate(offsetDays) {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 86400 * 1000);
  return {
    ymd: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`,
    md: String(now.getUTCMonth() + 1).padStart(2, '0') + String(now.getUTCDate()).padStart(2, '0')
  };
}

// 특일정보 API에서 연도별 공휴일 조회 (미승인/실패 시 null)
function fetchHolidays(year) {
  return new Promise((resolve) => {
    const url = `http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getHoliDeInfo?serviceKey=${SERVICE_KEY}&solYear=${year}&numOfRows=100&_type=json`;
    const req = http.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          const items = j.response && j.response.body && j.response.body.items ? j.response.body.items.item : null;
          if (!items) return resolve(null);
          const list = (Array.isArray(items) ? items : [items])
            .filter(it => String(it.isHoliday) === 'Y')
            .map(it => String(it.locdate).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'));
          resolve(list.length > 0 ? list : null);
        } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
  });
}

// 오늘/내일 공휴일 여부 조회
async function getHolidayInfo() {
  const today = getKstDate(0);
  const tomorrow = getKstDate(1);
  const year = today.ymd.substring(0, 4);

  // 연간 캐시
  let apiList = null;
  const cacheFile = path.join(DATA_DIR, `holidays_${year}.json`);
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (c.year === year && Array.isArray(c.holidays)) apiList = c.holidays;
  } catch (e) {}

  if (!apiList) {
    apiList = await fetchHolidays(year);
    if (apiList) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(cacheFile, JSON.stringify({ year, holidays: apiList }, null, 2));
      } catch (e) {}
    }
  }

  const isHoliday = d => (apiList && apiList.includes(d.ymd)) || FIXED_HOLIDAYS.includes(d.md);

  return {
    today: today.ymd,
    isHoliday: isHoliday(today),
    isDayBeforeHoliday: isHoliday(tomorrow),
    source: apiList ? 'api' : 'fixed' // api: 음력 포함 전체, fixed: 고정 공휴일만
  };
}

module.exports = { getHolidayInfo };
