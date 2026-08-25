# Arquitectura — Exógena 1005 (Cargador TOKEN → SIIGO)

Documento de contexto técnico para asistir a Claude (u otro LLM/dev) a entender rápidamente esta aplicación sin tener que releer todo el código fuente.

## 1. Qué es y para qué sirve

Aplicación de escritorio (GUI local, sin servidor, sin internet) que automatiza el llenado del **Formato 1005 de Información Exógena de la DIAN** (Colombia) — el reporte de IVA descontable por proveedor.

Toma un archivo de detalle de compras ("TOKEN"), agrupa y suma el IVA por tercero (proveedor), calcula los campos que exige la DIAN (tipo de documento, dígito de verificación) y escribe el resultado directamente dentro de una plantilla Excel de SIIGO que ya trae el formato oficial 1005, sin alterar el resto del archivo.

No hay backend, no hay base de datos, no hay red: todo corre localmente contra dos archivos `.xlsx` que el usuario selecciona.

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Lenguaje | Python 3.12 |
| GUI | `tkinter` + `ttk` (nativo, sin dependencias externas de UI) |
| Lectura/escritura Excel | `openpyxl` (única dependencia de terceros) |
| Precisión numérica | `decimal.Decimal` (nunca `float` para sumas de dinero, salvo al escribir el valor final en la celda) |
| Persistencia | Ninguna (no hay config, no hay DB; el estado vive solo en memoria mientras la ventana está abierta) |

Comando para ejecutar:
```
python exogena_1005_app.py
```
Requiere `pip install openpyxl` (tkinter viene con la instalación estándar de Python en Windows).

## 3. Ubicación de archivos

```
C:\AUTOMATIZACION\EXOGENA\1005\
├── exogena_1005_app.py          # todo el código (lógica + UI en un solo archivo)
├── TOKEN 2025 PRUEBA.xlsx       # archivo de entrada de ejemplo (detalle de compras)
└── EXOGENA 2025 SB PRUEBA.xlsx  # plantilla de entrada de ejemplo (formato SIIGO)
```

El script es monolítico: un solo archivo `.py` de ~546 líneas dividido en dos bloques claramente separados por comentarios:
- **Lógica de negocio** (líneas 1–283): funciones puras + clase `Exogena1005Processor`, sin ninguna dependencia de tkinter. Podría reutilizarse desde un script CLI o tests sin tocar la UI.
- **Interfaz Tkinter** (líneas 286–546): clase `Exogena1005App(tk.Tk)`, que solo orquesta llamadas al processor y pinta resultados.

No hay tests automatizados, ni `requirements.txt`, ni control de versiones (`git init` no se ha corrido en `C:\AUTOMATIZACION\EXOGENA`).

## 4. Modelo de datos

```python
@dataclass
class Registro1005:
    tipo_documento: int       # 31 = jurídica, 13 = cédula (natural)
    identificacion: str       # NIT/cédula, solo dígitos
    digito_verificacion: int  # DV calculado (módulo 11 DIAN)
    razon_social: str         # nombre del tercero
    vimp: Decimal             # IVA descontable acumulado del año, 2 decimales
```

Cada instancia representa **un tercero ya agrupado** (no una factura individual) — es la unidad que finalmente se escribe como una fila en la hoja `1005` de salida.

## 5. Constantes de negocio

- `PESOS_DV = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3]`
  Pesos oficiales del algoritmo módulo 11 de la DIAN para calcular el dígito de verificación del NIT.

- `EMPRESA_KEYWORDS`
  Lista de ~35 palabras/siglas (`SAS`, `LTDA`, `SA`, `CIA`, `E.S.P`, `IPS`, `DIAN`, `UNIVERSIDAD`, etc.) usada para inferir por el **nombre del tercero** si es persona jurídica.

## 6. Clase `Exogena1005Processor`

Constructor:
```python
Exogena1005Processor(incluir_notas_credito: bool = False, solo_grupo_recibido: bool = True)
```
Ambos flags son configurables desde la UI (checkboxes) y controlan el filtrado descrito abajo.

### 6.1 Utilidades de normalización de texto/números
- `quitar_acentos(texto)` — normaliza Unicode NFD y elimina marcas diacríticas.
- `normalizar_texto(texto)` — sin acentos, mayúsculas, espacios colapsados. Usada para comparar nombres, tipos de documento y encabezados de columna de forma tolerante a variaciones de formato.
- `limpiar_identificacion(valor)` — deja solo dígitos (`re.sub(r"\D", "", ...)`), quita puntos, guiones, DV pegado, etc.
- `a_decimal(valor)` — convierte celdas de Excel a `Decimal` de forma segura; si falla el parseo devuelve `Decimal("0")` en vez de lanzar excepción (tolerante a celdas vacías o con formato raro).

### 6.2 `calcular_dv(numero: str) -> int`
Implementa el algoritmo oficial DIAN módulo 11:
1. Limpia el número a solo dígitos.
2. Si tiene más de 15 dígitos, toma los últimos 15 (`PESOS_DV` tiene 15 posiciones).
3. Rellena con ceros a la izquierda (`zfill`) hasta 15.
4. Multiplica cada dígito por su peso correspondiente y suma.
5. `residuo = total % 11`.
6. Si `residuo` es 0 o 1, el DV es el mismo residuo; si no, `DV = 11 - residuo`.

### 6.3 `es_nota_credito(tipo_documento_excel) -> bool`
Compara el texto normalizado del campo `Tipo de documento` del TOKEN contra las frases `"NOTA DE CREDITO"`, `"NOTA CREDITO"`, `"NOTA DE AJUSTE CREDITO"`.

### 6.4 `inferir_tipo_documento(identificacion, nombre) -> int`
El archivo TOKEN **no trae una columna explícita** de tipo de identificación (NIT vs. cédula), así que se infiere:
1. Se normaliza el nombre y se busca cualquier palabra de `EMPRESA_KEYWORDS` como token completo (con bordes de espacio) → si hay match, `31` (jurídica).
2. Si no hay match por nombre, heurística de respaldo sobre el número: si la identificación tiene **9+ dígitos** y **empieza en 8 o 9** → `31`.
3. En cualquier otro caso → `13` (persona natural / cédula).

Este es el punto más "adivinado" de todo el flujo — no hay fuente de verdad explícita en el TOKEN para esto, así que puede haber falsos positivos/negativos en casos límite (p. ej. una cédula que empiece en 9 con 9 dígitos, o una empresa cuyo nombre no contenga ninguna palabra clave conocida).

### 6.5 `leer_token_y_agrupar(token_path: str) -> List[Registro1005]`
Pipeline principal de lectura:
1. Abre el `.xlsx` con `openpyxl.load_workbook(data_only=True)` (lee valores calculados, no fórmulas).
2. Exige que exista una hoja llamada exactamente **`COMPRAS`**; si no, lanza `ValueError`.
3. Lee la fila 1 como encabezados (mapeo texto→índice de columna).
4. Exige que existan las columnas: `Tipo de documento`, `NIT Emisor`, `Nombre Emisor`, `IVA`, `Grupo`. Si falta alguna, lanza `ValueError` con el detalle de cuáles.
5. Recorre fila por fila desde la fila 2 hasta `ws.max_row`:
   - Si `solo_grupo_recibido=True` (default), descarta filas donde `Grupo` ≠ `"RECIBIDO"` (comparación insensible a mayúsculas/espacios).
   - Si `incluir_notas_credito=False` (default), descarta filas cuyo `Tipo de documento` sea nota crédito.
   - Limpia identificación y nombre; descarta la fila si falta cualquiera de los dos.
   - Convierte IVA a `Decimal`; descarta la fila si el IVA es `0`.
   - Infiere `tipo_documento` (31/13).
   - **Agrupa** por clave `(tipo_documento, identificacion)` en un diccionario acumulador, sumando el IVA de todas las filas que compartan esa clave.
   - Si el mismo tercero aparece con variantes de nombre (p. ej. razón social truncada en una factura), conserva la variante **más larga** como razón social final (para no perder información).
6. Convierte el acumulador a una lista de `Registro1005`, calculando el DV y redondeando el IVA a 2 decimales con `ROUND_HALF_UP`.
7. Ordena la lista por `(nombre normalizado, identificación)`.

### 6.6 `encontrar_fila_y_columnas_1005(ws) -> (fila_header+1, columnas)`
En vez de asumir una posición fija, **busca dinámicamente** dentro de las primeras 40 filas de la hoja `1005` de la plantilla SIIGO la fila que contenga, en algún orden, los 5 encabezados objetivo (normalizados):
`TIPO DE DOCUMENTO`, `NUMERO DE IDENTIFICACION`, `DIGITO DE VERIFICACION`, `RAZON SOCIAL DEL INFORMADO`, `IMPUESTO DESCONTABLE`.

Esto hace la app resiliente a que SIIGO cambie ligeramente el layout de fila/columna del formato de un año a otro, siempre que los textos de encabezado se mantengan. Si no encuentra la fila, o si falta alguna columna, lanza `ValueError`.

### 6.7 `copiar_estilo_fila(ws, fila_modelo, fila_destino)`
Copia estilo completo (`_style`, `number_format`, `font`, `fill`, `border`, `alignment`, `protection`, alto de fila) de una fila modelo a una fila destino usando `copy.copy` sobre los objetos de estilo de `openpyxl`. Se usa para que las filas nuevas que la app agrega tengan el mismo formato visual que las filas ya existentes del formato oficial.

### 6.8 `llenar_formato_1005(plantilla_path, output_path, registros)`
1. Carga la plantilla SIIGO completa (con estilos, sin `data_only`, para no perder fórmulas de otras hojas).
2. Exige hoja `1005`.
3. Localiza fila de inicio y columnas con `encontrar_fila_y_columnas_1005`.
4. **Limpia** (pone en `None`) las 5 columnas objetivo desde la fila de inicio hasta `max(max_row, fila_inicio + len(registros) + 50)`, para borrar datos de una corrida anterior sin tocar el resto del archivo.
5. Para cada fila que se necesite escribir: si la fila está más allá del `max_row` original, o si existe pero no tiene estilo, copia el estilo de la fila modelo (la primera fila de datos).
6. Escribe los 5 campos de cada `Registro1005` en su fila correspondiente (`identificacion` se castea a `int`, `vimp` a `float` solo en este punto final de escritura).
7. Crea el directorio de salida si no existe y guarda con `wb.save(output_path)` — **nunca sobrescribe el archivo de entrada**, siempre es un archivo nuevo elegido por el usuario.

## 7. Formatos de archivo esperados (contratos de entrada/salida)

### 7.1 TOKEN (entrada, detalle de compras)
- Debe ser `.xlsx`.
- Hoja obligatoria: `COMPRAS`.
- Fila 1 = encabezados, deben incluir (nombre exacto, sin normalizar): `Tipo de documento`, `NIT Emisor`, `Nombre Emisor`, `IVA`, `Grupo`.
- No requiere tipo de identificación explícito (se infiere).
- `Grupo` se usa para filtrar solo compras recibidas (`RECIBIDO`).

### 7.2 Plantilla SIIGO (entrada/salida, formato 1005 oficial)
- Debe ser `.xlsx`.
- Hoja obligatoria: `1005`.
- En algún punto de las primeras 40 filas debe existir una fila de encabezados que contenga, como substring normalizado, las 5 frases: `TIPO DE DOCUMENTO`, `NUMERO DE IDENTIFICACION`, `DIGITO DE VERIFICACION`, `RAZON SOCIAL DEL INFORMADO`, `IMPUESTO DESCONTABLE`.
- La app solo escribe en esas 5 columnas; todo lo demás del archivo (otras hojas, otras columnas, fórmulas, formato) se preserva intacto.

### 7.3 Archivo de salida
- Copia completa de la plantilla SIIGO con las 5 columnas del 1005 llenas con los terceros agrupados, ordenados alfabéticamente por razón social.
- Nombre sugerido automáticamente por la UI: `<nombre plantilla> - 1005 GENERADO.xlsx` en la misma carpeta que la plantilla.

## 8. Interfaz gráfica (`Exogena1005App`)

Ventana Tkinter (`1120x760`, mínimo `1000x650`), tema `ttk` `"clam"`. Estructura de arriba hacia abajo:

1. **Header** — título y descripción de una línea.
2. **Sección "Archivos"** — 3 filas (TOKEN Excel / Plantilla SIIGO / Guardar como), cada una con `Entry` + botón "Buscar" (`filedialog.askopenfilename` / `asksaveasfilename`).
3. **Sección "Opciones de cálculo"** — 2 checkboxes:
   - "Usar solo registros con Grupo = Recibido" (default: activado).
   - "Incluir notas crédito en VIMP" (default: desactivado).
4. **Acciones** — 3 botones:
   - **Analizar y previsualizar** → corre `leer_token_y_agrupar`, llena la tabla de vista previa y el resumen (Terceros / Total IVA), sin tocar ningún archivo de salida.
   - **Generar Excel 1005** → si no se ha analizado antes, analiza primero; luego corre `llenar_formato_1005` y muestra un `messagebox` de éxito.
   - **Limpiar** → resetea todos los campos, tabla, log y opciones a su estado inicial.
5. **Resumen** — label con conteo de terceros y suma total de IVA.
6. **Vista previa** — `ttk.Treeview` con columnas `TDOC | Identificación | DV | Razón social | VIMP`, con scroll vertical y horizontal.
7. **Bitácora** — `tk.Text` de solo lectura (se habilita/deshabilita para escribir) que va logueando cada paso y errores.

### 8.1 Autocarga de ejemplos
Al iniciar, `_autocargar_ejemplos_si_existen()` busca en la misma carpeta del script archivos llamados **exactamente** `TOKEN 2025.xlsx` y `EXOGENA 2025 SB.xlsx` (sin "PRUEBA" en el nombre). Si existen, precarga las rutas y sugiere la salida. Los archivos de ejemplo actuales en el repo se llaman `TOKEN 2025 PRUEBA.xlsx` y `EXOGENA 2025 SB PRUEBA.xlsx`, por lo que **no se autocargan** — hay que seleccionarlos manualmente con "Buscar".

### 8.2 Manejo de errores en UI
Todas las acciones (`analizar`, `generar_excel`) están envueltas en `try/except Exception` genérico: muestran un `messagebox.showerror` con el mensaje de la excepción y lo registran en la bitácora. Las excepciones de negocio son casi siempre `ValueError` con mensajes en español ya pensados para mostrarse directamente al usuario final (ver validaciones de hojas/columnas faltantes en las secciones 6.5–6.6).

## 9. Flujo end-to-end (resumen)

```
Usuario                         App (Exogena1005App)              Processor (lógica pura)
   │                                    │                                  │
   ├─ Selecciona TOKEN.xlsx ──────────►│                                  │
   ├─ Selecciona plantilla SIIGO ─────►│──(sugiere ruta salida)           │
   ├─ Ajusta checkboxes ──────────────►│                                  │
   ├─ Click "Analizar" ───────────────►│── leer_token_y_agrupar() ──────►│
   │                                    │                        filtra, agrupa,
   │                                    │                        infiere tipo doc,
   │                                    │                        calcula DV
   │                                    │◄── List[Registro1005] ──────────┤
   │◄─ Tabla + resumen actualizados ───┤                                  │
   ├─ Click "Generar Excel 1005" ─────►│── llenar_formato_1005() ───────►│
   │                                    │                        ubica hoja 1005,
   │                                    │                        limpia y escribe
   │                                    │                        columnas objetivo
   │◄─ messagebox "Proceso terminado" ─┤                                  │
   │◄─ Archivo .xlsx generado en disco ┤                                  │
```

## 10. Supuestos y limitaciones conocidas

- El tipo de documento (31/13) es **inferido**, no viene del dato fuente — es la fuente más probable de error si un tercero tiene nombre ambiguo o un rango de NIT atípico.
- No valida duplicados de tercero con NIT mal digitado en distintas variantes (dos NITs distintos que en realidad son el mismo proveedor con un typo no se detectan ni se fusionan).
- No maneja hojas `COMPRAS` o `1005` con nombres ligeramente distintos (case-sensitive exacto en `wb.sheetnames`) — un espacio extra o mayúscula distinta rompe la detección de hoja (aunque los encabezados de columna sí se comparan de forma normalizada).
- Redondeo de IVA a 2 decimales usa `ROUND_HALF_UP`, consistente con la convención contable esperada por la DIAN, pero difiere del redondeo bancario (`ROUND_HALF_EVEN`) si en algún momento se compara contra otro sistema.
- No hay manejo de archivos `.xls` (formato antiguo de Excel), solo `.xlsx`.
- No hay tests automatizados ni control de versiones en el directorio del proyecto.
- Aplicación single-file: toda la lógica y la UI viven en `exogena_1005_app.py`; no hay separación en módulos/paquetes.
