# 포트 사용 현황

## 현재 포트 상태

### 프로젝트 관련 포트

| 포트 | 상태 | 사용 중인 서비스 | 비고 |
|------|------|-----------------|------|
| **8000** | ⚠️ 사용 중 | Portainer (Docker 관리) | FastAPI와 충돌 가능 |
| **3006** | ⚠️ 사용 중 | Next.js (jeon-web) | 정상 (프로젝트 서비스) |
| **3000** | ⚠️ 사용 중 | baas_frontend | 다른 Next.js 인스턴스 |

### 기타 서비스 포트

| 포트 | 상태 | 서비스 |
|------|------|--------|
| 5432 | ⚠️ 사용 중 | PostgreSQL |
| 3306 | ⚠️ 사용 중 | MySQL |
| 8080 | ✅ 사용 가능 | - |
| 8081 | ✅ 사용 가능 | - |
| 6379 | ✅ 사용 가능 | Redis (미사용) |

## 포트 충돌 해결 방법

### 옵션 1: 포트 변경 (권장)

**FastAPI 포트를 8000 → 8001로 변경:**

`docker-compose.yml`:
```yaml
jeon-api:
  ports:
    - "8001:8000"  # 호스트:컨테이너
```

`backend/app.py` 또는 환경 변수:
```bash
PORT=8001
```

`.env`:
```env
FASTAPI_URL=http://localhost:8001
```

### 옵션 2: 기존 서비스 중지

**Portainer 중지 (포트 8000 해제):**
```bash
docker stop portainer
# 또는
docker compose -f portainer-compose.yml down
```

### 옵션 3: Docker 네트워크 내부 통신만 사용

외부 포트 매핑 없이 내부 네트워크만 사용:
```yaml
jeon-api:
  # ports:  # 주석 처리
  #   - "8000:8000"
  expose:
    - "8000"
```

이 경우 Next.js는 `http://jeon-api:8000`로만 접근 가능 (Docker 내부)

## 포트 확인 스크립트 실행

```bash
./scripts/check-ports.sh
```

또는:

```bash
bash scripts/check-ports.sh
```

## 현재 실행 중인 Docker 컨테이너

```
baas_frontend  - 포트 3000, 3004
portainer      - 포트 8000, 9443
jupyterhub     - 포트 8020
```

## 권장 조치

1. **FastAPI 포트를 8001로 변경** (가장 안전)
2. 또는 **Portainer를 다른 포트로 이동** (8000 → 8001)
3. Docker 네트워크 내부 통신만 사용 (프로덕션 환경)

