#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# ─── Configuración ────────────────────────────────────────────────────────────
BACKUP_DIR="backups"
KEEP_DAYS=7          # Cuántos días de backups conservar
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/${TIMESTAMP}"

set -a
source .env 2>/dev/null || true
set +a

DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-taskflow}"

# ─── Preparar carpeta ─────────────────────────────────────────────────────────
mkdir -p "${BACKUP_PATH}"

echo "════════════════════════════════════════"
echo "  Backup GestionTareasOficina"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════"

# 1. Base de datos
echo "▶ Exportando base de datos..."
docker compose exec -T postgres \
  pg_dump -U "${DB_USER}" "${DB_NAME}" | gzip > "${BACKUP_PATH}/db.sql.gz"
echo "  ✔ db.sql.gz"

# 2. Variables de entorno
echo "▶ Copiando archivos de configuración..."
[ -f .env ]           && cp .env           "${BACKUP_PATH}/.env"           && echo "  ✔ .env"
[ -f backend/.env ]   && cp backend/.env   "${BACKUP_PATH}/backend.env"    && echo "  ✔ backend.env"

# 3. Certificados SSL (si existen)
if [ -d /etc/nginx/certs ]; then
  mkdir -p "${BACKUP_PATH}/certs"
  cp /etc/nginx/certs/*.crt "${BACKUP_PATH}/certs/" 2>/dev/null && \
  cp /etc/nginx/certs/*.key "${BACKUP_PATH}/certs/" 2>/dev/null && \
  echo "  ✔ certs/"
fi

# 4. CA raíz de mkcert (si existe)
MKCERT_CA="${HOME}/.local/share/mkcert/rootCA.pem"
if [ -f "${MKCERT_CA}" ]; then
  cp "${MKCERT_CA}" "${BACKUP_PATH}/rootCA.pem"
  echo "  ✔ rootCA.pem"
fi

# 5. Comprimir todo el backup en un solo archivo
echo "▶ Comprimiendo backup..."
tar -czf "${BACKUP_DIR}/backup_${TIMESTAMP}.tar.gz" -C "${BACKUP_DIR}" "${TIMESTAMP}"
rm -rf "${BACKUP_PATH}"
echo "  ✔ backup_${TIMESTAMP}.tar.gz"

# 6. Rotación: eliminar backups más viejos que KEEP_DAYS días
echo "▶ Rotación (conservando últimos ${KEEP_DAYS} días)..."
find "${BACKUP_DIR}" -name "backup_*.tar.gz" -mtime "+${KEEP_DAYS}" -delete
TOTAL=$(find "${BACKUP_DIR}" -name "backup_*.tar.gz" | wc -l)
echo "  ✔ ${TOTAL} backup(s) almacenado(s)"

echo ""
echo "✅ Backup completado: ${BACKUP_DIR}/backup_${TIMESTAMP}.tar.gz"
echo "════════════════════════════════════════"
