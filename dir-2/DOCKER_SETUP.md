# Docker 실행 가이드

## 🐳 Docker Compose로 실행하기

### 1. 서비스 시작

```bash
cd /mnt/hdd1/jeon/dir-2
docker compose up -d
```

### 2. 서비스 상태 확인

```bash
# 모든 서비스 상태 확인
docker compose ps

# 특정 서비스 로그 확인
docker compose logs jeon-api
docker compose logs jeon-web
```

### 3. 접근 URL

- **Next.js 웹 애플리케이션**: `http://localhost:3006` 또는 `http://keti-ev1.iptime.org:3006`
- **FastAPI 추론 API**: `http://localhost:8001` 또는 `http://keti-ev1.iptime.org:8001`

## 🔧 문제 해결

### Next.js에 접근이 안 될 때

1. **컨테이너가 실행 중인지 확인**
   ```bash
   docker compose ps
   ```
   - `jeon-web` (또는 `jeon-nextjs`) 컨테이너가 `Up` 상태여야 합니다.

2. **포트가 열려 있는지 확인**
   ```bash
   netstat -tuln | grep 3006
   # 또는
   ss -tuln | grep 3006
   ```

3. **컨테이너 로그 확인**
   ```bash
   docker compose logs jeon-web
   ```
   - 빌드 오류나 실행 오류가 있는지 확인합니다.

4. **컨테이너 재시작**
   ```bash
   docker compose restart jeon-web
   ```

### FastAPI에 접근이 안 될 때

1. **컨테이너가 실행 중인지 확인**
   ```bash
   docker compose ps jeon-api
   ```

2. **헬스 체크 확인**
   ```bash
   curl http://localhost:8001/health
   ```

3. **컨테이너 로그 확인**
   ```bash
   docker compose logs jeon-api
   ```

4. **컨테이너 재시작**
   ```bash
   docker compose restart jeon-api
   ```

### SOC 추정 기능이 작동하지 않을 때

1. **SOC 추정기 상태 확인**
   ```bash
   curl http://localhost:8001/health | python3 -m json.tool
   ```
   - `soc_estimator_available`이 `false`인 경우:
     - 모델 파일이 있는지 확인: `docker compose exec jeon-api ls -la models/`
     - 환경 변수 확인: `docker compose exec jeon-api env | grep SOC_MODEL_PATH`
     - InfluxDB 연결 확인: `docker compose exec jeon-api env | grep INFLUXDB`

2. **모델 파일 경로 설정**
   - `docker-compose.yml`에서 `SOC_MODEL_PATH` 환경 변수 설정
   - 또는 모델 파일을 `backend/models/` 디렉토리에 복사

3. **로그에서 오류 확인**
   ```bash
   docker compose logs jeon-api | grep -i "soc\|estimator\|error"
   ```

## 📝 환경 변수 설정

### .env 파일 생성 (선택적)

```bash
# .env 파일 생성
cat > .env << EOF
# FastAPI 설정
MODEL_PATH=./models/model.pt
USE_ONNXRUNTIME=false
SOC_MODEL_PATH=models/gru_voltage.pt

# InfluxDB 설정
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=your-token-here
INFLUXDB_ORG=your-org
INFLUXDB_BUCKET=aicar_bms
EOF
```

### docker-compose.yml에서 직접 설정

```yaml
services:
  jeon-api:
    environment:
      - SOC_MODEL_PATH=${SOC_MODEL_PATH:-models/gru_voltage.pt}
      - INFLUXDB_URL=${INFLUXDB_URL:-}
      - INFLUXDB_TOKEN=${INFLUXDB_TOKEN:-}
      - INFLUXDB_ORG=${INFLUXDB_ORG:-}
      - INFLUXDB_BUCKET=${INFLUXDB_BUCKET:-aicar_bms}
```

## 🚀 일반 프로세스로 실행하기 (Docker 없이)

Docker를 사용하지 않고 직접 실행하려면:

### FastAPI 실행

```bash
cd /mnt/hdd1/jeon/dir-2/backend
python -m uvicorn app:app --host 0.0.0.0 --port 8001
```

### Next.js 실행

```bash
cd /mnt/hdd1/jeon/dir-2
npm run dev
# 또는
npm run build && npm start
```

**참고**: 일반 프로세스로 실행할 때는 `FASTAPI_URL` 환경 변수를 설정해야 합니다:
```bash
export FASTAPI_URL=http://localhost:8001
```

## 🔍 네트워크 확인

Docker 컨테이너 간 통신이 제대로 되는지 확인:

```bash
# jeon-web 컨테이너에서 jeon-api에 접근 테스트
docker compose exec jeon-web wget -O- http://jeon-api:8000/health

# 또는
docker compose exec jeon-web curl http://jeon-api:8000/health
```

## 📚 추가 리소스

- [Docker Compose 공식 문서](https://docs.docker.com/compose/)
- [Next.js Docker 배포 가이드](https://nextjs.org/docs/deployment#docker-image)
- [FastAPI Docker 배포 가이드](https://fastapi.tiangolo.com/deployment/docker/)

