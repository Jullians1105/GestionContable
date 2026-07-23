#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# ─── Uso ─────────────────────────────────────────────────────────────────────
# ./scripts/restore.sh backups/backup_20260626_120000.tar.gz

BACKUP_FILE="${1:-}"

if [ -z "${BACKUP_FILE}" ]; then
  echo "Uso: ./scripts/restore.sh <archivo_backup.tar.gz>"
  echo ""
  echo "Backups disponibles:"
  ls -lht backups/backup_*.tar.gz 2>/dev/null || echo "  (ninguno)"
  exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "❌ Archivo no encontrado: ${BACKUP_FILE}"
  exit 1
fi

set -a
source .env 2>/dev/null || true
set +a

DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-gestcon}"

echo "════════════════════════════════════════"
echo "  Restaurar Backup"
echo "  Archivo: ${BACKUP_FILE}"
echo "════════════════════════════════════════"
echo ""
echo "⚠️  ADVERTENCIA: Esto sobreescribirá la base de datos actual."
read -rp "¿Continuar? (escribe 'si' para confirmar): " confirm
[ "${confirm}" != "si" ] && { echo "Cancelado."; exit 0; }

# Extraer backup en carpeta temporal
TMPDIR=$(mktemp -d)
trap "rm -rf ${TMPDIR}" EXIT
tar -xzf "${BACKUP_FILE}" -C "${TMPDIR}"
EXTRACTED=$(ls "${TMPDIR}")
BACKUP_PATH="${TMPDIR}/${EXTRACTED}"

echo ""
echo "▶ Restaurando base de datos..."
# Eliminar conexiones activas y restaurar
docker compose exec -T postgres psql -U "${DB_USER}" -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();" \
  postgres > /dev/null 2>&1 || true

docker compose exec -T postgres psql -U "${DB_USER}" -c \
  "DROP DATABASE IF EXISTS ${DB_NAME}; CREATE DATABASE ${DB_NAME};" postgres

zcat "${BACKUP_PATH}/db.sql.gz" | docker compose exec -T postgres \
  psql -U "${DB_USER}" "${DB_NAME}"
echo "  ✔ Base de datos restaurada"

# Restaurar .env si existe en el backup y no hay uno local
if [ -f "${BACKUP_PATH}/.env" ] && [ ! -f .env ]; then
  cp "${BACKUP_PATH}/.env" .env
  echo "  ✔ .env restaurado"
fi

# Restaurar certificados si existen en el backup
if [ -d "${BACKUP_PATH}/certs" ]; then
  sudo mkdir -p /etc/nginx/certs
  sudo cp "${BACKUP_PATH}/certs/"* /etc/nginx/certs/
  echo "  ✔ Certificados SSL restaurados"
fi

echo ""
echo "✅ Restauración completada."
echo "   Reinicia los servicios con: docker compose restart"
echo "════════════════════════════════════════"
