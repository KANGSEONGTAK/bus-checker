const http = require('http');
const K = '874mgo%2FQ8RDcM%2FhTJn3YI3AEPtV9bXYsuB60MpCxvQBG0ehkCinIQHpp%2BCJhAjzgFUaWVD1l6qXi%2F7P%2FmS5w1Q%3D%3D';
const url = `http://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteStationListv2?format=json&serviceKey=${K}&routeId=234001251`;
http.get(url, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const j = JSON.parse(data);
    const list = j.response.msgBody.busRouteStationList;
    list.filter(s => [16, 17, 34].includes(s.stationSeq)).forEach(s => {
      console.log(`seq ${s.stationSeq}: ${s.stationName} (stationId: ${s.stationId})`);
    });
  });
}).on('error', e => console.log('에러:', e.message));
