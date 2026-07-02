#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRON_JOB="0 18 * * * cd ${PROJECT_DIR} && ./scripts/backup.sh >> /var/log/backup-gestion.log 2>&1"

# Agrega la tarea solo si no existe ya
if crontab -l 2>/dev/null | grep -qF "backup-gestion"; then
  echo "✔ El cron de backup ya estaba configurado"
else
  (crontab -l 2>/dev/null; echo "${CRON_JOB}") | crontab -
  echo "✔ Cron configurado: backup diario a las 6:00 PM"
fi

echo ""
echo "Tareas cron activas:"
crontab -l
