# Arquitectura de GestorDocs

> Documento técnico único de referencia. Cubre la aplicación completa: interfaz
> gráfica, licenciamiento por equipo, generación del archivo de trabajo, el
> proceso de búsqueda/descarga en DIAN (compras y ventas), el manejo de la
> contraseña de los PDF, y el empaquetado como ejecutable.
>
> Para el detalle versión a versión de qué cambió y por qué, ver `CHANGELOG.md`.

---

## 1. Objetivo

Automatizar la descarga masiva de PDFs de documentos electrónicos (facturas de
compra, ventas, notas crédito, notas débito y documentos equivalentes) desde el
catálogo público de la DIAN (`catalogo-vpfe.dian.gov.co`), a partir de un
reporte Excel exportado por el usuario desde el portal, actualizando ese mismo
archivo de trabajo con el resultado de cada descarga. Todo se opera desde una
interfaz de escritorio (Tkinter) que un usuario del área contable puede usar
sin conocimientos técnicos.

La app se distribuye como ejecutable (`GestorDocs.exe`) y su uso está
restringido a los equipos autorizados de la empresa (Gestcon) mediante un
mecanismo de licenciamiento local.

---

## 2. Estructura del proyecto

```text
GESTOR_DIAN_UNIFICADO/
│
├── app.py                        # Punto de entrada único (GUI + modos CLI internos)
│
├── core/
│   ├── license_lock.py           # Control de equipos autorizados (MachineGuid + hash)
│   ├── dian_service.py           # Construcción de comandos y manejo de Chrome/CDP
│   ├── excel_service.py          # Lectura de resumen de estados del archivo de trabajo
│   ├── worker.py                 # Ejecuta los scripts de proceso como subproceso, en streaming
│   ├── compras_service.py        # Vacío (placeholder, sin uso)
│   └── ventas_service.py         # Vacío (placeholder, sin uso)
│
├── ui/
│   └── main_window.py            # Ventana principal Tkinter (toda la lógica de interfaz)
│
├── inicio_dian_descargas.py      # Genera el archivo de trabajo a partir del reporte DIAN
├── dianDescargaEstable.py        # Proceso de búsqueda/descarga — modo Compras (Recibido)
├── dianDescargaVentas.py         # Proceso de búsqueda/descarga — modo Ventas (Emitido)
│
├── chrome_cdp_profile_unificado/ # Perfil de Chrome dedicado (cookies/sesión DIAN persistentes)
├── GestorDocs.spec               # Especificación de empaquetado PyInstaller
├── GestorDocs.ico / app_icon_v7.png
├── README.md                     # Descripción general del proyecto (resumen no técnico)
├── CHANGELOG.md                  # Historial de versiones
└── dist/GestorDocs.exe           # Ejecutable generado (build)
```

`core/_init_.py` y `ui/init.py` existen pero están vacíos y **mal nombrados**
(debieron llamarse `__init__.py`). No cumplen función de paquete Python; los
imports funcionan igual porque Python 3 soporta *namespace packages* sin
`__init__.py`. No son necesarios para el funcionamiento actual, pero tampoco
aportan nada — son residuales.

---

## 3. Punto de entrada (`app.py`)

`app.py` es el único ejecutable de la aplicación (`GestorDocs.exe` apunta
aquí). Según los argumentos de línea de comandos, decide uno de cuatro modos:

| Invocación | Comportamiento |
|---|---|
| Sin argumentos | Verifica que el equipo esté autorizado (`equipo_autorizado()`); si lo está, lanza la GUI (`ui.main_window.MainWindow`). Si no, muestra un `messagebox` de error ("Equipo no autorizado") y sale con código 1. |
| `--id` | Muestra una ventana pequeña con el código único calculado para ese equipo (`codigo_equipo_actual()`), para que el usuario lo copie y lo envíe a soporte y así autorizar el equipo. No valida licencia (se puede correr en un equipo no autorizado solo para obtener su código). |
| `--generate <modo> <ruta_reporte>` | Ejecuta `inicio_dian_descargas.py` en modo script (`runpy.run_path`) para generar el archivo de trabajo. Requiere equipo autorizado. Lo invoca la GUI como subproceso. |
| `--process <modo> <ruta_workbook> <total_filas>` | Ejecuta `dianDescargaEstable.py` (compras) o `dianDescargaVentas.py` (ventas) en modo script. Requiere equipo autorizado. Lo invoca la GUI como subproceso. |

`resource_path()` resuelve rutas relativas tanto en modo desarrollo (carpeta
del proyecto) como empaquetado (`sys._MEIPASS`, carpeta temporal que usa
PyInstaller al descomprimir el `.exe`).

Los modos `--generate` y `--process` existen porque, una vez empaquetado en un
solo `.exe`, ya no hay intérprete de Python externo disponible para invocar
`inicio_dian_descargas.py` o `dianDescargaEstable.py` directamente: la GUI
lanza el propio `.exe` como subproceso con esos flags (ver sección 5).

---

## 4. Licenciamiento por equipo (`core/license_lock.py`)

La app solo corre en equipos autorizados explícitamente por Gestcon. No hay
validación en línea ni servidor de licencias: todo es local.

**Mecanismo:**
1. Se lee el `MachineGuid` de Windows desde el registro
   (`HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography`). Este identificador
   es estable ante reinicios, actualizaciones y cambios de hardware; solo
   cambia si el equipo se formatea o se reinstala Windows.
2. Se calcula `SHA-256("GESTCON-GESTOR-DIAN-2026:<MachineGuid>")`, se toma en
   mayúsculas y se agrupa en 4 bloques de 4 caracteres (los primeros 16
   caracteres del hash), separados por guiones — ej. `FCF8-8ACF-38C9-64AE`.
3. Ese código se compara contra el set fijo `CODIGOS_AUTORIZADOS`, hardcodeado
   en el propio archivo fuente (12 equipos registrados actualmente, cada uno
   comentado con el nombre/placa de la persona).

**Flujo de alta de un equipo nuevo:**
1. Correr `GestorDocs.exe --id` en el equipo nuevo → se obtiene su código.
2. Agregar ese código a `CODIGOS_AUTORIZADOS` en el código fuente.
3. Re-empaquetar con PyInstaller y redistribuir el `.exe` actualizado a todos
   los equipos (no solo al nuevo).

Esto implica que autorizar un equipo adicional requiere una nueva build y
redistribución completa del ejecutable — no hay actualización incremental de
la lista de equipos sin recompilar.

Si `winreg` no está disponible (no-Windows) o la clave de registro no existe,
`obtener_machine_guid()` devuelve cadena vacía y el equipo queda como no
autorizado.

---

## 5. Interfaz gráfica (`ui/main_window.py`)

Ventana Tkinter (`MainWindow`, hereda de `tk.Tk`), 1200×790, con estilo `ttk`
tema `clam` y paleta propia (azul corporativo `#0f4c81`). Se organiza en
cuatro paneles:

### 5.1 Panel "Archivos"
- Selector de **modo**: `Compras` / `Ventas` (radio buttons, `mode_var`).
- Ruta del **Excel base DIAN** (`report_path_var`), con botón "Seleccionar"
  que abre un `filedialog` filtrado a `*.xlsx`/`*.xlsm`.
- Ruta del **archivo de trabajo** (`workbook_path_var`), de solo lectura,
  calculada automáticamente a partir del Excel base: `<nombre>_TRABAJO_COMPRAS.xlsx`
  o `<nombre>_TRABAJO_VENTAS.xlsx` según el modo elegido.

### 5.2 Panel "Flujo de trabajo" (botones de acción)
1. **"1. Generar archivo de trabajo"** → `generate_workbook()`: valida que el
   Excel base exista y lanza `--generate` como subproceso.
2. **"2. Abrir navegador"** → `open_chrome()`: lanza Chrome con el flag CDP
   (`open_chrome_cdp()`) y sondea hasta ~8 segundos (16 intentos × 500 ms) a
   que el puerto 9222 responda (`is_cdp_running()`) antes de habilitar el
   siguiente paso.
3. **"3. Iniciar descarga"** (el texto cambia a "Procesar compras"/"Procesar
   ventas" según el modo) → `process_all()`: valida que exista el archivo de
   trabajo y que el CDP esté activo, cuenta filas procesables
   (`count_processable_rows`) y, si hay al menos una, lanza `--process` como
   subproceso pasándole el total de filas como límite.
4. **"Cancelar proceso"** → pide confirmación y llama `ProcessRunner.cancel()`
   sobre el subproceso en curso (ver 5.4). El avance ya guardado en el Excel
   se conserva; solo se detiene el resto de filas pendientes.
5. **"Limpiar registro"** → vacía el widget de log en pantalla (no afecta
   archivos).

Los botones se habilitan/deshabilitan dinámicamente según el estado
(`_update_buttons_by_state`): sin Excel base → solo "Seleccionar"; sin archivo
de trabajo → solo "Generar"; sin CDP activo → "Generar" y "Abrir navegador";
todo listo → los tres pasos disponibles. Mientras hay un proceso corriendo
(`is_busy`), todos los botones de acción se bloquean excepto "Cancelar".

### 5.3 Panel "Resumen del proceso"
Cinco contadores (Total, Pendientes, Descargados, Errores, Revisión manual),
alimentados por `read_status_summary()` (`core/excel_service.py`), que lee el
archivo de trabajo y cuenta filas por valor de la columna `Estado Proceso`.
Se refresca al terminar cada acción y, mientras hay un proceso en curso, cada
2 segundos como máximo (`_last_summary_refresh`), de forma silenciosa
(`refresh_summary_safe`, que ignora errores transitorios de lectura mientras
el Excel está siendo reemplazado por el proceso en curso).

### 5.4 Panel "Registro del proceso"
`tk.Text` de solo lectura visual que muestra la salida del subproceso en vivo,
línea por línea, con colores por tipo de evento (info/success/warning/error/
muted). La traducción de líneas técnicas a mensajes legibles ocurre en
`_humanize_log_line()`: reconoce por regex patrones como `Fila N | Buscando...`,
`OK fila N: ...`, `ERROR fila N: ...`, mensajes de reintento de token, etc., y
oculta ruido (warnings de Python/Node, rutas de invocación, separadores).

### 5.5 Orquestación de subprocesos
La GUI **nunca ejecuta la lógica de descarga en el mismo proceso**: cada
acción (generar / procesar) se lanza como un subproceso independiente
(`core/worker.py`, clase `ProcessRunner`), en un hilo (`threading.Thread`)
que hace streaming de `stdout`/`stderr` combinados hacia una `Queue`, la cual
la ventana principal drena cada 250 ms (`_poll_queue`, vía `self.after`). Esto
mantiene la interfaz responsiva mientras Playwright hace su trabajo (que puede
tardar horas en reportes grandes) y permite cancelar limpiamente
(`terminate()` con `wait(timeout=5)` y `kill()` como respaldo).

El comando exacto a ejecutar lo arma `core/dian_service.py`
(`build_generate_command` / `build_process_command`): si la app corre
empaquetada (`sys.frozen`), invoca el propio `.exe` con `--generate`/
`--process`; en modo desarrollo, invoca `python <script>.py` directamente.

**Nota de inconsistencia:** `core/excel_service.py` define también
`get_workbook_path()`, que calcula el nombre del archivo de trabajo como
`<nombre>_TRABAJO_RECIBIDOS.xlsx` — un sufijo distinto al que realmente usa la
GUI (`_TRABAJO_COMPRAS.xlsx` / `_TRABAJO_VENTAS.xlsx`, calculado en
`ui/main_window.py::_build_workbook_path`). Esta función no se llama desde
ningún lugar del código actual; es código muerto que quedó de una convención
de nombres anterior y puede inducir a error si alguien la reutiliza asumiendo
que refleja el comportamiento real.

---

## 6. Generación del archivo de trabajo (`inicio_dian_descargas.py`)

Lee el reporte base exportado directamente del portal DIAN y genera el
archivo de trabajo que el proceso de descarga usará y actualizará.

**Validación de entrada:** requiere que el Excel tenga las columnas
`CUFE/CUDE`, `Grupo` y `Tipo de documento`; si falta alguna, lanza error antes
de escribir nada.

**Filtros aplicados** (`normalizar_texto` compara en mayúsculas, sin tildes):
- **Compras**: `Grupo == "RECIBIDO"`, excluye `"APPLICATION RESPONSE"`.
- **Ventas**: `Grupo == "EMITIDO"`, excluye `"APPLICATION RESPONSE"` y
  cualquier tipo de documento que contenga `"NOMINA INDIVIDUAL"`.

Si tras filtrar no queda ninguna fila, lanza `ValueError` con un mensaje
específico por modo.

**Columnas que conserva del reporte base** (solo las que existan realmente en
el archivo de entrada — si falta alguna sugerida, se omite sin error):
`CUFE/CUDE` (renombrada a `CUFE`), `Tipo de documento`, `Prefijo`, `Folio`,
`Fecha Emisión`, `Fecha Recepción`, `NIT Emisor`, `Nombre Emisor`,
`NIT Receptor`, `Total`, `Estado`, `Grupo`.

**Limpieza:** `CUFE` se recorta de espacios; filas con `CUFE` vacío se
descartan; se eliminan duplicados por `CUFE` (`drop_duplicates`).

**Columnas agregadas por la app:** `Estado Proceso` (inicial `"PENDIENTE"`),
`Link` (vacía, reservada), `Archivo` (vacía), `Observación` (vacía).

**Salida:** `<nombre_reporte>_TRABAJO_COMPRAS.xlsx` o
`<nombre_reporte>_TRABAJO_VENTAS.xlsx`, en la misma carpeta que el reporte
base. El reporte base original nunca se modifica.

---

## 7. Apertura del navegador y conexión CDP

La aplicación lanza Chrome con la bandera `--remote-debugging-port=9222`
apuntando a un perfil dedicado (`chrome_cdp_profile_unificado/`), separado del
perfil normal del usuario. El perfil reutiliza cookies y sesiones previas de
DIAN, lo que reduce los bloqueos de Cloudflare frente a un navegador
"limpio". La ruta de Chrome está fija (`C:\Program Files\Google\Chrome\
Application\chrome.exe`); si no existe en esa ruta, `open_chrome_cdp()` lanza
`FileNotFoundError`.

Los scripts de descarga (`dianDescargaEstable.py` / `dianDescargaVentas.py`)
se conectan a ese Chrome ya abierto vía Playwright
(`chromium.connect_over_cdp("http://127.0.0.1:9222")`) y reutilizan el primer
contexto/página existentes (`asegurar_pagina`), en vez de abrir uno nuevo —
así conservan la sesión y cualquier verificación de Cloudflare ya superada
manualmente por el usuario.

---

## 8. Proceso de búsqueda y descarga (bucle principal)

Compartido conceptualmente entre `dianDescargaEstable.py` (compras) y
`dianDescargaVentas.py` (ventas) — el código está duplicado entre ambos
archivos con pequeñas diferencias de timeouts y de renombrado final (ver
sección 9). Ambos exponen `procesar_y_descargar(ruta_excel, limite)`.

Para cada fila del archivo de trabajo cuyo `Estado Proceso` sea `PENDIENTE`,
`ERROR`, `REVISION_MANUAL` o `BUSCADO` (hasta el límite recibido por
argumento, que en la práctica la GUI fija al total de filas procesables):

1. **Resolución de NIT candidatos.** Se limpia (`limpiar_nit`) y arma una
   lista de NIT candidatos a partir de `NIT Emisor` y `NIT Receptor` (en ese
   orden, sin duplicados). `limpiar_nit` normaliza el valor tal como llega de
   pandas (puede ser `float`), quita todo lo que no sea dígito y descarta
   guion + dígito de verificación. Si ninguna de las dos columnas tiene NIT,
   la fila se marca `REVISION_MANUAL` de inmediato, sin intentar la búsqueda
   (ver sección 11).
2. **Navegación.** `ir_a_busqueda`: `page.goto("https://catalogo-vpfe.dian.gov.co/User/SearchDocument")`
   y espera hasta 90 s a que el campo con placeholder `"Ingrese el código CUFE o UUID"`
   esté visible.
3. **Búsqueda (`buscar_cufe`)**, por cada NIT candidato, en orden, hasta que
   uno funcione:
   - Escribe el CUFE en el campo correspondiente y presiona `Tab`. Desde
     jul-2026 la DIAN exige un segundo campo, `"Digite el NIT del emisor o
     receptor, sin puntos, comas, ni DV"`, que solo se habilita después de
     diligenciar el CUFE — si no aparece dentro de 8 s, se lanza
     `PlaywrightTimeoutError`.
   - Escribe el NIT en ese segundo campo.
   - Espera hasta 10 s a que Cloudflare resuelva el challenge automático
     (`esperar_operacion_exitosa`: detecta el texto `"Operación exitosa"` en
     el DOM —incluyendo iframes— o que algún input oculto de token de captcha
     tenga más de 20 caracteres).
   - Hace clic en el botón `"Buscar"`.
   - Si tras el clic aparece el texto `"Falta Token de validación de
     captcha"`, reintenta una vez más (espera con backoff ~3–4.2 s, reintenta
     detectar éxito, vuelve a hacer clic). Si persiste, lanza
     `CaptchaTokenError`.
   - Espera hasta 20 s a que aparezca `"Descargar PDF"` o
     `"Detalles del documento"`. Si no aparece, lanza `PlaywrightTimeoutError`.
   - Si el intento con un NIT falla por timeout (documento no encontrado con
     ese NIT), se reintenta automáticamente con el siguiente NIT candidato.
     Si falla por `CaptchaTokenError` (problema de Cloudflare, no depende del
     NIT usado), **no** se reintenta con el otro NIT: se corta de inmediato.
4. **Descarga (`descargar_pdf_desde_detalle`).** Ya en la vista de detalle:
   - Espera hasta 15 s a que Cloudflare vuelva a mostrar `"Operación
     exitosa"` o deje el token listo; si aparece, espera 2 s adicionales. Si
     no aparece nada en 15 s, lanza `CaptchaTokenError`.
   - Hace un único clic sobre el enlace `"Descargar PDF"`, capturando el
     evento de descarga con `page.expect_download()` (timeout 13 s en
     compras, 8 s en ventas).
   - En el mismo instante del clic, cierra automáticamente el **modal propio
     del sitio** que advierte que el PDF quedará con contraseña (botón
     "Aceptar" — ver sección 9); sin este cierre, la descarga se queda
     esperando indefinidamente.
   - Guarda el archivo descargado en disco con reintentos
     (`_guardar_descarga_con_reintentos`, hasta 6 intentos con espera
     creciente) por si el destino está bloqueado momentáneamente (antivirus,
     indexado, sincronización de unidad de red).
5. **Quitar la contraseña del PDF** (sección 9) usando el mismo NIT que
   funcionó en la búsqueda.
6. **Renombrado del PDF** según la lógica de cada modo (sección 10).
7. **Actualización del Excel.** Tras cada fila (éxito o error) se actualiza
   `Estado Proceso`, `Archivo` y `Observación`, y se guarda el Excel de
   inmediato de forma atómica y con reintentos (sección 12) — no se espera a
   terminar todo el lote para persistir el avance.

El bucle es **secuencial**: una fila a la vez, sin paralelismo ni pestañas
simultáneas.

---

## 9. Manejo de la contraseña del PDF (PyMuPDF / `fitz`)

Desde mediados de 2026 la DIAN empezó a entregar los PDF descargados
protegidos con una **contraseña de apertura igual al NIT** (emisor o
receptor, el mismo que se usó para la búsqueda), y agregó un **modal propio
de la página** (HTML del sitio, no un diálogo nativo del navegador)
advirtiendo esto antes de completar la descarga.

**Cierre del modal (`_cerrar_modal_password_si_aparece`):** intenta hacer
clic en un botón con texto "Aceptar" (por rol accesible primero, por texto
exacto como respaldo) con un timeout corto (5 s); si no aparece ningún modal,
continúa sin error — es tolerante a que DIAN deje de mostrarlo.

**Diálogos nativos del navegador (solo en `dianDescargaEstable.py`):**
adicionalmente se registra un manejador `page.on("dialog", ...)` que acepta
automáticamente cualquier alerta nativa real del navegador, como red de
seguridad extra por si en algún punto aparece una en vez del modal HTML.
`dianDescargaVentas.py` no registra este manejador.

**Quitar la contraseña (`quitar_password_pdf`):**
1. Abre el PDF descargado con PyMuPDF (`fitz.open`).
2. Si el documento requiere contraseña (`doc.needs_pass`) y el NIT usado no
   lo desbloquea (`doc.authenticate(password)` falla), lanza `ValueError`.
3. Si se desbloquea, lo vuelve a guardar sin cifrado
   (`fitz.PDF_ENCRYPT_NONE`) en un archivo temporal (`..._tmp_sinpass.pdf`).
4. Reemplaza el PDF original por esa versión sin contraseña
   (`_reemplazar_con_reintentos`, hasta 6 intentos con espera creciente ante
   `PermissionError` — mismo patrón que el guardado del Excel).

**Si la limpieza de contraseña falla por completo** (no desbloquea, o no se
puede reemplazar tras los reintentos): el PDF queda descargado igual (el
proceso no se detiene) y se registra en `Observación` un aviso de que quedó
con contraseña. Si además quedó un archivo temporal suelto tras un fallo de
reemplazo (`_marcar_duplicado_si_quedo`):
- Primero intenta borrarlo silenciosamente.
- Si tampoco se puede borrar, lo renombra a
  `DUPLICADO_REVISAR_<nombre_del_pdf>.pdf` para que sea imposible confundirlo
  con el documento real, y dicho nombre queda explícito en `Observación`.

Este subsistema es idéntico (código duplicado) en `dianDescargaEstable.py` y
`dianDescargaVentas.py`, salvo que en ventas la extracción del nombre final
del PDF ocurre **después** de quitar la contraseña, porque necesita leer el
texto del PDF ya descifrado (ver sección 10).

---

## 10. Renombrado del PDF (lógica diferenciada por modo)

**Compras (`construir_nombre_pdf`):** el nombre se arma directamente desde
los campos del Excel de trabajo, sin leer el contenido del PDF:

```
<DD MM> [<prefijo tipo documento>] <Nombre Emisor>
```

Ejemplo: `15 03 NC Empresa ABC Ltda.pdf`

- `fecha_dd_mm` parsea `Fecha Emisión` con `pandas.to_datetime` (día
  primero); si falla, intenta patrones `YYYY-MM-DD`, `DD/MM/YYYY` o
  `DD-MM-YYYY` por regex; si nada funciona, usa `"sin_fecha"`.
- `prefijo_tipo_documento` deriva el prefijo a partir del texto de
  `Tipo de documento` (normalizado a mayúsculas):
  - `NC` → "Nota de Crédito Electrónica"
  - `DSE` → "Documento Equivalente - Servicios Públicos Domiciliarios" o
    "Documento Soporte" + "No obligados"
  - `NA DSE` → "Nota de Ajuste" + Crédito + "Documento Equivalente"
  - Sin prefijo para facturas ordinarias u otros tipos no reconocidos.
- El nombre final pasa por `sanitize_filename` (quita caracteres inválidos de
  Windows, colapsa espacios, recorta a 180 caracteres).
- Si el nombre ya existe en la carpeta destino, `unique_path` agrega un
  sufijo numérico `" (2)"`, `" (3)"`, etc.

**Ventas (`extraer_nombre_desde_pdf`):** el PDF se descarga primero con un
nombre **temporal** (`_tmp_<fila>_<timestamp_ms>.pdf`), se le quita la
contraseña, y luego se abre con `pypdf.PdfReader` para extraer el texto de
las primeras 3 páginas. Sobre ese texto (normalizado: sin tildes, sin dobles
espacios, mayúsculas) se buscan, en este orden de prioridad, los patrones:

1. `NUMERO DE FACTURA: <valor>`
2. `NUMERO DE NOTA: <valor>`
3. `NUMERO DE DOCUMENTO: <valor>`

El primer patrón que haga match define el nombre final (tras
`sanitize_filename`). Si ninguno aparece en el texto extraído, se usa como
respaldo `<Prefijo>-<Folio>` del Excel (`construir_nombre_pdf_respaldo`), o si
tampoco hay esos datos, `VENTA_<primeros 12 caracteres del CUFE>`, o en
último caso `VENTA_SIN_NOMBRE`. El archivo temporal se renombra/mueve
(`os.replace`) al nombre final calculado.

---

## 11. Estructura del Excel de trabajo

El archivo de trabajo es el Excel que la app genera (sección 6) y mantiene
actualizado durante la descarga. Solo se incluyen las columnas de origen que
realmente existan en el reporte base de DIAN; si una columna sugerida no está
en el reporte, se omite.

| # | Columna | Tipo | Origen y uso |
|---|---|---|---|
| 1 | `CUFE` | Texto | De `CUFE/CUDE` del reporte DIAN, renombrada. Identificador único del documento. Limpio de espacios; duplicados descartados. |
| 2 | `Tipo de documento` | Texto | Del reporte DIAN. Ej.: "Factura Electrónica de Venta", "Nota de Crédito Electrónica", "Documento Soporte en Adquisiciones". Deriva el prefijo del nombre del PDF en compras. |
| 3 | `Prefijo` | Texto | Del reporte DIAN. Parte alfanumérica del número de documento (ej. "FE", "NC"). Usado como respaldo de nombre en ventas. |
| 4 | `Folio` | Texto/número | Del reporte DIAN. Correlativo dentro del prefijo. Usado como respaldo de nombre en ventas. |
| 5 | `Fecha Emisión` | Fecha | Del reporte DIAN. Usada para construir el nombre del PDF en compras (día/mes). |
| 6 | `Fecha Recepción` | Fecha | Del reporte DIAN. Solo informativa. |
| 7 | `NIT Emisor` | Texto | Del reporte DIAN. Primer candidato de NIT para la búsqueda y para desbloquear el PDF. |
| 8 | `Nombre Emisor` | Texto | Del reporte DIAN. Usado para construir el nombre del PDF en compras. |
| 9 | `NIT Receptor` | Texto | Del reporte DIAN (agregada desde v3.0). Segundo candidato de NIT si falla el emisor. |
| 10 | `Total` | Número | Del reporte DIAN. Solo informativa. |
| 11 | `Estado` | Texto | Del reporte DIAN. Estado del documento en DIAN (ej. "Aceptado"). Solo informativa. |
| 12 | `Grupo` | Texto | Del reporte DIAN. Siempre `"Recibido"` en compras y `"Emitido"` en ventas, dado el filtro previo. |
| 13 | `Estado Proceso` | Texto | Agregada por la app. Inicial `"PENDIENTE"`. Valores posibles: `DESCARGADO`, `ERROR`, `REVISION_MANUAL`. Solo se procesan filas `PENDIENTE`, `ERROR`, `REVISION_MANUAL` o `BUSCADO`. |
| 14 | `Link` | Texto | Agregada por la app. Inicializada vacía. **Campo reservado, no se actualiza en ningún punto del proceso actual.** |
| 15 | `Archivo` | Texto | Agregada por la app. Nombre del PDF descargado (sin ruta). Vacío si hubo error. |
| 16 | `Observación` | Texto | Agregada por la app. Mensaje de error/aviso (tipo de excepción, avisos de contraseña no removida, duplicado, etc.). Se limpia al descargar con éxito y sin avisos. |

---

## 12. Guardado seguro del Excel

Tras cada fila procesada (éxito o error), el Excel se guarda de inmediato con
`guardar_excel_seguro`: escribe primero en un archivo temporal
(`<nombre>_tmp_guardado.xlsx`) y lo reemplaza atómicamente sobre el destino
(`os.replace`). Si el archivo destino está bloqueado (Excel abierto,
antivirus, sincronización de red), reintenta hasta 6 veces con espera lineal
creciente (1.5 s, 3 s, 4.5 s, 6 s, 6 s, 6 s) antes de propagar el error.

---

## 13. Detalle técnico del request a DIAN

El sistema no usa ninguna API REST directa de DIAN. Toda la interacción es
automatización de navegador real (Playwright); es Chrome quien genera las
peticiones, no el script.

- **Mecanismo:** `playwright.sync_api`, conectado a Chrome vía
  `chromium.connect_over_cdp("http://127.0.0.1:9222")`.
- **URL de búsqueda:** `https://catalogo-vpfe.dian.gov.co/User/SearchDocument`.
- **Método de envío:** interacción de formulario HTML — Playwright llena los
  campos (CUFE, luego NIT) y hace clic en "Buscar"; el navegador maneja
  internamente el submit (POST) con el CUFE, el NIT y el token de Cloudflare.
- **Lo que se envía:** el CUFE, el NIT (emisor o receptor) y el token de
  validación resuelto automáticamente por Cloudflare (`cf-turnstile-response`,
  `g-recaptcha-response` o `h-captcha-response`, según el proveedor vigente).
- **Formato de respuesta:** HTML. Playwright inspecciona el DOM buscando
  `"Descargar PDF"` o `"Detalles del documento"`; no se parsea JSON/XML.
- **Descarga del PDF:** el enlace "Descargar PDF" dispara una descarga
  binaria directa, capturada con `page.expect_download()`.
- **Detección del token de Cloudflare:** el código sondea cada ~180 ms el DOM
  de la página y de todos sus iframes buscando el texto `"Operación exitosa"`
  (normalizado, sin tildes ni mayúsculas) o un input de token de captcha con
  más de 20 caracteres de valor.

---

## 14. Manejo de errores — resumen por causa

| Causa | Condición | Resultado en Excel |
|---|---|---|
| Sin NIT disponible | Ni `NIT Emisor` ni `NIT Receptor` tienen valor | `REVISION_MANUAL` — "Falta NIT Emisor y NIT Receptor..." (no se intenta buscar) |
| Token no listo al buscar | Tras reintentos, sigue apareciendo "Falta Token de validación de captcha" | `REVISION_MANUAL` — "Token no listo: Falta token al buscar tras reintentos." |
| Cloudflare no valida antes de descargar | 15 s sin "Operación exitosa" ni token listo en la vista de detalle | `REVISION_MANUAL` — "Token no listo: Cloudflare no mostró 'Operación exitosa'..." |
| Timeout de resultado | Tras clic en Buscar, no aparece "Descargar PDF"/"Detalles del documento" en 20 s (o el formulario no carga en 90 s) | `REVISION_MANUAL` — "Timeout: ..." (reintenta con el otro NIT si queda candidato) |
| Contraseña no removida | El NIT no desbloquea el PDF, o falla el reemplazo tras reintentos | El PDF queda descargado (con o sin contraseña); `Observación` avisa explícitamente; posible archivo `DUPLICADO_REVISAR_*` |
| Excel bloqueado al guardar | El archivo de trabajo está abierto por otro proceso | Reintentos con backoff; si los 6 fallan, `PermissionError` se propaga (la fila puede quedar sin persistir en disco, aunque sí en memoria hasta la siguiente iteración) |
| Error inesperado | Cualquier excepción no contemplada (red, cierre de Chrome, fallo de disco) | `ERROR` — `"<TipoExcepción>: <mensaje>"` |
| Reporte base inválido | No existe, o le faltan columnas `CUFE/CUDE`, `Grupo` o `Tipo de documento` | Error inmediato antes de generar nada; no se modifica ningún archivo |
| Sin filas pendientes | Todas las filas ya están `DESCARGADO` o sin CUFE | La GUI muestra "No hay filas pendientes por procesar" y no lanza el proceso |
| Equipo no autorizado | El `MachineGuid` no está en `CODIGOS_AUTORIZADOS` | La app no abre; muestra "Equipo no autorizado" y sale con código 1 |

---

## 15. Empaquetado (PyInstaller)

`GestorDocs.spec` define el build de un único ejecutable de carpeta
(`COLLECT`), sin consola (`console=False`), con ícono `GestorDocs.ico`:

- **Entry point:** `app.py`.
- **Datos incluidos explícitamente:** `inicio_dian_descargas.py`,
  `dianDescargaEstable.py`, `dianDescargaVentas.py`, `GestorDocs.ico` — se
  empaquetan como archivos de datos porque `app.py` los ejecuta con
  `runpy.run_path` en modo `--generate`/`--process`, no como módulos
  importados normalmente.
- **`hiddenimports`:** `playwright.sync_api`, `pypdf`, `fitz` (necesarios
  porque PyInstaller no siempre detecta automáticamente estos imports
  dinámicos/nativos).
- **`collect_all`** se ejecuta sobre `playwright` y `fitz` para arrastrar sus
  binarios y datos internos (drivers, DLLs de PyMuPDF).

Comando de build: `pyinstaller GestorDocs.spec` → genera `dist/GestorDocs/`
(o `dist/GestorDocs.exe` según configuración de distribución) junto con el
perfil de Chrome y demás recursos necesarios en tiempo de ejecución.

---

## 16. Dependencias

| Librería | Versión | Uso |
|---|---|---|
| Python | 3.x (stdlib) | Base. Usa `pathlib`, `sys`, `re`, `time`, `os`, `unicodedata`, `socket`, `subprocess`, `threading`, `tkinter`, `hashlib`, `winreg`, `runpy`. |
| pandas | 3.0.1 | Lectura/escritura de Excel, filtrado de filas, actualización de estados. |
| openpyxl | 3.1.5 | Motor de lectura/escritura `.xlsx`, backend de pandas. |
| playwright | 1.58.0 | Automatización de navegador (API síncrona). Controla Chrome vía CDP. |
| pypdf | 6.9.1 | Solo en ventas. Extrae texto de las primeras 3 páginas del PDF para determinar el nombre del archivo. |
| PyMuPDF (`fitz`) | — | Abre los PDF protegidos con contraseña (NIT) y los vuelve a guardar sin cifrado. Usado en compras y ventas. |
| PyInstaller | (build) | Empaquetado del ejecutable `GestorDocs.exe`. No es dependencia en runtime. |

---

## 17. Limitaciones conocidas

- **No hay API REST.** Todo depende de que `catalogo-vpfe.dian.gov.co`
  mantenga la misma estructura HTML (texto del botón "Buscar", placeholders
  de los campos, texto del enlace "Descargar PDF", texto del modal de
  contraseña). Un cambio de la DIAN puede romper el proceso sin previo aviso
  (ya ha pasado tres veces en 2026: campo de NIT, contraseña de PDF, modal de
  aviso).
- **Un documento a la vez.** El bucle es secuencial, sin paralelismo.
- **Requiere Chrome abierto manualmente vía el botón "Abrir navegador".** Si
  Chrome se cierra durante el proceso, las filas restantes quedan en `ERROR`
  o `REVISION_MANUAL`.
- **Sin manejo de sesión expirada.** Si DIAN requiere relogin, el proceso
  falla sin instrucciones claras al usuario.
- **Sin filtro por rango de fechas.** Se procesan todas las filas pendientes
  del archivo de trabajo; el filtrado por periodo lo hace el usuario al
  exportar el reporte desde DIAN.
- **Columna `Link` sin implementar.** Se inicializa en blanco y ninguna parte
  del código la actualiza.
- **`core/compras_service.py` y `core/ventas_service.py` están vacíos.** Son
  placeholders sin lógica; no forman parte del flujo real (que vive en los
  scripts de nivel raíz `dianDescargaEstable.py`/`dianDescargaVentas.py`).
- **`core/excel_service.py::get_workbook_path` es código muerto e
  inconsistente** con la convención de nombres real (ver sección 5.5).
- **Lógica de compras y ventas está duplicada casi por completo** entre
  `dianDescargaEstable.py` y `dianDescargaVentas.py` (búsqueda, manejo de
  Cloudflare, manejo de contraseña, guardado). No hay un módulo común; cada
  corrección de bug (ej. el modal de contraseña, sección 9) se ha tenido que
  replicar manualmente en ambos archivos, y ha habido casos donde un fix se
  aplicó solo a uno de los dos (ver v4.2 en `CHANGELOG.md`).
- **Extracción de nombre en ventas es frágil.** Depende de que el texto del
  PDF contenga literalmente "NUMERO DE FACTURA", "NUMERO DE NOTA" o "NUMERO
  DE DOCUMENTO" en mayúsculas sin tildes tras normalización Unicode. Si el
  formato del PDF cambia, cae al respaldo `Prefijo-Folio`.
- **No hay reintento automático diferido de `REVISION_MANUAL`.** Se puede
  reprocesar iniciando el proceso de nuevo, pero no hay una cola de reintento
  con espera.
- **No detecta si el CUFE no existe en DIAN.** Si el portal responde sin
  "Descargar PDF" porque el documento no existe, la fila queda en
  `REVISION_MANUAL` por timeout, sin mensaje diferenciado de "no encontrado".
- **La resolución de Cloudflare es pasiva.** El código solo detecta si
  Cloudflare ya resolvió el challenge automáticamente; no puede resolverlo
  activamente. Si aparece un challenge interactivo, el proceso queda
  bloqueado hasta el timeout.
- **Licenciamiento es 100% local y offline.** La lista de equipos autorizados
  vive hardcodeada en el código fuente; agregar un equipo exige recompilar y
  redistribuir el `.exe` completo a todos los usuarios, no solo al nuevo.
- **La contraseña del PDF es el NIT en texto plano usado en la búsqueda.**
  Si el NIT emisor y el receptor son distintos y ninguno de los dos coincide
  con la contraseña real esperada por DIAN, `quitar_password_pdf` falla y el
  PDF queda protegido (el usuario final tendría que abrirlo manualmente con
  el NIT correcto).

---

## 18. Historial de versiones

Ver `CHANGELOG.md` para el detalle completo versión por versión (4.2, 4.1,
4.0, 3.0, 2.0). En resumen, la evolución del portal DIAN durante 2026 obligó a
tres endurecimientos sucesivos del flujo de búsqueda/descarga: exigencia de
NIT emisor/receptor (v3.0), contraseña en los PDF + modal de aviso (v4.0),
endurecimiento de reintentos ante bloqueos de archivo en unidades de red
(v4.1), y réplica de esos fixes al flujo de ventas que se había quedado
desactualizado (v4.2). La aplicación se llamó "Gestor DIAN" hasta la v4.1 y se
renombró a "GestorDocs" para no usar el nombre de la entidad en el nombre del
producto.
