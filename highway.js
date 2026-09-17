// 고속도로 정체 정보 조회 모듈
const https = require('https');
const HIGHWAY_API_KEY = '8417546986';

// 소통등급
const GRADE_NAMES = { 1: '🟢', 2: '🟡', 3: '🔴' };
const GRADE_TEXTS = { 1: '원활', 2: '서행', 3: '정체' };

// 1311번 버스가 지나는 고속도로 구간 (오산→강남, 경부선 상행 S)
// 순서대로 지나는 구간만 필터링
const ROUTE_SECTIONS = [
  '서오산JC-북오산IC',
  '북오산IC-동탄JC',
  '동탄JC-기흥동탄IC',
  '기흥동탄IC-기흥IC',
  '기흥IC-수원신갈IC',
  '수원신갈IC-신갈JC',
  '신갈JC-서울TG',
  '서울TG-판교IC',
  '판교IC-판교JC',
  '판교JC-청계TG',
  '청계TG-금토JC',
  '금토JC-양재IC',
  '양재IC-서초IC'
];

// 고속도로 정체 정보 조회
function getHighwayTraffic() {
  return new Promise((resolve, reject) => {
    const url = `https://data.ex.co.kr/openapi/odtraffic/trafficAmountByRealtime?key=${HIGHWAY_API_KEY}&type=json&routeNo=0010&updownTypeCode=S`;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };
    
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (!j.list || j.list.length === 0) {
            resolve({ sections: [], hasCongestion: false, hasDelay: false });
            return;
          }
          
          // 1311번 경로 구간만 필터링 (순서 유지)
          const sectionMap = {};
          ROUTE_SECTIONS.forEach(name => {
            const matching = j.list.filter(item => item.conzoneName === name);
            if (matching.length > 0) {
              // 가장 느린 속도 기준
              const slowest = matching.reduce((a, b) => {
                const sa = parseInt(a.speed);
                const sb = parseInt(b.speed);
                return (sa >= 0 && sb >= 0 && sa < sb) ? a : b;
              });
              const speed = parseInt(slowest.speed);
              const grade = parseInt(slowest.grade);
              sectionMap[name] = {
                name,
                speed: speed >= 0 ? speed : -1,
                grade,
                trafficAmount: parseInt(slowest.trafficAmout),
                timeAvg: parseInt(slowest.timeAvg)
              };
            }
          });
          
          // 순서대로 배열로 변환
          const sections = ROUTE_SECTIONS
            .map(name => sectionMap[name])
            .filter(s => s && s.speed >= 0);
          
          const hasCongestion = sections.some(s => s.grade === 3);
          const hasDelay = sections.some(s => s.grade >= 2);
          
          resolve({
            sections,
            hasCongestion,
            hasDelay
          });
        } catch (e) {
          resolve({ sections: [], hasCongestion: false, hasDelay: false });
        }
      });
    }).on('error', () => resolve({ sections: [], hasCongestion: false, hasDelay: false }));
  });
}

module.exports = { getHighwayTraffic, GRADE_NAMES, GRADE_TEXTS, ROUTE_SECTIONS };
