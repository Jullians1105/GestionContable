# Catálogo DIAN de tipos de documento — referencia para el módulo de contabilidad

Referencia única de **qué es cada tipo de documento** que puede aparecer en la columna
`Tipo de documento` del reporte que exporta el portal DIAN, y **cómo debe tratarse
contablemente** en el módulo (ver [modulo-dian.md](modulo-dian.md) para la arquitectura).

Cada entrada cita la página exacta del anexo oficial del que sale, para poder auditarla.

---

## 1. Fuentes oficiales

Los tipos de documento **no están todos en un solo PDF**. Cada familia de documento tiene
su propia resolución y su propio anexo técnico. Los cuatro que se analizaron para armar
este catálogo:

| Anexo técnico | Resolución | Págs. | ¿Trae las tablas de códigos? |
|---|---|---:|---|
| Documento Equivalente Electrónico v1.0 | 000165 de 01/NOV/2023 | 1546 | **Sí**, embebidas (secc. 16.3, pág. 1444) |
| Factura Electrónica de Venta v1.9 | 000165 de 01/NOV/2023 | 753 | **No** — externalizadas (ver aviso abajo) |
| Documento Soporte en adquisiciones a no obligados | 000167 de 30/DIC/2021 | 290 | **Sí**, embebidas (secc. 16.1.3, pág. 242) |
| Documento Soporte de Pago de Nómina Electrónica | 000013 de 11/FEB/2021 | 299 | **Sí**, embebidas (secc. 5.5.7, pág. 210) |

> **Los PDF no están versionados en el repo** (pesan ~37 MB en conjunto). Se descargan del
> portal DIAN cuando haga falta verificar una cita. El de factura electrónica está en
> `dian.gov.co/impuestos/factura-electronica/Documents/Anexo-Tecnico-Factura-Electronica-de-Venta-vr-1-9.pdf`;
> los demás se buscan por número de resolución en `micrositios.dian.gov.co`. Los números de
> página citados en este documento corresponden a las versiones de la tabla de arriba —
> confirmar que la versión descargada coincide antes de fiarse de una página concreta.

La Resolución 000165 de 2023 adoptó a la vez el anexo 1.9 de factura electrónica y el
anexo 1.0 de documento equivalente: son documentos hermanos y consistentes entre sí.

### Aviso: las tablas de la factura electrónica ya no están en el PDF

En la versión 1.9, la sección 13.2.4 (pág. 684) **no incluye la tabla de códigos**. Dice
literalmente que la tabla 13.1.3 vive en un ZIP aparte:

> `Caja_de_herramientas_Factura_Electronica_Validacion_Previa.zip\Anexo Tecnico\Tablas Referenciadas`, en formato Excel ".xlsx"

Lo mismo pasa con "Tipos de operación" (13.2.5) y "Tipos Eventos" (13.2.6). Si en algún
momento se necesitan los códigos exactos de factura/nota crédito/nota débito, hay que
bajar ese ZIP del portal DIAN. **Hoy no bloquea nada**: los tipos de factura electrónica
que aparecen en el reporte ya están parametrizados.

---

## 2. Catálogo por familia

### 2.1 Documento equivalente electrónico

Fuente: anexo Documento Equivalente v1.0, **secc. 16.3, pág. 1444** (`InvoiceTypeCode` /
`CreditNoteTypeCode`). Verificado contra la tabla 16.4.2 (pág. 1447-1448) y contra el
render visual de la página.

| Código | Significado oficial | Secc. detalle | Naturaleza habitual |
|---:|---|---|---|
| 20 | Tiquete de máquina registradora con sistema P.O.S. | 8.2, págs. 91-134 | Venta |
| 25 | Boleta de ingreso a cine | 8.10, págs. 479-517 | Venta |
| 27 | Boleta de ingreso a espectáculos públicos | 8.8, págs. 368-415 | Venta |
| 30 | Documento en juegos localizados y no localizados — relación diaria de control de ventas | 8.7, págs. 330-367 | Venta |
| 35 | Tiquete de transporte de pasajeros Terrestre | 8.5, págs. 247-292 | **Compra** (típico) |
| 40 | Documento expedido para el cobro de peajes | 8.4, págs. 217-246 | **Compra** (típico) |
| 45 | Extracto Expedido por Sociedades Financieras y Fondos | 8.11, págs. 518-562 | **Compra** (típico) |
| 50 | Tiquete de Billete de Transporte Aéreo de Pasajeros | 8.6, págs. 293-329 | Ambos |
| 55 | Documento de Operación de Bolsa de Valores, Agropecuaria y de Otros Comodities | 8.9, págs. 416-478 | Ambos |
| 60 | Documento Expedido para los Servicios Públicos y Domiciliarios | 8.3, págs. 135-216 | **Compra** (típico) |
| 93 | Nota de Ajuste de tipo **débito** al Documento Equivalente | 8.12.2, págs. 604-652 | Ajuste (+) |
| 94 | Nota de Ajuste de tipo **crédito** al Documento Equivalente | 8.12.1, págs. 563-603 | Ajuste (−) |
| 07 | Contingencia por parte del emisor | — | Según doc. referenciado |
| 08 | Contingencia por parte DIAN | — | Según doc. referenciado |

"Naturaleza habitual" es criterio contable nuestro, no de la DIAN: el anexo solo define la
estructura del documento. Quien decide si es compra o venta es la columna `Grupo` del
reporte (`Recibido` / `Emitido`), salvo la excepción del documento soporte (ver 2.3).

### 2.2 Factura electrónica de venta y sus notas

Fuente: anexo Factura Electrónica v1.9. **Los códigos están en el ZIP "Caja de
Herramientas"**, no en el PDF (ver aviso arriba). Lo que sí documenta el PDF:

- **Notas crédito** (secc. 13.2.5.3, pág. 685): el valor por defecto de `CustomizationID`
  es `20` (nota crédito **con** referencia a factura). El tipo `22` es nota crédito **sin**
  referencia a una factura, y en ese caso debe informar el período que afecta.
- **Notas débito** (misma pág.): por defecto `30` (con referencia a factura); `32` sin
  referencia.

Esa distinción importa: una nota crédito tipo 22 no se puede casar contra una factura
concreta del mismo reporte.

### 2.3 Documento soporte en adquisiciones a no obligados a facturar

Fuente: anexo Documento Soporte, **secc. 16.1.3, pág. 242**.

| Código | Significado |
|---:|---|
| 05 | Documento soporte en adquisiciones efectuadas a sujetos no obligados a expedir factura o documento equivalente |
| 95 | Nota de ajuste al documento soporte |

> **Nota sobre este PDF:** las páginas 1-23 son la Resolución 000167 de 2021 **escaneada
> como imagen** — no tienen capa de texto y ningún extractor las lee. El anexo técnico
> propiamente dicho arranca en la pág. 24 y sí es texto digital. Para leer esas 23 páginas
> hay que renderizarlas como imagen (ver sección 4).

Este es el documento con la **regla de `Grupo` invertida** descrita en
[modulo-dian.md](modulo-dian.md): lo emitimos nosotros (`Grupo="Emitido"`) pero representa
una **compra** nuestra a alguien no obligado a facturar.

### 2.4 Nómina electrónica

Fuente: Resolución 000013 de 2021, **secc. 5.5.7 "Tipo de XML", pág. 210**.

| Código | Nombre XML | Significado |
|---:|---|---|
| 102 | `NominaIndividual` | Documento Soporte de Pago de Nómina Electrónica |
| 103 | `NominaIndividualDeAjuste` | Nota de Ajuste de Documento Soporte de Pago de Nómina Electrónica |

No se contabilizan como compra: el costo laboral entra al Estado de Resultados por la vía
del cálculo de nómina (`shared/calcularNomina.js`), no sumando estas filas. Sumarlas sería
contar el mismo gasto dos veces.

### 2.5 Instrumento ApplicationResponse

Fuente: anexo Documento Equivalente, **secc. 8.13, págs. 653-657**. Definición del propio
anexo (pág. 14):

> Documento electrónico de propósito general mediante el cual se envían las validaciones
> realizadas por la DIAN a el documento equivalente electrónico.

Es un **acuse técnico sin valor comercial**. Nunca entra en ningún total.

---

## 3. Mapeo al reporte real y estado de parametrización

Valores observados en `docs/REPORTE.xlsx` (419 filas, período 2026-07), contrastados con
`TIPOS_CONTABILIZADOS` en `backend/src/controllers/dianController.js:134`.

| `Tipo de documento` (texto exacto del portal) | Filas | Cód. | Fuente | Estado |
|---|---:|---:|---|---|
| `Factura electrónica` | 374 | 01 | FE 1.9 | Parametrizado |
| `Nota de crédito electrónica` | 14 | 91 | FE 1.9 | Parametrizado |
| `Documento equivalente - Transporte pasajeros terrestre` | 9 | 35 | DocEquiv 16.3 | **PENDIENTE** |
| `Nomina Individual` | 8 | 102 | Res. 000013 | Excluido a propósito |
| `Documento equivalente - Servicios públicos domiciliarios` | 6 | 60 | DocEquiv 16.3 | Parametrizado |
| `Nota de crédito electrónica` (Recibido) | 5 | 91 | FE 1.9 | Parametrizado |
| `Application response` | 4 | — | DocEquiv 8.13 | Excluido a propósito |
| `Documento soporte con no obligados` | 2 | 05 | DSNO 16.1.3 | Parametrizado (Grupo invertido) |
| `Nota de ajuste crédito del documento equivalente` | 1 | 94 | DocEquiv 16.3 | **PENDIENTE** |
| `Documento equivalente - Transporte aéreo de pasajeros` | 0 | 50 | DocEquiv 16.3 | Parametrizado |

El texto exacto que usa el portal **no coincide** con el nombre oficial del anexo. El
portal usa el patrón `Documento equivalente - <descripción>`, mientras el anexo dice
"Tiquete de transporte de pasajeros Terrestre". Para los tipos que todavía no han aparecido
en ningún reporte, el nombre exacto del portal **está sin confirmar** — hay que verlo en un
reporte real antes de agregarlo como constante.

### 3.1 Los dos pendientes

**`Documento equivalente - Transporte pasajeros terrestre` (cód. 35)**

- 9 filas, $47.000 c/u, **total $423.000**, todas con `IVA = 0` y `Grupo = Recibido`,
  emisor "COOPERATIVA DE TRANSPORTADORES".
- IVA en cero es coherente: el transporte público terrestre de pasajeros está **excluido**
  de IVA (Art. 476 ET). No es un error del reporte.
- Tratamiento correcto: **igual que `DOC_EQUIVALENTE` (servicios públicos)** — costo
  deducible que suma a Compras Netas cuando `Grupo = Recibido`. Es el hermano terrestre del
  `DOC_TRANSPORTE_AEREO` que ya existe; se agregó el aéreo y se pasó por alto el terrestre.
- Diferencia con el aéreo: el aéreo se trata como factura (puede ser compra **o** venta
  según el grupo); el terrestre, para nuestro caso de uso, solo aparece como compra.

**`Nota de ajuste crédito del documento equivalente` (cód. 94)**

- 1 fila, **$111.840**, `IVA = 0`, `Grupo = Recibido`, emisor "Empresa de Energía de Boyacá".
- El emisor es una empresa de servicios públicos: esta nota es la **contrapartida de un
  documento equivalente cód. 60** ya contabilizado como compra.
- Tratamiento correcto: **devolución en compras**, igual que `NOTA_CREDITO` — resta de
  Compras Netas.
- Existe también la nota de ajuste **débito** (cód. 93), que sumaría en vez de restar.
  Todavía no ha aparecido en ningún reporte, pero conviene contemplarla al mismo tiempo
  para no repetir este mismo hueco.

**Impacto neto hoy no contabilizado:** `+423.000 − 111.840 = 311.160`. Ambos tipos caen
actualmente en la sección DOCUMENTOS NO CONTABILIZADOS de la hoja METADATOS, así que el
Excel exportado sí los muestra — pero no entran en ningún total.

---

## 4. Cómo procesar estos PDFs (metodología verificada)

Anotado porque dos de los tres modos obvios de extracción producen **errores silenciosos**.

```bash
# CORRECTO — modo tabla + UTF-8
pdftotext -table -enc UTF-8 "docs/<anexo>.pdf" salida.txt
```

Tres trampas encontradas y resueltas:

1. **Codificación.** Sin `-enc UTF-8`, la salida sale en Latin-1 y todos los acentos se
   corrompen (`Resolución` → `Resoluci?n`).

2. **Desalineación de filas (la grave).** Con `-layout`, las tablas cuyas celdas ocupan
   varias líneas quedan desfasadas y producen lecturas **plausibles pero falsas**. La tabla
   16.3 leída con `-layout` afirma que el código 25 es "tiquete de máquina registradora"
   cuando en realidad es "Boleta de ingreso a cine". `-table` lo corrige.

3. **Páginas escaneadas.** Las págs. 1-23 del anexo de Documento Soporte son imágenes sin
   capa de texto. `pdftotext` devuelve vacío sin avisar. Se detectan buscando páginas con
   longitud anómala y se leen renderizándolas:

```python
import fitz  # pip install pymupdf
doc = fitz.open("docs/<anexo>.pdf")
doc[N].get_pixmap(dpi=150).save("pagina.png")   # luego leer la imagen
```

**Regla de oro:** ninguna tabla de códigos se da por buena con una sola lectura. Cada tabla
de este documento se validó cruzándola contra una segunda tabla de formato distinto que
repitiera el mismo mapeo, y/o contra el render visual de la página.

---

## 5. Pendientes

- Bajar el ZIP **"Caja de Herramientas"** del portal DIAN si se necesitan los códigos
  exactos de factura electrónica, notas crédito y notas débito (hoy no bloquea nada).
- Confirmar el texto exacto que usa el portal para los tipos de documento equivalente que
  aún no han aparecido en ningún reporte (códigos 20, 25, 27, 30, 40, 45, 55, 93).
- Contemplar la nota de ajuste **débito** (cód. 93) junto con la de crédito (cód. 94).
