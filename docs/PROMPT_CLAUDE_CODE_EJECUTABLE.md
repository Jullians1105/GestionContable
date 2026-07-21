# 🚀 PROMPT EJECUTABLE PARA CLAUDE CODE
## GestionTareasOficina - Acceso Remoto + Notificaciones en Tiempo Real

---

## 📌 CONTEXTO DEL PROYECTO

**Proyecto:** GestionTareasOficina / Gestcon  
**Stack:** React 18 + Node.js + Express + PostgreSQL + Docker + Socket.io  
**Estado:** FASE 3 completa (Backend, WebSockets, Tests ✅)  
**Servidor actual:** 192.168.1.12:5173 (solo red local)  
**Equipo:** 3 líderes + miembros del equipo  

**Repositorio:** https://github.com/[turepositorio]  
**Documentación estado:** docs/ESTADO_PROYECTO.md ✅  
**Documentación análisis:** docs/ACCESO_EXTERNO.md ✅  

---

## 🎯 OBJETIVO FINAL

Permitir que **3 líderes accedan a la aplicación desde internet** (fuera de red local) y **reciban notificaciones en tiempo real** cuando sus miembros comenten o realicen acciones en tareas asignadas.

### Casos de uso:
1. **Líder en café/casa:** Puede crear/editar tareas via `https://gestcon.duitama.cloudflareaccess.com`
2. **Miembro en oficina:** Comenta en una tarea
3. **Líder en otro lugar:** Recibe notificación en el navegador (incluso minimizado) sin lag

---

## 📋 TAREAS A EVALUAR E IMPLEMENTAR

### 1️⃣ ACCESO REMOTO CON CLOUDFLARE TUNNEL

**Decisión ya evaluada:** Opción recomendada es **Cloudflare Tunnel sin dominio**

**URL final:** `https://gestcon.duitama.cloudflareaccess.com` ($0 costo)

**Cambios necesarios:**

#### A. docker-compose.yml - Agregar servicio cloudflared
```yaml
# Agregar después del servicio 'frontend':

cloudflared:
  image: cloudflare/cloudflared:latest
  container_name: gestcon_cloudflared
  restart: unless-stopped
  command: tunnel --no-autoupdate run
  environment:
    - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
  depends_on:
    - frontend
    - backend
  networks:
    - gestcon_network
```

#### B. .env - Agregar variable
```
# Cloudflare Tunnel (obtener de: cloudflared tunnel create gestcon)
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoixxxxxxxxxxxxxxxx...
```

#### C. .env.example - Documentar
```
# CLOUDFLARE TUNNEL (Opcional - para acceso remoto de líderes)
# Obtener token: https://dash.cloudflare.com/
# Crear tunnel: cloudflared tunnel create gestcon
# Token es sensible - NUNCA en git
CLOUDFLARE_TUNNEL_TOKEN=tu_token_aqui
```

#### D. Crear docs/CLOUDFLARE_SETUP.md
- Guía paso a paso para instalar cloudflared
- Cómo crear el tunnel
- Cómo obtener el token
- Cómo configurar en docker-compose.yml
- Verificación de que funciona
- Troubleshooting común

#### E. Actualizar README.md
- Agregar sección "## 🌐 Acceso Remoto"
- Link a docs/CLOUDFLARE_SETUP.md
- Instrucción simple: "1. Crear tunnel 2. Exportar CLOUDFLARE_TUNNEL_TOKEN 3. docker compose up cloudflared"

**Validación:**
- ✅ docker-compose.yml sintaxis correcta
- ✅ cloudflared service levanta sin errores
- ✅ Frontend accesible desde https://gestcon.duitama.cloudflareaccess.com
- ✅ WebSockets funcionan (Socket.io)
- ✅ Backend API responde en /api/health

---

### 2️⃣ NOTIFICACIONES EN TIEMPO REAL

**Decisión ya evaluada:** Opción recomendada es **Notificación API nativa + Toast mejorado (FASE 1)**

**Casos a cubrir:**
- Miembro comenta en tarea → Líder asignado recibe notificación
- Tarea completada → Notificación a quien la asignó
- Usuario mencionado (@username) → Notificación al usuario

**Cambios frontend:**

#### A. Crear src/hooks/useNotifications.js
```javascript
// Hook que:
// 1. Solicita permiso de notificaciones al usuario
// 2. Muestra notificaciones nativas del SO cuando evento
// 3. Maneja clics (abre tarea)
// 4. Fallback a toast si no hay permiso

export const useNotifications = () => {
  const requestPermission = async () => { ... }
  const showNotification = (title, options) => { ... }
  return { requestPermission, showNotification }
}
```

#### B. Crear src/components/NotificationPermissionPrompt.jsx
```javascript
// Componente que:
// 1. Aparece en login
// 2. Muestra: "¿Permitir notificaciones?"
// 3. Si YES → requestPermission()
// 4. Guarda preferencia en localStorage
// 5. Solo muestra UNA VEZ por navegador
```

#### C. Crear src/components/NotificationCenter.jsx
```javascript
// Componente que:
// 1. Bell icon en navbar
// 2. Badge con contador de notificaciones no leídas
// 3. Dropdown que muestra últimas 5 notificaciones
// 4. Click en notificación → va a la tarea
// 5. Click en "Ver todas" → NotificationsPage
```

#### D. Mejorar src/context/NotificationContext.jsx
```javascript
// Cambios:
// 1. Cuando socket emite 'notification:new':
//    - Guardar en estado (ya hace)
//    - Mostrar toast (ya hace)
//    - NUEVO: Mostrar Notification API
// 2. Pasar { taskId, userId, type } en cada notificación
// 3. Manejar click en notificación
```

#### E. Mejorar src/context/ToastContext.jsx
```javascript
// Cambios:
// 1. Agregar soporte para actionButton
// 2. Agregar duration configurable (0 = no desaparece)
// 3. Mejorar estilos (más visible)
// 4. Sonido opcional cuando llega notificación
```

#### F. Actualizar src/pages/LoginPage.jsx
```javascript
// Después de login exitoso:
// 1. Mostrar NotificationPermissionPrompt
// 2. Solicitar permiso de notificaciones
// 3. Guardar estado en user.notifications_enabled
```

#### G. Actualizar src/components/Navbar.jsx
```javascript
// Agregar:
// 1. NotificationCenter (bell icon con badge)
// 2. Dropdown de notificaciones recientes
// 3. Link a NotificationsPage
```

#### H. Agregar iconos en src/public/
```
app-icon-192.png    (usado en notificaciones)
app-icon-512.png    (favicon mejorado)
badge-72.png        (badge de notificación)
```

**Cambios backend (MÍNIMOS):**

#### A. Verificar src/socket/events.js
```javascript
// Validar que cuando alguien comenta:
// 1. Se crea registro en BD (notifications table)
// 2. Se emite 'notification:new' a socket
// 3. Incluye: { title, message, taskId, userId, type, createdAt }
// 4. Se emite a sala 'user:{userId}'

// Ejemplo cuando alguien comenta:
socket.emit('notification:new', {
  title: `Nuevo comentario de ${commentAuthor.name}`,
  message: `Comentó en "${task.title}"`,
  taskId: task.id,
  userId: task.assigned_to,  // Quién lo recibe
  type: 'comment',
  link: `/tasks/${task.id}`
});
```

#### B. Validar backend/src/controllers/taskController.js
```javascript
// En postTaskComment():
// 1. Crear comentario ✅
// 2. Emitir 'task:updated' ✅
// 3. Crear notificación en BD ✅
// 4. Emitir 'notification:new' ← VALIDAR QUE EXISTA
// 5. Si task tiene assigned_to → notificar a esa persona
```

**Tests a crear:**

#### A. tests/useNotifications.test.js
```javascript
// Test que:
// 1. requestPermission() solicita permisos
// 2. showNotification() crea Notification API
// 3. Maneja click en notificación
// 4. Fallback a toast si no hay permisos
```

#### B. tests/NotificationCenter.test.js
```javascript
// Test que:
// 1. Muestra bell icon
// 2. Badge cuenta notificaciones no leídas
// 3. Click abre dropdown
// 4. Click en notificación navega a tarea
```

#### C. Actualizar tests/socket.test.js (backend)
```javascript
// Test que:
// 1. Cuando alguien comenta → se emite 'notification:new'
// 2. Notificación contiene taskId, userId, message
// 3. Solo se emite a usuario correcto (no broadcast)
// 4. No se emite si usuario desactivó notificaciones
```

**Documentación:**

#### A. Crear docs/NOTIFICACIONES.md
```markdown
## Sistema de Notificaciones en Tiempo Real

### Opciones evaluadas
- Web Notifications API ✅ (ELEGIDA)
- Service Worker + Push
- Toast in-app (complemento)
- Email/SMS (descartado)

### Cómo funciona
- Usuario en app → Toast in-app + Notificación API
- Usuario fuera app → Notificación API
- Usuario con navegador cerrado → (FASE 2: Service Worker)

### Guía de uso
1. Al login, permitir notificaciones
2. Recibe notificación cuando alguien comenta
3. Click en notificación → abre la tarea
4. Ver historial en NotificationsPage

### API Backend
```

---

### 3️⃣ INTEGRACIÓN COMPLETA

**Flujo end-to-end:**

```
Usuario A (Líder) EN OTRO LUGAR
    ↓
Accede: https://gestcon.duitama.cloudflareaccess.com
    ↓ (Cloudflare Tunnel)
Frontend en 192.168.1.12:5173
    ↓
Conecta a Backend via Socket.io
    ↓
Se autentica con JWT
    ↓
Se une a sala 'user:{userId}'
    ↓
Usuario B comenta en tarea asignada a A
    ↓
Backend emite: socket.emit('notification:new', {...})
    ↓
Frontend A recibe en socket listener
    ↓
├─→ Toast in-app: "Usuario B comentó"
├─→ Notification API: Alerta del SO
├─→ Badge en bell icon: +1
└─→ Click → Abre tarea en navegador
```

---

### 4️⃣ OPCIONES DE DOMINIO (DOCUMENTAR)

**Crear docs/OPCIONES_DOMINIO.md** con tabla comparativa:

| Opción | URL | Costo | Seguridad | Profesional |
|--------|-----|-------|-----------|---|
| 1. Sin dominio | gestcon.duitama.cloudflareaccess.com | $0 | ✅ | ⭐⭐⭐ |
| 2. Dominio gratis | gestcon.tk | $0 | ❌ | ⭐ |
| 3. Subdominio existente | gestcon.tudominio.com | $0* | ✅ | ⭐⭐⭐⭐⭐ |
| 4. Dominio pagado | gestcon.com | $12-15/año | ✅ | ⭐⭐⭐⭐⭐ |

**Recomendación para MVP:** Opción 1 (Sin dominio, $0)  
**Recomendación cuando escale:** Opción 4 (Dominio .com, $12/año)

---

## 📂 ESTRUCTURA DE CAMBIOS

### Archivos a crear (NUEVO):
```
src/
├── hooks/
│   └── useNotifications.js
├── components/
│   ├── NotificationPermissionPrompt.jsx
│   ├── NotificationCenter.jsx
│   └── Toast.jsx (mejorado)
├── public/
│   ├── app-icon-192.png
│   ├── app-icon-512.png
│   └── badge-72.png
├── tests/
│   ├── useNotifications.test.js
│   └── NotificationCenter.test.js
└── docs/
    ├── CLOUDFLARE_SETUP.md
    ├── NOTIFICACIONES.md
    └── OPCIONES_DOMINIO.md
```

### Archivos a modificar:
```
docker-compose.yml          ← Agregar servicio cloudflared
.env.example                ← Agregar CLOUDFLARE_TUNNEL_TOKEN
README.md                   ← Agregar sección acceso remoto
src/context/NotificationContext.jsx      ← Mejorar listener
src/context/ToastContext.jsx             ← Agregar acciones
src/pages/LoginPage.jsx                  ← Request permisos
src/pages/NotificationsPage.jsx          ← Mejorar UI
src/components/Navbar.jsx                ← Agregar NotificationCenter
backend/src/socket/events.js             ← Validar emisión
backend/src/controllers/taskController.js ← Validar notificaciones
tests/socket.test.js                     ← Agregar tests
tests/integration/notifications.test.js  ← NUEVO
```

---

## ✅ CHECKLIST FINAL

### A. CLOUDFLARE TUNNEL
- [ ] docker-compose.yml con servicio cloudflared
- [ ] .env.example con CLOUDFLARE_TUNNEL_TOKEN
- [ ] docs/CLOUDFLARE_SETUP.md (guía paso a paso)
- [ ] README.md actualizado
- [ ] Validación que cloudflared levanta sin errores
- [ ] Validación que WebSockets funciona (Socket.io)

### B. NOTIFICACIONES
- [ ] useNotifications.js hook creado
- [ ] NotificationPermissionPrompt.jsx creado
- [ ] NotificationCenter.jsx creado
- [ ] NotificationContext.jsx mejorado
- [ ] ToastContext.jsx mejorado
- [ ] Iconos agregados (app-icon-*.png, badge-*.png)
- [ ] LoginPage.jsx actualizado
- [ ] Navbar.jsx con bell icon
- [ ] NotificationsPage.jsx mejorado

### C. BACKEND (VALIDACIÓN)
- [ ] socket/events.js emite 'notification:new' correctamente
- [ ] taskController.js crea notificaciones en BD
- [ ] Notificaciones van a usuario correcto (no broadcast)
- [ ] Rate limiting aplicado (max 10 notif/min)

### D. TESTS
- [ ] useNotifications.test.js creado
- [ ] NotificationCenter.test.js creado
- [ ] socket.test.js actualizado
- [ ] Cobertura >= 70%

### E. DOCUMENTACIÓN
- [ ] CLOUDFLARE_SETUP.md (paso a paso)
- [ ] NOTIFICACIONES.md (opciones evaluadas)
- [ ] OPCIONES_DOMINIO.md (comparativa)
- [ ] README.md actualizado
- [ ] CAMBIOS_SESION_[FECHA].md (changelog)

---

## 🎯 ENTREGA ESPERADA

**Archivo principal:** 

```
IMPLEMENTACION_ACCESO_REMOTO_NOTIFICACIONES.md
```

Incluir:

1. ✅ Decisiones técnicas explicadas
2. ✅ Código funcional (todos los archivos)
3. ✅ Cambios en docker-compose.yml y config
4. ✅ Tests unitarios e integración
5. ✅ Documentación completa (3 docs)
6. ✅ Guía de setup para los 3 líderes
7. ✅ Guía de deployment en Cloudflare

**Tiempo estimado:** 3-4 horas  
**Complejidad:** Media (notificaciones + infraestructura)  
**Riesgo:** Bajo (cambios no rompen FASE 3)

---

## 📞 CONTEXTO ADICIONAL

### Ya está implementado en el proyecto:
- ✅ Socket.io en frontend y backend
- ✅ NotificationContext (base)
- ✅ ToastContext (base)
- ✅ JWT auth
- ✅ Tests framework (Jest)
- ✅ Docker Compose setup

### NO necesitas:
- ❌ Firebase Cloud Messaging
- ❌ Service Workers (FASE 2)
- ❌ Comprar dominio (start sin él)
- ❌ Cambiar BD (estructura existe)

### Requisitos:
- ✅ HTTPS requerido (Cloudflare proporciona)
- ✅ Cuenta Cloudflare gratis (5 min)
- ✅ Token Cloudflare (obtenido con cloudflared CLI)

---

## 🚀 CÓMO EJECUTAR ESTE PROMPT

### En Claude Code:

```
1. Copia ESTE prompt completo
2. Abre Claude Code
3. Pega el prompt
4. Agrégale esto:

"Analiza qué hacer y entrega:
- Código funcional listo para copiar
- Documentación en .md
- Tests listos para ejecutar
- Guía de setup para usuarios finales

Enfoque en FASE 1 (Notificaciones + Cloudflare).
Mantén compatible con FASE 3 existente."

5. Ejecuta
```

---

## 📊 ROADMAP

```
HOY (Sesión):
  ├─ Cloudflare Tunnel sin dominio ✅
  ├─ Notificaciones Notification API ✅
  └─ Toast mejorado ✅

SEMANA 2:
  ├─ Service Workers (navegador cerrado)
  └─ Web Push (opcional, si HTTPS)

MES 2:
  ├─ Comprar dominio .com si escala
  ├─ Integración n8n
  └─ Bot Telegram
```

---

**Versión:** 2.0  
**Fecha:** 2026-06-24  
**Estado:** Listo para enviar a Claude Code  
**Requiere:** Código FASE 3 actual funcional  
