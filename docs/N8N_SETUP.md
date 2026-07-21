# n8n — Guía de Setup y Automatizaciones

**URL de acceso:** `http://192.168.1.12:5678`  
**Contenedor:** `gestcon_n8n`  
**Base de datos:** PostgreSQL → `n8n` (separada de `gestcon`)  
**Zona horaria:** `America/Bogota`

> ⚠️ El servicio `n8n` (y `n8n-db-init`, referenciados por `scripts/deploy-n8n.sh`) **no está
> definido en `docker-compose.yml` de este repo** — se configuró aparte, directo en el servidor.
> Este rename de branding (2026-07-20) actualizó el nombre acá en la doc como referencia, pero
> **no renombra el contenedor real** en el servidor (que puede seguir llamándose
> `taskflow_n8n` hasta que se haga ese paso manual ahí). Si vas a tocar n8n, primero corré
> `docker ps` en el servidor para confirmar el nombre real del contenedor.

---

## 1. Primera vez que accedes

1. Abre `http://192.168.1.12:5678` desde cualquier equipo en la red
2. n8n mostrará el formulario de creación de cuenta de administrador:
   - **Nombre, apellido, email y contraseña** — estos son los datos del dueño de la instancia
3. Confirma y ya tendrás acceso al editor visual de workflows

> La cuenta se guarda en la base de datos `n8n` en PostgreSQL. Si necesitas resetearla, puedes borrar el volumen `n8n_data` y reiniciar el servicio.

---

## 2. Conectar n8n con la API de Gestcon

n8n se conecta al backend usando **HTTP Request** nodes con autenticación JWT.

### Obtener un token JWT

```bash
# Desde cualquier máquina en la red
curl -X POST http://192.168.1.12:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@empresa.com","password":"admin123"}'
```

Respuesta:
```json
{
  "token": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

### Crear una credencial en n8n

1. En n8n: **Credenciales → Nueva → Header Auth**
2. Nombre: `Gestcon JWT`
3. Header Name: `Authorization`
4. Header Value: `Bearer eyJhbGc...` (pegar el token)
5. Guardar

> Los tokens expiran en 1h. Para producción, usar el `refreshToken` para obtener uno nuevo, o crear un usuario de servicio con contraseña fuerte.

### Endpoints disponibles

```
Base URL: http://backend:3000/api   (dentro de Docker)
         http://192.168.1.12:3000/api  (desde la red)

GET    /tasks                 → listar tareas (con filtros)
POST   /tasks                 → crear tarea
PUT    /tasks/:id             → actualizar tarea
DELETE /tasks/:id             → eliminar tarea
GET    /employees             → listar empleados
GET    /groups                → listar grupos
GET    /stats                 → estadísticas generales
POST   /notifications         → crear notificación
```

---

## 3. Automatizaciones de ejemplo

### 3.1 Alerta diaria de tareas vencidas

**Trigger:** Schedule → todos los días a las 8:00 AM  
**Flujo:**
1. `Schedule Trigger` → cron: `0 8 * * *`
2. `HTTP Request` → `GET http://backend:3000/api/tasks?status=pending` (con header JWT)
3. `Code` → filtrar tareas donde `dueDate < hoy`
4. `IF` → si hay tareas vencidas, continuar
5. `Send Email` (vía Mailhog/SMTP) → enviar lista al admin

```json
// Ejemplo de body del email (en el nodo Code):
{
  "to": "maria@empresa.com",
  "subject": "⚠️ Tareas vencidas — Gestcon",
  "body": "Tienes {{ $json.count }} tareas vencidas:\n{{ $json.titles }}"
}
```

---

### 3.2 Notificación al asignar una tarea

**Trigger:** Webhook  
**Cómo activarlo:** Llamar al webhook desde el backend al crear/actualizar una tarea  
**Flujo:**
1. `Webhook` → URL generada por n8n (ej: `http://192.168.1.12:5678/webhook/task-assigned`)
2. `IF` → verificar que el campo `assignedTo` cambió
3. `HTTP Request` → `GET http://backend:3000/api/employees/:id` → obtener email del asignado
4. `Send Email` → notificar al empleado

**Cómo llamarlo desde el backend (opcional — agregar en `taskController.js`):**
```javascript
// En createTask, después de crear la tarea:
if (process.env.N8N_WEBHOOK_TASK_ASSIGNED) {
  fetch(process.env.N8N_WEBHOOK_TASK_ASSIGNED, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: newTask.id, assignedTo, actorName: req.user.name })
  }).catch(() => {}); // no bloquear si n8n no está disponible
}
```

---

### 3.3 Reporte semanal de productividad

**Trigger:** Schedule → cada lunes a las 7:00 AM  
**Flujo:**
1. `Schedule Trigger` → cron: `0 7 * * 1`
2. `HTTP Request` → `GET http://backend:3000/api/stats` (con JWT)
3. `HTTP Request` → `GET http://backend:3000/api/tasks?status=completed` (tareas de la semana)
4. `Code` → armar HTML del reporte
5. `Send Email` → enviar a todos los líderes

---

### 3.4 Backup semanal de la base de datos vía n8n

**Trigger:** Schedule → cada domingo a las 3:00 AM  
**Flujo:**
1. `Schedule Trigger` → cron: `0 3 * * 0`
2. `Execute Command` → `./scripts/backup.sh` (si n8n tiene acceso al host)
3. `Send Email` → confirmar backup completado con timestamp

> Alternativa más simple: configurar el crontab del servidor directamente (ver `docs/DEPLOY.md`).

---

## 4. Comandos útiles del día a día

```bash
# Ver estado del contenedor
docker compose ps n8n

# Ver logs de n8n en tiempo real
docker compose logs -f n8n

# Reiniciar n8n (aplica cambios de .env)
docker compose restart n8n

# Detener solo n8n (sin afectar el resto)
docker compose stop n8n

# Ver uso de la base de datos n8n
docker compose exec postgres psql -U postgres -d n8n -c "\dt"
```

---

## 5. Variables de entorno de n8n

Configuradas en `docker-compose.yml`. Si necesitas cambiarlas, edita el archivo y ejecuta:

```bash
docker compose up -d n8n
```

| Variable | Valor | Descripción |
|---|---|---|
| `N8N_HOST` | `0.0.0.0` | Escucha en todas las interfaces |
| `N8N_PORT` | `5678` | Puerto interno del contenedor |
| `N8N_EDITOR_BASE_URL` | `http://192.168.1.12:5678` | URL pública del editor |
| `WEBHOOK_URL` | `http://192.168.1.12:5678/` | Base de los webhooks |
| `DB_POSTGRESDB_DATABASE` | `n8n` | Base de datos propia (separada de gestcon) |
| `N8N_ENCRYPTION_KEY` | `(desde .env)` | Cifra las credenciales guardadas en n8n |
| `GENERIC_TIMEZONE` | `America/Bogota` | Timezone para los schedules |

---

## 6. Troubleshooting

### n8n no inicia — "database n8n does not exist"
```bash
# Verificar que n8n-db-init corrió correctamente
docker compose logs n8n-db-init

# Crear la base de datos manualmente
docker compose exec postgres psql -U postgres -c "CREATE DATABASE n8n"

# Reiniciar n8n
docker compose restart n8n
```

### No puedo acceder a http://192.168.1.12:5678
```bash
# Verificar que el contenedor está corriendo
docker compose ps n8n

# Verificar que el puerto está expuesto
docker compose port n8n 5678

# Ver logs de error
docker compose logs n8n --tail 30
```

### Las credenciales cifradas se perdieron
Si cambias `N8N_ENCRYPTION_KEY`, las credenciales guardadas quedan ilegibles. Mantén el mismo valor de `N8N_ENCRYPTION_KEY` siempre y guárdalo en un lugar seguro.

### El webhook no recibe datos
La URL de webhook en n8n incluye el ID del workflow. Verifica que:
1. El workflow está **activo** (toggle en la esquina superior derecha del editor)
2. La URL que llamas es exactamente la que n8n muestra al abrir el nodo Webhook
3. El firewall permite tráfico en el puerto 5678
