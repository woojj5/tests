# 성능 최적화 가이드

## 현재 상태

### 네트워크 지연 시간
- **첫 번째 요청**: ~14ms (연결 설정 오버헤드)
- **이후 요청**: 1-2ms (keep-alive 연결 재사용)

### 최적화 적용 사항

1. **Keep-Alive 연결 재사용**
   - FastAPI: `--timeout-keep-alive 300` (5분)
   - Next.js: Node.js 18+ 기본 keep-alive 지원
   - Docker 네트워크 내부 통신으로 지연 최소화

2. **FastAPI 설정**
   - `uvloop` 사용으로 비동기 처리 최적화
   - 싱글 워커 모드 (단일 프로세스)
   - 동시 연결 제한: 100

3. **Next.js 설정**
   - `Connection: keep-alive` 헤더 추가
   - Docker 네트워크 내부에서 컨테이너 이름으로 직접 통신

## 성능 측정

### 테스트 방법
```bash
# 연속 요청 테스트
for i in {1..5}; do
  time curl -s -X POST http://localhost:3006/api/infer \
    -H "Content-Type: application/json" \
    -d '{"inputs": [1.0, 2.0, 3.0]}' | jq '.network_latency_ms'
done
```

### 예상 결과
- 첫 요청: 10-15ms
- 이후 요청: 1-3ms

## 추가 최적화 옵션

### 1. HTTP/2 사용 (선택적)
```nginx
# Nginx를 사용하는 경우
listen 443 http2;
```

### 2. 연결 풀 크기 조정
```typescript
// app/api/infer/route.ts
// Node.js의 기본 연결 풀은 충분히 크므로 추가 조정 불필요
```

### 3. FastAPI 워커 수 증가 (CPU 부하가 높은 경우)
```dockerfile
# Dockerfile
CMD ["uvicorn", "app:app", "--workers", "4"]
```

## 문제 해결

### 느린 첫 요청
- 정상 동작입니다. 첫 요청 시 TCP 연결 설정 오버헤드가 발생합니다.
- 이후 요청은 keep-alive로 재사용되어 매우 빠릅니다.

### 모든 요청이 느린 경우
1. Docker 네트워크 확인: `docker network inspect dir-2_app-net`
2. FastAPI 로그 확인: `docker compose logs jeon-api`
3. Next.js 로그 확인: `docker compose logs jeon-web`

## 모니터링

### 실시간 성능 확인
```bash
# FastAPI 직접 호출
curl -X POST http://localhost:8001/infer \
  -H "Content-Type: application/json" \
  -d '{"inputs": [1.0, 2.0, 3.0]}'

# Next.js 브릿지 호출
curl -X POST http://localhost:3006/api/infer \
  -H "Content-Type: application/json" \
  -d '{"inputs": [1.0, 2.0, 3.0]}'
```

### 네트워크 지연 분석
응답 JSON의 `network_latency_ms` 필드를 확인하세요:
- 1-3ms: 최적
- 5-10ms: 양호
- 10ms 이상: 네트워크 설정 확인 필요

