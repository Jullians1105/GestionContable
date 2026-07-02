# Módulo Contabilidad DIAN

## Idea general

El módulo DIAN permite a un usuario tomar el reporte Excel que exporta el portal de la DIAN (facturas electrónicas emitidas y recibidas de un período) y, a partir de él, generar automáticamente un **Estado de Resultados contable** listo para presentar al contador o para archivo interno.

El flujo elimina el trabajo manual de clasificar cada factura, calcular retenciones, cuadrar el IVA y estimar el costo de nómina: el usuario sube un archivo, clasifica las compras en dos clics y descarga un Excel profesional de cinco hojas.

---

## Flujo de usuario (4 pasos)

```
[Paso 1] Subir reporte DIAN (.xlsx)
         ↓
[Paso 2] Clasificar retenciones de compras recibidas
         ↓
[Paso 3] (Opcional) Ingresar datos de nómina
         ↓
[Paso 4] Revisar resumen → Descargar Excel contable
```

---

## Arquitectura

### Frontend — páginas

| Página | Ruta | Responsabilidad |
|--------|------|-----------------|
| `DianUploadPage` | `/dian/upload` | Drag-and-drop del .xlsx; llama a `POST /api/dian/upload` y redirige al paso 2 con el ID del borrador y las filas. |
| `DianClasificacionPage` | `/dian/clasificacion` | Tabla de facturas recibidas; el usuario asigna tipo de retención y tasa por fila (autoguardado con debounce 1.5 s). También incluye "Clasificación rápida" para aplicar un valor a todas las filas sin clasificar de una vez. |
| `DianNominaPage` | `/dian/nomina` | Formulario opcional: empleados, meses, salario mensual. Muestra preview en vivo del costo laboral (aportes + provisiones). |
| `DianExportacionPage` | `/dian/exportacion` | Resumen de estado del proceso + botón de descarga del Excel. Llama a `POST /api/dian/borradores/:id/exportar`. |

El estado fluye entre páginas vía `react-router` `location.state` (no hay store global para este módulo).

---

### Backend — endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/dian/upload` | Recibe el `.xlsx` en memoria (multer), parsea con ExcelJS, calcula valores base, persiste borrador en PostgreSQL y devuelve `{ id, calculos, filasParaClasificar }`. |
| `PATCH` | `/api/dian/borradores/:id` | Actualiza `clasificacionRetencion` + `tasaRetencion` de una fila específica (por `indice`) en el JSONB del borrador. |
| `PATCH` | `/api/dian/borradores/:id/aplicar-clasificacion-rapida` | Aplica la misma clasificación a todas las filas que aún están en `null`. |
| `PATCH` | `/api/dian/borradores/:id/revisar-anomalia` | Marca un `tipo` de anomalía (de `calcularAnomalias`) como revisado manualmente. **Solo ack de auditoría** — nunca cambia ningún cálculo, ni para las anomalías que hoy excluyen filas de un total. Sin UI de frontend todavía (pendiente de definir dónde vive). |
| `POST` | `/api/dian/borradores/:id/exportar` | Recalcula todo, genera el workbook Excel (ExcelJS) y lo envía como descarga. Elimina el borrador al finalizar. |

Todos los endpoints requieren JWT (`authMiddleware`). Los borradores pertenecen al usuario que los creó (`creado_por = userId`).

---

### Base de datos

```sql
-- Tabla única del módulo
calculo_borradores (
  id            UUID PRIMARY KEY,
  nombre_archivo TEXT,
  creado_por     UUID REFERENCES users(id),
  datos          JSONB,      -- { filas: [...], calculos: {...} }
  creado_en      TIMESTAMPTZ DEFAULT now()
)
-- TTL implícito: el registro se elimina en el mismo request de exportación exitosa.
-- Expiración máxima: 14 días (por convención, no hay cron aún).
```

El campo `datos.filas` es un array JSONB con una entrada por fila del Excel. Cada elemento incluye todos los campos del reporte más `clasificacionRetencion` y `tasaRetencion` (nulos hasta que el usuario los asigna). La actualización se hace con `jsonb_set` + `jsonb_agg` in-place para no reescribir el JSONB completo.

---

### Lógica de negocio

#### 1. Parsing del Excel

El backend valida que el archivo tenga las columnas obligatorias:

```
Tipo de documento | CUFE/CUDE | Fecha Emisión | NIT Emisor | Nombre Emisor | IVA | Total | Estado | Grupo
```

Las columnas opcionales (ICA, INC, Rete IVA, Rete Renta, etc.) se incluyen solo si están presentes en el archivo, para compatibilidad con distintos exportes de la DIAN.

#### 2. Cálculos base (en el upload)

Se separan las filas por `Grupo` (`Recibido` / `Emitido`) y `Tipo de documento`:

```
comprasBruto       = Σ total  (Recibido + [Factura electrónica, Documento equivalente -
                                Servicios públicos domiciliarios, Documento soporte con
                                no obligados])
devolucionCompras  = Σ total  (Recibido + Nota crédito electrónica)
ventasBruto        = Σ total  (Emitido  + Factura electrónica)
devolucionVentas   = Σ total  (Emitido  + Nota crédito electrónica)
ivaDescontable     = Σ IVA    (Recibido + Factura electrónica)
ivaGenerado        = Σ IVA    (Emitido  + Factura electrónica)
ivaDevolucionCompras = Σ IVA  (Recibido + Nota crédito electrónica)
ivaDevolucionVentas  = Σ IVA  (Emitido  + Nota crédito electrónica)
```

`comprasBruto` incluye tres tipos de documento porque los tres son costos deducibles ante
la DIAN. `"Application response"` queda deliberadamente fuera: es un acuse técnico sin
valor comercial (aparece en la sección DOCUMENTOS NO CONTABILIZADOS del Excel, junto con
cualquier otro tipo de documento no reconocido).

#### 3. Clasificación de retenciones

Solo aplica a facturas del grupo `Recibido` (excluye nómina individual). Opciones disponibles:

| Concepto | Tasas disponibles |
|----------|-------------------|
| N/A | — (sin retención) |
| Compras | 0,10% / 1,50% / 2,50% / 3,50% |
| Servicios | 1% / 2% / 3,50% / 4% |
| Arrendamiento | 3,50% / 4% |
| Honorarios | 11% |

Retención por fila = `total × (tasaRetencion / 100)`

#### 4. Estado de Resultados (en la exportación)

```
INGRESOS
  Ventas (bruto)
  (−) Devolución en ventas
  = Ventas Netas

COSTOS
  Compras (bruto)
  (−) Devolución en compras
  + Documento Soporte (compra) — "Documento soporte con no obligados" con Grupo="Emitido"
  = Compras Netas
  = Costos Totales   (igual a Compras Netas; se mantiene como línea propia por nombre contable)

UTILIDAD BRUTA = Ventas Netas − Costos Totales

IMPUESTOS
  IVA Generado
  (−) IVA Descontable
  (−) IVA devolución compras   [línea propia, antes venía combinada en "IVA Devoluciones"]
  (−) IVA devolución ventas    [línea propia, antes venía combinada en "IVA Devoluciones"]
  = IVA a pagar

(−) Total retenciones

UTILIDAD NETA (antes nómina)

NÓMINA (opcional)
  Costo laboral = empleados × meses × costoMes

UTILIDAD FINAL = UTILIDAD NETA − Costo laboral   (el costo laboral es un GASTO, resta)
```

**Regla de `Grupo` invertido para `"Documento soporte con no obligados"`** — confirmada
y ya implementada: para este tipo de documento (y *solo* para este), el sentido normal
de `Grupo` (`Recibido` = compra, `Emitido` = venta) queda invertido:

- `Grupo="Emitido"` → es una **compra** nuestra (se lo emitimos a alguien no obligado a
  facturar que nos vendió). Se suma directo a **Compras Netas** (`esDocSoporteCompra` en
  `dianController.js`).
- `Grupo="Recibido"` → no tiene contrapartida normal en este modelo; **no se suma a
  ningún total**. Se reporta como anomalía en la hoja METADATOS
  (`"Documento soporte con Grupo \"Recibido\" inesperado"`) para revisión manual.

`comprasBruto` (calculado en el upload) **excluye** `"Documento soporte con no
obligados"` — solo cuenta `Factura electrónica` y `Documento equivalente - Servicios
públicos domiciliarios` bajo la convención normal. El ajuste de Documento Soporte se
aplica aparte, en la exportación, sobre `comprasNetas`.

#### 5. Cálculo de nómina

Fórmula centralizada en `shared/calcularNomina.js` (ESM), usada tanto por el backend
(vía `import()` dinámico dentro de `exportarBorrador`, cacheado por Node desde la
primera llamada) como por el preview de `DianNominaPage.jsx` en el frontend — evita que
las dos capas vuelvan a desincronizarse, como pasó antes con el SMMLV hardcodeado.

```
devengado      = salario + auxilioTransporte   (solo si salario ≤ 2 × SMMLV del año)
aportesEmpresa = salario × 16,52%              (Pensión 12% | ARL 0,52% | Caja 4% — sin auxilio)
provisiones    = (salario × 4,17% vacaciones)
               + ((salario + auxilio) × (8,33% prima + 8,33% cesantías))
               + (cesantías × 1% intereses)

costoMes   = devengado + aportesEmpresa + provisiones
costoTotal = empleados × meses × costoMes
```

SMMLV y auxilio de transporte son constantes por año en `shared/salaryConstants.json`
(fuente única, leída también por `backend/src/constants/salaryConstants.js` y por las
páginas de frontend). Se resuelven según el año del período del reporte (primera fecha
de emisión), con fallback al año más reciente configurado si no hay dato para ese año.

| Año | SMMLV | Auxilio de transporte |
|-----|-------|------------------------|
| 2026 | $1.750.905 | $249.095 |
| 2025 | $1.423.500 | $200.000 |

---

### Excel de salida (5 hojas)

Formato tradicional de estado de resultados imprimible (no dashboard): tabla jerárquica
con una sola tarjeta destacada para UTILIDAD FINAL, bordes por bloque de sección, alturas
de fila ampliadas en headers/totales, freeze pane en las hojas con muchas filas o headers
fijos, y una columna de Notas (col. C en RESUMEN) para explicaciones puntuales.

| Hoja | Contenido |
|------|-----------|
| `RESUMEN` | Título con banda propia (empresa + período), tarjeta UTILIDAD FINAL (verde si es positiva, roja si es negativa — mismo criterio `isNeg` que el resto de la hoja), y el Estado de Resultados detallado línea por línea para auditar cómo se llegó a ese número |
| `RETENCIONES_POR_PROVEEDOR` | Retenciones agrupadas por NIT emisor y concepto |
| `DETALLE_COMPRAS` | Todas las facturas recibidas con su clasificación, tasa y valor retenido |
| `NOMINA` | Desglose de devengado, aportes y provisiones, con tarjeta destacada del costo total (solo si se ingresó nómina) |
| `METADATOS` | Usuario, fecha de procesamiento, período, totales de documentos, y dos secciones de transparencia con banda ámbar (advertencia — no rojo, ese color ya significa "negativo" en el resto del Excel): **DOCUMENTOS NO CONTABILIZADOS** (tipos de documento fuera de todos los cálculos, ej. "Application response") y **ANOMALÍAS DETECTADAS** (CUFE/CUDE duplicado, IVA mayor que el Total, Total negativo fuera de Nota Crédito, Grupo con valor distinto de "Emitido"/"Recibido", Documento soporte con Grupo "Recibido" inesperado) |

Nombre del archivo generado: `ContabilidadDIAN_<empresa>_<YYYY-MM>.xlsx`

---

## Dependencias clave

| Paquete | Uso |
|---------|-----|
| `exceljs` | Lectura del .xlsx de entrada y generación del Excel de salida |
| `multer` (memoryStorage) | Recepción del archivo en memoria sin tocar disco |
| `date-fns` | Parsing de fechas en formato `dd-MM-yyyy` del reporte DIAN |
| `uuid` | ID del borrador en PostgreSQL |
| `react-router` | Navegación entre pasos y paso de estado entre páginas |
| `shared/calcularNomina.js` | Fórmula de nómina (ESM), compartida entre backend y preview de frontend |
| `shared/salaryConstants.json` | SMMLV y auxilio de transporte por año, fuente única para backend y frontend |

---

## Estado actual (rama `feat/dian-modulo-base`)

- Upload, parsing y cálculo base: implementado
- Clasificación fila a fila + clasificación rápida: implementado
- Módulo nómina con preview en vivo: implementado
- Generación y descarga del Excel (5 hojas): implementado
- Eliminación automática del borrador tras exportación: implementado

**Pendiente / ideas futuras:**
- **UI de frontend para "revisar anomalía"** — el endpoint (`PATCH .../revisar-anomalia`)
  y el reflejo en el Excel ya existen; falta decidir dónde vive el botón (¿nueva sección
  en `DianClasificacionPage`? ¿página propia?) y conectarlo.
- Cron job para limpiar borradores sin exportar después de 14 días
- Historial de reportes exportados (sin guardar los datos, solo metadatos)
- Soporte para múltiples empresas en el mismo reporte
- Validación automática de retenciones según tabla DIAN vigente
