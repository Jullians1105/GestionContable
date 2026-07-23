#!/usr/bin/env bash
set -euo pipefail

# "$0" puede ser el symlink en /usr/local/bin (gestion-stop) en vez de la
# ruta real del script — resolverlo con readlink -f antes de calcular la
# raíz del repo, o "cd" termina en /usr/local en vez de en el proyecto.
SCRIPT_PATH="$(readlink -f "$0")"
cd "$(dirname "$SCRIPT_PATH")/.."

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
echo "   Vas a apagar el servidor. Esto afecta a toda la oficina y a"
echo "   quienes acceden remoto vía gestcon.work — no vuelve a estar"
echo "   disponible hasta que alguien lo encienda mañana."
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
