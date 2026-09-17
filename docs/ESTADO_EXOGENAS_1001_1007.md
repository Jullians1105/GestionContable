# Estado — Exógenas 1001 y 1007

> Documento de continuidad de sesión. Última actualización: 2026-08-31. Léelo completo antes de
> tocar cualquier cosa relacionada con 1001/1007 en una sesión nueva — resume decisiones ya
> tomadas para no volver a preguntarlas ni reabrirlas sin evidencia nueva.

---

## 0. Sesión 2026-08-31 (resumen — 1001 y 1007 ya generan Excel)

Sobre la rama `feat/exogenas-1007-verificacion-ingresos` (base: sección 1 de abajo), en orden:

1. **Fix DEV VENTAS del 1007**: sumaba el `Total` de TODAS las filas de esa hoja, sin filtrar por
   tipo de documento — ahora solo cuenta filas que son nota crédito, igual que ya hacía VENTAS del
   lado contrario. Bug encontrado por el usuario.
2. **Fix filas ocultas por filtro/"Ocultar" (AutoFilter)**: el flujo real es copiar el TOKEN
   completo y ocultar filas/filtrar en Excel a lo que aplica en cada hoja — el código leía esas
   filas igual. Se agregó `if (row.hidden) return;` en los 4 formatos (1001, 1005, 1006, 1007),
   en TODAS las hojas que leen (COMPRAS/VENTAS/DEV VENTAS/DEV COMPRAS). Columnas ocultas SÍ se
   siguen leyendo normal (confirmado por el usuario — los impuestos del 1005/1006/1007 vienen en
   columnas típicamente ocultas y deben seguir restándose).
3. **1007 ya genera Excel real** (antes era "solo verificación"): se implementó
   `llenarHoja`/`llenarPlantilla` en `formato1007.js` con los headers reales de la hoja "1007"
   sacados de `docs/EXOGENA - GUIA FORMATOS.xlsx` (hoja "1007 OK") — a diferencia de 1005/1006,
   el 1007 NO tiene columna DV y SÍ tiene columna PAIS. Se registró en
   `services/exogenas/index.js#ESTRATEGIAS` y en `exogenasController.js#FORMATOS_SOPORTADOS`.
   - **CPT (concepto)** se deja intencionalmente en blanco — sigue sin definir (ver sección 2).
   - **PAIS** se llena cruzando el NIT del cliente contra la tabla `terceros` (mismo dato que
     "Consulta Tercero") vía `formato1007.js#enriquecerConPais` — si el cliente no tiene factura
     importada en "Importar Terceros", PAIS queda en blanco. Decisión del usuario (opción 3 de
     3 posibles: dejar vacío / asumir Colombia fijo / cruzar contra `terceros`).
   - El frontend (`ExogenasUploadPage.jsx`) ya NO trata 1007 como `soloVerificacion`: entra al
     mismo flujo que 1005/1006 (`uploadExogenas` → `borradores` → tabla genérica → "Generar
     Excel"). Se generalizó la tabla con dos campos opcionales en `CONFIG_FORMATO`: `aviso`
     (banner ámbar arriba de las tarjetas, explica que CPT está pendiente y de dónde sale PAIS) y
     `columnaExtra` (columna extra en la tabla — hoy solo 1007 la usa, para el estado
     "Con país"/"Sin país" por tercero, con una tarjeta "Sin país" cuando aplica).
   - El endpoint `POST /exogenas/1007/verificar-ingresos` (`verificarIngresos1007`) se ELIMINÓ
     (controller, ruta, `api.js`) — ya no hace falta, 1007 usa `POST /exogenas/upload` como
     1005/1006.
4. **Tabla del 1007 con `table-fixed`**: antes envolvía valores largos de IBRU/DEV en dos líneas
   porque Razón social se llevaba todo el ancho — ahora usa el mismo patrón de anchos fijos que
   1005/1006 (esto quedó obsoleto por el punto 3, que reemplazó esa tabla por la genérica, pero
   el ancho fijo se mantiene igual en la genérica).
5. **1001 TAMBIÉN ya genera Excel real** (mismo patrón que el punto 3, a pedido del usuario: "quiero
   que deje generar el excel... para mostrarles y verificar cómo se ve la información de los
   terceros"): se implementó `llenarHoja`/`llenarPlantilla` en `formato1001.js` con los headers
   reales de la hoja "1001" sacados de `docs/EXOGENA - GUIA FORMATOS.xlsx` (hoja "1001 OK") — el
   1001 tampoco tiene columna DV, y trae DIR/DPTO/MUN/PAIS. Ojo con dos detalles no obvios de esa
   plantilla real:
   - Las columnas RETP y RETA comparten LITERALMENTE el mismo texto descriptivo ("Retención en la
     fuente practicada Renta"), solo cambia el sufijo entre paréntesis — el `match` de cada una en
     `CAMPOS_PLANTILLA` incluye ese sufijo para no confundirlas (si no, las dos apuntarían a la
     misma columna).
   - MUN pide solo los 3 dígitos de municipio dentro del departamento, no el código DANE completo
     de 5 que guarda `terceros.codigo_municipio_dane` — se recorta con `.slice(-3)`.
   Registrado en `services/exogenas/index.js#ESTRATEGIAS` y en
   `exogenasController.js#FORMATOS_SOPORTADOS`.
   - **CPT y las columnas de dinero** (PAGO, PNDED, IDED, INDED, RETP, RETA, COMUN, NDOM) quedan en
     blanco a propósito — siguen sin definir (ver sección 2).
   - **DIR/DPTO/MUN/PAIS** se llenan cruzando el NIT del proveedor contra `terceros` vía
     `formato1001.js#enriquecerConTerceros` (la misma función que ya existía para el chequeo
     previo) — si el proveedor no tiene factura importada, quedan en blanco.
   - El frontend: 1001 dejó de ser `soloVerificacion`, entra al mismo flujo genérico que
     1005/1006/1007. Como YA NO QUEDA NINGÚN FORMATO `soloVerificacion`, se eliminó toda esa
     maquinaria del frontend: estado `verificaciones`, `VISTA_VERIFICACION`, el componente
     `Verificacion1001View`, y la rama especial en `analizar()`/`tieneResultado()`. El componente
     genérico se generalizó: `columnaExtra` (un objeto) pasó a ser `columnasExtra` (un arreglo),
     porque 1001 necesita DOS columnas extra (Dirección + Estado) mientras 1007 solo necesita una
     (PAIS). Ojo con un detalle de Tailwind: los badges de color (verde/ámbar/rojo) usan un mapa
     `BADGE_ESTILOS` con clases completas y literales — Tailwind escanea el código fuente buscando
     los nombres de clase tal cual aparecen, así que interpolar `bg-${color}-100` NO generaría el
     CSS correspondiente.
   - Los endpoints `POST /exogenas/1001/verificar-terceros` (`verificarTerceros1001`) y
     `POST /exogenas/1007/verificar-ingresos` se ELIMINARON (controller, rutas, `api.js`) — ya no
     hacen falta, ambos formatos usan `POST /exogenas/upload` como 1005/1006. **Importante:** la
     funcionalidad de verificar (avisar a quién le falta la dirección) NO desapareció, solo se
     movió — ahora vive dentro del flujo normal (`uploadExogenas` llama a `enriquecerConTerceros`
     igual que antes) y se sigue viendo en la tabla vía la columna "Estado" (columnasExtra de
     1001).

Todo esto sigue en la misma rama `feat/exogenas-1007-verificacion-ingresos`, **sin commitear
todavía** — ver sección 3 actualizada.

---

## 1. Qué se hizo en la sesión 2026-08-28 (resumen)

Arrancó revisando el estado del repo (nada pendiente de commitear en `main`), y de ahí se hicieron,
en orden, estas piezas — cada una en su propia rama, con PR:

1. **Extracción de régimen fiscal/responsabilidad tributaria/teléfono/correo** desde el PDF de
   factura DIAN (antes solo se guardaba dirección/municipio/departamento). PR #50, mergeado.
2. **Pantalla "Consulta Tercero"**: busca un tercero guardado por NIT y muestra todos sus datos,
   con aviso de que vienen de facturas (no de un RUT verificado). Régimen fiscal se traduce a su
   descripción con una tabla de códigos DIAN (`regimenFiscalDian.js`). PR #50, mergeado.
3. **Fix de producción**: `nginx.conf` no tenía `client_max_body_size` (default 1m), rechazaba con
   413 la subida de varios PDFs a la vez en "Importar Terceros". Ya en `main`.
4. **País del tercero**: se extrae el campo "País" del PDF (antes solo se usaba como tope) y se
   mapea a código DIAN de 3 dígitos vía `paisesDian.js` (~190 países, fuente:
   `docs/codigos-paises-dian.pdf`). PR #51, mergeado. Se muestra en el resumen de "Importar
   Terceros" pero **no** en "Consulta Tercero" (pedido explícito del usuario).
5. **Renombres**: "Datos de Terceros" → "Importar Terceros"; módulo "DIAN" → "Gestión Tributaria"
   en todo el sidebar/UI (no en el contenido de los Excel exportados — eso sigue diciendo DIAN a
   propósito, es contenido contable real). Incluido en PR #50.
6. **Verificación de terceros para el 1001** (`formato1001.js`): agrupa por tercero desde la hoja
   COMPRAS del TOKEN y cruza contra `terceros` para avisar a quién le falta dirección completa
   antes de generar la exógena. Integrado como tarjeta "1001" en la misma pantalla de Exógenas
   (no una página aparte — se descartó esa idea a pedido del usuario). PR #52, mergeado.
7. **Verificación de ingresos para el 1007** (`formato1007.js`): agrupa por tercero desde VENTAS
   (+ DEV VENTAS opcional) y calcula IBRU/DEV como "Total menos impuestos presentes". Mismo
   patrón que 1001, generalizado para no duplicar código en `ExogenasUploadPage.jsx`. **Recién
   commiteado, sin pushear todavía** — ver sección 3.

---

## 2. Lo que quedó pendiente y por qué (NO inventar, esperar respuesta)

El usuario le preguntó a su jefe/jefa sobre dos cosas para poder terminar el 1001 del todo y
cerrar el CPT del 1007. **Sigue en espera de esa respuesta** (al 2026-08-31 todavía no habla con
el jefe) — el usuario avisa cuando la tenga, no hay que preguntarle de nuevo en la próxima sesión
salvo que él lo mencione primero.

1. **Concepto (CPT) del 1001**: varía por tipo de gasto (servicios, arrendamientos, honorarios,
   etc.), no es un valor fijo como en 1005 (5555) o 1006 (6666). El usuario mencionó que su jefa
   propuso algo más grande: una base de datos mensual por empresa, alimentada desde el módulo
   "Contabilidad", sincronizada con Exógenas para que la info ya esté cargada al momento de
   generar la exógena. **Esto está en discusión con el jefe, es una decisión de arquitectura
   grande, independiente de todo lo demás — no bloquea nada de lo ya construido.** En el Excel que
   ya genera el 1001 (ver sección 0), esta columna se deja en blanco a propósito.
2. **Concepto (CPT) del 1007**: también varía (visto en la guía oficial: 4001, 4002, 4003 — muy
   probablemente ingresos operacionales / no operacionales / rendimientos financieros, pero **sin
   confirmar por el usuario**, no asumir). En el Excel que ya genera el 1007 (ver sección 0), esta
   columna se deja en blanco a propósito — el usuario la completa a mano hasta que se defina la
   regla.
3. **Columnas de dinero del 1001** (PAGO, PNDED, IDED, INDED, RETP, RETA, COMUN, NDOM): de dónde
   salen, también pendiente — el usuario dijo que hoy es un cálculo manual, iba a preguntar. En el
   Excel que ya genera el 1001, estas 8 columnas quedan en blanco a propósito (junto con CPT).
   Las de 1007 (IBRU, DEV) **ya están resueltas y generando Excel** — ver sección 0.

Cuando el usuario traiga la respuesta de la reunión, lo único que falta para cerrar 1001/1007 de
verdad es escribir el CPT correcto (y en el caso de 1001, también PAGO/PNDED/IDED/INDED/RETP/
RETA/COMUN/NDOM) en vez de dejarlos en blanco — `llenarHoja` de ambos formatos ya está
implementado y todo lo demás (TDOC/NID/nombre/dirección/país/IBRU/DEV) ya se genera bien. No hace
falta ningún otro cambio de arquitectura para esto, solo:
- Definir la regla de concepto para 1001 y 1007 (probablemente una tabla de mapeo, similar a como
  se resolvieron régimen fiscal o país — pedir la fuente/regla exacta, no inventar) y escribirla en
  `CAMPOS_PLANTILLA`/`llenarHoja` de cada formato.
- Confirmar de dónde salen las columnas de dinero del 1001 y agregarlas a `leerYAgrupar`/
  `llenarHoja` en `formato1001.js`.

---

## 3. Estado de ramas/PRs ahora mismo

- `main`: **al día** — PR #53 (`feat/exogenas-1007-verificacion-ingresos`, commit `9a55b0c`,
  merge `1650b20`) ya está mergeado. Incluye todo lo de la sesión 2026-08-31 (sección 0): 1001 y
  1007 generando Excel real, fix DEV VENTAS, fix filas ocultas por filtro en los 4 formatos.
- Rama de trabajo ya cerrada — la próxima sesión debería arrancar una rama nueva desde `main` si
  hay que tocar algo más de 1001/1007.
- **Sigue sin probarse en navegador con datos reales** (TOKEN + plantilla SIIGO reales, con hojas
  "1001"/"1007") — esto quedó pendiente de que el usuario lo pruebe él mismo tras el merge. 1005 y
  1006 sí llevan tiempo en producción y probados.

---

## 4. Archivos clave para retomar esto

- `backend/src/services/exogenas/formato1001.js` / `formato1007.js` — ambos completos salvo CPT
  (y en 1001, además las columnas de dinero) en blanco (ver sección 0 y 2).
- `backend/src/controllers/exogenasController.js` — los 4 formatos pasan por el flujo genérico
  (`uploadExogenas`/`getExogenasBorrador`/`generarExogenas`/`generarExogenasCombinado`); el
  enriquecimiento contra `terceros` está especial-caseado ahí dentro de `uploadExogenas`
  (`if (formato === '1001') ... enriquecerConTerceros`, `if (formato === '1007') ...
  enriquecerConPais`).
- `src/pages/ExogenasUploadPage.jsx` — `FORMATOS_DISPONIBLES` (ya no hay ningún
  `soloVerificacion`, se eliminó esa maquinaria por completo), `CONFIG_FORMATO` (campos `aviso` y
  `columnasExtra` — arreglo, no objeto — opcionales, usados por 1001 y 1007).
- `docs/EXOGENA - GUIA FORMATOS.xlsx` — hojas "1001 OK"/"1007 OK", tiene ejemplos reales de
  salida (incluye los CPT variables sin explicar la regla, y los headers reales de cada hoja).
- `docs/PLANEACION_EXTRACCION_DATOS_FACTURAS.md` — planeación original del módulo `terceros`
  (por qué existe, de dónde salió la necesidad del 1001 y ahora también del país del 1007).

---

## 5. Otros pendientes sueltos (no relacionados con 1001/1007)

- `docs/ARQUITECTURA_DESCARGA_FACTURAS.md`, `docs/PLANEACION_EXTRACCION_DATOS_FACTURAS.md`,
  `docs/tipoDocumentos.jpeg`: siguen sin trackear en git a propósito (el usuario pidió
  explícitamente no commitearlos, son solo para que Claude los lea). Este mismo archivo
  (`ESTADO_EXOGENAS_1001_1007.md`) sigue el mismo patrón — no commitear salvo que el usuario lo
  pida.
- Automatización de descarga de PDFs desde el portal DIAN (reemplazar `GestorDocs`) y
  licenciamiento vía Postgres: ideas de la planeación original, sin retomar, no urgentes.
