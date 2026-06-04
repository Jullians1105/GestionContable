# Bugs Sesión 2026-06-04 — Integración Backend Fase 3

Registro de errores encontrados al conectar el frontend con el backend real (PostgreSQL + JWT + Socket.io).

---

## Bugs Resueltos

### 1. Contraseña de PostgreSQL incorrecta en `.env`
**Error:** `FATAL: la autentificación password falló para el usuario «postgres»`
**Causa:** `backend/.env` tenía `DB_PASSWORD=postgres` pero la instalación local usaba otra contraseña.
**Fix:** Actualizar `DB_PASSWORD` con la contraseña correcta.

---

### 2. `DATABASE_URL` con fallback hardcodeado ignoraba variables individuales
**Error:** El backend se conectaba con `postgresql://postgres:postgres@localhost:5432/taskflow` aunque `.env` tenía otra contraseña.
**Causa:** `backend/src/config/env.js` tenía `DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@...'`. Como `DATABASE_URL` no estaba definida en `.env`, usaba el hardcoded. Y en `database.js` el `if (env.DATABASE_URL)` lo elegía sobre las variables individuales.
**Fix:** Cambiar el fallback a `''` para que `database.js` use las variables individuales.

---

### 3. Vite sin proxy para `/api` y `/socket.io`
**Error:** `GET http://localhost:5173/api/... 404`
**Causa:** `vite.config.js` no tenía proxy configurado. Las peticiones al path `/api` iban al servidor de Vite (puerto 5173) en lugar del backend (puerto 3000).
**Fix:** Agregar en `vite.config.js`:
```js
server: {
  proxy: {
    '/api': { target: 'http://localhost:3000', changeOrigin: true },
    '/socket.io': { target: 'http://localhost:3000', changeOrigin: true, ws: true },
  }
}
```

---

### 4. Login retornaba 401 — faltaba `await` en LoginPage
**Error:** `POST /api/auth/login 401` — el login siempre mostraba "no autorizado".
**Causa:** `LoginPage.jsx` llamaba `const result = login(...)` sin `await`. Como `login` es `async`, `result` era una `Promise`, no `{ success: true }`. `result.success` era siempre `undefined` → mensaje de error.
**Fix:** `const result = await login(form.email, form.password)`

---

### 5. Hashes bcrypt del seed incorrectos
**Error:** Login 401 aunque la contraseña fuera correcta.
**Causa:** Los hashes en `migrations/002_seed_data.sql` no correspondían a `admin123`, `leader123`, etc. Al ejecutarlos con `psql` desde PowerShell, los `$` de los hashes fueron interpolados como variables y los hashes quedaron corruptos en la BD.
**Fix:** Regenerar hashes con Node.js (evitando PowerShell) y actualizar directamente la BD y el archivo seed.

---

### 6. CORS bloqueaba socket y peticiones desde puerto 5174
**Error:** Socket.io no conectaba; peticiones desde `:5174` rechazadas.
**Causa:** `CLIENT_URL=http://localhost:5173` en `.env`, pero Vite a veces arranca en `:5174` si el puerto está ocupado. El backend rechazaba `Origin: http://localhost:5174`.
**Fix:** En `backend/src/index.js`, usar regex en desarrollo:
```js
const corsOrigin = env.NODE_ENV === 'development'
  ? /^http:\/\/localhost(:\d+)?$/
  : env.CLIENT_URL;
```

---

### 7. Condición de carrera en `AuthContext` — logout inmediato tras login
**Error:** Al hacer login, el usuario entraba y al instante era redirigido a `/login`.
**Causa:** El `useEffect` de `AuthContext` capturaba el token del closure al montarse. Si ese efecto resolvía después del login (con un token viejo), llamaba `api.me()` y si fallaba, limpiaba la sesión recién creada.
**Fix:**
- Leer `localStorage.getItem('auth_token')` en el momento que resuelve `checkBackend()` (no del closure).
- En el catch, solo limpiar si el token no fue reemplazado por un login concurrente.
- Limpiar tokens previos antes de llamar `api.login()`.
- Purgar tokens falsos del sistema anterior (`token-tk...` que no son JWT).

---

### 8. `SELECT id FROM token_blacklist` — columna inexistente
**Error:** TODAS las peticiones autenticadas devolvían 401, incluso con token válido.
**Causa:** El middleware de auth hacía `SELECT id FROM token_blacklist WHERE token = $1`. La tabla `token_blacklist` no tiene columna `id` (su PK es `token`). La query lanzaba excepción → capturada por el catch → devolvía 401.
**Fix:** `SELECT 1 FROM token_blacklist WHERE token = $1`

---

### 9. TeamContext / GroupContext / TagContext con IDs falsos (`user-3`, `group-1`)
**Error:** `POST /api/tasks 500` — `la sintaxis de entrada no es válida para tipo uuid: «user-3»`
**Causa:** Los tres contextos cargaban datos de localStorage (datos de muestra del sistema anterior con IDs tipo `user-1`, `group-2`, `tag-3`). PostgreSQL espera UUIDs reales.
**Fix:** Agregar `useEffect` en los tres contextos que cargue desde el backend (`/api/employees`, `/api/groups`, `/api/tags`) cuando `useRealBackend = true`.

---

## Bugs Pendientes

### P1. 429 Too Many Requests — polling excesivo
**Síntoma:** La consola se llena de errores 429 (demasiadas peticiones).
**Causa probable:** El socket no conecta (o desconecta), lo que activa el polling de fallback en `TaskContext` cada 3 segundos. Con el rate limit de 200 req/15min, se supera rápidamente.
**Estado:** Reapareció después de las correcciones del día. Requiere verificar por qué el socket no mantiene la conexión.
**Archivos relacionados:** `src/context/TaskContext.jsx` (polling useEffect línea 73), `src/context/SocketContext.jsx`, `backend/src/socket/events.js`

---

### P2. Subtareas no funcionan
**Síntoma:** Al agregar o completar subtareas no se guarda correctamente.
**Causa probable:** El backend maneja subtareas como tabla separada (`task_subtasks`), pero el frontend las envía embebidas en el objeto de tarea (`updateTask`). El controlador puede no estar procesando el array `subtasks` al hacer PUT.
**Estado:** Sin investigar.
**Archivos relacionados:** `src/context/TaskContext.jsx` (`addSubtask`, `toggleSubtask`), `backend/src/controllers/taskController.js` (PUT handler)

---

### P3. Comentarios no funcionan
**Síntoma:** Al agregar un comentario no se guarda o no aparece.
**Causa probable:** Similar a subtareas — el frontend envía comentarios embebidos en el objeto tarea via `updateTask`, pero el backend los maneja en tabla separada (`task_comments`).
**Estado:** Sin investigar.
**Archivos relacionados:** `src/context/TaskContext.jsx` (`addComment`), `backend/src/controllers/taskController.js`

---

### P4. Notificaciones no muestran texto de descripción del comentario
**Síntoma:** En la página de notificaciones, las notificaciones de tipo `comment_added` no muestran el texto del comentario.
**Causa probable:** El campo `message` de la notificación solo incluye quién comentó y en qué tarea, pero no el contenido del comentario. O bien el componente no renderiza el campo correcto.
**Estado:** Sin investigar.
**Archivos relacionados:** `src/context/TaskContext.jsx` (`addComment` — genera la notificación), `src/pages/NotificationsPage.jsx` (renderizado), `src/context/NotificationContext.jsx`

---

## Notas Generales

- El backend usa **CommonJS** (`require`), el frontend usa **ESM** (`import`). Coexisten correctamente.
- Los puertos se acumulan entre reinicios. Usar `npm run stop` o matar procesos manualmente antes de `npm start`.
- PowerShell interpola `$` en strings con comillas dobles. Para ejecutar SQL con hashes bcrypt, usar archivos `.js` de Node.js en lugar de comandos inline.
- El rate limiter del backend está configurado en 200 req/15min (general) y 20 req/15min (auth). El polling de 3s = ~1200 req/h → supera el límite fácilmente si el socket no está activo.
