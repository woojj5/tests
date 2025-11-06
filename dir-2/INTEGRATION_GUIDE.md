# FastAPI + Next.js 통합 가이드

## 📋 개요

이 프로젝트는 Next.js 프론트엔드와 FastAPI 머신러닝 인퍼런스 서버를 통합한 구조입니다.

## 🏗️ 아키텍처

```
┌─────────────────┐         ┌─────────────────┐
│   Next.js Web   │  HTTP   │  FastAPI Server │
│   (Port 3006)   │ ──────> │   (Port 8000)   │
└─────────────────┘         └─────────────────┘
         │                            │
         └──────────────┬──────────────┘
                        │
                   ┌────▼────┐
                   │ Docker  │
                   │ Network │
                   └─────────┘
```

## 🚀 실행 방법

### 방법 1: 로컬 개발 (개별 실행)

**터미널 1 - FastAPI 서버:**
```bash
cd /mnt/hdd1/jeon/dir-2/backend
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

**터미널 2 - Next.js 서버:**
```bash
cd /mnt/hdd1/jeon/dir-2
npm run dev
# 또는
npm run dev -- -p 3006
```

### 방법 2: Docker Compose 통합 실행

```bash
cd /mnt/hdd1/jeon/dir-2

# 환경 변수 설정 (선택적)
cp .env.example .env
# .env 파일 편집

# 전체 스택 실행
docker compose up --build

# 백그라운드 실행
docker compose up -d --build

# 로그 확인
docker compose logs -f

# 특정 서비스만 실행
docker compose up --build jeon-api
docker compose up --build jeon-web
```

## 🔧 환경 변수 설정

`.env` 파일 생성 (프로젝트 루트):

```env
# FastAPI 서버 URL
# 로컬 개발: http://localhost:8000
# Docker: http://jeon-api:8000
FASTAPI_URL=http://localhost:8000

# 모델 설정 (선택적)
MODEL_PATH=/path/to/model.onnx
USE_ONNXRUNTIME=true
```

## 📡 API 사용 예시

### Next.js에서 FastAPI 호출

**클라이언트 컴포넌트:**
```typescript
const response = await fetch('/api/infer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    inputs: [1.0, 2.0, 3.0, 4.0]
  })
});

const data = await response.json();
console.log(data.outputs); // [2.0, 4.0, 6.0, 8.0]
```

**서버 컴포넌트:**
```typescript
const response = await fetch(`${process.env.FASTAPI_URL}/infer`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ inputs: [1.0, 2.0, 3.0] })
});
```

## 🧪 테스트

### FastAPI 서버 테스트

```bash
# 헬스 체크
curl http://localhost:8000/health

# 추론 요청
curl -X POST http://localhost:8000/infer \
  -H "Content-Type: application/json" \
  -d '{"inputs": [1.0, 2.0, 3.0, 4.0]}'
```

### Next.js 브릿지 테스트

```bash
# 상태 확인
curl http://localhost:3006/api/infer

# 추론 요청
curl -X POST http://localhost:3006/api/infer \
  -H "Content-Type: application/json" \
  -d '{"inputs": [1.0, 2.0, 3.0, 4.0]}'
```

## 📊 성능 모니터링

### FastAPI 서버 로그

서버 시작 시 다음 로그를 확인할 수 있습니다:
```
[MODEL] Loading model...
[MODEL] No model file found, using dummy model (x*2)
[WARMUP] Starting warm-up...
[WARMUP] Completed in 1.23ms
```

### Next.js API 로그

브라우저 콘솔 또는 서버 로그에서 다음을 확인:
- `total_latency_ms`: 전체 요청 시간
- `fastapi_latency_ms`: FastAPI 추론 시간
- `network_latency_ms`: 네트워크 지연 시간

## 🔍 문제 해결

### FastAPI 서버 연결 실패

**증상:** `ECONNREFUSED` 에러

**해결:**
1. FastAPI 서버가 실행 중인지 확인
2. `FASTAPI_URL` 환경 변수 확인
3. 포트 충돌 확인: `lsof -i :8000`

### Docker 네트워크 문제

**증상:** 컨테이너 간 통신 실패

**해결:**
```bash
# 네트워크 확인
docker network ls
docker network inspect dir-2_app-net

# 컨테이너 재시작
docker compose down
docker compose up --build
```

### 모델 로드 실패

**증상:** 모델 관련 에러

**해결:**
1. `MODEL_PATH` 환경 변수 확인
2. 모델 파일 경로 확인
3. 더미 모델로 테스트 (모델 파일 없이 실행)

## 🎯 GPU 사용 (선택적)

### Docker Compose에서 GPU 사용

`docker-compose.yml`의 `jeon-api` 서비스에 다음 추가:

```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
```

그리고 `requirements.txt`에서:
```
onnxruntime-gpu==1.16.3
```

또는:
```
torch==2.1.2  # CUDA 지원 버전
```

## 📝 파일 구조

```
/mnt/hdd1/jeon/dir-2/
├── backend/
│   ├── app.py              # FastAPI 서버
│   ├── requirements.txt    # Python 의존성
│   ├── Dockerfile          # FastAPI Docker 이미지
│   └── README.md           # FastAPI 문서
├── app/
│   └── api/
│       └── infer/
│           └── route.ts    # Next.js 브릿지 API
├── docker-compose.yml      # 통합 Docker 설정
├── Dockerfile              # Next.js Docker 이미지
└── INTEGRATION_GUIDE.md   # 이 문서
```

## 🔄 업데이트 및 배포

### 코드 변경 시

```bash
# 로컬 개발: 자동 리로드 (--reload 옵션)
# Docker: 재빌드 필요
docker compose up --build
```

### 프로덕션 배포

```bash
# 프로덕션 빌드
docker compose -f docker-compose.yml build

# 프로덕션 실행
docker compose -f docker-compose.yml up -d
```

## 📚 추가 리소스

- [FastAPI 공식 문서](https://fastapi.tiangolo.com/)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Docker Compose 문서](https://docs.docker.com/compose/)

