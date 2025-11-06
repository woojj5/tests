#!/bin/bash
# GitHub/GitLab Webhook 배포 스크립트

set -e

# 설정
PROJECT_DIR="/mnt/hdd1/jeon/dir-2"
SECRET_TOKEN="${WEBHOOK_SECRET:-your-secret-token}"
LOG_FILE="/var/log/webhook-deploy.log"

# 로그 함수
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 인증 확인 (간단한 토큰 기반)
if [ "$1" != "$SECRET_TOKEN" ]; then
    log "ERROR: Invalid token"
    exit 1
fi

log "Deployment started"

cd "$PROJECT_DIR"

# Git 업데이트
log "Updating from Git..."
git pull origin main || {
    log "ERROR: Git pull failed"
    exit 1
}

# 빌드 및 배포
log "Building and deploying..."
bash scripts/deploy.sh main true

log "Deployment completed successfully"

