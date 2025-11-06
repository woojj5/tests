# 접속 URL 가이드

## ✅ 올바른 접속 URL

### 로컬 접속
- **Next.js 웹 애플리케이션**: `http://localhost:3006`
- **FastAPI 서버**: `http://localhost:8001`

### 외부 접속 (keti-ev1.iptime.org)
- **Next.js 웹 애플리케이션**: `http://keti-ev1.iptime.org:3006`
- **FastAPI 서버**: `http://keti-ev1.iptime.org:8001`

## ❌ 사용하지 않는 포트

- 포트 `63527`은 사용하지 않습니다.
- 이 포트는 다른 서비스이거나 잘못된 URL일 수 있습니다.

## 🔍 현재 실행 중인 서비스

```bash
# 서비스 상태 확인
docker compose ps

# 포트 확인
netstat -tuln | grep -E ":(3006|8001)"
```

## 📝 주요 페이지

- **홈**: `http://localhost:3006/`
- **개괄 분석**: `http://localhost:3006/analysis`
- **랭킹**: `http://localhost:3006/ranking`
- **SOC 추정**: `http://localhost:3006/analysis` (페이지 하단)

## 🚀 서버 시작

```bash
cd /mnt/hdd1/jeon/dir-2

# Docker Compose로 실행
docker compose up -d

# 또는 로컬 개발
npm run dev  # 포트 3006
```

## 💡 문제 해결

포트 63527에 접속하려고 했다면:
1. 브라우저에서 `http://localhost:3006` 사용
2. 또는 `http://keti-ev1.iptime.org:3006` 사용

