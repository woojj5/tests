# 브라우저 접속 문제 해결 가이드

## ✅ 서버 상태 확인

서버는 정상적으로 실행 중입니다:
- **Next.js**: 포트 3006에서 실행 중
- **FastAPI**: 포트 8001에서 실행 중

## 🔍 브라우저 접속이 안 되는 경우

### 1. 브라우저 캐시 문제
브라우저 캐시를 지우고 다시 시도하세요:
- **Chrome/Edge**: `Ctrl+Shift+Delete` → 캐시 삭제
- **Firefox**: `Ctrl+Shift+Delete` → 캐시 삭제
- 또는 **시크릿 모드**로 접속 시도

### 2. 올바른 URL 확인
다음 URL을 사용하세요:
- **로컬**: `http://localhost:3006/analysis`
- **외부**: `http://keti-ev1.iptime.org:3006/analysis`

### 3. 방화벽 확인
서버에서 방화벽이 포트 3006을 차단하고 있는지 확인:
```bash
# UFW 확인
sudo ufw status

# iptables 확인
sudo iptables -L -n | grep 3006
```

### 4. 다른 브라우저로 시도
다른 브라우저(Chrome, Firefox, Edge 등)로 접속을 시도해보세요.

### 5. 서버 재시작
서버를 재시작해보세요:
```bash
cd /mnt/hdd1/jeon/dir-2
docker compose restart jeon-web
```

### 6. 로그 확인
에러 로그를 확인하세요:
```bash
docker compose logs jeon-web --tail=100
```

## 🧪 접속 테스트

터미널에서 다음 명령어로 접속을 테스트할 수 있습니다:
```bash
# 로컬 접속 테스트
curl http://localhost:3006/analysis

# 외부 접속 테스트 (서버에서)
curl http://keti-ev1.iptime.org:3006/analysis
```

## 💡 추가 확인 사항

1. **프록시 설정**: 브라우저에 프록시 설정이 있는지 확인
2. **VPN**: VPN을 사용 중이라면 비활성화 후 시도
3. **호스트 파일**: `/etc/hosts` 파일에 `localhost`가 올바르게 설정되어 있는지 확인

## 📞 문제가 계속되면

다음 정보를 확인하세요:
- 브라우저 콘솔 에러 메시지 (F12 → Console)
- 네트워크 탭에서 실패한 요청 확인 (F12 → Network)
- 서버 로그: `docker compose logs jeon-web`

