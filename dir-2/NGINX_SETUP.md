# Nginx 리버스 프록시 설정 가이드

## 🎯 목표

포트 번호 없이 도메인 이름으로만 접근:
- `http://keti-ev1.iptime.org` (Next.js)
- `http://keti-ev1.iptime.org/api/infer` (FastAPI)
- `http://api.keti-ev1.iptime.org` (FastAPI - 서브도메인)

## 🚀 실행 방법

### Docker Compose로 실행 (Nginx 포함)

```bash
cd /mnt/hdd1/jeon/dir-2
docker compose up -d --build
```

**접근 URL:**
- Next.js: `http://keti-ev1.iptime.org`
- FastAPI (경로): `http://keti-ev1.iptime.org/api/infer`
- FastAPI (서브도메인): `http://api.keti-ev1.iptime.org`

## 📋 설정 구조

```
┌─────────────────┐
│   외부 클라이언트  │
└────────┬────────┘
         │ http://keti-ev1.iptime.org:80
         │
    ┌────▼────┐
    │  Nginx  │  (포트 80)
    │ 프록시  │
    └───┬─────┘
        │
    ┌───┴──────┐
    │          │
┌───▼───┐  ┌──▼────┐
│Next.js│  │FastAPI│
│ :3006 │  │ :8001 │
└───────┘  └───────┘
```

## 🔧 Nginx 설정 파일

`nginx/nginx.conf` 파일에서 설정 변경 가능:

```nginx
# Next.js 접근
location / {
    proxy_pass http://nextjs;  # → http://localhost:3006
}

# FastAPI 접근
location /api/infer {
    proxy_pass http://fastapi/infer;  # → http://localhost:8001/infer
}
```

## 📝 접근 경로

### 방법 1: 경로로 구분 (기본)

- `http://keti-ev1.iptime.org/` → Next.js
- `http://keti-ev1.iptime.org/api/infer` → FastAPI
- `http://keti-ev1.iptime.org/api/health` → FastAPI 헬스 체크
- `http://keti-ev1.iptime.org/fastapi/` → FastAPI 직접

### 방법 2: 서브도메인으로 구분

- `http://keti-ev1.iptime.org` → Next.js
- `http://api.keti-ev1.iptime.org` → FastAPI

**서브도메인 설정:**
- iptime DDNS에서 `api.keti-ev1.iptime.org` 추가
- 또는 DNS에서 CNAME 레코드 추가

## 🔄 설정 변경 후 재시작

```bash
# Nginx 설정 변경 후
docker compose restart nginx

# 또는 전체 재시작
docker compose down
docker compose up -d --build
```

## 🧪 테스트

```bash
# Next.js 접근
curl http://keti-ev1.iptime.org

# FastAPI 접근 (경로)
curl http://keti-ev1.iptime.org/api/health
curl -X POST http://keti-ev1.iptime.org/api/infer \
  -H "Content-Type: application/json" \
  -d '{"inputs": [1.0, 2.0, 3.0]}'

# FastAPI 접근 (서브도메인)
curl http://api.keti-ev1.iptime.org/health
```

## 🔒 HTTPS 설정 (선택적)

```nginx
# SSL 인증서 설정
server {
    listen 443 ssl;
    server_name keti-ev1.iptime.org;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # ... 기존 설정 ...
}
```

## 💡 포트 직접 접근도 가능

포트 직접 접근도 원하면:
- `docker-compose.yml`에서 `127.0.0.1:3006` → `0.0.0.0:3006`으로 변경
- 그러면 `http://keti-ev1.iptime.org:3006`도 접근 가능

