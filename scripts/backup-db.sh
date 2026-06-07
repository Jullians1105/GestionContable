#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

set -a
source .env
set +a

mkdir -p backups
timestamp=$(date +%Y%m%d_%H%M%S)
outfile="backups/taskflow_${timestamp}.sql"

docker compose exec -T postgres pg_dump -U "${DB_USER:-postgres}" "${DB_NAME:-taskflow}" > "$outfile"

echo "Backup written to $outfile"
