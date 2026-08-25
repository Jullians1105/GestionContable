# Prompt para Claude Code — Módulo Exógenas dentro de GestionTareasOficina

## Contexto

Trabajo en Gestcon, firma contable colombiana. El proyecto es **GestionTareasOficina**
(monorepo: `src/` React 18 + Vite 5, `backend/` Node/Express, PostgreSQL, Docker Compose,
desplegado en `gestcon.work` vía Cloudflare Tunnel desde un servidor Ubuntu en
`192.168.1.12`). Ya tiene 4 módulos en producción: Gestor de Tareas, Fondo Emprender,
Empresas Externas y DIAN (Contabilidad DIAN).

Objetivo: llevar al mismo repo/app una herramienta que hoy es un script standalone en
Python + Tkinter ("Exógenas manuales" — genera reportes tributarios formato 1005 para la
DIAN a partir de una plantilla Excel de SIIGO), que actualmente se distribuye por zip a
mano y obliga a reempaquetar en cada ajuste. Al integrarla en la app web ya no hay que
distribuir nada — todos entran por el navegador y los cambios se despliegan una sola vez.

**Alcance de formatos a automatizar (definido, no abierto):**
- **1005** — IVA descontable. Ya existe la lógica de negocio portada en Python (script
  actual), es el primero en migrarse a la app.
- **1001** — Pagos o abonos en cuenta y retenciones practicadas (gastos/costos).
- **1006** — IVA generado.
- **1007** — Ingresos.

Estos cuatro se implementan uno a la vez, en ese orden, cada uno como una implementación
nueva de la interfaz de strategy pattern descrita más abajo — nunca como una reescritura
de la del formato anterior. No asumas otros formatos de exógena (1003, 1008, 1009, 1010,
1012, 2276, etc.) como parte del alcance salvo que yo lo indique explícitamente después.

**Antes de escribir código, lee este documento completo y confírmame que entendiste el
alcance antes de tocar nada.**

---

## Decisiones ya tomadas (no las reabras sin evidencia nueva)

1. **El motor de procesamiento de Excel se hace en JS, no en Python**, usando **ExcelJS**
   (no `xlsx`/SheetJS — esa librería no preserva bien estilos en un round-trip de lectura+
   escritura sobre una plantilla ajena). ExcelJS ya es la librería que usa
   `backend/src/controllers/dianController.js` (o el archivo equivalente) para generar el
   Excel final del módulo DIAN existente — úsalo como referencia de patrón en el repo,
   aunque ese caso genera hojas desde cero y el nuestro necesita **editar una plantilla
   preexistente preservando todo lo demás intacto** (comportamiento distinto, más exigente).

2. **Se integra dentro de este mismo repo, como parte del módulo `DIAN` del sidebar** — no
   como microservicio Python aparte, no como subdominio nuevo (`exogenas.gestcon.work`
   fue descartado), no como app separada. Motivo: mismo dominio funcional que Contabilidad
   DIAN (subir Excel → aplicar regla tributaria → devolver Excel), reduce superficie de
   mantenimiento, reusa auth/infraestructura ya existente.

3. **No reutilizar la tabla `calculo_borradores`** del módulo DIAN con un campo `tipo` para
   distinguir. Se crea una tabla nueva para Exógenas, mismo patrón (JSONB + archivo
   original en BYTEA + expiración), pero separada — evita acoplar dos dominios que van a
   evolucionar distinto.

4. **Diseño del motor de exógenas como strategy pattern por formato desde el día uno**,
   aunque en la Fase 2 solo se porte el formato 1005. Interfaz común aproximada:
   `leerYAgrupar(archivo, opciones) -> registros[]` y `llenarPlantilla(plantilla, registros)
   -> archivo`. Cada formato (1005 primero; 1001, 1006 y 1007 después, en ese orden —
   ver alcance completo arriba) implementa esa interfaz sin tocar las demás. Revisa el
   detalle de la lógica actual en Python en el archivo que te voy a compartir aparte
   (`arqExogena.md`) para portar la lógica de negocio real del 1005, no reinventarla — en
   particular las funciones equivalentes a `copiar_estilo_fila` y
   `encontrar_fila_y_columnas_1005`, que editan solo 5 columnas y preservan el resto de la
   plantilla SIIGO intacto.

5. **Sidebar**: el sidebar tiene una estructura de 2 columnas (barra de íconos por módulo +
   panel de submenú del módulo activo). El módulo `dian` ya existe con un solo navItem
   ("Subir reporte" → `/dian/upload`). Cambios:
   - Label del módulo pasa de "Contabilidad DIAN" a **"DIAN"**.
   - navItems del módulo `dian` pasan de 1 a 2:
     - "Contabilidad DIAN" → `/dian/upload` (ruta intacta, sin cambios funcionales)
     - "Exógenas" → `/exogenas/upload` (nueva)
   - Sin gating de permisos nuevo: DIAN no tiene permisos granulares hoy (a diferencia de
     Gestor de Tareas, Fondo Emprender y Empresas Externas, que sí filtran edición por
     permiso) y Exógenas debe quedar igual de visible para todos, sin restricción.
   - Nombre "DIAN" confirmado — es la entidad pública que emite el formato, uso
     descriptivo en herramienta interna, sin riesgo de marca.

6. **Nombre descartado**: agrupar bajo "Procesos" — colisiona con el término ya usado en
   `fondo_procesos` / `ext_procesos` (procesos de checklist mensual), que es un concepto
   distinto y ya establecido en la app. No usar esa palabra para esto.

---

## Plan de trabajo (en este orden, con aprobación explícita entre fases)

### Fase 0 — Spike de validación técnica (desechable, no se mergea)

Antes de portar cualquier lógica de negocio, correr una prueba corta con **ExcelJS** contra
la plantilla real de SIIGO (te la voy a pasar) para confirmar:
- Que abrir y volver a guardar el archivo sin tocar nada preserva todas las hojas,
  fórmulas y estilos.
- Que copiar el estilo de una fila a otra (equivalente a `copiar_estilo_fila` del script
  Python) produce una fila visualmente idéntica a las de al lado.

Si el spike falla en algo, repórtalo y paramos a re-evaluar antes de seguir — no asumas
que "casi funciona" es suficiente para un reporte tributario.

### Fase 1 — Reestructuración del sidebar

Solo frontend. Investiga primero `Sidebar.jsx` y el archivo/config de `navItems` de los
módulos existentes (mira cómo está armado Fondo Emprender, que ya tiene 3 subitems, como
referencia del patrón). Reporta qué archivos tocarías y cómo, antes de escribir código.
Luego implementa el cambio del punto 5 de arriba. La ruta `/exogenas/upload` puede
apuntar a una página placeholder ("Próximamente") mientras se construye la Fase 2.

Rama: `feat/sidebar-modulo-dian-exogenas` desde `main` actualizado.

### Fase 2 — Backend + frontend del módulo Exógenas (formato 1005)

Se detalla y se prompteará aparte una vez cerradas las Fases 0 y 1, con el resultado del
spike ya confirmado. Solo cubre el formato 1005 — 1001, 1006 y 1007 son fases futuras
independientes, cada una con su propio prompt cuando llegue el momento, reusando la
interfaz de strategy pattern ya definida en el punto 4 de arriba. Alcance esperado para
esta fase (sujeto a ajuste post-spike):
- Tabla nueva en Postgres para borradores de Exógenas (migración numerada — **coordinar
  con Julians antes de crear el archivo**, correr
  `git ls-tree origin/main --name-only -- backend/migrations/` para evitar colisión, ya
  existe una colisión histórica conocida en 018 y 013 que no hay que repetir sin querer).
- Endpoint(s) backend para subir el reporte + la plantilla, procesar con la lógica portada
  del script Python, devolver el Excel generado.
- Página(s) frontend en `/exogenas/*` siguiendo el patrón visual ya establecido en la app
  (StatsCard, tabs segmentados, tablas con scroll horizontal sticky, colores del sistema
  `#004ac6` azul / verde `#16a34a` / rojo `#ef4444` / ámbar `#d97706`, transiciones solo de
  opacity/transform/background-color/color ~200ms, sin Framer Motion).

Rama: `feat/modulo-exogenas-1005` desde `main` actualizado (después de mergear Fase 1).

---

## Reglas de trabajo (aplican a todo lo anterior)

- **GitHub Flow estricto**: ninguna rama se pushea directo a `main`. Toda tarea nace en
  `feat/xxx` o `fix/xxx`, PR antes de mergear, revisión de Julians.
- **Patrón investigar → reportar → implementar → verificar → nunca commitear sin
  aprobación explícita mía.** No asumas mi visto bueno por defecto.
- No usar `git restore .` ni comandos destructivos sin confirmar exactamente qué archivos
  tocan.
- ESLint (`--max-warnings 0`) pasando es necesario pero no suficiente — se requiere
  también prueba manual en navegador antes de dar por cerrada una fase.
- Cuidado visual explícito en cualquier UI nueva: consistencia con el resto de la app,
  espaciados, jerarquía clara — no lo dejes para después.

---

## Qué NO se debe hacer (para que no se reconsidere sin evidencia nueva)

- No crear un repo/servicio separado para esto.
- No usar `xlsx`/SheetJS para escribir el Excel final.
- No reutilizar `calculo_borradores` de DIAN para los borradores de Exógenas.
- No nombrar el grupo del sidebar "Procesos".
- No mezclar la Fase 2 con cambios al módulo DIAN existente — sus rutas y lógica quedan
  intactas.
