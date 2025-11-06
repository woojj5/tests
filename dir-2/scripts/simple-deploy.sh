#!/bin/bash
# 간단한 배포 스크립트 (로컬 실행용)

set -e

cd /mnt/hdd1/jeon/dir-2

echo "🚀 배포 시작..."

# Git 업데이트
echo "📥 Git 업데이트..."
git pull

# 의존성 설치
echo "📦 의존성 설치..."
npm install

# 빌드
echo "🔨 빌드..."
npm run build

# Docker 재시작
echo "🐳 Docker 재시작..."
docker compose up -d --build jeon-web
docker compose restart jeon-web

echo "✅ 배포 완료!"
echo "접속: http://keti-ev1.iptime.org:3006"

