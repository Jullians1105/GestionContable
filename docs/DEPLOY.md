# Guía de Deployment — TaskFlow Pro

**Servidor de producción:** `192.168.1.12`  
**Puerto de acceso:** `5173`  
**URL de acceso en red local:** `http://192.168.1.12:5173`

---

## Requisitos del servidor Ubuntu

```bash
# Verificar que Docker está instalado
docker --version
docker compose version

# Si no está instalado:
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Agregar usuario actual al grupo docker (evita usar sudo en cada comando)
sudo usermod -aG docker $USER
newgrp docker
```

---

## 1. Clonar el repositorio

```bash
cd ~
git clone <URL_DEL_REPO> taskflow
cd taskflow
```

Si el repositorio es privado, configurar SSH key o usar HTTPS con token.

---

## 2. Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

Valores mínimos que debes cambiar para producción:

```env
# Base de datos
DB_USER=postgres
DB_PASSWORD=CAMBIA_ESTO_POR_UNA_CONTRASEÑA_SEGURA
DB_NAME=taskflow

# JWT — usar cadenas largas y aleatorias
JWT_SECRET=genera-un-secreto-largo-y-aleatorio-aqui
JWT_REFRESH_SECRET=otro-secreto-diferente-tambien-largo

# URL del cliente (para CORS del backend)
CLIENT_URL=http://192.168.1.12:5173

# Puerto del backend (interno)
PORT=3000
```

Generar secretos seguros:
```bash
openssl rand -base64 48
```

---

## 3. Primera ejecución

```bash
# Levantar todos los servicios en background
docker compose up -d

# Esperar a que postgres esté listo (~10 segundos) y ejecutar migraciones con datos de prueba
docker compose --profile migrate up migrate

# Verificar que todo está corriendo
docker compose ps
```

Salida esperada:
```
NAME                 STATUS          PORTS
taskflow_postgres    running (healthy)   0.0.0.0:5432->5432/tcp
taskflow_mailhog     running             0.0.0.0:1025->1025/tcp
taskflow_backend     running (healthy)   0.0.0.0:3000->3000/tcp
taskflow_frontend    running             0.0.0.0:5173->80/tcp
```

---

## 4. Verificar que funciona

```bash
# Health check del backend
curl http://localhost:3000/api/health
# Respuesta esperada: {"status":"OK","timestamp":"..."}

# Verificar frontend
curl -I http://localhost:5173
# Respuesta esperada: HTTP/1.1 200 OK
```

Desde otro equipo en la red:
```
http://192.168.1.12:5173
```

---

## 5. Comandos del día a día

```bash
# Ver estado de los contenedores
docker compose ps

# Ver logs del backend en tiempo real
docker compose logs -f backend

# Ver logs de todos los servicios
docker compose logs -f

# Reiniciar solo el backend (tras un hotfix)
docker compose restart backend

# Parar todo
docker compose down

# Parar y eliminar volúmenes (¡DESTRUCTIVO — borra la BD!)
docker compose down -v
```

---

## 6. Actualizar a una nueva versión

```bash
# 0. Backup antes de tocar producción (por las dudas, no específico de esta versión)
./scripts/backup.sh

# 1. Traer cambios del repositorio
git pull

# 2. Reconstruir imágenes con los cambios
docker compose build

# 3. Levantar con las imágenes nuevas
docker compose up -d
```

No hace falta un paso manual aparte para migraciones ni verificar si "hay migraciones nuevas":
en `docker-compose.yml`, el servicio `backend` tiene `depends_on: migrate: condition:
service_completed_successfully`, así que `docker compose up -d` siempre corre `migrate` primero
y espera a que termine OK antes de levantar `backend`. `migrations/run.js` es idempotente
(tabla `schema_migrations` trackea qué archivos ya se aplicaron), así que correrlo en cada
deploy —incluso sin migraciones nuevas— no tiene efecto ni riesgo, simplemente no hace nada.

---

## 7. Backup automático (cron)

Configurar un backup diario de la base de datos a las 2:00 AM:

```bash
# Dar permisos al script
chmod +x scripts/backup-db.sh

# Editar el crontab del usuario actual
crontab -e
```

Añadir esta línea al crontab:
```cron
0 2 * * * /home/$USER/taskflow/scripts/backup-db.sh >> /home/$USER/taskflow/backups/backup.log 2>&1
```

Los backups se guardan en `backups/taskflow_YYYYMMDD_HHMMSS.sql`.

Limpiar backups antiguos (mantener solo los últimos 7 días):
```bash
# Añadir también al crontab
0 3 * * * find /home/$USER/taskflow/backups -name "*.sql" -mtime +7 -delete
```

---

## 8. Abrir el firewall (si aplica)

```bash
# Permitir tráfico en el puerto 5173 desde la red local
sudo ufw allow from 192.168.1.0/24 to any port 5173
sudo ufw allow from 192.168.1.0/24 to any port 3000
sudo ufw status
```

---

## 9. Arrancar automáticamente al reiniciar el servidor

Docker Compose con `restart: unless-stopped` ya garantiza que los contenedores se reinician solos si el daemon de Docker está activo. Para que Docker arranque con el sistema:

```bash
sudo systemctl enable docker
sudo systemctl status docker
```

---

## Troubleshooting

### El frontend carga pero no puede conectar con la API
```bash
# Verificar que el backend está sano
docker compose ps backend
docker compose logs backend --tail 30

# Verificar que el healthcheck pasa
curl http://localhost:3000/api/health
```

### Las migraciones fallan al conectar con Postgres
```bash
# Esperar a que postgres esté completamente listo
docker compose ps postgres
# Debe decir "healthy". Si dice "starting", esperar 10-15 segundos más.
docker compose --profile migrate up migrate
```

### Los WebSockets no conectan
El frontend usa nginx para hacer proxy de `/socket.io/` al backend. Verificar que el backend está corriendo y que la sesión tiene token JWT válido (reiniciar sesión si expiró).

### Puerto 5173 ocupado
```bash
sudo lsof -i :5173
# Cambiar el puerto en docker-compose.yml: "NUEVO_PUERTO:80"
```

### Resetear la base de datos (desarrollo solamente)
```bash
# ¡DESTRUCTIVO — elimina todos los datos!
docker compose down -v
docker compose up -d
docker compose --profile migrate up migrate
```

### Ver uso de espacio en disco
```bash
docker system df
# Limpiar imágenes y contenedores no usados
docker system prune -f
```
