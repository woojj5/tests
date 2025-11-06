# 외부 접근 가이드

## 🌐 접근 URL

### 도메인 사용 (권장)
- **Next.js 웹 애플리케이션**: `http://keti-ev1.iptime.org:3006`
- **FastAPI 추론 API**: `http://keti-ev1.iptime.org:8001`

### IP 주소 사용
- **Next.js 웹 애플리케이션**: `http://59.14.241.229:3006`
- **FastAPI 추론 API**: `http://59.14.241.229:8001`

## 🔧 설정 확인

### 1. 포트 노출 확인
```bash
# Docker Compose 상태 확인
docker compose ps

# 포트 리스닝 확인
netstat -tuln | grep -E ":(3006|8001)"
# 또는
ss -tuln | grep -E ":(3006|8001)"
```

### 2. 방화벽 설정 (UFW 사용 시)
```bash
# 포트 열기
sudo ufw allow 3006/tcp
sudo ufw allow 8001/tcp

# 방화벽 상태 확인
sudo ufw status
```

### 3. iptables 설정 (직접 관리 시)
```bash
# 포트 열기
sudo iptables -A INPUT -p tcp --dport 3006 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 8001 -j ACCEPT

# 설정 저장 (Ubuntu/Debian)
sudo netfilter-persistent save
```

## 🧪 외부 접근 테스트

### 로컬에서 테스트
```bash
# Next.js 접근 테스트
curl http://keti-ev1.iptime.org:3006

# FastAPI 헬스 체크
curl http://keti-ev1.iptime.org:8001/health

# FastAPI 추론 테스트
curl -X POST http://keti-ev1.iptime.org:8001/infer \
  -H "Content-Type: application/json" \
  -d '{"inputs": [1.0, 2.0, 3.0]}'

# Next.js 브릿지 테스트
curl -X POST http://keti-ev1.iptime.org:3006/api/infer \
  -H "Content-Type: application/json" \
  -d '{"inputs": [1.0, 2.0, 3.0]}'
```

### 외부에서 테스트
다른 컴퓨터나 모바일에서 브라우저로 접근:
- `http://keti-ev1.iptime.org:3006`
- `http://keti-ev1.iptime.org:8001/health`

## 🔒 보안 고려사항

### 1. HTTPS 설정 (선택적)
```nginx
# Nginx 리버스 프록시 사용 시
# SSL 인증서 설정 필요
```

### 2. 인증 추가 (선택적)
- FastAPI에 API 키 인증 추가
- Next.js에 로그인 기능 추가

### 3. IP 화이트리스트 (선택적)
```bash
# 특정 IP만 허용
sudo ufw allow from 192.168.1.0/24 to any port 3006
sudo ufw allow from 192.168.1.0/24 to any port 8001
```

## 📱 모바일/태블릿 접근

같은 네트워크 또는 인터넷에서:
- `http://keti-ev1.iptime.org:3006`
- `http://59.14.241.229:3006`

## 🚨 문제 해결

### 연결이 안 될 때

1. **포트 확인**
   ```bash
   docker compose ps
   # PORTS 컬럼에 0.0.0.0:3006->3006/tcp 확인
   ```

2. **방화벽 확인**
   ```bash
   sudo ufw status
   sudo iptables -L -n | grep -E "(3006|8001)"
   ```

3. **라우터 포트 포워딩** (필요한 경우)
   - iptime 라우터 설정에서 포트 포워딩 추가
   - 외부 포트 3006 → 내부 IP:3006
   - 외부 포트 8001 → 내부 IP:8001

4. **Docker 네트워크 확인**
   ```bash
   docker network inspect dir-2_app-net
   ```

5. **서비스 로그 확인**
   ```bash
   docker compose logs jeon-web
   docker compose logs jeon-api
   ```

## 📝 현재 설정

### Docker Compose 포트 매핑
```yaml
jeon-web:
  ports:
    - "0.0.0.0:3006:3006"  # 모든 인터페이스에서 접근 가능

jeon-api:
  ports:
    - "0.0.0.0:8001:8000"  # 모든 인터페이스에서 접근 가능
```

`0.0.0.0`으로 설정되어 있어 외부에서 접근 가능합니다.

## 🔄 동적 IP 대응

공인 IP가 변경되면:
1. iptime DDNS가 자동으로 업데이트 (keti-ev1.iptime.org)
2. 도메인 이름 사용 시 IP 변경에 영향 없음

