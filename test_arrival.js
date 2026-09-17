const http = require('http');
const K = '874mgo%2FQ8RDcM%2FhTJn3YI3AEPtV9bXYsuB60MpCxvQBG0ehkCinIQHpp%2BCJhAjzgFUaWVD1l6qXi%2F7P%2FmS5w1Q%3D%3D';
// 세마중고교(stationId 223000331), 5104번(routeId 223000150, staOrder 6)
const url = `http://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalItemv2?format=json&serviceKey=${K}&stationId=223000331&routeId=223000150&staOrder=6`;
http.get(url, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => console.log(data.substring(0, 1500)));
}).on('error', e => console.log('에러:', e.message));
