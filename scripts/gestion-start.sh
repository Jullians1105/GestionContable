#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Servicios con healthcheck definido en docker-compose.yml — solo estos se
# usan para decidir si el sistema quedó "saludable" (frontend y mailhog no
# tienen healthcheck propio).
HEALTHCHECK_SERVICES=(backend postgres)
MAX_WAIT_SECONDS=60
POLL_INTERVAL_SECONDS=5

echo "════════════════════════════════════════"
echo "  Gestion — iniciar sistema"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════"
echo "▶ Levantando contenedores (docker compose up -d)..."
docker compose up -d
echo "  ✔ docker compose up -d completado"

# Devuelve 0 si todos los servicios en HEALTHCHECK_SERVICES están "healthy".
# Llena el array global UNHEALTHY_SERVICES con el detalle de lo que falte.
check_health() {
  local ps_json line health svc all_healthy
  ps_json="$(docker compose ps --format json)"
  all_healthy=0
  UNHEALTHY_SERVICES=()
  for svc in "${HEALTHCHECK_SERVICES[@]}"; do
    line="$(printf '%s\n' "$ps_json" | grep -F "\"Service\":\"${svc}\"" || true)"
    if [ -z "$line" ]; then
      UNHEALTHY_SERVICES+=("${svc} (contenedor no encontrado)")
      all_healthy=1
      continue
    fi
    health="$(printf '%s' "$line" | grep -o '"Health":"[^"]*"' | cut -d'"' -f4 || true)"
    if [ "$health" != "healthy" ]; then
      UNHEALTHY_SERVICES+=("${svc} (estado: ${health:-desconocido})")
      all_healthy=1
    fi
  done
  return "$all_healthy"
}

echo
echo "▶ Esperando confirmación de healthcheck (backend, postgres)..."
elapsed=0
while ! check_health; do
  if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
    break
  fi
  sleep "$POLL_INTERVAL_SECONDS"
  elapsed=$((elapsed + POLL_INTERVAL_SECONDS))
done

echo
echo "▶ Estado de los contenedores:"
docker compose ps
echo

if [ "${#UNHEALTHY_SERVICES[@]}" -eq 0 ]; then
  echo "✅ Sistema arriba y saludable"
else
  echo "⚠️  Advertencia: los siguientes servicios no quedaron saludables:"
  for s in "${UNHEALTHY_SERVICES[@]}"; do
    echo "   - ${s}"
  done
  echo "   Revisa los logs con: docker compose logs <servicio>"
  exit 1
fi
