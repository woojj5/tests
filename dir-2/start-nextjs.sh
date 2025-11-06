#!/bin/bash
# Next.js 서버 실행 스크립트

cd /mnt/hdd1/jeon/dir-2

echo "🚀 Starting Next.js server..."
echo ""

# 환경 변수 설정
if [ ! -f .env.local ]; then
    echo "📝 Creating .env.local file..."
    echo "FASTAPI_URL=http://localhost:8001" > .env.local
    echo "✅ .env.local created with FASTAPI_URL=http://localhost:8001"
    echo ""
fi

# 포트 확인
if netstat -tuln 2>/dev/null | grep -q ":3006 " || ss -tuln 2>/dev/null | grep -q ":3006 "; then
    echo "⚠️  포트 3006이 이미 사용 중입니다!"
    echo "   다른 포트를 사용하세요:"
    echo "   npm run dev -- -p 3007"
    exit 1
fi

# FastAPI 서버 확인
if ! curl -s http://localhost:8001/health > /dev/null 2>&1; then
    echo "⚠️  FastAPI 서버가 실행되지 않았습니다!"
    echo "   먼저 FastAPI 서버를 실행하세요:"
    echo "   cd backend && uvicorn app:app --host 0.0.0.0 --port 8001 --reload"
    echo ""
    read -p "계속하시겠습니까? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "✅ 환경 설정 완료"
echo "✅ FastAPI 서버 확인: http://localhost:8001"
echo ""
echo "🌐 Next.js 서버 시작 중..."
echo "   브라우저에서 http://localhost:3006 접속 가능합니다"
echo ""
echo "   API 엔드포인트:"
echo "   - GET  http://localhost:3006/api/infer (상태 확인)"
echo "   - POST http://localhost:3006/api/infer (추론 요청)"
echo ""
echo "   중지: Ctrl+C"
echo ""

# Next.js 서버 실행
npm run dev

