#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

docker compose up -d --build
docker compose run --rm migrate
docker compose logs -f
