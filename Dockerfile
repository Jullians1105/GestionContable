FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# 512 alcanzaba antes de sumar BlockNote/Tiptap/ProseMirror (módulo de Notas);
# con ese límite el build revienta con OOM aunque el chunk quede lazy-loaded,
# porque Rollup igual necesita analizar/minificar todo en el build. Probado:
# 768 ya compila, se deja margen en 1024. Si el servidor no tiene RAM para
# esto, seguir construyendo la imagen aparte (Mac, --platform linux/amd64) y
# llevarla al servidor, como ya se documenta en ARQUITECTURA.md.
RUN NODE_OPTIONS="--max-old-space-size=1024" npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80 443
