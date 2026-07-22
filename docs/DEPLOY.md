# Guía de Deployment — Gestcon

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
git clone <URL_DEL_REPO> gestcon
cd gestcon
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
DB_NAME=gestcon

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
gestcon_postgres    running (healthy)   0.0.0.0:5432->5432/tcp
gestcon_mailhog     running             0.0.0.0:1025->1025/tcp
gestcon_backend     running (healthy)   0.0.0.0:3000->3000/tcp
gestcon_frontend    running             0.0.0.0:5173->80/tcp
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

### Atajo: alias `deploy`

En el servidor de producción existe un alias `deploy` en `~/.bashrc` (**no versionado en el
repo** — si el servidor se reinstala hay que volver a crearlo, ver comando abajo) que hace
exactamente los pasos de esta sección en un solo comando:

```bash
alias deploy='cd ~/GestionTareasOficina && ./scripts/backup.sh && git pull && docker compose build && docker compose up -d'
```

Escribir `deploy` en una terminal del servidor: hace backup, trae `main`, reconstruye todas las
imágenes y levanta todo (lo que dispara `migrate` automáticamente, igual que el paso a paso
manual).

**Por qué el backup va primero, siempre:** si algo del deploy sale mal (migración que falla,
imagen que no levanta), el backup ya está hecho *antes* de tocar nada — no depende de acordarse
de correrlo aparte.

**Historial — versión anterior de este alias (ya corregida):** hasta el 2026-07-21 el alias era
`git pull && docker compose up -d --build backend && docker compose up -d --build frontend`, sin
backup y limitando el `--build`/`up` a `backend` y `frontend` únicamente. Eso dejaba un hueco
real: `migrate` es un contenedor "one-off" (`restart: "no"`) que Compose solo vuelve a correr si
su condición `service_completed_successfully` no está ya satisfecha por un contenedor previo. Si
`migrate` ya había corrido y salido con código 0 en un deploy anterior, un `deploy` posterior que
solo apuntaba a `backend`/`frontend` **no volvía a ejecutar `migrate`** — y encima, como tampoco
reconstruía la imagen de `migrate` (mismo Dockerfile/contexto que `backend`, pero el `--build` no
la incluía), si por algún motivo sí llegaba a correr lo hacía con migraciones viejas. Esto es lo
que obligaba a correr las migraciones a mano antes de cada deploy con cambios de esquema. La
versión actual del alias evita el problema por completo: `docker compose build` reconstruye
también la imagen de `migrate`, y `docker compose up -d` (sin restringir a servicios puntuales)
sí re-evalúa y corre `migrate` como corresponde.

---

## 7. Backup automático (cron)

Configurar un backup diario de la base de datos a las 2:00 AM:

```bash
# Dar permisos al script
chmod +x scripts/backup.sh

# Editar el crontab del usuario actual
crontab -e
```

Añadir esta línea al crontab:
```cron
0 2 * * * /home/$USER/gestcon/scripts/backup.sh >> /home/$USER/gestcon/backups/backup.log 2>&1
```

Los backups se guardan comprimidos en `backups/backup_YYYYMMDD_HHMMSS.tar.gz`. La rotación automática (mantener últimos 7 días) está integrada en el script, no requiere cron adicional.

**Cron real configurado en el servidor de producción actual** (`crontab -l` como
`gestionc-server`, distinto del ejemplo genérico de arriba):
```cron
0 18 * * * cd /home/gestionc-server/GestionTareasOficina && ./scripts/backup.sh >> /var/log/backup-gestion.log 2>&1
```
Corre todos los días a las 6:00 PM, log en `/var/log/backup-gestion.log` (no dentro del repo).

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

## 10. Configuración manual del servidor — gestion-start / gestion-stop

### Qué hace cada script

**`gestion-start.sh`**: corre `docker compose up -d`, después sondea cada 5s (hasta 60s máximo)
el estado de `docker compose ps --format json` esperando que `backend` y `postgres` (los únicos
servicios con healthcheck propio — `frontend` y `mailhog` no tienen) queden `healthy`. Al final
muestra `docker compose ps` completo. Si algún servicio no llegó a `healthy` en los 60s, lista
cuáles y termina con código de error (sugiere revisar `docker compose logs <servicio>`).

**`gestion-stop.sh`**: muestra una advertencia (apaga el servidor para toda la oficina y para
quienes entran remoto por `gestcon.work`), pide escribir exactamente `si` para confirmar (se
puede saltar con `-y`/`--yes`), corre `docker compose down` y termina con `sudo shutdown -h now`.
Uso diario real: `gestion-start` al llegar, `gestion-stop` al terminar el día.

Ambos resuelven su propia ruta con `readlink -f "$0"` para funcionar igual invocados por el path
completo o por el symlink en `/usr/local/bin`.

### Instalación

Dependen de tres cambios hechos directamente en el sistema operativo del servidor — **no están
versionados en el repo**. Si el servidor se reinstala o migra a otro equipo, hay que rehacerlos.

**1. Sudo sin contraseña, solo para shutdown**

Archivo `/etc/sudoers.d/gestion-stop`:
```
gestionc-server ALL=(ALL) NOPASSWD: /usr/sbin/shutdown
```
Verificar con `sudo -n shutdown --help` — no debe pedir contraseña.

**2. Lid switch en ignore** (evita que cerrar la tapa suspenda el servidor por accidente)

Archivo `/etc/systemd/logind.conf.d/99-gestion-lid.conf`:
```ini
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
```
Aplicar con:
```bash
sudo systemctl restart systemd-logind
```

**3. Symlinks de los scripts**

```bash
sudo ln -sf ~/GestionTareasOficina/scripts/gestion-start.sh /usr/local/bin/gestion-start
sudo ln -sf ~/GestionTareasOficina/scripts/gestion-stop.sh  /usr/local/bin/gestion-stop
```

**Uso diario:** `gestion-start` al llegar, `gestion-stop` al terminar el día (pide confirmación
escribiendo `si`, apaga físicamente el servidor). Solo funciona parado frente al servidor o
conectado por SSH.

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
