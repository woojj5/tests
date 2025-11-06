#!/bin/bash
# Next.js 서버 실행 스크립트 (서버용)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Next.js 서버 실행 스크립트${NC}"
echo ""

# 옵션 파싱
MODE="dev"  # dev 또는 prod
PORT=3006
HOST="0.0.0.0"
BACKGROUND=false
USE_SCREEN=false
SCREEN_NAME="nextjs-server"

while [[ $# -gt 0 ]]; do
    case $1 in
        --mode)
            MODE="$2"
            shift 2
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --host)
            HOST="$2"
            shift 2
            ;;
        --background|-b)
            BACKGROUND=true
            shift
            ;;
        --screen|-s)
            USE_SCREEN=true
            shift
            ;;
        --screen-name)
            SCREEN_NAME="$2"
            shift 2
            ;;
        --help|-h)
            echo "사용법: $0 [옵션]"
            echo ""
            echo "옵션:"
            echo "  --mode MODE          실행 모드: dev (기본값) 또는 prod"
            echo "  --port PORT          포트 번호 (기본값: 3006)"
            echo "  --host HOST          호스트 (기본값: 0.0.0.0)"
            echo "  --background, -b     백그라운드로 실행"
            echo "  --screen, -s         screen 세션에서 실행"
            echo "  --screen-name NAME   screen 세션 이름 (기본값: nextjs-server)"
            echo "  --help, -h           도움말 표시"
            echo ""
            echo "예시:"
            echo "  $0                                    # 개발 모드로 실행 (포트 3006)"
            echo "  $0 --mode prod --port 3007           # 프로덕션 모드로 실행 (포트 3007)"
            echo "  $0 --background                      # 백그라운드로 실행"
            echo "  $0 --screen                          # screen 세션에서 실행"
            exit 0
            ;;
        *)
            echo -e "${RED}알 수 없는 옵션: $1${NC}"
            exit 1
            ;;
    esac
done

# 포트 확인
if lsof -i :$PORT >/dev/null 2>&1 || fuser $PORT/tcp >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  포트 $PORT가 이미 사용 중입니다!${NC}"
    echo ""
    echo "사용 중인 프로세스:"
    lsof -i :$PORT 2>/dev/null || fuser $PORT/tcp 2>/dev/null || echo "  확인 불가"
    echo ""
    read -p "다른 포트를 사용하시겠습니까? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "포트 번호를 입력하세요: " PORT
    else
        echo -e "${RED}실행을 취소했습니다.${NC}"
        exit 1
    fi
fi

# 환경 변수 설정
if [ ! -f .env.local ]; then
    echo -e "${YELLOW}📝 .env.local 파일 생성 중...${NC}"
    cat > .env.local << EOF
# FastAPI 서버 URL
FASTAPI_URL=http://localhost:8001

# Next.js 설정
NODE_ENV=${MODE}
PORT=${PORT}
EOF
    echo -e "${GREEN}✅ .env.local 파일이 생성되었습니다.${NC}"
    echo ""
fi

# FastAPI 서버 확인 (선택적)
if curl -s http://localhost:8001/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ FastAPI 서버가 실행 중입니다 (http://localhost:8001)${NC}"
else
    echo -e "${YELLOW}⚠️  FastAPI 서버가 실행되지 않았습니다 (http://localhost:8001)${NC}"
    echo "   SOC 추정 기능이 작동하지 않을 수 있습니다."
fi
echo ""

# 프로덕션 모드인 경우 빌드 확인
if [ "$MODE" = "prod" ]; then
    if [ ! -d ".next" ]; then
        echo -e "${YELLOW}📦 프로덕션 빌드가 없습니다. 빌드를 시작합니다...${NC}"
        npm run build
        echo -e "${GREEN}✅ 빌드 완료${NC}"
        echo ""
    fi
fi

# 실행 명령어 구성
if [ "$MODE" = "prod" ]; then
    CMD="npm start -- -p $PORT -H $HOST"
else
    CMD="npm run dev -- -p $PORT -H $HOST"
fi

# 실행 방법 선택
if [ "$USE_SCREEN" = true ]; then
    # screen 세션에서 실행
    if screen -list | grep -q "$SCREEN_NAME"; then
        echo -e "${YELLOW}⚠️  screen 세션 '$SCREEN_NAME'이 이미 존재합니다.${NC}"
        echo "   기존 세션에 연결: screen -r $SCREEN_NAME"
        echo "   세션 목록: screen -ls"
        exit 1
    fi
    
    echo -e "${BLUE}📺 screen 세션 '$SCREEN_NAME'에서 실행합니다...${NC}"
    screen -dmS "$SCREEN_NAME" bash -c "$CMD; exec bash"
    echo -e "${GREEN}✅ screen 세션에서 실행 중입니다.${NC}"
    echo ""
    echo "세션에 연결: ${BLUE}screen -r $SCREEN_NAME${NC}"
    echo "세션 목록: ${BLUE}screen -ls${NC}"
    echo "세션 분리: ${BLUE}Ctrl+A, D${NC}"
    
elif [ "$BACKGROUND" = true ]; then
    # 백그라운드로 실행
    echo -e "${BLUE}🔄 백그라운드로 실행합니다...${NC}"
    nohup bash -c "$CMD" > nextjs.log 2>&1 &
    PID=$!
    echo -e "${GREEN}✅ Next.js 서버가 백그라운드에서 실행 중입니다 (PID: $PID)${NC}"
    echo ""
    echo "로그 확인: ${BLUE}tail -f nextjs.log${NC}"
    echo "프로세스 확인: ${BLUE}ps aux | grep $PID${NC}"
    echo "종료: ${BLUE}kill $PID${NC}"
    
else
    # 포그라운드로 실행
    echo -e "${GREEN}🌐 Next.js 서버 시작 중...${NC}"
    echo ""
    echo "접속 URL:"
    echo "  - 로컬: ${BLUE}http://localhost:$PORT${NC}"
    echo "  - 서버: ${BLUE}http://$(hostname -I | awk '{print $1}'):$PORT${NC}"
    if [ -n "$(hostname -f 2>/dev/null)" ]; then
        echo "  - 도메인: ${BLUE}http://$(hostname -f):$PORT${NC}"
    fi
    echo ""
    echo "중지: ${YELLOW}Ctrl+C${NC}"
    echo ""
    
    # 실행
    exec $CMD
fi

