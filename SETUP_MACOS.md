# Setup en macOS — GestionTareasOficina

Prompt para ejecutar en Claude Code al abrir el proyecto en un Mac por primera vez.

---

## Prompt de primer setup (ejecutar una sola vez)

```
Estoy abriendo este proyecto por primera vez en macOS. Necesito que hagas lo siguiente en orden:

1. Verifica que Node.js esté instalado corriendo `node -v` y `npm -v`. Si no están, indícame cómo instalarlos con Homebrew (`brew install node`).

2. Instala las dependencias del proyecto raíz:
   npm install

3. Instala las dependencias del backend:
   npm --prefix backend install

4. Instala las dependencias del servidor MCP:
   npm --prefix mcpServer install

5. Compila el servidor MCP (TypeScript → JavaScript):
   npm --prefix mcpServer run build

   Verifica que se haya generado la carpeta mcpServer/dist/ con el archivo index.js.

6. Verifica que el archivo .claude.json tenga la ruta relativa ./mcpServer/dist/index.js (no una ruta absoluta de Windows). Si tiene una ruta absoluta, cámbiala.

7. Confirma que todo esté listo mostrando el contenido de mcpServer/dist/ y el estado de las dependencias.
```

---

## Prompt de arranque diario (cada vez que abres el proyecto)

```
Arranca el entorno de desarrollo completo:

1. Levanta el frontend y el backend en paralelo:
   npm run start

   Esto arranca:
   - MCP Server en modo dev (ts-node src/index.ts) 
   - Backend Express en localhost:3000

2. En otra terminal, levanta el servidor de desarrollo de Vite:
   npm run dev

   El frontend queda disponible en localhost:5173.

Avísame cuando los tres procesos estén corriendo y sin errores.
```

---

## Prompt si el MCP server no carga en Claude Code

```
El servidor MCP "gestor-tareas" no está cargando. Haz lo siguiente:

1. Verifica que mcpServer/dist/index.js existe. Si no existe, compila:
   npm --prefix mcpServer run build

2. Revisa el contenido de .claude.json y confirma que args contiene:
   "./mcpServer/dist/index.js"
   (ruta relativa, sin barras invertidas de Windows)

3. Si el archivo existe y la ruta es correcta, recarga Claude Code:
   Ve a Configuración → MCP Servers → reinicia "gestor-tareas"

4. Si sigue sin cargar, muéstrame el error exacto del panel de MCP servers.
```

---

## Prompt si hay errores al instalar dependencias

```
Tengo errores al correr npm install en este proyecto en macOS. El paquete better-sqlite3 
requiere compilación nativa. Haz lo siguiente:

1. Verifica que Xcode Command Line Tools estén instalados:
   xcode-select --install

2. Si el error menciona Python, verifica la versión:
   python3 --version

3. Reinstala las dependencias del mcpServer forzando recompilación:
   npm --prefix mcpServer install --build-from-source

4. Si el error persiste, muéstrame el mensaje de error completo.
```

---

## Prompt para detener todos los procesos

```
Detén todos los procesos Node.js del proyecto:
   npm run stop

Si eso no funciona o mata procesos de otros proyectos, usa:
   pkill -f "ts-node src/index.ts"
   pkill -f "node server.js"
   pkill -f "vite"
```

---

## Referencia rápida de scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Frontend Vite en localhost:5173 |
| `npm run build` | Build de producción (verifica errores) |
| `npm run lint` | ESLint — falla si hay warnings |
| `npm run start` | MCP server + Backend Express en paralelo |
| `npm run stop` | Mata todos los procesos node |
| `npm --prefix mcpServer run build` | Compila TypeScript del MCP server |
| `npm --prefix mcpServer run dev` | MCP server en modo dev con ts-node |
