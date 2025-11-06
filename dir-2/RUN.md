# 🚀 실행 방법 (간단 가이드)

## 방법 1: Docker Compose로 실행 (권장)

```bash
cd /mnt/hdd1/jeon/dir-2

# 전체 스택 실행 (백그라운드)
docker compose up -d --build

# 로그 확인
docker compose logs -f

# 서비스 중지
docker compose down
```

**접근 URL:**
- Next.js: `http://59.14.241.229:3006` 또는 `http://keti-ev1.iptime.org:3006`
- FastAPI: `http://59.14.241.229:8001` 또는 `http://keti-ev1.iptime.org:8001`

## 방법 2: 로컬 개발 (개별 실행)

**터미널 1 - FastAPI:**
```bash
cd /mnt/hdd1/jeon/dir-2/backend
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8001 --reload
```

**터미널 2 - Next.js:**
```bash
cd /mnt/hdd1/jeon/dir-2
echo "FASTAPI_URL=http://localhost:8001" > .env.local
npm run dev
```

**접근 URL:**
- Next.js: `http://localhost:3006`
- FastAPI: `http://localhost:8001`

## ✅ 실행 확인

```bash
# 서버 상태 확인
./check-servers.sh

# 통합 테스트
./test-integration.sh
```

## 🔧 문제 해결

**포트가 이미 사용 중인 경우:**
```bash
./scripts/check-ports.sh
```

**Docker 컨테이너 확인:**
```bash
docker compose ps
docker compose logs
```

