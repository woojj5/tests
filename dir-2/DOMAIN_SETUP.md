# keti-ev1.iptime.org 도메인 접근 설정 가이드

## 🎯 목표

외부에서 `keti-ev1.iptime.org:8001` (FastAPI)와 `keti-ev1.iptime.org:3006` (Next.js)로 접근 가능하도록 설정

## ✅ 현재 상태

Docker Compose는 이미 `0.0.0.0:포트`로 설정되어 있어 모든 인터페이스에서 접근 가능합니다.

## 🔧 설정 방법

### 방법 1: 로컬 hosts 파일 설정 (로컬 테스트용)

**로컬에서 테스트할 때:**

```bash
# /etc/hosts 파일 수정
sudo nano /etc/hosts

# 다음 줄 추가:
127.0.0.1    keti-ev1.iptime.org
```

그러면 로컬에서 `http://keti-ev1.iptime.org:3006`으로 접근 가능합니다.

### 방법 2: 실제 도메인 설정 (외부 접근)

**iptime 라우터 설정 필요:**

1. **포트 포워딩 설정**
   - iptime 관리자 페이지 접속 (보통 `192.168.0.1`)
   - 고급 설정 → NAT/라우터 관리 → 포트포워드
   - 다음 규칙 추가:
     ```
     외부 포트: 8001 → 내부 IP: [서버 IP] → 내부 포트: 8001 (FastAPI)
     외부 포트: 3006 → 내부 IP: [서버 IP] → 내부 포트: 3006 (Next.js)
     ```

2. **DDNS 설정 확인**
   - iptime에서 DDNS 설정 확인
   - `keti-ev1.iptime.org`가 현재 서버 IP로 매핑되어 있는지 확인

3. **방화벽 설정**
   ```bash
   # UFW 사용 시
   sudo ufw allow 8001/tcp
   sudo ufw allow 3006/tcp
   
   # 또는 iptables
   sudo iptables -A INPUT -p tcp --dport 8001 -j ACCEPT
   sudo iptables -A INPUT -p tcp --dport 3006 -j ACCEPT
   ```

### 방법 3: Nginx 리버스 프록시 설정 (권장)

**포트 80/443으로 접근하고 싶을 때:**

```nginx
# /etc/nginx/sites-available/keti-ev1
server {
    listen 80;
    server_name keti-ev1.iptime.org;

    # FastAPI
    location /api/infer {
        proxy_pass http://localhost:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Next.js
    location / {
        proxy_pass http://localhost:3006;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🚀 빠른 설정 (로컬 테스트)

### 1. Docker Compose 실행

```bash
cd /mnt/hdd1/jeon/dir-2
docker compose up -d --build
```

### 2. 로컬 hosts 파일 설정 (선택적)

```bash
echo "127.0.0.1 keti-ev1.iptime.org" | sudo tee -a /etc/hosts
```

### 3. 접근 테스트

```bash
# 로컬에서
curl http://keti-ev1.iptime.org:3006
curl http://keti-ev1.iptime.org:8001/health
```

## 📝 확인 사항

### 현재 서버 IP 확인

```bash
hostname -I
# 또는
ip addr show | grep "inet " | grep -v 127.0.0.1
```

### 포트 리스닝 확인

```bash
netstat -tuln | grep -E ':(8001|3006)'
# 또는
ss -tuln | grep -E ':(8001|3006)'
```

### 외부에서 접근 가능한지 확인

다른 컴퓨터에서:
```bash
curl http://keti-ev1.iptime.org:3006
curl http://keti-ev1.iptime.org:8001/health
```

## 🔒 보안 고려사항

1. **방화벽**: 필요한 포트만 열기
2. **HTTPS**: 프로덕션에서는 SSL/TLS 사용 권장
3. **인증**: 외부 접근 시 인증 추가 고려

## 💡 문제 해결

### 연결이 안 될 때

1. **포트 확인:**
   ```bash
   ./scripts/check-ports.sh
   ```

2. **Docker 컨테이너 확인:**
   ```bash
   docker compose ps
   docker compose logs
   ```

3. **방화벽 확인:**
   ```bash
   sudo ufw status
   # 또는
   sudo iptables -L -n
   ```

4. **라우터 포트포워딩 확인:**
   - iptime 관리자 페이지에서 확인

