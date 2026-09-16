FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-slim
WORKDIR /app

# Chrome REAL (no un Chromium genérico) + Xvfb (pantalla virtual — este contenedor no tiene
# monitor) para dianTokenService.js, que genera el token de acceso a la DIAN automatizando el
# login real de catalogo-vpfe.dian.gov.co. Encontrado probando en vivo (ver
# ESTADO_EMPRESAS_DIRECTORIO.md): tiene que ser el Chrome oficial de Google, no el Chromium que
# trae Playwright ni el de los repos de Alpine — por eso la imagen base pasó de
# node:20-alpine a node:20-slim (Debian), que sí puede instalar el paquete oficial.
RUN apt-get update && apt-get install -y --no-install-recommends \
      wget gnupg ca-certificates xvfb \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*
# (wget/gnupg se quedan instalados — el propio paquete de Chrome depende de wget para su
# mecanismo de actualización; purgarlo después se lleva a Chrome con él, ya probado en vivo.)

# node:20-slim ya trae un usuario "node" en UID/GID 1000 — se reusa en vez de crear uno nuevo
# (crear otro con -g 1000 choca, ese GID ya existe). El perfil de Chrome se monta por bind
# mount desde el host (ver docker-compose.yml) y un bind mount conserva los permisos del host
# tal cual, así que igual conviene que el UID del contenedor (1000) coincida con el dueño real
# de esa carpeta en el servidor (gestionc-server, también uid 1000) — coincide de casualidad,
# pero por eso no hizo falta tocar nada más.
COPY --from=builder /app/node_modules ./node_modules
COPY src ./src
COPY migrations ./migrations
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /app/dian-perfil && chown -R node:node /app/dian-perfil \
    # Xvfb necesita crear su socket unix acá — como root, antes de pasar a un usuario sin
    # privilegios, porque en tiempo de ejecución ya no podría crear este directorio él solo
    # (encontrado en vivo: "_XSERVTransmkdir: ERROR: euid != 0").
    && mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

USER node
ENV DISPLAY=:99
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/index.js"]
