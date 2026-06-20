# Acceso Externo — Arquitectura y Plan de Implementación

> Decisión técnica para exponer GestionTareasOficina a integraciones externas
> (Telegram, n8n, apps móviles, formularios web, sistemas empresariales).

---

## Contexto

El sistema corre en un servidor local mediante Docker. El objetivo es que usuarios
y sistemas externos a la red local puedan crear tareas y consumir la API de forma
segura y confiable.

**Stack actual:** React + Vite · Node.js + Express · PostgreSQL · JWT · Socket.IO · Docker Compose

**Escala objetivo:** hasta 25 usuarios.

---

## Opciones Evaluadas

### Tabla Comparativa

| Criterio | Tailscale | Cloudflare Tunnel | IP Pública + Nginx |
|---|---|---|---|
| **Seguridad** | ★★★★★ | ★★★★☆ | ★★★☆☆ |
| **Complejidad de setup** | ★★★★☆ | ★★★★☆ | ★★☆☆☆ |
| **Mantenimiento continuo** | Bajo | Muy bajo | Alto |
| **Costo** | Gratis (≤100 dispositivos) | Gratis | Gratis + IP estática |
| **Telegram bot** | ❌ Incompatible | ✅ Nativo | ✅ Con config |
| **n8n cloud** | ❌ Incompatible | ✅ Nativo | ✅ Con config |
| **App móvil** | ⚠️ Requiere cliente | ✅ Nativo | ✅ Con config |
| **Formulario web externo** | ❌ Imposible | ✅ Nativo | ✅ Con config |
| **Sistema empresarial externo** | ⚠️ Solo si tiene Tailscale | ✅ Nativo | ✅ Con config |
| **Socket.IO / WebSocket** | ✅ Directo | ✅ Con config | ✅ Con config |
| **Oculta IP del servidor** | ✅ | ✅ | ❌ |
| **Requiere abrir puertos** | ❌ | ❌ | ✅ |
| **HTTPS automático** | ✅ | ✅ | Manual (Let's Encrypt) |
| **Escala a más usuarios** | ⚠️ Todos deben tener cliente | ✅ | ✅ |

---

### Opción 1: Tailscale

Tailscale es una red privada entre dispositivos controlados por ti. Los servidores
de Telegram, n8n Cloud, una app móvil de un usuario externo o un formulario web
anónimo **no pueden unirse a la red Tailscale** — los descarta para todos los casos
de uso del proyecto.

```
Telegram ──── INTERNET ────✖──── Tailscale VPN ──── Tu servidor
```

Uso válido como complemento: acceso SSH/admin al servidor para el equipo de
desarrollo. No como solución de integración externa.

---

### Opción 2: Cloudflare Tunnel ✅ Recomendada

El daemon `cloudflared` en el servidor abre una conexión **saliente** hacia la red
de Cloudflare. No se expone ningún puerto. Todo el tráfico entra por Cloudflare y
llega al servidor por esa conexión persistente.

```
Telegram  ──┐
n8n       ──┤── HTTPS ──── Cloudflare Edge ──── Tunnel ──── Tu servidor
App móvil ──┤
Web       ──┘
```

**Nota sobre Socket.IO:** Cloudflare tiene un timeout de 100 s en WebSockets en el
plan gratuito. Socket.IO lo gestiona automáticamente con ping/pong y reconexión.
Configurar en el cliente frontend:

```js
const socket = io({
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
})
```

**Riesgos:**
- El tráfico pasa por los servidores de Cloudflare (aceptable para gestión de tareas de oficina).
- Si Cloudflare tiene un incidente, las integraciones externas no responden (uptime histórico: 99.99%+).
- El tunnel depende de conectividad a internet del servidor local.

**Costo:** $0 para este caso de uso. Cloudflare Access (autenticación adicional en
rutas admin) tiene tier gratuito para hasta 50 usuarios.

---

### Opción 3: IP Pública + Port Forwarding + Nginx

Funciona para todos los casos de uso, pero introduce fricción operativa significativa:

- Los ISPs residenciales frecuentemente asignan IPs dinámicas y bloquean puertos 80/443.
- Requiere: fail2ban, UFW, headers de seguridad en Nginx, rate limiting, renovación
  automática de certificados, monitoring de logs.
- Cada cambio de configuración de ruta o actualización de seguridad requiere
  intervención manual.
- Un misconfiguration de Nginx expone directamente el servidor a internet.

Recomendada solo si existe un requisito explícito de **no pasar tráfico por
servidores de terceros** (compliance médico, financiero regulado). No aplica
para este proyecto.

---

## Decisión: Cloudflare Tunnel

La regla en arquitectura es: **la solución más simple que resuelve todos los
requisitos**. Cloudflare Tunnel resuelve las 5 integraciones del proyecto, no abre
puertos, no requiere IP estática, añade protección DDoS sin configuración adicional
y si en el futuro se migra a un VPS, la arquitectura se mantiene idéntica — solo
cambia el servidor donde corre `cloudflared`.

---

## Arquitectura por Fase

### Corto plazo — MVP

```
Internet
  │
  ▼
Cloudflare Edge (HTTPS, DDoS protection)
  │
  ▼ cloudflared tunnel (conexión saliente, sin puertos abiertos)
  │
Servidor local
  ├── taskflow_frontend   :5173
  ├── taskflow_backend    :3000
  ├── taskflow_postgres   :5432  ← nunca expuesto
  └── taskflow_cloudflared       ← nuevo contenedor
```

Sin cambios en los servicios existentes. Solo se agrega el contenedor `cloudflared`.

### Mediano plazo — 25 usuarios activos

- Cloudflare Access en rutas `/api/employees` y rutas admin (autenticación extra
  sobre el JWT propio).
- Ajustar rate limiting del backend según volumen real de integraciones Telegram/n8n.
- Backup automático de PostgreSQL programado.

### Largo plazo — Crecimiento futuro

Si el equipo supera 50 usuarios o el servidor local se vuelve un bottleneck:
migrar a un VPS (Hetzner, DigitalOcean, etc.). Cloudflare Tunnel sigue funcionando
igual — solo cambia dónde corre el servidor. No se pierde ninguna parte de la
arquitectura actual.

---

## Plan de Implementación

**Nivel de dificultad:** 3 / 10  
**Tiempo estimado:** 45 – 90 minutos  
**Prerequisito:** tener un dominio con DNS gestionado por Cloudflare.

---

### Paso 1 — Configurar Cloudflare (10 min)

1. Crear cuenta en [cloudflare.com](https://cloudflare.com) (gratis).
2. Agregar el dominio → Cloudflare asigna nameservers → configurarlos en el registrador.
3. Ir a **Zero Trust → Networks → Tunnels → Create tunnel**.
4. Copiar el token generado.

---

### Paso 2 — Agregar cloudflared al docker-compose.yml (10 min)

```yaml
services:
  # ... servicios existentes sin cambios ...

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: taskflow_cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - frontend
      - backend
```

En el archivo `.env`:

```env
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoixxxxxxxxxxxxxxxx...
```

> El `.env` nunca se sube a git. El token se puede rotar desde el dashboard de
> Cloudflare en cualquier momento.

---

### Paso 3 — Configurar rutas del tunnel (5 min)

En el dashboard de Cloudflare, configurar las rutas públicas:

| Subdominio | Servicio interno |
|---|---|
| `app.tudominio.com` | `http://frontend:5173` |
| `api.tudominio.com` | `http://backend:3000` |

---

### Paso 4 — Habilitar WebSockets para Socket.IO (2 min)

En Cloudflare Dashboard: **Network → WebSockets → ON**

---

### Paso 5 — Levantar el nuevo contenedor (2 min)

```bash
git pull && docker compose up -d cloudflared
```

No se hace rebuild de frontend ni backend.

---

### Paso 6 — Verificar (5 min)

```bash
# Logs del tunnel — deben aparecer 4 conexiones establecidas
docker compose logs -f cloudflared
# INF Connection established connIndex=0
# INF Connection established connIndex=1
# INF Connection established connIndex=2
# INF Connection established connIndex=3

# Verificar desde fuera de la red local
curl https://api.tudominio.com/api/health
```

---

### Paso 7 — Proteger rutas admin con Cloudflare Access (opcional, 15 min)

En **Zero Trust → Access → Applications**:

- Agregar aplicación: `api.tudominio.com/api/employees`
- Política: solo emails del equipo (autenticación por OTP o Google SSO)
- Capa de seguridad adicional sobre el JWT del backend

---

## Integración con Sistemas Externos

### Telegram Bot

```
Bot → POST https://api.tudominio.com/api/tasks
      Authorization: Bearer <token>
```

Sin configuración adicional. El bot llama el endpoint como cualquier cliente HTTP.

### n8n (cloud o self-hosted)

```
HTTP Request node → https://api.tudominio.com/api/tasks
```

Si n8n es self-hosted en la misma red local, puede llamar directamente al backend
por red interna (`http://backend:3000`) sin pasar por el tunnel.

### App Móvil

URL base de la API: `https://api.tudominio.com`. No requiere VPN ni configuración
especial en el dispositivo.

### Formulario Web Externo

CORS debe incluir el dominio del formulario en la configuración del backend Express:

```js
// backend/src/index.js
app.use(cors({
  origin: ['https://tudominio.com', 'https://formulario-externo.com'],
}))
```

### Sistema Empresarial Externo

Llamada HTTP estándar a `https://api.tudominio.com/api/tasks` con el token JWT.
Si el sistema externo necesita autenticación propia (no JWT de usuario), evaluar
crear un endpoint de API Key dedicado.

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Cloudflare downtime | Muy baja (SLA 99.99%+) | En largo plazo: tunnel secundario a VPS |
| Token del tunnel comprometido | Baja | Rotar token desde Cloudflare dashboard; `.env` fuera de git |
| Rate limit del backend insuficiente | Media | Ajustar límites en `backend/src/index.js` según integración real |
| WebSocket timeout en sesiones largas | Media-baja | `pingInterval` configurado en Socket.IO cliente |
| Exposición accidental de rutas internas | Baja | Solo se expone lo configurado en el tunnel; postgres nunca sale |
| ISP corta la conexión del servidor | Media | `restart: unless-stopped` reconecta el tunnel automáticamente |
