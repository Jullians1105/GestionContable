#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

SKIP_CONFIRM=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes)
      SKIP_CONFIRM=1
      ;;
    *)
      echo "⚠️  Argumento no reconocido: ${arg}" >&2
      echo "   Uso: $(basename "$0") [-y|--yes]" >&2
      exit 1
      ;;
  esac
done

echo "════════════════════════════════════════"
echo "  Gestion — detener sistema"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════"
echo "⚠️  ADVERTENCIA:"
echo "   Esto detiene el sistema para TODA la oficina (~14 personas)"
echo "   y los 3 líderes remotos que acceden vía gestcon.work."
echo "   Además, esto APAGA FÍSICAMENTE el servidor — no es una suspensión."
echo "   Alguien debe estar presente para volver a encenderlo."
echo

if [ "$SKIP_CONFIRM" -eq 0 ]; then
  read -r -p "Escribe exactamente \"si\" para confirmar: " CONFIRM
  if [ "$CONFIRM" != "si" ]; then
    echo "❌ Cancelado — no se hizo ningún cambio"
    exit 1
  fi
fi

echo
echo "▶ Deteniendo contenedores (docker compose down)..."
docker compose down
echo "  ✔ Contenedores detenidos"

echo
echo "▶ Apagando el servidor (sudo shutdown -h now)..."
sudo shutdown -h now
