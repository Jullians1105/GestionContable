#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

echo "This will drop and recreate the taskflow database. Continue? (y/N)"
read -r confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

docker compose run --rm migrate node migrations/run.js --reset --seed
