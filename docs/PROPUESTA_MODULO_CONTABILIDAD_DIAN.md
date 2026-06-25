# Propuesta: Módulo de Contabilidad DIAN dentro de GestionTareasOficina

## Para quién es este documento

Esto no es un prompt de implementación. Es una propuesta funcional y de arquitectura para que la analices con el contexto completo del repositorio actual (rutas, modelos, autenticación, permisos) y nos digas si tiene sentido integrarla aquí, qué ajustarías, y si ves algún conflicto con el trabajo de permisos que ya está en curso.

---

## 1. Objetivo del módulo

Reemplazar la dependencia de un software de contabilidad de pago (Siigo Pyme) para procesos que la firma puede automatizar internamente: a partir del reporte que la DIAN entrega al exportar documentos electrónicos (facturas, notas crédito, documentos soporte) de una empresa cliente, calcular automáticamente Compras, Ventas, IVA, retenciones y nómina, con la menor intervención manual posible.

Puntos clave que cambian respecto a otros módulos del sistema:

- **No hay gestión de empresas cliente.** No se crean ni se listan las ~80 empresas que la firma atiende. Cada uso del módulo es una corrida independiente: se sube un reporte, se calcula, se exporta, y no queda ningún registro permanente de esa empresa en el sistema.
- **Un archivo de entrada = una empresa siempre** (confirmado, nunca trae varias mezcladas).
- **Quién lo usa:** las ~13 personas que ya tienen cuenta en el sistema, con acceso abierto por defecto. El equipo ya está construyendo un sistema de permisos en paralelo — ver sección 6.

---

## 2. Por qué proponemos este repo y no uno nuevo

- Reutiliza la autenticación (JWT) y las cuentas ya existentes — sin esto, habría que duplicar login/roles para las mismas 13 personas en otro sistema.
- No requiere modelar entidades de negocio nuevas (no hay "empresas", solo borradores transitorios de cálculo — ver sección 5).
- Reutiliza el servidor Ubuntu y Docker Compose ya en producción.
- Es un dominio distinto al de gestión de tareas, pero al no persistir datos fiscales de clientes de forma permanente, no hay mezcla real de datos sensibles con los datos internos del equipo.

No reutiliza nada del código de la aplicación de descarga de PDFs (Playwright + Chrome CDP). Esa herramienta automatiza navegador para bajar PDFs documento por documento; este módulo solo necesita leer un Excel y calcular. Comparten el formato del archivo de entrada, nada más.

---

## 3. Flujo end-to-end

1. El usuario sube el reporte de DIAN, sin modificar, tal cual lo exporta el portal (ver estructura exacta en sección 4).
2. El backend calcula automáticamente todos los valores que no requieren juicio humano (ver sección 5).
3. Para las filas de documentos "Recibido" sujetas a retención, el usuario clasifica manualmente concepto + tarifa desde un desplegable, en una tabla interactiva. El progreso se autoguarda (debounce de 1-2 segundos) en un borrador en base de datos.
4. El usuario revisa los resultados en pantalla: tabla detallada + resumen de IVA, retenciones por proveedor y nómina.
5. Al hacer clic en "Generar Excel": se construye el Excel final con valores ya calculados (no fórmulas cruzadas entre hojas), se descarga, y se elimina el borrador correspondiente de la base de datos.

---

## 4. Estructura del archivo de entrada (confirmada)

Reporte DIAN, 32 columnas (A:AF), sin modificar por el usuario:

| Col | Campo | Notas |
|---|---|---|
| A | Tipo de documento | "Factura electrónica", "Nota de crédito electrónica", "Documento soporte con no obligados", etc. |
| B | CUFE/CUDE | Identificador único |
| C | Folio | |
| D | Prefijo | |
| H | Fecha de Emisión | Fecha real (datetime), no texto |
| J | NIT Emisor | |
| K | Nombre Emisor | |
| L | NIT Receptor | |
| M | Nombre Receptor | |
| N | IVA | |
| O | ICA | |
| AA | Rete IVA | |
| AB | Rete Renta | |
| AC | Rete ICA | |
| AD | Total del documento | |
| AE | Estado | "Aprobado" / "Aprobado con notificación" |
| AF | Grupo | "Emitido" o "Recibido" |

(Columnas restantes según catálogo DIAN: divisa, forma/medio de pago, fecha recepción, otros impuestos menores — disponibles si se necesitan, no usadas en el cálculo principal.)

---

## 5. Reglas de cálculo (especificación funcional del dueño del proceso contable)

Cada componente se calcula de forma independiente — sin netear dentro de la misma fórmula — para evitar que dos cálculos del mismo concepto diverjan entre sí:

| Concepto | Origen |
|---|---|
| Compras (bruto) | Facturas Recibidas |
| Devolución en compras | Notas Crédito Recibidas |
| Ventas (bruto) | Facturas Emitidas |
| Devolución en ventas | Notas Crédito Emitidas |
| IVA Descontable (IVA de compras) | IVA de Facturas Recibidas |
| IVA Generado (IVA de ventas) | IVA de Facturas Emitidas |
| IVA Devolución en Compras | IVA de Notas Crédito Recibidas |
| IVA Devolución en Ventas | IVA de Notas Crédito Emitidas |

Netos, calculados a partir de los componentes anteriores (no recalculados de forma independiente):

```
Compras Netas = Compras − Devolución en compras
Ventas Netas  = Ventas − Devolución en ventas
```

Documento Soporte Emitido (aparece como "Emitido" en el reporte, pero corresponde a una compra del receptor que no facturó) se suma a Compras Netas como costo.

```
Utilidad = Ventas Netas − (Compras Netas + Documento Soporte Emitido)
```

El resultado final debe mostrar explícitamente Compras Netas y Ventas Netas, no solo la Utilidad.

### Nómina

Costo laboral total con parámetros manuales por corrida (número de empleados, número de meses, salario). Reutilizar la lógica de aportes y provisiones del sistema anterior:

- Aportes empresa: Pensión 12% + ARL Clase I 0,52% + Caja de Compensación 4%
- Provisiones: Prima 8,33% + Cesantías 8,33% (sobre salario + auxilio de transporte) + Intereses Cesantías 1% (sobre cesantías) + Vacaciones 4,17%

Importante: el sistema anterior tenía el auxilio de transporte hardcodeado en la fórmula de cesantías con un valor desactualizado. En esta versión, el auxilio de transporte debe ser un parámetro de configuración (valor del año vigente), referenciado, no repetido como literal en cada fórmula.

---

## 6. Retención — clasificación manual y tabla de tarifas

El reporte DIAN no indica si una compra fue de bienes, un servicio, un arriendo u honorarios — esa clasificación no se puede derivar automáticamente. Por eso, para las filas "Recibido" sujetas a retención, el usuario elige manualmente desde un desplegable una combinación de concepto + tarifa:

| Concepto | Tarifas |
|---|---|
| Compras | 0,10% / 1,50% / 2,50% / 3,50% |
| Servicios | 1% / 2% / 3,50% / 4% |
| Arrendamiento | 3,50% / 4% |
| Honorarios | 11% |

(11 combinaciones en total — el desplegable las muestra ya armadas, ej. "Compras 2,50%", no como selección en dos pasos.)

Esta tabla de tarifas es de referencia fija en backend (no editable por el usuario). El sistema anterior tenía una hoja `RETEFUENTE_2026` con la tabla oficial completa (75 filas) — útil como fuente si en el futuro aparecen conceptos fuera de esta lista de 11.

Salida adicional requerida: resumen agrupado por proveedor (NIT + Nombre Emisor) mostrando cuánto se le retuvo y por qué concepto — insumo para certificados de retención e información exógena.

---

## 7. Persistencia — una tabla nueva, transitoria

No se modela "empresa" como entidad. Se necesita una tabla mínima para no perder el trabajo de clasificación manual si se recarga la página a medias:

```sql
calculo_borradores
  id              uuid (pk)
  nombre_archivo  text        -- nombre del reporte original, solo para identificarlo en pantalla
  creado_por      uuid (fk a users)
  datos           jsonb       -- clasificaciones ya hechas, fila por fila
  creado_en       timestamp
  actualizado_en  timestamp
```

Ciclo de vida: se crea al subir el archivo, se actualiza con autoguardado mientras el usuario clasifica, y se elimina al confirmar "Generar Excel". No hay retención histórica de cálculos pasados — el Excel descargado es el archivo de respaldo, igual que el proceso actual.

---

## 8. Permisos

13 personas con cuenta, acceso abierto por defecto a este módulo. El equipo ya está implementando un sistema de permisos en paralelo (independiente de esta propuesta) — si para cuando esto se construya ya existe esa base, evaluar si este módulo necesita un permiso propio (ej. `canUseDianCalculator`) o si entra bajo uno ya existente. No bloqueante para el diseño, pero sí para la implementación final.

---

## 9. Contexto: por qué no seguimos con el Excel de fórmulas

El sistema anterior (Excel con SUMPRODUCT cruzando 10 hojas) tenía bugs reales confirmados, no documentados, antes de cargar un solo dato real:

- El Dashboard gerencial mostraba Utilidad Bruta, Utilidad Neta y los 3 márgenes siempre en cero, por enlaces a celdas equivocadas entre hojas.
- El bloque de "Otros Impuestos" (INC, IC, Timbre) leía la columna del impuesto anterior por un desplazamiento de una columna.
- Una fórmula de IVA Generado tenía un filtro de estado inconsistente con la fórmula gemela de Ingresos, pudiendo dar cifras distintas para el mismo conjunto de documentos.

El patrón de falla es estructural: una fórmula se corrige en una hoja y su par en otra hoja no se actualiza igual, y un enlace roto entre hojas no lanza ningún error de Excel — solo da un número equivocado en silencio. De ahí la decisión de mover el cálculo a código con pruebas, dejando el Excel solo como reporte de salida generado al final.

---

## 10. Lo que pedimos que evalúes

1. ¿La tabla `calculo_borradores` (jsonb) es viable dentro del esquema actual sin afectar nada existente?
2. ¿Hay algún conflicto con el sistema de permisos que ya está en construcción?
3. ¿Recomendarías otra estructura de rutas/módulo dado cómo está organizado el backend hoy (`backend/src/controllers`, `routes`, etc.)?
4. ¿Alguna señal de riesgo o complejidad que no estemos viendo, dado el resto del código del repositorio?

No es necesario que generes código todavía — con un análisis de viabilidad y tus observaciones es suficiente para decidir el siguiente paso.
