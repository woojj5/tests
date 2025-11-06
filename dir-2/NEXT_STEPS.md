# 다음 단계 가이드

## ✅ 현재 상태

FastAPI 서버가 정상 작동 중입니다!
- 상태: `healthy`
- 모델 로드: `true` (더미 모델 사용 중)
- 포트: `8001`

## 🚀 다음 단계

### 1. Next.js 서버 실행

**새 터미널에서:**
```bash
cd /mnt/hdd1/jeon/dir-2

# 환경 변수 설정 (FastAPI URL)
echo "FASTAPI_URL=http://localhost:8001" > .env.local

# Next.js 서버 실행
npm run dev
```

### 2. API 테스트

**FastAPI 직접 호출:**
```bash
# 헬스 체크 (이미 확인 완료 ✅)
curl http://localhost:8001/health

# 추론 테스트
curl -X POST http://localhost:8001/infer \
  -H "Content-Type: application/json" \
  -d '{"inputs": [1.0, 2.0, 3.0, 4.0]}'
```

**예상 응답:**
```json
{
  "outputs": [2.0, 4.0, 6.0, 8.0],
  "latency_ms": 0.5
}
```

**Next.js 브릿지 호출:**
```bash
# Next.js 서버가 실행된 후
curl http://localhost:3006/api/infer

# 추론 요청
curl -X POST http://localhost:3006/api/infer \
  -H "Content-Type: application/json" \
  -d '{"inputs": [1.0, 2.0, 3.0, 4.0]}'
```

### 3. 브라우저에서 확인

1. Next.js 서버 실행 후: http://localhost:3006
2. API 엔드포인트 테스트: http://localhost:3006/api/infer

## 🔍 문제 해결

### FastAPI는 실행 중인데 Next.js에서 연결 실패

**확인 사항:**
1. `.env.local` 파일에 `FASTAPI_URL=http://localhost:8001` 설정 확인
2. Next.js 서버 재시작
3. 브라우저 콘솔 또는 서버 로그 확인

### 포트 충돌

```bash
# 포트 확인
./scripts/check-ports.sh

# 또는
netstat -tuln | grep -E ':(3006|8001)'
```

## 📊 전체 시스템 확인

### 현재 실행 중인 서비스

- ✅ FastAPI: `http://localhost:8001` (정상)
- ⏳ Next.js: `http://localhost:3006` (실행 필요)

### 완전한 통합 테스트

```bash
# 1. FastAPI 헬스 체크
curl http://localhost:8001/health

# 2. FastAPI 추론
curl -X POST http://localhost:8001/infer \
  -H "Content-Type: application/json" \
  -d '{"inputs": [1.0, 2.0, 3.0]}'

# 3. Next.js 브릿지 상태 확인
curl http://localhost:3006/api/infer

# 4. Next.js 브릿지 추론
curl -X POST http://localhost:3006/api/infer \
  -H "Content-Type: application/json" \
  -d '{"inputs": [1.0, 2.0, 3.0]}'
```

## 🎯 체크리스트

- [x] FastAPI 서버 실행 중
- [x] FastAPI 헬스 체크 성공
- [ ] Next.js 서버 실행
- [ ] Next.js 브릿지 API 테스트
- [ ] 브라우저에서 전체 플로우 테스트

## 💡 팁

- FastAPI 서버는 `--reload` 옵션으로 실행 중이므로 코드 변경 시 자동 재시작됩니다
- Next.js도 개발 모드로 실행하면 자동 리로드됩니다
- 두 서버 모두 실행 중이어야 완전한 통합 테스트가 가능합니다

