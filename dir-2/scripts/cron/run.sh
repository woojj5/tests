#!/usr/bin/env bash
set -euo pipefail
echo "[worker] loop start"
while true; do
  date +"[worker] %Y-%m-%d %H:%M:%S distance"
  node ./scripts/cron/rankings/distance/materialize-distance.js || true
  date +"[worker] %Y-%m-%d %H:%M:%S soh"
  node ./scripts/cron/rankings/soh/materialize-soh.js || true
  sleep 300
done
