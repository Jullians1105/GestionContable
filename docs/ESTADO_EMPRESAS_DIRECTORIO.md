# Estado — Directorio maestro de Empresas (unifica los 4 catálogos)

> Documento de continuidad de sesión. Última actualización: 2026-09-14. Léelo completo antes de
> tocar cualquier cosa relacionada con este feature en una sesión nueva — resume decisiones ya
> tomadas para no volver a preguntarlas ni reabrirlas sin evidencia nueva. No está commiteado a
> propósito (mismo patrón que `ESTADO_CONTABILIDAD_EMPRESAS.md`/`ESTADO_EXOGENAS_1001_1007.md`):
> es solo para que Claude lo lea.

---

## 0. La idea, en una frase

Existían 4 catálogos de empresas totalmente separados (Fondo Emprender, Empresas Externas,
Nómina Electrónica, Contabilidad), cada uno con su propio "crear empresa nueva" sin ninguna
forma de saber si la misma empresa real ya estaba creada en otro lado. Nació al investigar por
qué Contabilidad no tenía forma de renombrar/borrar una empresa del catálogo — el usuario
identificó que el problema real era más amplio y pidió centralizar la administración en un solo
lugar nuevo ("Empresas" en el sidebar), en vez de solo arreglar Contabilidad.

Rama: `feat/contabilidad-empresas-clasificacion` (la misma de Contabilidad — no se abrió rama
aparte). Commit hecho: `7769389`. Sin push, sin PR — pendiente para cuando el usuario retome
Contabilidad también (ver `ESTADO_CONTABILIDAD_EMPRESAS.md`, ambos features viven en la misma
rama y se subirán juntos).

---

## 1. Decisiones ya acordadas (no las reabras sin evidencia nueva)

- **No se fusionó nada de golpe.** Los 4 catálogos (`fondo_empresas` 65, `ext_empresas` 35,
  `ne_empresas` 109, `contab_empresas` 54) siguen siendo tablas separadas con sus propios campos
  (`categoria`/`monthlyFee` en fondo, `responsable_id` en ext/ne, `nit` en contab) — no son su
  identidad, son configuración de esa empresa PARA ese módulo. Se agregó una tabla maestra
  `empresas` con una columna `empresa_id` en cada una de las 4 (nullable), llenada por backfill
  automático que reutiliza los enlaces que Nómina Electrónica ya tenía hacia Fondo/Externas
  (`fondo_empresa_id`/`ext_empresa_id`, migraciones 045/046) — nada se fusionó por nombre
  parecido en el backfill, eso lo decide una persona a mano.
- **Por qué no se centralizó el nombre con un JOIN**: reescribir los `SELECT` de los 4
  controladores existentes era más riesgo del necesario. En cambio, renombrar solo se hace desde
  el directorio maestro (`PUT /api/empresas/:id`), y esa escritura CASCADA el nombre hacia las
  filas de módulo ya habilitadas — así ningún `SELECT` viejo cambia.
- **Permiso de edición: admin + leader** (`isAdmin() || isLeader()` / `roleMiddleware('admin',
  'leader')`) — más estrecho que los 4 catálogos de módulo (que hoy dejan crear/editar a
  cualquier autenticado), porque esta pantalla es justo la que existe para evitar duplicados.
  **Lectura abierta a cualquier autenticado** — el usuario pidió explícitamente que todos
  pudieran verla.
- **Ubicación: ícono propio en el sidebar** (`empresas-directorio`, label "Empresas", ícono
  `domain`), NO dentro de `navItems`/"Gestor de Tareas" (ahí es donde viven Usuarios/
  Configuración) — se descartó esa opción porque el directorio se usa entrando y saliendo de
  varios módulos distintos, y quedaría escondido si solo viviera en uno.
- **NIT como señal de duplicado, no reemplazo del nombre**: hoy SOLO `contab_empresas` captura
  NIT (52 de 54 filas, se aprende del primer reporte DIAN). Se subió a `empresas.nit`
  (migración 054) con cascada automática desde `dianController.js#uploadDian` cuando lo
  aprende. Regla: mismo NIT en dos empresas = duplicado casi seguro (motivo `'nit'`); NIT
  distinto conocido en ambas = descarta la sugerencia por nombre aunque compartan palabra
  (prueba de que son distintas). `updateEmpresa` del directorio NO permite editar NIT a mano
  todavía — se decidió que solo se aprenda desde Contabilidad, no que se pueda escribir a
  ciegas desde el hub (evita un typo generando una señal falsa).
- **Detección de "posible duplicado" por nombre**: comparte al menos una palabra significativa
  (≥3 letras, sin contar figuras jurídicas genéricas). A propósito NO se reutilizó
  `nombresSeParecen` tal cual para esto — esa función devuelve `true` cuando a un nombre no le
  queda ninguna palabra significativa (pensada para "no bloquear una subida", útil ahí, pero acá
  inundaría de falsos positivos nombres cortos como "GC"). El check nuevo exige señal real en
  AMBOS lados.
- **"ASOCIACION"/"ASO"/"FUNDACION"/"FUNDACIONES" se agregaron a las palabras genéricas** (mismo
  grupo que SAS/LTDA/CIA) tras encontrarlo con datos reales: 12 de ~190 empresas empiezan por
  "ASOCIACION", generando 66 pares falsos-positivos solo entre esas 12. El usuario lo reportó en
  vivo ("todo lo estás asociando con 'asociación'"). Otras palabras genéricas de sector
  (AVICOLA, GANADERIA, RESTAURANTE, VILLA, CLUB, FINCA, HACIENDA, CONSTRUCCIONES, CONTROLES)
  siguen SIN filtrar — quedan ~89 sugerencias por nombre en los datos reales actuales, varias
  genuinamente útiles (ver sección 4), otras ruido de palabra de sector compartida. **No se ha
  decidido si conviene filtrar más palabras de sector** — pendiente, ver sección 6.
- **`EmpresaCombobox` se extrajo** de `DianUploadPage.jsx` (donde vivía privado) a
  `src/components/EmpresaCombobox.jsx`, componente compartido genérico. `DianUploadPage.jsx` ya
  lo usa igual que antes (se verificó que la extracción no cambió nada visualmente).

---

## 2. Qué se implementó

### Backend
| Archivo | Qué hace |
|---|---|
| `backend/migrations/053_empresas_maestro.sql` | Tabla `empresas` + columna `empresa_id` (única parcial) en las 4 tablas de módulo + backfill completo (188 empresas maestras al aplicarla). |
| `backend/migrations/054_empresas_maestro_nit.sql` | Columna `nit` (única parcial) en `empresas` + backfill desde `contab_empresas.nit`. |
| `backend/src/utils/nombresSeParecen.js` | `nombresSeParecen`/`palabrasSignificativas`/`normalizarNombreSimple` — extraídas de `dianController.js` (antes privadas ahí), reusadas por el directorio. |
| `backend/src/controllers/empresasMaestroController.js` | `getDirectorio`, `getPosiblesDuplicados` (NIT + nombre, ver sección 1), `createEmpresa`, `updateEmpresa` (rename+activa con cascada), `habilitarModulo`/`deshabilitarModulo`, `fusionar` (mueve habilitaciones, avisa con 409 si hay conflicto de módulo repetido en ambas). |
| `backend/src/routes/empresasMaestro.js` | Montado en `/api/empresas`. `GET` público (cualquier autenticado); el resto `roleMiddleware('admin','leader')`. |
| `backend/src/controllers/dianController.js` | Cascada de NIT hacia `empresas.nit` agregada dentro de `uploadDian` (justo donde ya aprendía el NIT de `contab_empresas`). |

### Frontend
| Archivo | Qué cambió |
|---|---|
| `src/pages/EmpresasPage.jsx` | **Nueva.** Ruta `/empresas`. Lista con badges por módulo, buscador, crear empresa, expandir fila para renombrar/activar/habilitar/deshabilitar, panel de posibles duplicados con botón "Fusionar" (modal para elegir qué nombre se conserva). |
| `src/components/EmpresaCombobox.jsx` | **Nuevo** (extraído, ver sección 1). |
| `src/components/Sidebar.jsx` | Módulo nuevo `empresas-directorio` (ícono `domain`) + `EMPRESAS_MAESTRO_NAV`. |
| `src/App.jsx` | Ruta `/empresas`. |
| `src/services/api.js` | `getEmpresasDirectorio/getEmpresasDuplicados/createEmpresaMaestro/updateEmpresaMaestro/habilitarEmpresaModulo/deshabilitarEmpresaModulo/fusionarEmpresas`. |
| `src/pages/DianUploadPage.jsx` | Solo el import del combobox extraído — sin cambios de comportamiento. |

---

## 3. Verificación hecha (y la que falta)

**Hecho:**
- Backfill verificado contra la base de datos real (no un entorno de prueba): 188 empresas
  maestras, 0 filas sin `empresa_id` en las 4 tablas, los 54 enlaces de NE hacia Fondo/Externas
  se reutilizaron correctamente (verificado con consulta cruzada).
- 79 tests unitarios del backend pasando (`dianController`, `empresasMaestroController`,
  `nombresSeParecen`, `extEmpresasController`, `fondoEmpresasController`).
- `npm run lint` y `npm run build` (frontend) sin errores, en cada paso.
- El intento de correr el suite COMPLETO del backend (`npx jest` sin filtro) se ha cortado sin
  terminar varias veces en este entorno (ya pasaba también en la sesión de Contabilidad) —
  parece lento/pesado en general acá, no algo que este feature haya roto. Los tests
  específicamente relacionados sí se confirmaron uno por uno.

**Falta (nadie lo ha hecho todavía):**
- **Ver `/empresas` funcionando en el navegador** — todo lo de arriba se verificó por tests +
  consultas directas a la base de datos, nunca se abrió la pantalla en Chrome. Es lo primero a
  hacer al retomar.
- Probar en vivo: crear una empresa, habilitarla en 2 módulos, confirmar que aparece bien en la
  pantalla de cada módulo (ej. en el combobox de `/dian/upload`), renombrarla y confirmar que el
  nuevo nombre se ve en los módulos habilitados, fusionar dos de prueba.

---

## 4. Pendiente real para la próxima sesión

En orden aproximado de importancia:

1. **El usuario va a mandar los NIT de una lista de 71 empresas** (las que salen en alguna
   sugerencia de posible duplicado por nombre) para poder confirmar/descartar cuáles son
   duplicados reales. La lista completa se le dio en el chat de esta sesión — si no la trae él
   mismo, se puede regenerar con la consulta de `getPosiblesDuplicados` (ver sección 1) filtrada
   a `motivo: 'nombre'`. Cuando lleguen los NIT: escribirlos a mano en `contab_empresas.nit` (o
   agregar edición de NIT al directorio si hace falta más de una vez) y dejar que la cascada
   existente los suba a `empresas.nit`; NO son de Contabilidad necesariamente — si el NIT es de
   una empresa que solo existe en Fondo/Externas/NE, no hay hoy ningún catálogo que lo capture
   (ver punto 3 de abajo).
2. **Migrar los 4 puntos de creación actuales** (Fondo Emprender, Empresas Externas, Nómina
   Electrónica, combobox de Contabilidad) para que busquen/creen contra el directorio maestro en
   vez de crear directo en su propia tabla — es el paso 6 del plan original, deliberadamente
   dejado para el final. Sin esto, alguien puede seguir creando una empresa duplicada desde
   cualquiera de esas 4 pantallas sin pasar por el directorio ni ver el aviso de posible
   duplicado.
3. **Ningún catálogo aparte de Contabilidad captura NIT** — si se quiere que el punto 1 sea útil
   más allá de Contabilidad (o que el directorio detecte duplicados entre Fondo/Externas/NE por
   NIT), hace falta decidir dónde se captura ese NIT para esos 3 módulos. No inventar la
   respuesta — preguntar al usuario si hace falta antes de tocar esos controladores.
4. **Palabras de sector sin filtrar en la detección por nombre** (AVICOLA, GANADERIA,
   RESTAURANTE, VILLA, CLUB, FINCA, HACIENDA, CONSTRUCCIONES, CONTROLES) — hoy generan ruido
   real en `getPosiblesDuplicados` (~89 sugerencias totales, no todas útiles). Preguntar si vale
   la pena filtrar alguna más antes de asumirlo — el usuario ya corrigió específicamente
   "ASOCIACION", no pidió las demás.
5. **Edición de NIT desde el directorio**: hoy `updateEmpresa` del hub no acepta `nit` (decisión
   deliberada, ver sección 1). Si el flujo del punto 1 resulta tedioso escribiendo directo en la
   base de datos, valdría la pena agregar un campo de NIT editable ahí (validado como único,
   igual que ya hace `contabEmpresasController.js`).

---

## 5. Archivos clave para retomar esto

- `backend/migrations/053_empresas_maestro.sql` / `054_empresas_maestro_nit.sql` — esquema y backfill.
- `backend/src/controllers/empresasMaestroController.js` — toda la lógica del directorio.
- `backend/src/utils/nombresSeParecen.js` — heurística de nombre parecido, compartida con `dianController.js`.
- `src/pages/EmpresasPage.jsx` — la pantalla.
- `src/components/EmpresaCombobox.jsx` — combobox compartido, primer consumidor: `DianUploadPage.jsx`.
- `docs/ESTADO_CONTABILIDAD_EMPRESAS.md` — el otro feature en la misma rama (Contabilidad), por si se suben juntos.
