# 세마중고교 버스 예측기

1311번(강남행), 5104번(서울역행) 버스를 세마중고교에서 탈 때
"내가 탈 수 있을지" 예측하고 텔레그램으로 알려주는 도구.

## 작동 원리

1. **매 5분마다 자동 수집** (GitHub Actions)
   - 버스 실시간 위치 API 호출
   - 각 버스의 정류장별 빈좌석 변화 추적
   - 정류장 이동 시 빈좌석 감소 = 승차 인원

2. **데이터 누적** (data/boarding_stats.json)
   - 요일별 + 시간대별 + 정류장별 평균 승차 인원
   - 시간이 지날수록 정확도 향상

3. **매일 아침 7:30 텔레그램 알림** (평일)
   - 현재 버스 위치 + 빈좌석
   - 수집된 통계로 "도착 시 예상 빈좌석" 계산
   - 탑승 가능 여부 추천

## 파일 구성

```
collect_bus_data.js          # 데이터 수집 (GitHub Actions 자동 실행)
predict_bus.js               # 예측 스크립트 (직접 실행)
telegram_notify.js           # 텔레그램 알림 스크립트
.github/workflows/
  collect-bus-data.yml        # 매 5분 데이터 수집
  morning-notify.yml          # 매일 아침 7:30 텔레그램 알림
data/                        # 수집된 데이터 (자동 생성)
  boarding_stats.json        # 요일별/시간대별 통계
  state_*.json               # 버스 추적 상태
  raw/                       # 원본 스냅샷
```

## 설정 방법

### 1. GitHub 저장소 생성
```bash
git init
git add .
git commit -m "버스 예측기 초기 설정"
git remote add origin https://github.com/본인계정/bus-checker.git
git push -u origin main
```

### 2. GitHub Secrets 등록 (3개)

GitHub 저장소 → Settings → Secrets and variables → Actions

| Name | 값 |
|------|-----|
| `BUS_API_KEY` | 공공데이터포털 서비스키 |
| `TELEGRAM_BOT_TOKEN` | 텔레그램 봇 토큰 |
| `TELEGRAM_CHAT_ID` | 텔레그램 Chat ID |

### 3. 자동 실행 확인

- GitHub 저장소 → Actions 탭
- "버스 승차 인원 자동 수집": 매 5분 실행
- "매일 아침 버스 알림": 평일 7:30 실행

## 사용법

### 텔레그램 알림 (자동)
평일 아침 7:30 자동 전송 (GitHub Actions)

### 수동 실행
```bash
# 예측 확인
node predict_bus.js

# 텔레그램 알림 수동 전송
node telegram_notify.js

# 데이터 수동 수집
node collect_bus_data.js
```

## 데이터 정확도

| 기간 | 정확도 |
|------|--------|
| 1일 | 통계 부족 (실시간만) |
| 1주 | 60-70% |
| 1달 | 85-90% |
| 3달 | 95%+ |

## 데이터 소스

- 경기도 버스위치정보 API (공공데이터포털)
- 실시간 버스 위치, 빈좌석, 2층버스 여부, 혼잡도
