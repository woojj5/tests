#!/bin/bash
# 통합 테스트 스크립트

echo "🧪 FastAPI + Next.js 통합 테스트"
echo "=================================="
echo ""

# 색상 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 테스트 카운터
PASSED=0
FAILED=0

# 테스트 함수
test_endpoint() {
    local name=$1
    local url=$2
    local method=${3:-GET}
    local data=${4:-""}
    
    echo -n "테스트: $name ... "
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" --max-time 5 -X POST "$url" \
            -H "Content-Type: application/json" \
            -d "$data" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" --max-time 5 "$url" 2>/dev/null)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✓ 성공${NC} (HTTP $http_code)"
        echo "  응답: $body" | head -c 100
        echo ""
        ((PASSED++))
        return 0
    elif [ "$http_code" = "000" ]; then
        echo -e "${RED}✗ 연결 실패${NC} (서버가 실행되지 않았거나 연결할 수 없음)"
        echo "  URL: $url"
        echo "  확인: curl $url 또는 서버 실행 상태 확인"
        ((FAILED++))
        return 1
    else
        echo -e "${RED}✗ 실패${NC} (HTTP $http_code)"
        echo "  응답: $body"
        ((FAILED++))
        return 1
    fi
}

# 1. FastAPI 헬스 체크
echo "1️⃣ FastAPI 서버 확인"
test_endpoint "FastAPI Health" "http://localhost:8001/health"
echo ""

# 2. FastAPI 직접 추론
echo "2️⃣ FastAPI 직접 추론"
test_endpoint "FastAPI Inference" "http://localhost:8001/infer" "POST" '{"inputs": [1.0, 2.0, 3.0, 4.0]}'
echo ""

# 3. Next.js 브릿지 상태 확인
echo "3️⃣ Next.js 브릿지 상태"
test_endpoint "Next.js Bridge Status" "http://localhost:3006/api/infer"
echo ""

# 4. Next.js 브릿지를 통한 추론
echo "4️⃣ Next.js 브릿지 추론"
test_endpoint "Next.js Bridge Inference" "http://localhost:3006/api/infer" "POST" '{"inputs": [1.0, 2.0, 3.0, 4.0]}'
echo ""

# 5. 성능 테스트
echo "5️⃣ 성능 테스트"
echo -n "  FastAPI 직접 호출 지연 시간: "
time_start=$(date +%s%N)
curl -s -X POST http://localhost:8001/infer \
    -H "Content-Type: application/json" \
    -d '{"inputs": [1.0, 2.0, 3.0]}' > /dev/null
time_end=$(date +%s%N)
duration=$(( (time_end - time_start) / 1000000 ))
echo "${duration}ms"

echo -n "  Next.js 브릿지 호출 지연 시간: "
time_start=$(date +%s%N)
curl -s -X POST http://localhost:3006/api/infer \
    -H "Content-Type: application/json" \
    -d '{"inputs": [1.0, 2.0, 3.0]}' > /dev/null
time_end=$(date +%s%N)
duration=$(( (time_end - time_start) / 1000000 ))
echo "${duration}ms"
echo ""

# 결과 요약
echo "=================================="
echo "테스트 결과 요약"
echo "=================================="
echo -e "${GREEN}성공: $PASSED${NC}"
echo -e "${RED}실패: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ 모든 테스트 통과!${NC}"
    echo ""
    echo "🎉 통합 시스템이 정상 작동 중입니다!"
    echo ""
    echo "다음 단계:"
    echo "  - 브라우저에서 http://localhost:3006 접속"
    echo "  - API를 사용하여 애플리케이션에 통합"
    exit 0
else
    echo -e "${RED}❌ 일부 테스트 실패${NC}"
    exit 1
fi

