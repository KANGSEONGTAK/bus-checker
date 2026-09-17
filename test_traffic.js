// 경기도 교통정보센터 API 테스트
const http = require('http');
const key = 'c4af5b5a9253af2f59d5b3207ae1a9cab3740';

// 도로교통정보 조회 (routeId 없이 전체 조회)
const url = `https://openapigits.gg.go.kr/api/rest/getRoadTrafficInfoList?serviceKey=${key}&type=json`;

const https = require('https');

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      console.log('응답 길이:', data.length);
      const j = JSON.parse(data);
      console.log(JSON.stringify(j, null, 2).substring(0, 3000));
    } catch (e) {
      console.log('파싱 실패, 원본:');
      console.log(data.substring(0, 3000));
    }
  });
}).on('error', e => console.log('오류:', e));
