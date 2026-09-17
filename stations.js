// 정류장 목록 (오산→강남/서울역 방향, 사용자가 타는 구간만)
// 1311 실제 노선 순서 (경기도 버스노선정보 API 확인, routeId 234001251)
// isHighway: 고속도로 경유 지점, sec: ROUTE_SECTIONS 인덱스 (해당 지점 직전 구간)

const STATIONS = {
  '1311': [
    { seq: 1,  name: '한라.이림아파트' },
    { seq: 2,  name: '세교칸타빌더퍼스트' },
    { seq: 3,  name: '오산초등학교' },
    { seq: 4,  name: '세교2지구12단지' },
    { seq: 5,  name: '남촌오거리.세교2지구12단지' },
    { seq: 6,  name: '남촌오거리' },
    { seq: 7,  name: '오산대학' },
    { seq: 8,  name: '꿈빛나래청소년문화의집' },
    { seq: 9,  name: '궐리사.대우아파트' },
    { seq: 10, name: '대우아파트' },
    { seq: 11, name: '오산대역.물향기수목원' },
    { seq: 12, name: '수청초등학교앞' },
    { seq: 13, name: '세교13단지' },
    { seq: 14, name: '세교고인돌공원' },
    { seq: 15, name: '죽미마을입구' },
    { seq: 16, name: '세마중고교' },
    { seq: 17, name: '세마역' },
    { seq: 18, name: '북오산TG',      isHighway: true, sec: 0 },
    { seq: 19, name: '동탄JC',       isHighway: true, sec: 1 },
    { seq: 20, name: '기흥동탄IC',   isHighway: true, sec: 2 },
    { seq: 21, name: '기흥휴게소',   isHighway: true, sec: 3 },
    { seq: 22, name: '수원신갈IC',   isHighway: true, sec: 4 },
    { seq: 23, name: '신갈JC',       isHighway: true, sec: 5 },
    { seq: 24, name: '죽전',         isHighway: true, sec: 6 },
    { seq: 25, name: '금곡',         isHighway: true, sec: 6 },
    { seq: 26, name: '서울TG',       isHighway: true, sec: 6 },
    { seq: 27, name: '판교IC',       isHighway: true, sec: 7 },
    { seq: 28, name: '금토JC',       isHighway: true, sec: 10 },
    { seq: 29, name: '서울진입',     isHighway: true, sec: 11 },
    { seq: 30, name: '청계산입구역', isHighway: true, sec: 11 },
    { seq: 31, name: '양재IC',       isHighway: true, sec: 11 },
    { seq: 32, name: '서초IC',       isHighway: true, sec: 12 },
    { seq: 33, name: 'KCC사옥' },
    { seq: 34, name: '신논현역.인터파크' },
    { seq: 35, name: '강남역.지오다노' },
    { seq: 36, name: '강남역10번출구' },
    { seq: 37, name: '강남역도시에빛' }
  ],
  '5104': [
    { seq: 1,  name: '세교한신더휴.LH21단지' },
    { seq: 2,  name: '세교칸타빌더퍼스트' },
    { seq: 3,  name: '세교2지구7단지' },
    { seq: 4,  name: '호반써밋라포레후문' },
    { seq: 5,  name: '죽미마을입구' },
    { seq: 6,  name: '세마중고교' },
    { seq: 7,  name: '세마역' },
    { seq: 8,  name: '북오산TG',      isHighway: true },
    { seq: 25, name: '순천향대학병원' },
    { seq: 28, name: '남대문세무서' },
    { seq: 29, name: '을지로입구역.광교' },
    { seq: 31, name: '서울역환승센터' }
  ]
};

// 회차 지점 (이후 seq는 복귀 방면)
const TURN_SEQ = { '1311': 37, '5104': 31 };

module.exports = { STATIONS, TURN_SEQ };
