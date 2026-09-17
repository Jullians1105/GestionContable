# Planeación — Extracción de datos de facturas para Exógenas (1001)

> Documento de continuidad. Resume una conversación de planeación (sin código
> escrito todavía) sobre si conviene traer a este proyecto parte de lo que
> hace `GestorDocs` (app de escritorio aparte, ver
> `docs/ARQUITECTURA_DESCARGA_FACTURAS.md`). Nada de esto está implementado
> aún — es el punto de partida para retomar mañana.

---

## 1. Por qué surgió esto

El formato **1001** de Exógenas (pagos/abonos en cuenta y retenciones) necesita,
por tercero, datos que **no vienen en el TOKEN** (el reporte de compras/ventas
que ya usan 1005 y 1006): **dirección, código de municipio y código de
departamento** (DANE). Hoy ese dato se busca a mano, factura por factura, y
según el jefe de Diego es uno de los puntos más importantes a resolver de todo
este proyecto de automatización de Exógenas — es la parte que más tiempo come.

La idea que surgió: la empresa ya tiene `GestorDocs`, una app de escritorio
que descarga en masa los PDF de facturas desde el catálogo público de la DIAN
(`catalogo-vpfe.dian.gov.co`) y ya sabe leer texto de esos PDF (lo usa hoy para
renombrar archivos en el flujo de ventas). La pregunta: ¿se puede usar/traer
algo de eso para extraer dirección/municipio/departamento automáticamente?

---

## 2. Lo que ya se investigó y quedó confirmado

### 2.1 Extracción del PDF — sí es viable
Se revisó un PDF real de muestra (`docs/PDF-901939874-AAC2.pdf`, factura de
"ASOCIACION AVICOLA CHICAMOCHA"). Hallazgos:
- Es **texto nativo**, no imagen escaneada — no hace falta OCR.
- Como el flujo de descarga **siempre** pasa por el catálogo público de la
  DIAN buscando por CUFE (no se guarda el PDF original del emisor, sea cual
  sea su sistema de facturación — SIIGO u otro), el PDF que se obtiene
  **siempre tiene el mismo layout fijo generado por la DIAN**
  ("PDF Generado por: Solución Gratuita DIAN"). Esto elimina el riesgo de
  tener que soportar N layouts distintos según el proveedor de facturación
  del cliente — solo hay UN formato que parsear.
- Los campos vienen con etiqueta consistente y separada para Emisor y
  Adquiriente: `Departamento:`, `Municipio / Ciudad:`, `Dirección:`. Extraer
  esto con una expresión regular simple es directo.
- **Lo que el PDF NO trae:** el código DANE de municipio/departamento, solo el
  nombre en texto ("Boyacá", "Socha"). Se resuelve con una tabla de
  correspondencia nombre → código DANE, que es **fija y oficial** — se
  construye una sola vez y no depende de ningún cliente ni PDF. Falta
  conseguir esa tabla oficial antes de implementar el mapeo (mismo criterio
  que ya se sigue en este proyecto: no inventar códigos, pedir fuente
  oficial).

### 2.2 Descarga desde DIAN — no requiere sesión personal
Se confirmó con Diego que el flujo de búsqueda en
`catalogo-vpfe.dian.gov.co` **nunca inicia sesión con una cuenta DIAN
personal** — es búsqueda pública por CUFE + NIT (el NIT lo exige la DIAN
desde hace poco "por seguridad", ya resuelto en `GestorDocs`). Esto importa
porque significa que **no hay que aislar credenciales/sesiones por usuario**
si esto se centraliza en un servidor — todos pasan por el mismo mecanismo
público, protegido solo por Cloudflare (no por login).

### 2.3 Red — el servidor ya comparte la misma IP pública que la oficina
Punto clave que aportó Diego: las 15 personas del equipo están siempre en la
misma oficina, conectadas por LAN/WiFi a un mismo "rompemuros" (repetidor)
que nace del mismo router — o sea, **una sola IP pública para todos**, no 15
distintas. Y el servidor de este proyecto (`192.168.1.12`, IP privada,
publicado al exterior vía Cloudflare Tunnel — señal de que está físicamente
en esa misma red) **también sale a internet por esa misma IP**.

Conclusión de esto: mover la automatización de descarga al servidor **no
cambia nada de cara a Cloudflare/DIAN** — ya es la misma IP hoy, corriendo
`GestorDocs` en cualquiera de las 15 máquinas. El riesgo que se había
planteado al inicio (IP concentrada y "sospechosa" al centralizar) **no
aplica** en este caso. Además, al estar el servidor físicamente en la
oficina, si alguna vez aparece un challenge interactivo de Cloudflare que la
automatización no resuelve sola, alguien puede acceder físicamente/por
remoto a esa máquina para intervenir — no es una nube inaccesible.

### 2.4 Consumo de recursos — depende del diseño de concurrencia, no del uso
Diego quiere que cada uno de los 15 pueda usar esto "cuando quiera", de forma
independiente (subir su archivo, ver su propio progreso, sin tener que
esperar a otro). Eso NO tiene que traducirse en 15 Chromes corriendo a la vez
en el servidor (que sí pegaría en RAM — cada Chrome+Playwright activo pesa
~200-500 MB — y además rompería el patrón "una búsqueda a la vez" que hoy
protege de Cloudflare).

Diseño recomendado: **una sola cola de trabajo** en el servidor (un único
Chrome/Playwright activo, procesando un documento a la vez, igual que hoy en
una máquina), donde cada usuario:
- Entra a su propia página cuando quiera, sube su archivo, su trabajo se
  encola.
- Ve el progreso de SU trabajo en tiempo real (mismo patrón de streaming que
  ya usa la app en otras partes — Socket.io).
- No necesita quedarse viendo una ventana de Chrome; puede cerrar y volver.

Esto da la sensación de "mi propia app independiente" sin multiplicar el
consumo de recursos ni el patrón de tráfico hacia DIAN — el consumo real
sigue siendo equivalente a un solo Chrome, igual que hoy.

**Pendiente sin resolver:** no se revisaron las specs reales del servidor
(RAM/CPU disponible) — hace falta correr `free -h` y `nproc` por SSH antes de
comprometerse a un diseño concreto de concurrencia, aunque el diseño de cola
única ya es conservador de por sí.

---

## 3. Lo que se descartó / matizó en el camino

- **Portar `GestorDocs` completo tal cual como módulo web**, de entrada, se
  consideró mala idea (primera respuesta de Claude) por el supuesto problema
  de aislar sesiones/IP por usuario. **Ese supuesto quedó invalidado** tras
  las secciones 2.2 y 2.3 — el panorama es más favorable de lo que se pensó
  al principio. La recomendación ya no es "no lo hagas", es "no lo hagas
  primero, y no lo hagas con concurrencia total por usuario".
- Preocupación descartada: variación de layout de PDF según el emisor —no
  aplica porque siempre se descarga el PDF generado por la propia DIAN, no el
  del sistema de facturación original del cliente.
- Preocupación descartada: consumo de base de datos a largo plazo por guardar
  los datos extraídos — es una tabla angosta (NIT, razón social, dirección,
  ciudad, código municipio, código departamento), del orden de decenas de MB
  incluso con decenas de miles de terceros — insignificante comparado con
  `exogenas_borradores`, que ya guarda archivos Excel completos como BYTEA.
  Clave: **no guardar los PDF**, solo los campos ya extraídos.

---

## 4. Recomendación de secuencia (para retomar)

1. **Construir ya el módulo de extracción** (independiente de la decisión de
   automatizar la descarga): subir PDFs de facturas ya descargadas → extraer
   dirección/municipio/departamento por regex sobre el layout fijo de la DIAN
   → mapear nombre de municipio/departamento a código DANE (falta la tabla
   oficial) → guardar en una tabla nueva `terceros` (NIT como llave, de uso general,
   no exclusiva de Exógenas — nombre confirmado con el usuario 2026-08-27)
   en la misma Postgres que ya usa Exógenas. Reusa el mismo patrón ya probado
   (subir Excel/archivo → procesar → guardar) que 1005/1006.
   - Bajo riesgo, alto valor, ataca directo la prioridad que marcó el jefe.
   - Falta decidir el disparador: ¿por lote antes de generar cada exógena, o
     continuo? — esta pregunta quedó sin resolver, Diego prefirió primero
     saber si el aplicativo completo era viable antes de entrar en ese
     detalle.
2. **Confirmar specs del servidor** (RAM/CPU) antes de diseñar la
   automatización de descarga centralizada.
3. **Si se decide avanzar con la descarga centralizada:** diseño de cola
   única server-side (sección 2.4), streaming de progreso por usuario, y un
   plan para el caso raro de challenge interactivo de Cloudflare que no se
   resuelve solo.
4. **Ganancias rápidas identificadas, independientes de todo lo anterior**,
   para los dos dolores reales que mencionó Diego de mantener `GestorDocs`
   como está hoy (redistribuir el `.exe` a 15 equipos en cada cambio, y
   control de qué equipos están autorizados):
   - Mover el chequeo de licencia de "hardcodeado en el binario" a una
     consulta a una tabla en la Postgres de este proyecto (vía un endpoint
     chico) — agregar/quitar un equipo autorizado pasa a ser una fila, no una
     recompilación + redistribución a los 15.
   - Auto-actualizador liviano en `GestorDocs` que revisa versión contra un
     endpoint (puede vivir en este mismo backend) y se trae los scripts
     nuevos solo — resuelve el dolor de redistribuir zips a mano, sin tocar
     el motor de automatización.
   - Estas dos mejoras **no dependen de la decisión de centralizar la
     descarga** — se pueden hacer en cualquier momento.

---

## 5. Nota aparte — no confundir con el otro frente de trabajo

En paralelo a esta conversación de planeación, en la rama
`feat/exogenas-formato-1006` quedó implementado y verificado (pero **sin
commitear todavía**) el formato **1006** completo de Exógenas: servicio
backend, endpoint de generación combinada (un solo Excel con la hoja de cada
formato analizado), pestañas por formato en el frontend, persistencia del
borrador en la URL al recargar, y varios ajustes de UI (tarjetas de resumen,
tabla sin scroll horizontal, botón flotante). Ver el historial de la
conversación para el detalle — ese trabajo está listo para revisión y commit,
es independiente de todo lo de este documento.
