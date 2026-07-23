#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

echo "🚀 Desplegando n8n en Gestcon..."

# 1. Verificar que .env existe y tiene N8N_ENCRYPTION_KEY
if [ ! -f .env ]; then
  echo "❌ Error: no se encontró el archivo .env"
  echo "   Copia .env.example a .env y completa las variables"
  exit 1
fi

if ! grep -q "N8N_ENCRYPTION_KEY" .env || grep -q "N8N_ENCRYPTION_KEY=$" .env; then
  echo "⚠️  Advertencia: N8N_ENCRYPTION_KEY no está configurada en .env"
  echo "   Genera una clave con: openssl rand -hex 32"
  echo "   Y agrégala al .env antes de continuar"
  read -rp "   ¿Continuar de todas formas? (s/N): " confirm
  [ "$confirm" = "s" ] || { echo "Cancelado."; exit 1; }
fi

# 2. Backup del docker-compose actual
backup_file="docker-compose.yml.backup.$(date +%Y%m%d_%H%M%S)"
cp docker-compose.yml "$backup_file"
echo "✅ Backup guardado en: $backup_file"

# 3. Validar sintaxis del docker-compose.yml
echo "🔍 Validando docker-compose.yml..."
docker compose config --quiet
echo "✅ Sintaxis válida"

# 4. Levantar solo el servicio de init de BD (crea la BD n8n si no existe)
echo "🗄️  Preparando base de datos n8n..."
docker compose up -d postgres
echo "   Esperando a que PostgreSQL esté healthy..."
until docker compose exec postgres pg_isready -U "${DB_USER:-postgres}" > /dev/null 2>&1; do
  sleep 2
done
docker compose run --rm n8n-db-init
echo "✅ Base de datos n8n lista"

# 5. Levantar n8n
echo "🔧 Iniciando n8n..."
docker compose up -d n8n
echo "✅ n8n iniciado"

# 6. Estado de todos los servicios
echo ""
echo "📊 Estado de servicios:"
docker compose ps

# 7. Esperar a que n8n esté respondiendo
echo ""
echo "⏳ Esperando a que n8n esté disponible (puede tardar 20-30 segundos)..."
max_wait=60
elapsed=0
until curl -sf http://localhost:5678/healthz > /dev/null 2>&1; do
  sleep 3
  elapsed=$((elapsed + 3))
  if [ $elapsed -ge $max_wait ]; then
    echo "⚠️  n8n tardó más de ${max_wait}s en responder. Revisa los logs:"
    echo "   docker compose logs n8n --tail 30"
    break
  fi
  printf "."
done
echo ""

# 8. Primeras líneas de log de n8n
echo "📋 Logs recientes de n8n:"
docker compose logs n8n --tail 20

echo ""
echo "✅ Deployment completado!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📍 Editor n8n:  http://192.168.1.12:5678"
echo "📍 Webhooks:    http://192.168.1.12:5678/webhook/..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Primera vez: crea tu cuenta de administrador en el editor"
echo ""
