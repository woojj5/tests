#!/bin/bash
# 서버 상태 확인 스크립트

echo "🔍 서버 상태 확인"
echo "=================="
echo ""

# 색상 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. 포트 확인
echo "1️⃣ 포트 사용 현황"
echo "------------------"
if netstat -tuln 2>/dev/null | grep -q ":8001" || ss -tuln 2>/dev/null | grep -q ":8001"; then
    echo -e "  포트 8001 (FastAPI): ${GREEN}사용 중${NC}"
    netstat -tuln 2>/dev/null | grep ":8001" || ss -tuln 2>/dev/null | grep ":8001"
else
    echo -e "  포트 8001 (FastAPI): ${RED}사용 안 함${NC}"
fi

if netstat -tuln 2>/dev/null | grep -q ":3006" || ss -tuln 2>/dev/null | grep -q ":3006"; then
    echo -e "  포트 3006 (Next.js): ${GREEN}사용 중${NC}"
    netstat -tuln 2>/dev/null | grep ":3006" || ss -tuln 2>/dev/null | grep ":3006"
else
    echo -e "  포트 3006 (Next.js): ${RED}사용 안 함${NC}"
fi
echo ""

# 2. 프로세스 확인
echo "2️⃣ 실행 중인 프로세스"
echo "------------------"
if pgrep -f "uvicorn.*8001" > /dev/null; then
    echo -e "  FastAPI (uvicorn): ${GREEN}실행 중${NC}"
    ps aux | grep "uvicorn.*8001" | grep -v grep | head -1
else
    echo -e "  FastAPI (uvicorn): ${RED}실행 안 됨${NC}"
fi

if pgrep -f "next.*3006" > /dev/null || pgrep -f "node.*3006" > /dev/null; then
    echo -e "  Next.js: ${GREEN}실행 중${NC}"
    ps aux | grep -E "(next|node)" | grep 3006 | grep -v grep | head -1
else
    echo -e "  Next.js: ${RED}실행 안 됨${NC}"
fi
echo ""

# 3. 연결 테스트
echo "3️⃣ 서버 연결 테스트"
echo "------------------"

# FastAPI
echo -n "  FastAPI (http://localhost:8001/health): "
if curl -s --max-time 2 http://localhost:8001/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 연결 가능${NC}"
    curl -s http://localhost:8001/health | head -c 50
    echo ""
else
    echo -e "${RED}✗ 연결 불가${NC}"
fi

# Next.js
echo -n "  Next.js (http://localhost:3006/api/infer): "
if curl -s --max-time 2 http://localhost:3006/api/infer > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 연결 가능${NC}"
    curl -s http://localhost:3006/api/infer | head -c 50
    echo ""
else
    echo -e "${RED}✗ 연결 불가${NC}"
fi
echo ""

# 4. 실행 방법 안내
echo "4️⃣ 서버 실행 방법"
echo "------------------"
if ! curl -s --max-time 2 http://localhost:8001/health > /dev/null 2>&1; then
    echo -e "${YELLOW}FastAPI 서버 실행:${NC}"
    echo "  cd backend"
    echo "  uvicorn app:app --host 0.0.0.0 --port 8001 --reload"
    echo "  또는"
    echo "  ./backend/run.sh"
    echo ""
fi

if ! curl -s --max-time 2 http://localhost:3006/api/infer > /dev/null 2>&1; then
    echo -e "${YELLOW}Next.js 서버 실행:${NC}"
    echo "  npm run dev"
    echo "  또는"
    echo "  ./start-nextjs.sh"
    echo ""
fi

