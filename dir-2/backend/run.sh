#!/bin/bash
# FastAPI 서버 실행 스크립트

# 포트 설정 (환경 변수 또는 기본값)
PORT=${PORT:-8001}

echo "🚀 Starting FastAPI server on port $PORT..."
echo "   (포트 8000이 사용 중이므로 8001 사용)"
echo ""

# 포트 사용 확인
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -tuln 2>/dev/null | grep -q ":$PORT " || ss -tuln 2>/dev/null | grep -q ":$PORT "; then
    echo "⚠️  포트 $PORT가 이미 사용 중입니다!"
    echo "   다른 포트를 사용하세요:"
    echo "   PORT=8002 uvicorn app:app --host 0.0.0.0 --port 8002 --reload"
    exit 1
fi

# 서버 실행
uvicorn app:app --host 0.0.0.0 --port $PORT --reload

