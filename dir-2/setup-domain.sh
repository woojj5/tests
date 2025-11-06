#!/bin/bash
# keti-ev1.iptime.org 도메인 접근 설정 스크립트

echo "🔧 keti-ev1.iptime.org 도메인 접근 설정"
echo "=========================================="
echo ""

# 현재 서버 IP 확인
SERVER_IP=$(hostname -I | awk '{print $1}')
echo "📌 현재 서버 IP: $SERVER_IP"
echo ""

# 방법 1: 로컬 hosts 파일 설정 (로컬 테스트용)
echo "1️⃣ 로컬 hosts 파일 설정 (로컬 테스트용)"
echo "----------------------------------------"
if grep -q "keti-ev1.iptime.org" /etc/hosts 2>/dev/null; then
    echo "  ✅ 이미 설정되어 있습니다:"
    grep "keti-ev1.iptime.org" /etc/hosts
else
    echo "  ⚠️  설정되지 않음"
    echo ""
    echo "  로컬에서 테스트하려면 다음 명령 실행:"
    echo "    sudo bash -c 'echo \"$SERVER_IP keti-ev1.iptime.org\" >> /etc/hosts'"
    echo "    또는"
    echo "    sudo bash -c 'echo \"127.0.0.1 keti-ev1.iptime.org\" >> /etc/hosts'"
fi
echo ""

# 방법 2: 실제 외부 접근 설정
echo "2️⃣ 외부 접근 설정 (iptime 라우터)"
echo "----------------------------------------"
echo "  다음 작업이 필요합니다:"
echo ""
echo "  a) iptime 라우터 관리자 페이지 접속"
echo "     - 주소: http://192.168.0.1 (또는 라우터 IP)"
echo ""
echo "  b) 포트포워딩 설정"
echo "     - 고급 설정 → NAT/라우터 관리 → 포트포워드"
echo "     - 규칙 추가:"
echo "       외부 포트: 8001 → 내부 IP: $SERVER_IP → 내부 포트: 8001 (FastAPI)"
echo "       외부 포트: 3006 → 내부 IP: $SERVER_IP → 내부 포트: 3006 (Next.js)"
echo ""
echo "  c) DDNS 설정 확인"
echo "     - iptime 관리 → DDNS 설정"
echo "     - keti-ev1.iptime.org가 현재 공인 IP로 매핑되어 있는지 확인"
echo ""

# 방법 3: 방화벽 확인
echo "3️⃣ 방화벽 설정 확인"
echo "----------------------------------------"
if command -v ufw &> /dev/null; then
    echo "  UFW 상태:"
    sudo ufw status | head -5
    echo ""
    echo "  포트 열기 (필요시):"
    echo "    sudo ufw allow 8001/tcp"
    echo "    sudo ufw allow 3006/tcp"
elif command -v firewall-cmd &> /dev/null; then
    echo "  firewalld 사용 중"
    echo "  포트 열기 (필요시):"
    echo "    sudo firewall-cmd --add-port=8001/tcp --permanent"
    echo "    sudo firewall-cmd --add-port=3006/tcp --permanent"
    echo "    sudo firewall-cmd --reload"
else
    echo "  방화벽 설정 도구를 찾을 수 없습니다"
    echo "  iptables 사용 시:"
    echo "    sudo iptables -A INPUT -p tcp --dport 8001 -j ACCEPT"
    echo "    sudo iptables -A INPUT -p tcp --dport 3006 -j ACCEPT"
fi
echo ""

# 방법 4: Docker Compose 확인
echo "4️⃣ Docker Compose 설정 확인"
echo "----------------------------------------"
if [ -f docker-compose.yml ]; then
    echo "  ✅ docker-compose.yml 확인됨"
    if grep -q "0.0.0.0:8001" docker-compose.yml && grep -q "0.0.0.0:3006" docker-compose.yml; then
        echo "  ✅ 포트 매핑이 모든 인터페이스에 바인딩되어 있습니다"
    else
        echo "  ⚠️  포트 매핑 확인 필요"
    fi
else
    echo "  ❌ docker-compose.yml 파일 없음"
fi
echo ""

# 접근 테스트
echo "5️⃣ 접근 테스트"
echo "----------------------------------------"
echo "  로컬에서 테스트:"
echo "    curl http://keti-ev1.iptime.org:3006"
echo "    curl http://keti-ev1.iptime.org:8001/health"
echo ""
echo "  외부에서 테스트 (다른 컴퓨터/스마트폰):"
echo "    http://keti-ev1.iptime.org:3006"
echo "    http://keti-ev1.iptime.org:8001/health"
echo ""

