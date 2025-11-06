#!/bin/bash
# 포트 사용 현황 확인 스크립트

echo "=== 포트 사용 현황 확인 ==="
echo ""

# 확인할 포트 목록
PORTS=(8000 3006 3000 8080 8081 5432 6379 3306)

# netstat 사용 가능 여부 확인
if command -v netstat &> /dev/null; then
    echo "📊 netstat으로 확인:"
    for port in "${PORTS[@]}"; do
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            echo "  ⚠️  포트 $port: 사용 중"
            netstat -tuln 2>/dev/null | grep ":$port " | head -1
        else
            echo "  ✅ 포트 $port: 사용 가능"
        fi
    done
    echo ""
fi

# ss 사용 가능 여부 확인
if command -v ss &> /dev/null; then
    echo "📊 ss로 확인:"
    for port in "${PORTS[@]}"; do
        if ss -tuln 2>/dev/null | grep -q ":$port "; then
            echo "  ⚠️  포트 $port: 사용 중"
            ss -tuln 2>/dev/null | grep ":$port " | head -1
        else
            echo "  ✅ 포트 $port: 사용 가능"
        fi
    done
    echo ""
fi

# lsof 사용 가능 여부 확인
if command -v lsof &> /dev/null; then
    echo "📊 lsof로 확인 (프로세스 정보):"
    for port in "${PORTS[@]}"; do
        result=$(lsof -i :$port 2>/dev/null)
        if [ -n "$result" ]; then
            echo "  ⚠️  포트 $port: 사용 중"
            echo "$result" | head -3
        else
            echo "  ✅ 포트 $port: 사용 가능"
        fi
    done
    echo ""
fi

# Docker 컨테이너 포트 확인
if command -v docker &> /dev/null; then
    echo "🐳 Docker 컨테이너 포트 확인:"
    running=$(docker ps --format "table {{.Names}}\t{{.Ports}}" 2>/dev/null | grep -E "(8000|3006|3000)")
    if [ -n "$running" ]; then
        echo "$running"
    else
        echo "  Docker 컨테이너 실행 중 없음"
    fi
    echo ""
fi

# 프로젝트 관련 포트 요약
echo "=== 프로젝트 포트 요약 ==="
echo "  FastAPI (jeon-api):  8000"
echo "  Next.js (jeon-web):   3006"
echo "  Next.js (기본):      3000"
echo ""

