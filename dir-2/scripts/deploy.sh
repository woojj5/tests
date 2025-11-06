#!/bin/bash
# 자동 배포 스크립트

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 설정
PROJECT_DIR="/mnt/hdd1/jeon/dir-2"
BRANCH="${1:-main}"
USE_DOCKER="${2:-true}"

echo -e "${BLUE}🚀 배포 시작${NC}"
echo "프로젝트 디렉토리: $PROJECT_DIR"
echo "브랜치: $BRANCH"
echo "Docker 사용: $USE_DOCKER"
echo ""

cd "$PROJECT_DIR"

# 1. Git 업데이트
echo -e "${YELLOW}📥 Git 업데이트 중...${NC}"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"
echo -e "${GREEN}✅ Git 업데이트 완료${NC}"
echo ""

# 2. 의존성 설치
echo -e "${YELLOW}📦 의존성 설치 중...${NC}"
npm ci
echo -e "${GREEN}✅ 의존성 설치 완료${NC}"
echo ""

# 3. 타입 체크
echo -e "${YELLOW}🔍 타입 체크 중...${NC}"
npm run typecheck || {
    echo -e "${RED}❌ 타입 체크 실패${NC}"
    exit 1
}
echo -e "${GREEN}✅ 타입 체크 완료${NC}"
echo ""

# 4. 빌드
echo -e "${YELLOW}🔨 빌드 중...${NC}"
npm run build || {
    echo -e "${RED}❌ 빌드 실패${NC}"
    exit 1
}
echo -e "${GREEN}✅ 빌드 완료${NC}"
echo ""

# 5. 배포
if [ "$USE_DOCKER" = "true" ]; then
    echo -e "${YELLOW}🐳 Docker로 배포 중...${NC}"
    docker compose up -d --build jeon-web
    docker compose restart jeon-web
    echo -e "${GREEN}✅ Docker 배포 완료${NC}"
else
    echo -e "${YELLOW}🔄 서비스 재시작 중...${NC}"
    if systemctl is-active --quiet nextjs-aicar; then
        sudo systemctl restart nextjs-aicar
        echo -e "${GREEN}✅ systemd 서비스 재시작 완료${NC}"
    else
        echo -e "${YELLOW}⚠️  systemd 서비스가 없습니다. 수동으로 재시작하세요.${NC}"
    fi
fi
echo ""

# 6. 헬스 체크
echo -e "${YELLOW}🏥 헬스 체크 중...${NC}"
sleep 10
if curl -f http://localhost:3006 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 서버가 정상적으로 실행 중입니다${NC}"
else
    echo -e "${RED}❌ 서버 헬스 체크 실패${NC}"
    exit 1
fi
echo ""

echo -e "${GREEN}🎉 배포 완료!${NC}"
echo "접속 URL: http://keti-ev1.iptime.org:3006"

