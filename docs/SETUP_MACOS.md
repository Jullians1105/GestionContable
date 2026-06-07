# Setup en macOS — GestionTareasOficina

Prompt para ejecutar en Claude Code al abrir el proyecto en un Mac por primera vez.

---

El proyecto soporta dos flujos de desarrollo:

- **A — Todo en Docker** (recomendado, usa `scripts/start-dev.sh`): postgres + backend + frontend corren en contenedores. Requiere el `.env` de la **raíz**.
- **B — Node local + Postgres en Docker** (`npm run start`): backend con nodemon y frontend con Vite corren directo en tu máquina, solo Postgres va en contenedor. Requiere `backend/.env`.

Elige uno según lo que el usuario prefiera; ambos son válidos.

## Prompt de primer setup (ejecutar una sola vez)

```
Estoy abriendo este proyecto por primera vez en macOS. Necesito que hagas lo siguiente en orden:

1. Verifica que Node.js y Docker estén instalados:
   node -v && npm -v
   docker -v

   Si Node.js no está, indícame cómo instalarlo con Homebrew:
     brew install node
   Si Docker no está, indícame que descargue Docker Desktop desde https://www.docker.com/products/docker-desktop/

2. Da permisos de ejecución a los scripts auxiliares (necesario en checkouts nuevos):
   chmod +x scripts/*.sh

3. Crea el .env de la raíz (lo usa docker-compose para todos los servicios):
   cp .env.example .env

   Confirma que tiene al menos estas variables:
     PORT=3000
     DB_PORT=5432
     DB_NAME=taskflow
     DB_USER=postgres
     DB_PASSWORD=<elige un password>
     JWT_SECRET=<cualquier cadena larga>
     JWT_REFRESH_SECRET=<otra cadena larga distinta>

   Si vas a trabajar con el flujo B (Node local), crea también backend/.env:
   cp backend/.env.example backend/.env
   y ajusta DB_HOST=localhost (no "postgres", eso es solo Docker-to-Docker).

4. Si vas a usar el flujo A (todo en Docker), instala las dependencias del
   proyecto raíz solo para tener linting/herramientas locales (opcional):
   npm install

   Si vas a usar el flujo B (Node local), instala además las del backend:
   npm install
   npm run backend:install

5. Levanta el entorno y aplica migraciones + seed:

   Flujo A (todo en Docker):
     ./scripts/start-dev.sh
   Esto hace `docker compose up -d --build`, corre las migraciones con
   seed (`docker compose run --rm migrate`) y luego sigue los logs.
   Sal de los logs con Ctrl+C — los contenedores siguen corriendo.

   Flujo B (Node local + Postgres en Docker):
     docker compose up -d postgres
   Espera el healthcheck (~10s) y verifica con `docker compose ps`, luego:
     npm run backend:migrate:seed

   En ambos casos las migraciones deberían aplicar:
   - 001_initial_schema.sql
   - 002_seed_data.sql
   - 003_notification_extra.sql
   - 004_user_permissions.sql

6. Confirma que todo esté listo mostrando el resultado de:
   docker compose ps
   ls backend/migrations/
```

---

## Prompt de arranque diario (cada vez que abres el proyecto)

```
Arranca el entorno de desarrollo. Pregúntame si prefiero el flujo todo-en-Docker
o Node local antes de continuar (o usa el que ya esté configurado si es obvio
por lo que está corriendo en `docker compose ps`):

Flujo A — todo en Docker:
1. ./scripts/start-dev.sh
   Levanta postgres, backend y frontend en contenedores, corre las
   migraciones y sigue los logs. Frontend en localhost:5173, backend en
   localhost:3000.

Flujo B — Node local + Postgres en Docker:
1. Asegúrate de que PostgreSQL esté corriendo:
   docker compose ps
   Si el contenedor postgres no está up:
   docker compose up -d postgres

2. Levanta el backend y el frontend en paralelo:
   npm run start

   Esto arranca:
   - Backend Express (nodemon) en localhost:3000
   - Frontend Vite en localhost:5173

   El frontend detecta automáticamente si el backend está disponible
   y cambia a modo real (JWT + PostgreSQL). Si el backend no responde,
   cae en modo localStorage.

Avísame cuando los procesos estén corriendo y sin errores en consola.
```

---

## Prompt si necesitas el MCP Server (opcional)

```
El MCP server de gestor-tareas es opcional desde la Fase 3.
Si lo necesitas activo en Claude Code:

1. Instala sus dependencias (si no lo hiciste):
   npm --prefix mcpServer install

2. Compila TypeScript → JavaScript:
   npm --prefix mcpServer run build

   Verifica que se haya generado mcpServer/dist/index.js.

3. Revisa que .claude.json tenga la ruta relativa (no absoluta de Windows):
   "./mcpServer/dist/index.js"

4. Recarga el servidor MCP en Claude Code:
   Ve a Configuración → MCP Servers → reinicia "gestor-tareas"
```

---

## Prompt si el backend no conecta a PostgreSQL

```
El backend no puede conectarse a la base de datos. Haz lo siguiente:

1. Verifica que el contenedor esté corriendo:
   docker compose ps

2. Si está detenido, reinícialo:
   docker compose up -d postgres

3. Confirma que backend/.env existe y tiene DB_HOST=localhost y DB_PORT=5432.
   (No usar DB_HOST=postgres — eso es solo para Docker-to-Docker.)

4. Si la base de datos no tiene tablas (primer arranque o reset):
   npm run backend:migrate:seed

5. Si el error es "password authentication failed", verifica que
   DB_PASSWORD en backend/.env coincida con POSTGRES_PASSWORD en docker-compose.yml
   (por defecto ambos son "postgres").

6. Muéstrame el error exacto si sigue fallando.
```

---

## Prompt si hay errores al instalar dependencias nativas

```
Tengo errores al correr npm install en este proyecto en macOS.
El paquete better-sqlite3 (mcpServer) requiere compilación nativa.

1. Verifica que Xcode Command Line Tools estén instalados:
   xcode-select --install

2. Si el error menciona Python, verifica la versión:
   python3 --version

3. Reinstala las dependencias del mcpServer forzando recompilación:
   npm --prefix mcpServer install --build-from-source

4. Si el error persiste, muéstrame el mensaje de error completo.

Nota: el backend principal ya no usa better-sqlite3 (migrado a PostgreSQL),
por lo que este problema solo afecta al MCP server opcional.
```

---

## Prompt para detener todos los procesos

```
Detén todos los procesos del proyecto:

Si usaste el flujo A (todo en Docker):
   ./scripts/stop-dev.sh
   (equivale a `docker compose down`)

Si usaste el flujo B (Node local + Postgres en Docker):
1. Para Node.js (frontend + backend):
   npm run stop

   Si eso mata procesos de otros proyectos, usa selectivamente:
   pkill -f "nodemon src/index.js"
   pkill -f "vite"

2. Para PostgreSQL (Docker):
   docker compose stop postgres

   O si quieres detener y limpiar todo:
   docker compose down
```

---

## Prompt para tareas de base de datos (backup / reset)

```
Necesito hacer una tarea de mantenimiento sobre la base de datos PostgreSQL
(corriendo en Docker, vía docker-compose):

- Backup: ./scripts/backup-db.sh
  Genera un dump con pg_dump en backups/taskflow_<timestamp>.sql
  (usa las variables de .env en la raíz; crea la carpeta backups/ si no existe).

- Reset completo (borra y recrea la BD con migraciones + seed): ./scripts/reset-db.sh
  Pide confirmación interactiva (y/N) antes de ejecutar
  `docker compose run --rm migrate node migrations/run.js --reset --seed`.
  ¡Esto borra todos los datos! Confirma conmigo antes de aceptar el prompt.
```

---

## Usuarios de prueba (seed en PostgreSQL)

| Email | Password | Rol | Permisos |
|---|---|---|---|
| maria@empresa.com | admin123 | admin | todos |
| carlos@empresa.com | leader123 | leader | todos |
| ana@empresa.com | member123 | member | crear + comentar |
| pedro@empresa.com | member123 | member | crear + comentar |
| laura@empresa.com | viewer123 | viewer | ninguno |

Los permisos granulares (`canCreateTask`, `canEditTask`, etc.) se gestionan
desde `/usuarios` (solo admin). Si `permissions` es `null` en la BD,
se aplican los defaults del rol.

---

## Referencia rápida de scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Solo frontend Vite en localhost:5173 |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint — falla si hay warnings |
| `npm run start` | Backend (nodemon) + Frontend Vite en paralelo |
| `npm run stop` | Mata todos los procesos node |
| `npm run backend:install` | Instala dependencias del backend |
| `npm run backend:migrate` | Aplica migraciones SQL (sin seed) |
| `npm run backend:migrate:seed` | Aplica migraciones + carga datos de prueba |
| `npm run backend:test` | Corre tests del backend (Jest) |
| `npm --prefix mcpServer run build` | Compila TypeScript del MCP server |
| `npm --prefix mcpServer run dev` | MCP server en modo dev con ts-node |
| `docker compose up -d postgres` | Levanta solo PostgreSQL en Docker (flujo B) |
| `docker compose stop postgres` | Detiene PostgreSQL |
| `docker compose down` | Detiene y elimina contenedores |
| `./scripts/start-dev.sh` | Levanta todo (postgres + backend + frontend) en Docker, migra y sigue logs (flujo A) |
| `./scripts/stop-dev.sh` | Detiene y elimina los contenedores (`docker compose down`) |
| `./scripts/backup-db.sh` | Vuelca la BD a `backups/taskflow_<timestamp>.sql` con `pg_dump` |
| `./scripts/reset-db.sh` | Borra y recrea la BD con migraciones + seed (pide confirmación) |
