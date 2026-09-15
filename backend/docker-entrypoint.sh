#!/bin/sh
# Arranca la pantalla virtual (Xvfb) que necesita el Chrome real de dianTokenService.js — este
# contenedor no tiene monitor. Se lanza en segundo plano UNA vez, antes del proceso real
# (Node), y sigue viva mientras viva el contenedor.
Xvfb "$DISPLAY" -screen 0 1280x1024x24 -nolisten tcp &

exec "$@"
