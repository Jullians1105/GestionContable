# NIT vs. cédula — regla de conteo de dígitos para inferir tipo de documento

Referencia de por qué `inferirTipoDocumento` (en
`backend/src/services/exogenas/utils/dian.js`) usa el **conteo de dígitos** del número de
identificación, además del nombre, para decidir si un tercero es persona jurídica (NIT, TDOC
31) o persona natural (cédula, TDOC 13) en los formatos de Exógenas (1001/1005/1006/1007).

---

## 1. Por qué existe esta regla

El reporte TOKEN de la DIAN no trae una columna explícita de "tipo de identificación" —
solo el número y el nombre. `inferirTipoDocumento` lo infiere. La primera señal (más
confiable) es el nombre: si contiene una palabra clave de persona jurídica (SAS, LTDA, S.A.,
etc. — ver `EMPRESA_KEYWORDS`), es empresa. Cuando el nombre no da ninguna pista, hace falta
una segunda regla basada en el número — este documento es la fuente de esa segunda regla.

## 2. Fuentes (no hay un único PDF oficial citable con página, a diferencia de
`docs/dian-tipos-documento.md`)

Se buscó un anexo técnico de la DIAN equivalente al de tipos de documento (con página
citable) y no existe públicamente — el algoritmo de asignación del NIT no está publicado
como anexo técnico. Las fuentes usadas en su lugar, verificadas el 2026-09-28:

1. **Registraduría Nacional del Estado Civil** (fuente primaria, sitio oficial del Estado
   colombiano) — ["Ahora la cédula es de 10 dígitos"](https://www.registraduria.gov.co/Ahora-la-cedula-es-de-10-digitos.html):
   numeración histórica de cédulas: cupos 1 a 19.999.999 asignados a hombres, 20.000.001 a
   69.999.999 a mujeres: al agotarse esos cupos, 70.000.001 a 99.999.999 volvió a asignarse a
   hombres. Todos estos rangos caben en **máximo 8 dígitos**. Desde el año 2000, el NUIP
   asigna cédulas de **exactamente 10 dígitos**, consecutivas, sin distinción de género.
2. **DIAN-RUT.com** — ["Número de Identificación Tributaria (NIT)"](https://dian-rut.com/dian/numero-de-identificacion-tributaria-nit/)
   y **Dian.com.co** — ["NIT en Colombia"](https://dian.com.co/nit-colombia-2026/): ambos
   sitios especializados en trámites DIAN, independientes entre sí, coinciden en que el NIT
   de persona jurídica tiene **exactamente 9 dígitos** más dígito de verificación, en el
   rango 800.000.000-899.999.999 y ascendente desde 900.000.000. Para persona natural, el
   NIT es la cédula misma con un DV agregado (no un número de 9 dígitos aparte).

Ninguna de las dos fuentes del punto 2 es la DIAN misma citando su propia resolución con
número de página — son sitios secundarios especializados, no el anexo técnico oficial. Se
usan porque el dato (longitud/rango del NIT jurídico) no se encontró en ningún anexo público
de la DIAN, y las dos fuentes coinciden entre sí de forma independiente.

## 3. La regla resultante — los tres rangos no se superponen

| Dígitos (limpios, sin DV) | Tipo |
|---:|---|
| 1 a 8 | Persona natural — cédula antigua (Registraduría, rango histórico) |
| **9** | Persona jurídica — NIT (DIAN-RUT / Dian.com.co) |
| 10 | Persona natural — cédula NUIP (Registraduría, desde el año 2000) |

Reemplaza la heurística anterior ("9+ dígitos Y empieza en 8 o 9"), que tenía dos huecos
reales: un NIT de 9 dígitos que no empezara en 8/9 se clasificaba mal como persona, y un
número de 10+ dígitos que empezara en 8/9 se clasificaba mal como empresa (no existe NIT
jurídico de 10 dígitos bajo esta regla).

## 4. Qué sigue igual

El chequeo por palabra clave en el nombre (`EMPRESA_KEYWORDS`) sigue yendo primero — es una
señal más fuerte que el conteo de dígitos y ya está validada con datos reales. La regla de
dígitos solo aplica cuando el nombre no trae ninguna palabra clave conocida.

## 5. Pendiente

Si en algún momento aparece un caso real que esta regla clasifique mal, documentarlo acá
antes de tocar el código — no reabrir esta decisión sin evidencia nueva.
