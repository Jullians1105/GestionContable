# Cambios Sesión 2026-06-10 — Registro, recuperación de contraseña y deploy local con Docker

Registro de lo implementado en esta sesión: despliegue local con Docker en Windows, registro de usuarios sin auto-login con popup de éxito, y flujo completo de recuperación de contraseña (forgot/reset) con backend real (Postgres + JWT) y Mailhog.

---

## 1. Despliegue local con Docker (Windows)

### `vite.config.js`
- Agregado `server.host: true` y proxy a `/api` y `/socket.io` apuntando a `VITE_BACKEND_URL` (default `http://localhost:3000`).
- Fix de HMR roto en Docker Desktop para Windows (bind mounts no disparan eventos de archivo): `watch: { usePolling: true, interval: 300 }`.

### `.env` (raíz, usado por `docker-compose.yml`)
- `JWT_SECRET` / `JWT_REFRESH_SECRET` alineados con `backend/.env` (`taskflow-dev-secret-key-change-in-production-2026` / `taskflow-refresh-secret-different-key-2026`) para evitar 401 por tokens firmados con secretos distintos entre el flujo Docker y el flujo local.
- Agregado `FROM_EMAIL=noreply@gestcon.local`.

### `docker-compose.yml`
- Quitado el campo obsoleto `version: '3.9'`.
- Nuevo servicio **mailhog** (`mailhog/mailhog:latest`), puertos `1025` (SMTP) y `8025` (UI web).
- `backend` depende de `mailhog` (`condition: service_started`) y recibe `SMTP_HOST=mailhog`, `SMTP_PORT=1025`, `SHOW_RESET_TOKEN=true`.

---

## 2. Registro de usuarios — sin auto-login + popup de éxito

### `src/context/AuthContext.jsx`
- `register()` ya **no hace auto-login**. Solo crea el usuario (backend o fallback localStorage) y devuelve `{ success: true }`.

### `src/pages/RegisterPage.jsx`
- `handleSubmit` ahora es `async` y hace `await register(...)` (antes faltaba el `await`, por lo que `result.success` siempre era `undefined`).
- Quitado el bloque "Usuarios de prueba" del login (`LoginPage.jsx`) y agregado el link **"¿Olvidaste tu contraseña?"**.
- Nuevo modal de éxito al registrar:
  - Ícono `check_circle`, título "¡Cuenta creada!", mensaje de confirmación.
  - Botón "Ir a iniciar sesión" → `navigate('/login')`.

---

## 3. Recuperación de contraseña — arquitectura

Tokens de un solo uso, hasheados con SHA-256, expiración de 30 minutos, respuestas genéricas (anti-enumeración de emails). Envío de correo vía **Mailhog** en desarrollo (nodemailer abstraído para poder apuntar a un proveedor real solo cambiando variables de entorno).

### Migración nueva: `backend/migrations/005_password_reset.sql`
```sql
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash  VARCHAR(64) PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);
```
Aplicada manualmente vía `docker compose exec -T postgres psql -U postgres -d gestcon < backend/migrations/005_password_reset.sql`, porque `migrations/run.js` no tiene tabla de control de migraciones aplicadas y falla si se reejecuta sobre una BD ya inicializada (`relation "idx_users_email" already exists`). **Pendiente:** agregar tabla `schema_migrations` para que `run.js` sea idempotente.

`backend/migrations/run.js` — el `DROP TABLE` de `--reset` ahora incluye `password_reset_tokens`.

### Backend — `backend/src/utils/email.js` (nuevo)
- `sendPasswordResetEmail(to, token)` — arma `resetUrl = ${CLIENT_URL}/reset-password?token=...` y envía HTML vía nodemailer.
- Si `SMTP_HOST` no está configurado, solo loguea (no rompe el flujo).

### Backend — `backend/src/config/env.js`
- Nuevas vars: `SMTP_HOST`, `SMTP_PORT` (default 1025), `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`.
- Nueva var **`SHOW_RESET_TOKEN`** (boolean, default false): si está en `true`, `forgotPassword` devuelve el token crudo en la respuesta del API (`devToken`), para no depender de revisar el correo en desarrollo. **Nunca activar en producción.**

### Backend — `backend/src/controllers/authController.js`
- `forgotPassword(req, res)`:
  - Busca el usuario por email; si existe, genera token random de 32 bytes, guarda su hash SHA-256 en `password_reset_tokens` (expira en 30 min), y envía el email.
  - Si `SHOW_RESET_TOKEN` está activo, agrega `devToken` a la respuesta.
  - Responde siempre con el mismo mensaje genérico, exista o no el usuario.
- `resetPassword(req, res)`:
  - Valida token (hash, no usado, no expirado).
  - Actualiza `password_hash`, marca el token como usado, revoca todos los `refresh_tokens` del usuario.

### Backend — `backend/src/routes/auth.js`
- `POST /auth/forgot-password` — `body('email').isEmail().normalizeEmail()`.
- `POST /auth/reset-password` — `body('token').notEmpty()`, `body('password').isLength({ min: 8 })`.
- Documentación OpenAPI/swagger agregada para ambas rutas.

### Backend — dependencias
- `nodemailer@^6.9.14` agregado a `backend/package.json` (instalado, queda `^6.10.1` en `package-lock.json`).

---

## 4. Recuperación de contraseña — frontend

### `src/services/api.js`
```js
forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
resetPassword: (token, password) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
```

### `src/utils/storage.js`
- `getPasswordResetTokens` / `savePasswordResetTokens` — para el flujo fallback (sin backend real), guarda tokens en localStorage con expiración de 30 min.

### `src/context/AuthContext.jsx`
- `requestPasswordReset(email)`:
  - Con backend real: llama `api.forgotPassword(email)`, devuelve `{ success: true, devToken }` (devToken solo si el backend lo manda, vía `SHOW_RESET_TOKEN`).
  - Sin backend (fallback localStorage): busca el usuario, genera un token local, devuelve `{ success: true, devToken }`.
- `confirmPasswordReset(token, newPassword)`:
  - Con backend real: `api.resetPassword(token, newPassword)`.
  - Sin backend: valida contra `password_reset_tokens` en localStorage y actualiza `team_members`.
- Eliminada la función anterior `resetPassword(email, newPassword)` (insegura, sin verificación de identidad).

### `src/pages/ForgotPasswordPage.jsx` (reescrita)
- Formulario de un solo campo (email) → `requestPasswordReset(email)`.
- Mensaje de éxito genérico ("Si el email existe, se enviaron instrucciones...").
- Si la respuesta trae `devToken` (modo desarrollo), muestra botón **"Restablecer contraseña ahora"** que navega directo a `/reset-password?token=...` — **no hace falta abrir Mailhog** para probar el flujo completo.
- Si no hay `devToken` (producción), botón "Ya tengo mi token" → `/reset-password`.

### `src/pages/ResetPasswordPage.jsx` (nueva)
- Lee `?token=` de la URL con `useSearchParams`.
- Form: token (prellenado si viene en la URL), nueva contraseña, confirmar contraseña (validación de longitud mínima 8 y coincidencia).
- Llama `confirmPasswordReset(token, password)`.
- Modal de éxito ("¡Contraseña actualizada!") con botón "Ir a iniciar sesión".

### `src/App.jsx`
- Rutas nuevas: `/forgot-password` → `ForgotPasswordPage`, `/reset-password` → `ResetPasswordPage`.

---

## 5. Verificación end-to-end

1. `npm run build` — sin errores (los warnings de `npm run lint` son preexistentes y no relacionados con esta sesión: `vite.config.js` `process is not defined`, hooks con deps faltantes en `GroupContext`/`TagContext`/`TeamContext`, `SAMPLE_TASKS` sin usar).
2. `docker compose up -d --build` — 4 contenedores corriendo: `gestcon_postgres`, `gestcon_backend`, `gestcon_frontend`, `gestcon_mailhog`.
3. Migración `005_password_reset.sql` aplicada manualmente.
4. `POST /api/auth/forgot-password` con `maria@empresa.com`:
   - Email recibido en Mailhog (`localhost:8025`) con link `http://localhost:5173/reset-password?token=...`.
   - Respuesta del API incluye `devToken` (gracias a `SHOW_RESET_TOKEN=true`).
5. `POST /api/auth/reset-password` con el token → `"Contraseña actualizada correctamente"`.
6. `POST /api/auth/login` con la nueva contraseña → login exitoso (token JWT válido).

---

## Archivos creados

| Archivo | Descripción |
|---|---|
| `backend/migrations/005_password_reset.sql` | Tabla `password_reset_tokens` |
| `backend/src/utils/email.js` | Envío de email de recuperación vía nodemailer |
| `src/pages/ResetPasswordPage.jsx` | Página para confirmar el reset con token + nueva contraseña |

## Archivos modificados (resumen)

| Archivo | Cambios |
|---|---|
| `vite.config.js` | Proxy `/api` y `/socket.io`, `usePolling` para HMR en Docker/Windows |
| `.env` (raíz) | JWT secrets alineados, `FROM_EMAIL` |
| `docker-compose.yml` | Servicio `mailhog`, env vars SMTP/`SHOW_RESET_TOKEN` en backend |
| `backend/.env`, `backend/.env.example` | Vars SMTP + `SHOW_RESET_TOKEN` |
| `backend/migrations/run.js` | `DROP TABLE` de `--reset` incluye `password_reset_tokens` |
| `backend/src/config/env.js` | Vars SMTP + `SHOW_RESET_TOKEN` |
| `backend/src/controllers/authController.js` | `forgotPassword`, `resetPassword` |
| `backend/src/routes/auth.js` | Rutas `/forgot-password`, `/reset-password` |
| `backend/package.json` / `package-lock.json` | Dependencia `nodemailer` |
| `src/App.jsx` | Rutas `/forgot-password`, `/reset-password` |
| `src/context/AuthContext.jsx` | `register` sin auto-login; `requestPasswordReset`, `confirmPasswordReset` (reemplaza `resetPassword`) |
| `src/services/api.js` | `forgotPassword`, `resetPassword` |
| `src/utils/storage.js` | `getPasswordResetTokens`, `savePasswordResetTokens` |
| `src/pages/RegisterPage.jsx` | `handleSubmit` async + popup de éxito |
| `src/pages/ForgotPasswordPage.jsx` | Reescrita para usar `requestPasswordReset` |
| `src/pages/LoginPage.jsx` | Quitados usuarios de prueba, link "¿Olvidaste tu contraseña?" |

---

## Pendientes / ideas para próxima sesión

- **Rate limiting** en `/auth/forgot-password` y `/auth/reset-password` (`express-rate-limit`) — prevenir abuso/fuerza bruta. Prioridad alta, costo bajo.
- **Tabla `schema_migrations`** para que `backend/migrations/run.js` sea idempotente y no falle al reejecutarse.
- Para producción: cambiar `SMTP_HOST/PORT/USER/PASS` a un proveedor real (Resend, SendGrid, Gmail con app password) y poner `SHOW_RESET_TOKEN=false`/sin definir.
- Si el volumen de emails/notificaciones crece, considerar cola de trabajos (BullMQ + Redis) para desacoplar el envío de emails del request HTTP.
