# FastAPI 머신러닝 인퍼런스 서버

## 개요

FastAPI 기반의 머신러닝 모델 인퍼런스 서버입니다. Next.js 애플리케이션과 연동되어 실시간 추론을 제공합니다.

## 주요 기능

- **전역 싱글톤 모델 로드**: latency 최소화를 위한 모델 사전 로드
- **Warm-up**: 서버 시작 시 초기 추론 수행으로 첫 요청 지연 시간 감소
- **Async 처리**: FastAPI의 async 기능을 활용한 높은 처리량
- **Keep-alive 최적화**: 연결 재사용을 통한 네트워크 오버헤드 감소
- **더미 모델 지원**: 모델 파일이 없어도 기본 동작 (입력값 * 2)

## 실행 방법

### 로컬 개발

```bash
cd backend

# 의존성 설치
pip install -r requirements.txt

# 서버 실행
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### Docker 실행

```bash
# 프로젝트 루트에서
docker compose up --build jeon-api
```

## API 엔드포인트

### POST /infer

추론 요청을 처리합니다.

**요청:**
```json
{
  "inputs": [1.0, 2.0, 3.0, 4.0]
}
```

**응답:**
```json
{
  "outputs": [2.0, 4.0, 6.0, 8.0],
  "latency_ms": 1.23
}
```

### GET /health

서버 상태 확인

**응답:**
```json
{
  "status": "healthy",
  "model_loaded": true
}
```

## 환경 변수

- `MODEL_PATH`: 모델 파일 경로 (선택적)
- `USE_ONNXRUNTIME`: ONNX Runtime 사용 여부 (기본값: false)

## 모델 지원

- **ONNX Runtime**: ONNX 모델 파일 사용
- **PyTorch**: PyTorch JIT 모델 사용
- **더미 모델**: 모델 파일이 없을 경우 입력값 * 2 반환

## 성능 최적화

- 전역 모델 싱글톤으로 메모리 효율성 향상
- Keep-alive 연결로 네트워크 오버헤드 감소
- Async 처리로 동시 요청 처리량 증가
- Warm-up으로 첫 요청 지연 시간 감소

