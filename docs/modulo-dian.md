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

Se separan las filas por `Grupo` (`Recibido` / `Emitido`) y `Tipo de documento` (`Factura electrónica` / `Nota de crédito electrónica`):

```
comprasBruto       = Σ total  (Recibido + Factura)
devolucionCompras  = Σ total  (Recibido + Nota crédito)
ventasBruto        = Σ total  (Emitido  + Factura)
devolucionVentas   = Σ total  (Emitido  + Nota crédito)
ivaDescontable     = Σ IVA    (Recibido + Factura)
ivaGenerado        = Σ IVA    (Emitido  + Factura)
```

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
  = Compras Netas
  + Documento Soporte Emitido (si existe)
  = Costos Totales

UTILIDAD BRUTA = Ventas Netas − Costos Totales

IMPUESTOS
  IVA Generado
  (−) IVA Descontable
  (−) IVA Devoluciones
  = IVA a pagar

(−) Total retenciones

UTILIDAD NETA (antes nómina)

NÓMINA (opcional)
  Costo laboral = empleados × meses × costoMes

UTILIDAD FINAL
```

#### 5. Cálculo de nómina

```
costoMes = salario × (1 + 16,52% aportes + 21,83% provisiones)

Aportes empresa:   Pensión 12% | ARL 0,52% | Caja Compensación 4%
Provisiones:       Prima 8,33% | Cesantías 8,33% | Int. Cesantías 1% | Vacaciones 4,17%

costoTotal = empleados × meses × costoMes
```

Salario base por defecto: SMMLV 2026 = $1.423.500 COP.

---

### Excel de salida (5 hojas)

| Hoja | Contenido |
|------|-----------|
| `RESUMEN` | Estado de Resultados completo con secciones coloreadas |
| `RETENCIONES_POR_PROVEEDOR` | Retenciones agrupadas por NIT emisor y concepto |
| `DETALLE_COMPRAS` | Todas las facturas recibidas con su clasificación, tasa y valor retenido |
| `NOMINA` | Desglose de aportes y provisiones (solo si se ingresó nómina) |
| `METADATOS` | Usuario, fecha de procesamiento, período del reporte, totales de documentos |

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

---

## Estado actual (rama `feat/dian-modulo-base`)

- Upload, parsing y cálculo base: implementado
- Clasificación fila a fila + clasificación rápida: implementado
- Módulo nómina con preview en vivo: implementado
- Generación y descarga del Excel (5 hojas): implementado
- Eliminación automática del borrador tras exportación: implementado

**Pendiente / ideas futuras:**
- Cron job para limpiar borradores sin exportar después de 14 días
- Historial de reportes exportados (sin guardar los datos, solo metadatos)
- Soporte para múltiples empresas en el mismo reporte
- Validación automática de retenciones según tabla DIAN vigente
