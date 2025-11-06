# CI/CD 배포 가이드

Next.js 애플리케이션을 자동으로 배포하는 여러 방법을 안내합니다.

## 🚀 배포 방법 선택

### 1. GitHub Actions (권장)
- GitHub에 코드를 푸시하면 자동 배포
- 무료 (공개 저장소)
- 설정이 간단

### 2. GitLab CI/CD
- GitLab 저장소 사용 시
- 자체 호스팅 가능

### 3. 간단한 배포 스크립트
- 서버에서 직접 실행
- 가장 간단한 방법

### 4. Webhook 기반 배포
- GitHub/GitLab에서 푸시 시 자동 실행
- 서버에 webhook 서버 필요

## 📋 방법 1: GitHub Actions

### 1.1 GitHub Secrets 설정

GitHub 저장소 → Settings → Secrets and variables → Actions에서 다음 secrets 추가:

- `SERVER_HOST`: 서버 IP 또는 도메인 (예: `keti-ev1.iptime.org`)
- `SERVER_USER`: SSH 사용자명 (예: `root`)
- `SERVER_SSH_KEY`: SSH 개인 키 (전체 내용)
- `SERVER_PORT`: SSH 포트 (기본값: 22, 선택사항)

### 1.2 SSH 키 생성 및 설정

```bash
# 서버에서 SSH 키 생성 (없는 경우)
ssh-keygen -t ed25519 -C "github-actions"

# 공개 키를 authorized_keys에 추가
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys

# 개인 키 내용 복사 (GitHub Secrets에 추가)
cat ~/.ssh/id_ed25519
```

### 1.3 워크플로우 파일

`.github/workflows/deploy.yml` 파일이 이미 생성되어 있습니다.

### 1.4 사용 방법

```bash
# main 브랜치에 푸시하면 자동 배포
git push origin main

# 수동 실행: GitHub Actions 탭에서 "Run workflow" 클릭
```

## 📋 방법 2: GitLab CI/CD

### 2.1 GitLab Variables 설정

GitLab 프로젝트 → Settings → CI/CD → Variables에서 다음 변수 추가:

- `SERVER_HOST`: 서버 IP 또는 도메인
- `SERVER_USER`: SSH 사용자명
- `SSH_PRIVATE_KEY`: SSH 개인 키

### 2.2 CI/CD 파일

`.gitlab-ci.yml` 파일이 이미 생성되어 있습니다.

### 2.3 사용 방법

```bash
# main 브랜치에 푸시하면 자동 배포
git push origin main
```

## 📋 방법 3: 간단한 배포 스크립트

### 3.1 스크립트 실행

```bash
cd /mnt/hdd1/jeon/dir-2

# 기본 배포 (main 브랜치, Docker 사용)
./scripts/deploy.sh

# 다른 브랜치 배포
./scripts/deploy.sh develop

# Docker 없이 배포 (systemd 사용)
./scripts/deploy.sh main false

# 간단한 배포 (빠른 실행)
./scripts/simple-deploy.sh
```

### 3.2 Cron으로 자동 배포

```bash
# 매일 자정에 자동 배포
crontab -e

# 다음 줄 추가
0 0 * * * /mnt/hdd1/jeon/dir-2/scripts/deploy.sh main true >> /var/log/deploy.log 2>&1
```

## 📋 방법 4: Webhook 기반 배포

### 4.1 Webhook 서버 설정

```bash
# webhook 서버 설치 (예: webhook)
# https://github.com/adnanh/webhook

# webhook 설정 파일 생성
cat > /etc/webhook/hooks.json << EOF
[
  {
    "id": "deploy-nextjs",
    "execute-command": "/mnt/hdd1/jeon/dir-2/scripts/webhook-deploy.sh",
    "command-working-directory": "/mnt/hdd1/jeon/dir-2",
    "pass-arguments-to-command": [
      {
        "source": "header",
        "name": "X-GitHub-Event"
      }
    ],
    "trigger-rule": {
      "match": {
        "type": "payload-hash-sha1",
        "secret": "your-secret-token",
        "parameter": {
          "source": "header",
          "name": "X-Hub-Signature"
        }
      }
    }
  }
]
EOF

# webhook 서버 실행
webhook -hooks /etc/webhook/hooks.json -verbose
```

### 4.2 GitHub Webhook 설정

GitHub 저장소 → Settings → Webhooks → Add webhook:

- Payload URL: `http://keti-ev1.iptime.org:9000/hooks/deploy-nextjs`
- Content type: `application/json`
- Secret: `your-secret-token`
- Events: `Just the push event`

### 4.3 환경 변수 설정

```bash
# webhook 스크립트에서 사용할 시크릿 토큰 설정
export WEBHOOK_SECRET="your-secret-token"
```

## 🔧 배포 스크립트 상세

### deploy.sh

```bash
# 사용법
./scripts/deploy.sh [브랜치] [docker_사용여부]

# 예시
./scripts/deploy.sh main true    # main 브랜치, Docker 사용
./scripts/deploy.sh develop false # develop 브랜치, systemd 사용
```

**기능:**
1. Git 업데이트
2. 의존성 설치
3. 타입 체크
4. 빌드
5. Docker/systemd 재시작
6. 헬스 체크

### simple-deploy.sh

```bash
# 사용법
./scripts/simple-deploy.sh
```

**기능:**
- 빠른 배포 (타입 체크 제외)
- Docker 재시작

### webhook-deploy.sh

```bash
# 사용법 (webhook 서버에서 호출)
./scripts/webhook-deploy.sh [secret_token]
```

**기능:**
- Webhook에서 호출
- 토큰 기반 인증
- 로그 기록

## 🚀 빠른 시작

### 가장 간단한 방법

```bash
cd /mnt/hdd1/jeon/dir-2
./scripts/simple-deploy.sh
```

### GitHub Actions 사용 (권장)

1. GitHub Secrets 설정
2. `.github/workflows/deploy.yml` 확인
3. `git push origin main`

## 🔍 문제 해결

### 배포 실패 시

```bash
# 로그 확인
docker compose logs jeon-web
tail -f /var/log/webhook-deploy.log

# 수동 배포 테스트
./scripts/deploy.sh main true

# 서버 상태 확인
curl http://localhost:3006
docker compose ps
```

### SSH 연결 문제

```bash
# SSH 키 권한 확인
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub

# SSH 연결 테스트
ssh user@server "echo 'SSH connection successful'"
```

### 빌드 실패

```bash
# 의존성 재설치
rm -rf node_modules package-lock.json
npm install

# 빌드 캐시 삭제
rm -rf .next
npm run build
```

## 📝 배포 체크리스트

- [ ] Git 저장소 설정
- [ ] 서버 SSH 접근 가능
- [ ] Docker 설치 및 실행 중
- [ ] 환경 변수 설정 (.env.local)
- [ ] 포트 3006 열림
- [ ] GitHub Secrets / GitLab Variables 설정 (CI/CD 사용 시)
- [ ] 배포 스크립트 실행 권한 (`chmod +x scripts/*.sh`)

## 💡 추천 설정

### 개발 환경
- 간단한 배포 스크립트 사용
- 수동 배포

### 운영 환경
- GitHub Actions 또는 GitLab CI/CD
- 자동 배포
- 헬스 체크 포함

## 📚 추가 리소스

- [GitHub Actions 문서](https://docs.github.com/en/actions)
- [GitLab CI/CD 문서](https://docs.gitlab.com/ee/ci/)
- [Docker Compose 문서](https://docs.docker.com/compose/)
- [Webhook 서버](https://github.com/adnanh/webhook)

