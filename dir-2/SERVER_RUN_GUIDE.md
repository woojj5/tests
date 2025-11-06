# 서버에서 Next.js 실행 가이드

서버에서 Next.js를 실행하는 여러 방법을 안내합니다.

## 🚀 빠른 시작

### 1. 개발 모드로 실행 (가장 간단)

```bash
cd /mnt/hdd1/jeon/dir-2
npm run dev
```

- 포트: 3006
- 접속: `http://서버IP:3006` 또는 `http://keti-ev1.iptime.org:3006`
- 중지: `Ctrl+C`

### 2. 스크립트 사용 (권장)

```bash
cd /mnt/hdd1/jeon/dir-2
./scripts/start-nextjs-server.sh
```

옵션:
```bash
# 개발 모드 (기본)
./scripts/start-nextjs-server.sh

# 프로덕션 모드
./scripts/start-nextjs-server.sh --mode prod

# 다른 포트 사용
./scripts/start-nextjs-server.sh --port 3007

# 백그라운드 실행
./scripts/start-nextjs-server.sh --background

# screen 세션에서 실행 (터미널 종료 후에도 유지)
./scripts/start-nextjs-server.sh --screen
```

## 📋 실행 방법 상세

### 방법 1: 개발 모드 (개발/테스트용)

```bash
cd /mnt/hdd1/jeon/dir-2
npm run dev
```

**특징:**
- 핫 리로드 지원 (코드 변경 시 자동 반영)
- 개발 모드 최적화
- 디버깅 정보 제공

**접속:**
- 로컬: `http://localhost:3006`
- 서버: `http://서버IP:3006`
- 도메인: `http://keti-ev1.iptime.org:3006`

### 방법 2: 프로덕션 모드 (운영용)

```bash
cd /mnt/hdd1/jeon/dir-2

# 1. 빌드
npm run build

# 2. 실행
npm start
```

**특징:**
- 최적화된 프로덕션 빌드
- 빠른 응답 속도
- 메모리 효율적

### 방법 3: 백그라운드 실행

```bash
cd /mnt/hdd1/jeon/dir-2

# 방법 A: nohup 사용
nohup npm run dev > nextjs.log 2>&1 &

# 방법 B: 스크립트 사용
./scripts/start-nextjs-server.sh --background
```

**로그 확인:**
```bash
tail -f nextjs.log
```

**프로세스 확인:**
```bash
ps aux | grep next
```

**종료:**
```bash
# PID 확인
ps aux | grep "next dev"

# 종료
kill <PID>
```

### 방법 4: screen 세션 사용 (권장)

터미널을 종료해도 서버가 계속 실행됩니다.

```bash
cd /mnt/hdd1/jeon/dir-2

# 방법 A: 스크립트 사용
./scripts/start-nextjs-server.sh --screen

# 방법 B: 직접 실행
screen -S nextjs-server
npm run dev
# Ctrl+A, D로 분리
```

**screen 명령어:**
```bash
# 세션 목록
screen -ls

# 세션 연결
screen -r nextjs-server

# 세션 분리 (서버는 계속 실행)
# Ctrl+A, D

# 세션 종료
screen -X -S nextjs-server quit
```

### 방법 5: tmux 사용

```bash
cd /mnt/hdd1/jeon/dir-2

# 새 세션 생성
tmux new -s nextjs-server

# Next.js 실행
npm run dev

# 세션 분리: Ctrl+B, D
```

**tmux 명령어:**
```bash
# 세션 목록
tmux ls

# 세션 연결
tmux attach -t nextjs-server

# 세션 분리: Ctrl+B, D
# 세션 종료: exit 또는 Ctrl+D
```

### 방법 6: systemd 서비스 (운영 환경 권장)

서버 재부팅 후에도 자동으로 시작됩니다.

```bash
cd /mnt/hdd1/jeon/dir-2

# 1. 서비스 설치
sudo ./scripts/nextjs-service.sh install

# 2. 서비스 시작
sudo systemctl start nextjs-aicar

# 3. 서비스 상태 확인
sudo systemctl status nextjs-aicar

# 4. 서비스 로그 확인
sudo journalctl -u nextjs-aicar -f
```

**서비스 관리:**
```bash
# 시작
sudo systemctl start nextjs-aicar

# 중지
sudo systemctl stop nextjs-aicar

# 재시작
sudo systemctl restart nextjs-aicar

# 상태 확인
sudo systemctl status nextjs-aicar

# 로그 확인
sudo journalctl -u nextjs-aicar -f

# 서비스 제거
sudo ./scripts/nextjs-service.sh uninstall
```

## 🔧 포트 변경

포트 3006이 이미 사용 중인 경우:

```bash
# 개발 모드
npm run dev -- -p 3007

# 프로덕션 모드
npm start -- -p 3007

# 스크립트 사용
./scripts/start-nextjs-server.sh --port 3007
```

## 🌐 외부 접근 설정

### 방화벽 설정 (UFW)

```bash
# 포트 열기
sudo ufw allow 3006/tcp

# 방화벽 상태 확인
sudo ufw status
```

### iptables 설정

```bash
# 포트 열기
sudo iptables -A INPUT -p tcp --dport 3006 -j ACCEPT

# 설정 저장
sudo netfilter-persistent save
```

## 🔍 문제 해결

### 포트가 이미 사용 중일 때

```bash
# 사용 중인 프로세스 확인
lsof -i :3006
# 또는
fuser 3006/tcp

# 프로세스 종료
kill <PID>
```

### Next.js가 시작되지 않을 때

```bash
# 1. 의존성 설치 확인
npm install

# 2. 빌드 확인 (프로덕션 모드)
npm run build

# 3. 로그 확인
tail -f nextjs.log
# 또는
sudo journalctl -u nextjs-aicar -f
```

### FastAPI 연결 오류

```bash
# FastAPI 서버 확인
curl http://localhost:8001/health

# 환경 변수 확인
cat .env.local
```

## 📝 환경 변수 설정

`.env.local` 파일 생성:

```bash
cd /mnt/hdd1/jeon/dir-2
cat > .env.local << EOF
# FastAPI 서버 URL
FASTAPI_URL=http://localhost:8001

# Next.js 설정
NODE_ENV=production
PORT=3006
EOF
```

## 🎯 추천 설정

### 개발 환경
```bash
# screen 세션 사용
./scripts/start-nextjs-server.sh --screen
```

### 운영 환경
```bash
# systemd 서비스 사용
sudo ./scripts/nextjs-service.sh install
sudo systemctl start nextjs-aicar
sudo systemctl enable nextjs-aicar
```

## 📚 추가 리소스

- [Next.js 배포 문서](https://nextjs.org/docs/deployment)
- [systemd 서비스 가이드](https://www.freedesktop.org/software/systemd/man/systemd.service.html)
- [screen 사용법](https://www.gnu.org/software/screen/)
- [tmux 사용법](https://github.com/tmux/tmux/wiki)

