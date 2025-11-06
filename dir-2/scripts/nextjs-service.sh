#!/bin/bash
# Next.js systemd 서비스 관리 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_NAME="nextjs-aicar"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
USER="${SUDO_USER:-$USER}"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

function install_service() {
    echo -e "${BLUE}📦 Next.js systemd 서비스 설치 중...${NC}"
    
    if [ ! -f "$SERVICE_FILE" ]; then
        sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=Next.js AICar Dashboard Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
Environment="NODE_ENV=production"
Environment="FASTAPI_URL=http://localhost:8001"
Environment="PORT=3006"
ExecStart=/usr/bin/npm start -- -p 3006 -H 0.0.0.0
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
        echo -e "${GREEN}✅ 서비스 파일이 생성되었습니다: $SERVICE_FILE${NC}"
    else
        echo -e "${YELLOW}⚠️  서비스 파일이 이미 존재합니다: $SERVICE_FILE${NC}"
    fi
    
    sudo systemctl daemon-reload
    sudo systemctl enable "$SERVICE_NAME"
    echo -e "${GREEN}✅ 서비스가 등록되었습니다.${NC}"
    echo ""
    echo "서비스 시작: ${BLUE}sudo systemctl start $SERVICE_NAME${NC}"
    echo "서비스 상태: ${BLUE}sudo systemctl status $SERVICE_NAME${NC}"
    echo "서비스 로그: ${BLUE}sudo journalctl -u $SERVICE_NAME -f${NC}"
}

function uninstall_service() {
    echo -e "${YELLOW}🗑️  Next.js systemd 서비스 제거 중...${NC}"
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        sudo systemctl stop "$SERVICE_NAME"
    fi
    
    if systemctl is-enabled --quiet "$SERVICE_NAME"; then
        sudo systemctl disable "$SERVICE_NAME"
    fi
    
    if [ -f "$SERVICE_FILE" ]; then
        sudo rm "$SERVICE_FILE"
        sudo systemctl daemon-reload
        echo -e "${GREEN}✅ 서비스가 제거되었습니다.${NC}"
    else
        echo -e "${YELLOW}⚠️  서비스 파일이 없습니다.${NC}"
    fi
}

function show_status() {
    if systemctl list-unit-files | grep -q "$SERVICE_NAME"; then
        echo -e "${BLUE}서비스 상태:${NC}"
        sudo systemctl status "$SERVICE_NAME" --no-pager -l
    else
        echo -e "${YELLOW}⚠️  서비스가 설치되지 않았습니다.${NC}"
    fi
}

function show_logs() {
    if systemctl list-unit-files | grep -q "$SERVICE_NAME"; then
        echo -e "${BLUE}서비스 로그 (Ctrl+C로 종료):${NC}"
        sudo journalctl -u "$SERVICE_NAME" -f
    else
        echo -e "${YELLOW}⚠️  서비스가 설치되지 않았습니다.${NC}"
    fi
}

# 메인 로직
case "${1:-}" in
    install)
        install_service
        ;;
    uninstall|remove)
        uninstall_service
        ;;
    start)
        sudo systemctl start "$SERVICE_NAME"
        echo -e "${GREEN}✅ 서비스가 시작되었습니다.${NC}"
        ;;
    stop)
        sudo systemctl stop "$SERVICE_NAME"
        echo -e "${GREEN}✅ 서비스가 중지되었습니다.${NC}"
        ;;
    restart)
        sudo systemctl restart "$SERVICE_NAME"
        echo -e "${GREEN}✅ 서비스가 재시작되었습니다.${NC}"
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    *)
        echo "사용법: $0 {install|uninstall|start|stop|restart|status|logs}"
        echo ""
        echo "명령어:"
        echo "  install    - systemd 서비스 설치 및 등록"
        echo "  uninstall  - systemd 서비스 제거"
        echo "  start      - 서비스 시작"
        echo "  stop       - 서비스 중지"
        echo "  restart    - 서비스 재시작"
        echo "  status     - 서비스 상태 확인"
        echo "  logs       - 서비스 로그 확인 (실시간)"
        exit 1
        ;;
esac

