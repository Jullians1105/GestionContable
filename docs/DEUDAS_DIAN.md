# Deudas vencidas DIAN

Revisión mensual de las deudas vencidas de cada empresa en MUISCA (portal de la DIAN), que antes se hacía a
mano y se anotaba en el Excel `DEUDAS VENCIDAS DIAN.xlsx` (una hoja por mes). Pantalla: **Gestión Tributaria →
Deudas DIAN** (`/dian/deudas`).

## Qué hace
1. **Cargar clave** (admin/líder), en la ficha de la empresa del **Directorio** (sección «Clave DIAN», junto a la periodicidad
   del IVA): se guarda **cifrada** (AES-256-GCM). Antes de guardarla se hace **un solo intento** de ingreso real a la DIAN; si
   la rechaza, no se guarda. Deudas DIAN solo muestra el estado y enlaza al Directorio.
2. **Revisar** (cualquier usuario menos viewer) o **Revisar todas** (admin/líder, en segundo plano, 2 a la vez):
   entra a MUISCA con la clave guardada, lee el pastel "Sus obligaciones" y, si hay deuda, abre *Consulta obligación*
   y lee las dos filas: **DEUDA VENCIDA** (con **intereses a la fecha**, del cuadro de Liquidación) y **DEUDA NO VENCIDA**
   (aún dentro del plazo, sin intereses; se marca «No vencida»). Cada obligación se compara con los **recibos pagados
   electrónicos** (Asuntos → Recibos de pago) del mismo año.
3. Cruce con recibos: mismo concepto + año + periodo + valor → **Pagada** (la DIAN a veces tarda en reflejarlo);
   mismo concepto/año/periodo pero valor distinto → **Revisar** (lo resuelve una persona); sin recibo → **Se debe**.
4. El resultado del mes queda guardado (una revisión por empresa y mes; volver a revisar la reemplaza). Un fallo
   (error/clave) **no pisa** una revisión buena del mismo mes.
5. **Ver correo**: arma el texto para el cliente con lo que se debe (misma redacción que se usaba a mano). Las
   **no vencidas** van en un bloque aparte, sin los párrafos de intereses/art. 580-1 (redacción propuesta: la oficina no
   tenía plantilla para ese caso; si solo hay no vencidas, la introducción cambia). **El envío sigue siendo manual desde
   Gmail**: se copia el texto y se marca "Ya se envió".

## Presentar a mano: NIT, cédula y clave a la vista
Cuando la revisión automática falla (o hay que presentar algo a mano), los datos de ingreso están en la **misma fila** de cada
empresa en Deudas DIAN (y en su ficha del Directorio): **NIT**, **C.C. del representante** y **Clave**, cada uno copiable con
un clic (como el documento en el Directorio), sin abrir nada. El NIT se copia sin puntos ni dígito de verificación.
- **Decisión del usuario:** las claves se ven a quien entra a la página, porque hoy están en un Excel abierto a toda la
  oficina y entran las mismas personas. Por eso no hay permiso por usuario. **Única excepción: los usuarios «viewer» no las
  reciben** (la API responde 403 y la fila solo muestra NIT/cédula). Si algún día se quiere restringir más, está en
  `routes/dianDeudas.js` (`noViewer`).
- El botón **«Claves»** (ojo) de la cabecera las tapa con puntos si hay alguien mirando la pantalla; se recuerda en el navegador
  y sigue copiándose igual.
- Las claves llegan en **una sola consulta** (`POST /api/dian-deudas/claves`, no un GET: así no quedan en URLs ni historiales),
  descifradas por el servidor, con `Cache-Control: no-store`. Cada consulta deja una línea en `audit_log` (acción `READ`,
  quién y cuántas; nunca las claves; si ese registro falla no impide la respuesta). La clave guardada sigue **cifrada** en la
  base de datos.
- Ojo: lo copiado queda en el portapapeles del equipo hasta que se copie otra cosa.
- Es un cambio respecto a la regla inicial («la clave nunca sale por la API»).

## Carga masiva de claves desde los Excel
`backend/scripts/importarClavesDian.js` empareja las empresas del Directorio con los Excel `CLAVES CLIENTES*.xlsx` (columna
**INGRESO** = clave DIAN) y las carga verificando cada una contra la DIAN:

```
node scripts/importarClavesDian.js                       # SIMULACIÓN (no toca nada)
node scripts/importarClavesDian.js --aplicar --lote 5    # carga hasta 5 (un login real por empresa)
node scripts/importarClavesDian.js --aplicar --nombre ACME
```
- Solo carga las emparejadas **con certeza** (por NIT; por cédula si es persona natural; o nombre casi idéntico). Las que tienen
  **claves distintas entre archivos** (conflicto), las dudosas y las que no aparecen se **listan, no se cargan**.
- Nunca imprime claves. Salta las ya verificadas y las que la DIAN ya rechazó (no se reintenta).
- Los Excel viven en `docs/` (ignorados por git, `docs/*.xlsx`): **nunca subirlos al repo**.
- Cada base de datos (local vs. producción) necesita su propia carga y la misma `DIAN_CLAVES_KEY` con que se cifró.

## Consumo medido (revisión de 133 empresas, 05/10/2026)
Medido en la máquina de desarrollo (i5-13420H, 12 hilos) con concurrencia 2, Chrome headless:
- **Tiempo:** 1.028 s (17 min) para 133 empresas = 7,7 s/empresa (≈7 empresas/min); ≈15 s por empresa en cada una de las 2 en paralelo.
- **Memoria:** Chrome ≈10 procesos, promedio 1,3 GB y **pico 1,5 GB**; node (servicio) ≈200 MB.
- **CPU:** ≈4,1 s de CPU de Chrome por empresa (cifra mínima: el muestreo pierde el último segundo de cada proceso que muere);
  uso medio 0,53 núcleos.
- **Servidor** (Celeron N4020, 2 núcleos a 1,1 GHz, 7 GB RAM, ~5 GB libres, backend en reposo ≈724 MB): la memoria cabe
  (≈2,2 GB entre Chrome pico y backend), pero la **CPU es el límite**: con un factor de lentitud estimado 3,5–5× serían
  ≈14–20 s de CPU por empresa → con concurrencia 2 ambos núcleos quedarían casi al 100 % unos 30–40 min (la página se
  pondría lenta); con `DIAN_DEUDAS_MAX_CONCURRENTE=1` serían ≈60–75 min usando ~1 núcleo. **Recomendado: correrlo de noche o
  fuera de horario y con concurrencia 1.** (Estimación: se confirma midiendo en el servidor.)
- **Probado y descartado:** no descargar imágenes/fuentes/medios (A/B sobre las mismas 12 empresas): CPU +8 % (ruido), memoria
  −8 %, tiempo igual, mismos resultados. El consumo es del JavaScript de la propia DIAN, no de lo visual.
- Errores intermitentes observados en la primera pasada (6 de 133): lectura justo durante una navegación de MUISCA — ya se
  reintenta — y el cuadro de Liquidación que no abre al primer clic — se repite una vez.

## Aviso previo del régimen SIMPLE
Para algunas obligaciones (**Impuesto Unificado y consumo del régimen SIMPLE**) el botón «$» no abre directo el cuadro de
Liquidación: primero sale «Información importante… ¿Desea continuar?» (sí/no). El usuario autorizó confirmar **ese** aviso
(solo continúa hacia el cuadro de Liquidación, que se lee y se cierra con la X). Límites que se mantienen: se pulsa únicamente
su botón «sí» (`btnSi2`) y solo si el texto es el conocido; lo siguiente debe ser el cuadro de Liquidación, si no se cierra
con la X y se falla; el «sí» del cuadro de Liquidación (el que genera el recibo F490 y manda el correo) **nunca** se pulsa.
- **Anomalía:** en el SIMPLE el cuadro puede dar MENOS que la tabla (visto: tabla $4.651.000, liquidación $87.000). Los
  intereses solo suman, así que si la liquidación es menor que el valor de la tabla la obligación pasa a «Revisar» con una nota
  y **no se incluye en el correo** hasta que una persona la mire en la DIAN.
- Diagnóstico: `DIAN_DEUDAS_DEBUG=1` deja en el log cada paso de la lectura (sin datos sensibles).

## Perfil fijo del navegador (no cambiar sin volver a probar)
Las revisiones usan siempre el MISMO perfil, en cualquier equipo (`PERFIL_NAVEGADOR` en `dianDeudasService.js`): ventana
1280×900, idioma `es-ES`, cabecera `Accept-Language: es-ES,es;q=0.9`, zona `America/Bogota` y user agent de Chrome en Windows.
Es exactamente lo que manda el navegador de la máquina de desarrollo, donde se probó todo; así lo probado aquí se comporta
igual en el servidor (Linux, en inglés/UTC por defecto) y no aparecen diferencias de a poco.
- **Por qué:** con el idioma del contenedor (inglés) la DIAN sirve una página rota (cientos de 404 y la tabla de obligaciones
  vacía → «Consolidado de obligaciones» nunca aparece). Y no vale cualquier español: con `es-419` y `es-CO` la pantalla de
  **recibos pagados** muestra los números con comas (`2,347,000`); con `es-ES` usa puntos en todas las pantallas.
- **Red de seguridad:** si un número llega con comas de miles, el lector **falla** en vez de adivinar (`332,000` se leería
  como 332). Si aparece ese error, lo primero es revisar el perfil.
- **Regla:** cambiar cualquier valor del perfil exige volver a probar contra la DIAN real, incluida una empresa con deuda,
  una con deuda no vencida y una del régimen SIMPLE.
- Diagnóstico: `DIAN_DEUDAS_DEBUG=1` deja en el log cada paso de la lectura.

## Reglas de seguridad (no negociables)
- Nunca se pulsa **"sí"** en el cuadro de liquidación (generaría un recibo F490 y enviaría un correo): solo se lee y se
  cierra con la X.
- Una clave rechazada **no se reintenta** (la DIAN bloquea la cuenta del cliente): la empresa queda "Clave inválida"
  hasta que se cargue una nueva.
- Siempre se cierra la sesión en la DIAN, aun si algo falla a mitad.
- La clave nunca sale por la API ni se escribe en logs/auditoría.
- Dos personas dando *Revisar* a la misma empresa: la segunda recibe `409 EN_CURSO`.

## Despliegue
- **Variable obligatoria `DIAN_CLAVES_KEY`** (32 bytes en hex): `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
  Sin ella, guardar claves responde 503. **Guardarla también fuera del servidor**: si se pierde o cambia, las claves ya
  guardadas quedan ilegibles y hay que volver a cargarlas.
- `DIAN_DEUDAS_MAX_CONCURRENTE` (opcional, 2 por defecto): revisiones simultáneas. Comparte el Chrome (y los 2 núcleos) con
  el generador de token.
- Migración `065_dian_deudas.sql` (la aplica el servicio `migrate` al desplegar).
- Requiere Google Chrome instalado (`DIAN_CHROME_PATH`). Las revisiones usan **su propio Chrome sin ventana (headless)**,
  aparte del del generador de token: no necesitan Xvfb ni el perfil "calentado" (MUISCA **no** pide captcha ni Cloudflare).
  Así tampoco aparece una segunda ventana ociosa al revisar en una máquina con pantalla. Son dos procesos de Chrome en el
  servidor (el del token solo se lanza cuando se genera un token).

## Código
| Pieza | Archivo |
|---|---|
| Navegador (solo lectura contra MUISCA) | `backend/src/services/dianDeudas/muiscaScraper.js` |
| Reglas: clasificar concepto, periodos, cruce con recibos, correo | `backend/src/services/dianDeudas/logica.js` |
| Orquestación: bloqueo por empresa, cola, guardado, "revisar todas" | `backend/src/services/dianDeudasService.js` |
| Endpoints `/api/dian-deudas` | `backend/src/controllers/dianDeudasController.js`, `routes/dianDeudas.js` |
| Cifrado de claves | `backend/src/utils/secretos.js` |
| Pantalla | `src/pages/DeudasDianPage.jsx` |

## Notas operativas
- Cada revisión corre en un **contexto de navegador aislado** (cookies propias): varias a la vez no se pisan.
- Tiempos medidos contra la DIAN real: ~4 s sin deuda, ~25 s con deuda (3 obligaciones).
- **Periodicidad del IVA** por empresa (bimestral/cuatrimestral): sin ella el correo dice "IVA del periodo 2" en vez de
  "bimestre marzo-abril". Retención: mensual. Impuesto al consumo: bimestral.
- Una clave (o documento) errados dan en MUISCA el mensaje «Datos incorrectos o no encontrados. Verifique e intente de
  nuevo.» (visto en vivo); se detecta por texto, y si la DIAN cambiara el mensaje la empresa quedaría como `error` (no se
  guarda nada, pero tampoco se marca como clave inválida).
- Sin probar contra la DIAN real: recibos pagados con más de una página de resultados (el código recorre las páginas).
- Si la DIAN cambia su portal, lo primero que se rompe son los selectores de `muiscaScraper.js` (están comentados con el
  porqué de cada decisión).
