# Estado — Contabilidad por empresa (clasificación IVA/Concepto + base de datos mensual)

> Documento de continuidad de sesión. Última actualización: 2026-09-12. Léelo completo antes de
> tocar cualquier cosa relacionada con este feature en una sesión nueva — resume decisiones ya
> tomadas para no volver a preguntarlas ni reabrirlas sin evidencia nueva. No está commiteado a
> propósito (mismo patrón que `ESTADO_EXOGENAS_1001_1007.md`): es solo para que Claude lo lea.

---

## 0. La idea, en una frase

Hoy Contabilidad es una corrida desechable (se sube un reporte DIAN, se clasifica retención, se
exporta un Excel, y el borrador se borra). La jefa de Diego propuso — y ya se aprobó — que esa
clasificación quede **guardada permanentemente por empresa y por mes**, agregando dos
clasificaciones nuevas (IVA y Concepto) además de la retención que ya existía, para que después se
pueda consultar mensual/cuatrimestral/anualmente y usarse como insumo directo de la exógena (donde
hoy el Concepto de los formatos 1001/1007 queda en blanco por falta de esta misma información).

Rama de trabajo: `feat/contabilidad-empresas-clasificacion`, creada desde `main`. El primer commit
(`a18539b`) ya está hecho — no pusheado, no mergeado. El 2026-09-08/09 se trabajó aparte en Nómina
Electrónica (rama `feat/seguimiento-nomina-ajustes`, ya mergeada a `main` en los PRs #56 y #57; sin
doc de continuidad propio, fue autocontenida). El 2026-09-10 esta rama se actualizó con
`git rebase origin/main` (sin conflictos, toca archivos distintos) para traer eso, y después se
siguió trabajando acá — más cambios hechos, todavía sin commitear, ver sección 6.

---

## 1. Qué pidió el usuario, en orden cronológico

1. Crear una base de datos de 52 empresas (`docs/LISTADO EMPRESAS.xlsx`) para el módulo
   Contabilidad, con dos clasificaciones nuevas por factura (además de retención): **IVA**
   (Mayor valor / Descontable / Activo fijo) y **Concepto** (Servicios / Compras / Activo fijo /
   Honorarios / Arriendos / Adecuaciones / Compras diversos / Diversos / No deducible), aplicables
   solo a compras. De ventas, solo el IVA generado.
2. Guardar por factura: proveedor, NIT, dirección, subtotal, total, IVA, impuesto al consumo.
3. Poder consultar mensual, cuatrimestral y anualmente, por empresa, y exportar esos consolidados
   — insumo directo para la exógena.
4. Completar los NITs de las 52 empresas desde `docs/VENCIMIENTOS 2026.xlsx` (ya usado y borrado,
   ver sección 5).
5. Corregir que en ventas también se guardara el INC, no solo el IVA (ya estaba guardado en BD,
   faltaba mostrarlo en el Excel consolidado).
6. Rediseñar `DianUploadPage.jsx` (selector de empresa feo, título "Reporte de Retenciones" ya sin
   sentido) y `DianClasificacionPage.jsx` (nombre de empresa muy grande junto al título,
   clasificación rápida se veía separada, espacio lateral desaprovechado).

---

## 2. Decisiones ya acordadas (no las reabras sin evidencia nueva)

- **Catálogo de 52 empresas** es un conjunto propio (`contab_empresas`), sin solape con
  `fondo_empresas` (30) ni `ext_empresas` (35) — verificado, cero coincidencias.
- **Selector de empresa con escape**: "Sin empresa / no guardar" (ahora rediseñado como toggle
  "Guardar para una empresa" / "Solo calcular", ver sección 4) — sin empresa, todo se comporta
  exactamente igual que antes de este feature.
- **Las tres clasificaciones (retención, IVA, concepto) son obligatorias para exportar SOLO si el
  borrador tiene empresa asociada.** Sin empresa, solo se exige retención (como siempre).
- **Verificación de NIT en dos capas** (ambas ya implementadas y con bugs reales corregidos, ver
  sección 3): comparación directa si la empresa ya tiene NIT guardado; comparación por nombre
  (razón social del reporte vs. nombre del catálogo) si es la primera vinculación, con
  confirmación explícita del usuario si no se parecen.
- **Dirección del proveedor** se resuelve contra `terceros` al leer/exportar (nunca se congela en
  la fila guardada) — reutiliza `enriquecerConTerceros` de `formato1001.js`.
- **Re-subida del mismo mes**: identificada por CUFE; si ya hay datos, se avisa con el detalle
  exacto por mes y se elige `actualizar` (upsert) o `reemplazar` (borra y recarga ese mes).
- **Solo se guardan documentos con relevancia contable real** (`TIPOS_CONTABILIZADOS`) — quedan
  fuera "Nomina Individual" y "Application response" (bug real encontrado y corregido, sección 3).
- **Sin permisos nuevos**: ver/clasificar/guardar abierto a cualquier autenticado. Crear/editar
  empresas del catálogo también abierto (hace falta poder agregar una en pleno flujo); solo
  **borrar** empresas queda para admin.
- **Períodos cuatrimestrales**: Ene-Abr / May-Ago / Sep-Dic (fijo, sin confirmar si hace falta
  bimestral también — ver sección 7).

---

## 3. Bugs reales encontrados en pruebas manuales (ya corregidos)

Los tres se encontraron probando con reportes/empresas reales, no en tests sintéticos — quedan acá
para que no se reintroduzcan sin querer:

1. **PATCH de un solo campo borraba los otros dos.** `patchBorrador` pisaba
   `clasificacionRetencion`/`tasaRetencion`/`clasificacionIva`/`concepto` completos en cada
   llamada. Corregido con merge seguro (patrón "provided", como `responsableId` en
   `extEmpresasController.js`) — cada PATCH solo toca el campo que trae en el body.
2. **Primera vinculación de empresa sin ningún control.** El catálogo se sembró solo con nombres
   (sin NIT). La primera vez que se sube un reporte para una empresa sin NIT, no había con qué
   comparar — se aceptaba cualquier NIT sin preguntar. Pasó de verdad: un reporte de otra empresa
   quedó vinculado a "CATACAKES" sin aviso. Corregido: se compara el nombre real del reporte
   (razón social del receptor/emisor) contra el nombre de la empresa elegida; si no comparten
   ninguna palabra significativa, bloquea con `409 { requiereConfirmacion: true, nombreDetectado }`
   y pide confirmación explícita antes de guardar el NIT.
3. **Se guardaban documentos sin relevancia contable.** Un reporte real con 8 facturas (7 ventas +
   1 compra) dejó 14 documentos guardados — los 6 de más eran "Nomina Individual" y
   "Application response" (ya excluidos de todo cálculo en el resto del sistema, ver
   `MOTIVOS_DOCUMENTOS_EXCLUIDOS`). Corregido: `guardarDocumentosPermanentes` ahora filtra por
   `TIPOS_CONTABILIZADOS` antes de guardar. Los 6 registros contaminados de CATACAKES ya se
   limpiaron a mano.
4. **Subir el archivo sin elegir empresa, con "Guardar para una empresa" activo, no avisaba nada.**
   `DianUploadPage.jsx` no validaba `empresaId` antes de subir — si estaba vacío, `subirArchivo`
   simplemente no lo mandaba en el FormData, y el backend lo procesaba como "sin empresa" (redirige
   directo a Clasificación de retención, sin guardar nada). Encontrado por el usuario probando en
   vivo el 2026-09-09/10. Corregido: bloquea antes de subir si `modo === 'empresa' && !empresaId`,
   con el aviso "Elige primero una empresa, o cambia a 'Solo calcular'...".

---

## 4. Qué se implementó (los 4 pasos del plan + 2 rediseños)

### Backend

| Archivo | Qué hace |
|---|---|
| `backend/migrations/051_contabilidad_empresas.sql` | Catálogo `contab_empresas` (52 filas, solo nombre), `contab_periodos` (qué empresa/mes ya está guardado), `contab_documentos` (una fila por factura, llave `empresa_id + cufe`), y `calculo_borradores.empresa_id` (nullable). |
| `backend/migrations/052_contabilidad_empresas_nit.sql` | Completa el NIT de las 52 empresas (cruzado desde `VENCIMIENTOS 2026.xlsx`, ya borrado). `AND nit IS NULL` en cada UPDATE — no pisa un NIT real aprendido por uso. |
| `backend/src/controllers/contabEmpresasController.js` + `routes/contabEmpresas.js` | CRUD del catálogo, mismo patrón que `extEmpresasController.js`. |
| `backend/src/controllers/dianController.js` | `derivarNitPropio` (deriva NIT + nombre real del reporte, por grupo), `nombresSeParecen` (chequeo de nombre en primera vinculación), lógica de empresa en `uploadDian`, tres clasificaciones en `patchBorrador`/`aplicarClasificacionRapida`, `guardarDocumentosPermanentes` (guardado + detección de conflicto, transaccional), hoja `CONCEPTOS` y columnas nuevas en `DETALLE_COMPRAS`. |
| `backend/src/controllers/contabConsolidadoController.js` + `routes/contabConsolidado.js` | `GET /periodos`, `GET /consolidado` (mensual/cuatrimestral/anual según query), `GET /consolidado/exportar` (Excel: RESUMEN, CONCEPTOS, CLASIFICACION_IVA, DETALLE). Enriquecido con `terceros`. |

### Frontend

| Archivo | Qué cambió |
|---|---|
| `src/pages/DianUploadPage.jsx` | **Rediseñado.** Toggle "Guardar para una empresa" / "Solo calcular" (reemplaza el `<select>` con "Sin empresa" como opción enterrada). Combobox de empresa con búsqueda en vivo (`EmpresaCombobox`, componente local) — escribe y filtra, empresa elegida se ve como pastilla clickeable, agregar empresa nueva integrado como última fila de la lista. Título nuevo: "Cargar reporte DIAN". Diálogo de confirmación de nombre no coincidente. |
| `src/pages/DianClasificacionPage.jsx` | Tres clasificaciones por fila (retención + IVA + concepto) con autoguardado independiente. **Rediseñado**: "Clasificación rápida" unificada en una sola tarjeta con 3 columnas lado a lado (antes 2 tarjetas separadas con filas apiladas). Nombre de empresa movido del título a una insignia aparte. Contenedor ensanchado (`max-w-5xl` → `max-w-7xl`). Título adaptativo ("Clasificación de compras" con empresa / "Clasificación de retención" sin ella). |
| `src/pages/DianExportacionPage.jsx` | Diálogo de conflicto Actualizar/Reemplazar (detalle por mes: existentes vs. en el reporte). |
| `src/pages/ContabilidadConsolidadoPage.jsx` | **Nueva.** `/dian/consolidado`. Selector de empresa, tabs Mensual/Cuatrimestral/Anual con navegador de período, indicador de qué meses tienen datos, StatsCards de totales (incluye INC), tablas agrupadas, detalle con scroll, exportar. |
| `src/components/Sidebar.jsx` | Ítem nuevo "Consolidado" en `DIAN_NAV`. |
| `src/App.jsx` | Ruta `/dian/consolidado`. |
| `src/services/api.js` | Métodos nuevos: `getContabEmpresas/createContabEmpresa/...`, `getContabPeriodos`, `getContabConsolidado`, `exportarContabConsolidado`; `uploadDian`/`exportarDian`/`patchDianClasificacionRapida` extendidos para el nuevo contrato. |

---

## 5. Verificación hecha (y la que falta)

**Hecho:**
- 432 tests unitarios del backend pasando en cada paso.
- `npm run lint` y `npm run build` (frontend) sin errores.
- Backend probado end-to-end por API real (curl) contra reportes DIAN reales y datos reales del
  usuario (CATACAKES): upload con empresa, verificación de NIT (los dos casos: NIT ya registrado y
  primera vinculación), las tres clasificaciones, bloqueo progresivo de exportación, guardado
  permanente, conflicto de re-subida (`actualizar`/`reemplazar`), y los tres endpoints del
  consolidado + su Excel.
- El usuario probó en su propia máquina el flujo de subida completo con datos reales — encontró
  2 de los 3 bugs de la sección 3 (el del NIT y el de "14 documentos guardados").
- Los rediseños de `DianUploadPage.jsx` y `DianClasificacionPage.jsx` fueron aprobados por el
  usuario ("cambió mucho, me gusta" / "me gusta") después de iterar sobre feedback puntual.

**Hecho el 2026-09-09/10 (sesión de seguimiento, sobre datos reales del usuario):**
- El usuario probó `DianUploadPage.jsx` en vivo con reportes reales — encontró el bug 4 de la
  sección 3 (empresa no exigida antes de subir), ya corregido.
- Se agregó la columna **CUFE** a la hoja `DETALLE` del Excel del consolidado (mensual/cuatrimestral/
  anual comparten la misma función `buildDetalleSheet`) — primera columna, ancho angosto (20, antes
  se probó con 46 y se pidió más angosto). Cierra parte del punto 6 de más abajo.
- Se agregó transparencia activa para **tipos de documento no reconocidos**: antes solo vivían en la
  hoja `METADATOS` del Excel exportado (fácil de no ver nunca). Ahora `uploadDian` y `getBorrador`
  devuelven `documentosNoContabilizados` (ya se calculaba, solo faltaba exponerlo), y
  `DianClasificacionPage.jsx` muestra un banner ámbar cuando hay alguno con `esConocido: false` —
  no bloquea nada, es solo aviso. No probado con un reporte real que traiga un tipo desconocido
  (no hay uno a mano); sí pasan los 46 tests de `dianController.test.js`.
- Se explicó (no se tocó código, quedó como pregunta abierta) cómo se determina a qué mes pertenece
  cada documento: por `fechaEmision` (`YYYY-MM`, ver `agruparFilasPorPeriodo`), no por cuándo se
  sube el reporte. Dos huecos silenciosos identificados, sin corregir todavía — ver punto 7 de más
  abajo.

**Hecho el 2026-09-10 (sesión de la tarde, sin commitear todavía):**
- El usuario confirmó en vivo que **`ContabilidadConsolidadoPage.jsx` funciona** ("ya la probé y
  funciona") — cierra el punto 3 de la sección 7 en lo que era la parte de "verlo funcionar". Dijo
  que después le quiere hacer "algunos ajustes", sin especificar cuáles todavía — pregunta abierta,
  no inventar qué ajustes son, esperar a que los traiga.
- El usuario confirmó en vivo que **el diálogo de conflicto Actualizar/Reemplazar de
  `DianExportacionPage.jsx` funciona** (le dio Exportar sobre un Excel ya subido antes y le salió la
  alerta) — cierra la otra mitad del punto 3.
- A partir de esa prueba, el usuario notó que el aviso de conflicto **solo sale al exportar**, después
  de haber clasificado todo el reporte — si el Excel es grande, se pierde ese tiempo antes de
  enterarse de que el mes ya existía. Propuso adelantar el aviso a cuando se sube el archivo. Se
  verificó que el aviso NO depende de que las clasificaciones sean distintas — es puramente
  empresa+año+mes con documentos ya guardados, sin mirar contenido.
- **Implementado**: se extrajo la lógica de detección a una función compartida
  `detectarPeriodosExistentes(empresaId, filas)` en `dianController.js` (antes vivía inline dentro
  de `guardarDocumentosPermanentes`, que la sigue usando igual). `getBorrador` ahora también la
  llama (solo si el borrador tiene `empresa_id`) y devuelve `periodosExistentes` en la respuesta.
  `DianClasificacionPage.jsx` la lee al cargar y muestra un banner ámbar (mismo patrón visual que
  el de "tipos de documento no reconocidos") listando los meses en conflicto con conteo
  existente/en-el-reporte — **es solo informativo, no bloquea nada**; la elección real de
  actualizar/reemplazar sigue pasando al exportar, en `DianExportacionPage.jsx` (no se duplicó esa
  lógica, solo se adelantó el aviso).
- Verificado (2026-09-10): los 46 tests de `dianController.test.js` pasaban, `npm run lint` y
  `npm run build` (frontend) sin errores. El suite completo del backend (432 tests) se había
  lanzado en background al cierre de esa sesión pero **quedó sin confirmar** — el proceso se cortó
  al cerrarse la sesión sin dejar output recuperable (nota de la sesión del 2026-09-11).

**Hecho el 2026-09-12 (misma rama, sin push):**
- El usuario probó en vivo el banner de "meses ya guardados" (lo del 2026-09-10 tarde, arriba) y
  **confirmó que funciona bien**. No reabrir sin evidencia nueva.
- El usuario preguntó si un Excel con varias facturas de distintos meses se clasifica bien por mes
  — se confirmó que sí (agrupa por `fechaEmision`, cada mes se guarda y se cuenta aparte;
  `periodosExistentes`/el diálogo de conflicto avisan por mes, pero un solo `modo`
  actualizar/reemplazar aplica a todo el reporte de una exportación).
- A partir de ahí, el usuario pidió explícitamente agregar el aviso que en la sesión anterior se
  había decidido NO agregar todavía (punto 7.1, "sin evidencia nueva"): **avisar cuando una fila
  contabilizable no trae fecha de emisión utilizable** (ausente, o en un formato que
  `parseDate` no pudo convertir a ISO). El usuario prefirió adelantarse en vez de esperar un caso
  real — se implementó.
- **Implementado**: `calcularFilasSinFechaValida(filas)` en `dianController.js` (filtra
  `TIPOS_CONTABILIZADOS` sin `fechaEmision` en formato `YYYY-MM-DD`). Conectada en dos puntos:
  (a) dentro de `calcularAnomalias`, como una anomalía más (`tipo: 'Fecha de emisión ausente o
  irreconocible'`) — sigue apareciendo también en la hoja METADATOS del Excel exportado; (b)
  expuesta en vivo como `filasSinFecha` en las respuestas de `uploadDian` y `getBorrador`.
  `DianClasificacionPage.jsx` la lee y muestra un banner ámbar (mismo patrón que los otros dos)
  listando tipo de documento, prefijo/folio y el valor crudo de la fecha — **solo informativo, no
  bloquea nada**. 3 tests nuevos en `dianController.test.js` (ahora 49 en total) + se corrigió un
  test existente (`'un reporte limpio no produce anomalías'`) que no traía `fechaEmision` en su
  fixture y por eso empezó a disparar la anomalía nueva.
- Verificado: 49 tests de `dianController.test.js` pasan, `npm run lint` y `npm run build`
  (frontend) sin errores. El suite completo del backend se relanzó en background — confirmar que
  terminó bien antes de commitear (ver nota al pie de esta sección).
- **No probado en el navegador todavía**: nadie vio el banner nuevo de "fecha ausente" en pantalla
  (no hay a mano un reporte real con una fila así — habría que forzarlo editando un Excel de
  prueba, quitándole la fecha a una fila). Es lo primero a hacer al retomar.

**Falta (nadie lo ha hecho todavía):**
- Probar en el navegador el banner nuevo de "fecha de emisión ausente o irreconocible" en
  `DianClasificacionPage.jsx` (cambio de hoy, 2026-09-12) — no se ha visto en vivo todavía.
  **Primera cosa a hacer al retomar.** Requiere un Excel de prueba con una fila sin fecha (o con
  fecha en formato raro), armado a mano — no hay uno real disponible.
- Probar el catálogo de empresas desde la UI en un caso donde haga falta agregar una empresa nueva
  en pleno flujo de subida (el combobox lo soporta, pero no se ha visto en vivo).

---

## 6. Estado de git

Dos commits en la rama:
- `a18539b` — todo el trabajo original de este feature (catálogo, clasificación, consolidado).
- `d6b8b54` — lo del 2026-09-09/10: bug 4 de la sección 3 (empresa exigida antes de subir),
  columna CUFE, banner de tipos de documento no reconocidos.

Entre los dos, el 2026-09-10 se hizo `git rebase origin/main` (limpio, sin conflictos) para traer
lo de Nómina Electrónica ya mergeado en `main`.

**Tercer commit hecho el 2026-09-12**: `54ccb0b` — "avisa temprano si una fila no tiene fecha de
emisión válida". El usuario pidió commitear antes de salir, sin esperar a probar en vivo el banner
de "fecha ausente" (única vez que se commitea algo sin haberlo visto en pantalla — excepción
explícita, no el criterio de siempre). Ojo: por cómo quedó el working tree, **este commit incluye
DOS cambios**, no solo el que dice el título:
- El banner de "meses ya guardados" (`detectarPeriodosExistentes`, de la sesión del 2026-09-10
  tarde) — **este sí se probó en vivo y funciona**, solo que nunca se había commiteado antes.
- El banner de "fecha de emisión ausente o irreconocible" (`calcularFilasSinFechaValida`, de hoy)
  — **este NO se ha visto en el navegador todavía** (sección 7, punto 0).

Si al retomar el banner de fecha ausente resulta tener un problema, el fix va en un commit nuevo
encima de `54ccb0b` — no hace falta deshacer nada, los dos cambios conviven bien en el mismo commit
aunque uno esté confirmado y el otro no.

Ningún push, ningún PR todavía. El usuario dijo explícitamente (2026-09-12) que la próxima semana
retomamos y **ahí sí se hace push y se abre PR** — ya no es "decide después", es el plan para la
próxima sesión (después de probar el banner pendiente, punto 0 de la sección 7).

`docs/LISTADO EMPRESAS.xlsx` y `docs/VENCIMIENTOS 2026.xlsx`: el primero sigue en `docs/` (fuente
de las 52 empresas, por si hace falta releerlo); el segundo **ya se borró** después de usarlo para
completar los NITs (a pedido explícito del usuario, mismo patrón que otros Excel de una sola vez).

Este archivo (`ESTADO_CONTABILIDAD_EMPRESAS.md`) sigue el mismo patrón que
`ESTADO_EXOGENAS_1001_1007.md`: **no se commitea**, es solo para que Claude lo lea en la próxima
sesión.

---

## 7. Pendientes reales para la próxima sesión

En orden aproximado de probabilidad de que el usuario los traiga primero:

0. **Probar en el navegador el banner de "fecha de emisión ausente o irreconocible"** (sección
   4/5, ya commiteado en `54ccb0b` pero sin verlo en pantalla — el usuario pidió commitear antes
   de salir sin esperar la prueba, ver sección 6): armar a mano un Excel de prueba con una fila
   contabilizable sin fecha de emisión (o con formato raro) y confirmar que el aviso ámbar aparece
   en `DianClasificacionPage.jsx`, con tipo/folio/fecha-cruda correctos, sin bloquear el flujo. Si
   hay un problema, el fix va en un commit nuevo (no se deshace `54ccb0b`). Es lo primero a hacer
   al retomar — **antes de hacer push y abrir PR** (el usuario ya autorizó ambos para la próxima
   sesión, ver sección 6, pero después de esta prueba).
1. ~~Pregunta abierta: agregar anomalía/aviso visible para fila sin `fechaEmision` o con fecha en
   formato raro.~~ **Reabierto y resuelto 2026-09-12**: el usuario pidió agregarlo después de todo
   (sin esperar un caso real) — implementado, ver punto 0 de arriba para la prueba pendiente.
2. ~~Probar en vivo lo del commit `d6b8b54`~~ **Hecho — el usuario lo probó el 2026-09-10 y
   confirmó que los 3 cambios funcionan bien** (columna CUFE, banner de tipos no reconocidos, fix
   del bug 4). No reabrir sin evidencia nueva.
3. ~~Probar en el navegador el consolidado y el diálogo de conflicto de exportación~~ **Hecho —
   confirmado 2026-09-10 tarde, funcionan.** El usuario mencionó que le quiere hacer "algunos
   ajustes" al consolidado, sin especificar cuáles — pregunta abierta, no inventar cuáles son.
4. **Extender la selección múltiple** de `DianClasificacionPage.jsx` a IVA/Concepto — hoy solo
   aplica a retención (recorte de alcance consciente, ver commit). El autoguardado por fila y la
   clasificación rápida ya cubren los tres campos.
5. **Mapeo Concepto → CPT del formato 1001 de exógena** — sigue pendiente de la resolución oficial
   DIAN (códigos vistos en la guía real: 5002, 5004, 5005, 5007, 5008, 5010, 5011, 5012, 5016). No
   inventar la correspondencia; cuando el usuario traiga la fuente, se escribe en
   `formato1001.js`/`formato1007.js`.
6. **Confirmar si hace falta período bimestral** además de cuatrimestral (el usuario mencionó "creo
   que hay más períodos" al principio, sin confirmar cuáles).
7. **IC vs INC**: el reporte trae ambas columnas; INC ya se resolvió y se muestra (ventas y
   compras). Falta confirmar si "IC" (columna distinta de INC e ICA) también hace falta mostrar en
   algún lado — hoy solo vive dentro de `impuestos` (JSONB) sin mostrarse.
8. Otras columnas del Excel de exportación que quedaron identificadas como guardadas-pero-no-
   mostradas: tipo de documento (para distinguir nota crédito), tasa de retención (%), resto de
   impuestos menores (ICA, timbre, etc.) — CUFE ya se agregó (punto 2 de arriba), estas otras
   siguen solo como diagnóstico. Preguntar si las quiere antes de agregarlas (evitar sobrecargar el
   Excel sin necesidad real).

---

## 8. Archivos clave para retomar esto

- `backend/migrations/051_contabilidad_empresas.sql` / `052_contabilidad_empresas_nit.sql` — esquema y seed.
- `backend/src/controllers/dianController.js` — el motor completo (upload, clasificación, guardado permanente, Excel).
- `backend/src/controllers/contabConsolidadoController.js` — consulta y export del consolidado.
- `backend/src/controllers/contabEmpresasController.js` — catálogo de empresas.
- `src/pages/DianUploadPage.jsx`, `DianClasificacionPage.jsx`, `DianExportacionPage.jsx`,
  `ContabilidadConsolidadoPage.jsx` — todo el frontend del feature.
- `docs/LISTADO EMPRESAS.xlsx` — fuente de las 52 empresas (nombres).
- `docs/ESTADO_EXOGENAS_1001_1007.md` — por qué nació este feature (el CPT en blanco de la exógena).
