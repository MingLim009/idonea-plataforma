#!/usr/bin/env bash
# Backup SQLite + uploads from the running Docker volume.
# Usage on VPS: ./scripts/backup.sh
set -euo pipefail
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="backups/idonea-${STAMP}"
mkdir -p "$OUT"
docker compose exec -T idonea sh -c 'cd /data && tar cf - app.sqlite app.sqlite-wal app.sqlite-shm uploads 2>/dev/null || tar cf - .' > "${OUT}/data.tar"
echo "Backup written to ${OUT}/data.tar"
