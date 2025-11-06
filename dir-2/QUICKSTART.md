# 빠른 시작 가이드

## 🚀 실행 방법

### 방법 1: 로컬 개발 (개별 실행) - 권장

**터미널 1 - FastAPI 서버:**
```bash
cd /mnt/hdd1/jeon/dir-2/backend

# 의존성 설치 (최초 1회)
pip install -r requirements.txt

# 서버 실행 (포트 8001 사용, 포트 8000은 Portainer가 사용 중)
uvicorn app:app --host 0.0.0.0 --port 8001 --reload

# 또는 실행 스크립트 사용
./run.sh

# 또는 환경 변수로 포트 지정
PORT=8001 uvicorn app:app --host 0.0.0.0 --port 8001 --reload
```

**터미널 2 - Next.js 서버:**
```bash
cd /mnt/hdd1/jeon/dir-2

# 의존성 설치 (최초 1회)
npm install

# 서버 실행
npm run dev
# 또는 특정 포트 지정
npm run dev -- -p 3006
```

**환경 변수 설정 (.env 파일 생성):**
```bash
cd /mnt/hdd1/jeon/dir-2
echo "FASTAPI_URL=http://localhost:8000" > .env.local
```

### 방법 2: Docker Compose 통합 실행

**전체 스택 실행:**
```bash
cd /mnt/hdd1/jeon/dir-2

# 환경 변수 파일 생성 (선택적)
cat > .env << EOF
FASTAPI_URL=http://jeon-api:8000
MODEL_PATH=
USE_ONNXRUNTIME=false
EOF

# 빌드 및 실행
docker compose up --build

# 백그라운드 실행
docker compose up -d --build

# 로그 확인
docker compose logs -f

# 특정 서비스만 로그 확인
docker compose logs -f jeon-api
docker compose logs -f jeon-web
```

**외부 접근 (keti-ev1.iptime.org):**
- Docker Compose는 이미 `0.0.0.0:포트`로 설정되어 있어 외부 접근 가능
- 접근 URL:
  - FastAPI: `http://keti-ev1.iptime.org:8001`
  - Next.js: `http://keti-ev1.iptime.org:3006`
- 상세 설정은 `DOMAIN_SETUP.md` 참조

**서비스 중지:**
```bash
docker compose down
```

**서비스 재시작:**
```bash
docker compose restart
```

## ✅ 실행 확인

### 1. FastAPI 서버 확인

```bash
# 헬스 체크 (로컬 개발: 포트 8001)
curl http://localhost:8001/health

# Docker 사용 시 (포트 매핑 8001:8000)
curl http://localhost:8001/health
```

**예상 응답:**
```json
{
  "status": "healthy",
  "model_loaded": true
}
```

### 2. Next.js 서버 확인

브라우저에서:
- http://localhost:3006

또는:
```bash
curl http://localhost:3006
```

### 3. API 브릿지 테스트

```bash
# FastAPI 직접 호출 (포트 8001)
curl -X POST http://localhost:8001/infer \
  -H "Content-Type: application/json" \
  -d '{"inputs": [1.0, 2.0, 3.0, 4.0]}'
```

# Next.js 브릿지 호출
curl -X POST http://localhost:3006/api/infer \
  -H "Content-Type: application/json" \
  -d '{"inputs": [1.0, 2.0, 3.0, 4.0]}'
```

**예상 응답:**
```json
{
  "outputs": [2.0, 4.0, 6.0, 8.0],
  "latency_ms": 1.23,
  "total_latency_ms": 5,
  "fastapi_latency_ms": 1.23,
  "network_latency_ms": 3.77
}
```

## 🔍 문제 해결

### 포트 충돌

포트 확인:
```bash
./scripts/check-ports.sh
```

포트 변경:
- `docker-compose.yml`에서 포트 매핑 수정
- `.env.local`에서 `FASTAPI_URL` 수정

### FastAPI 서버 연결 실패

**에러:** `ECONNREFUSED` 또는 `FastAPI server is not available`

**해결:**
1. FastAPI 서버가 실행 중인지 확인
2. `FASTAPI_URL` 환경 변수 확인
3. 포트 확인 (8000 또는 8001)

### Docker 컨테이너 문제

```bash
# 컨테이너 상태 확인
docker compose ps

# 컨테이너 로그 확인
docker compose logs jeon-api
docker compose logs jeon-web

# 컨테이너 재시작
docker compose restart jeon-api
```

## 📝 다음 단계

1. ✅ 서버 실행 확인
2. ✅ API 테스트
3. 모델 파일 추가 (선택적)
4. 프로덕션 배포 설정

## 🎯 빠른 체크리스트

- [ ] FastAPI 서버 실행 중 (포트 8000)
- [ ] Next.js 서버 실행 중 (포트 3006)
- [ ] `/health` 엔드포인트 응답 확인
- [ ] `/api/infer` 엔드포인트 테스트 성공
- [ ] 환경 변수 설정 완료

