# Estado — Directorio maestro de Empresas + generación de token DIAN

> Documento de continuidad de sesión. Última actualización: 2026-09-17. **Este feature ya está
> terminado y en producción** — este documento es historia/referencia, no una lista de pendientes
> urgentes. Léelo si vas a tocar algo del directorio de empresas, la generación de token DIAN, o
> si vas a retomar Contabilidad/Exógenas y necesitas entender cómo quedó vinculada la identidad de
> empresa entre módulos.

---

## 0. Estado actual, en una frase

Los 4 catálogos de empresas (Fondo Emprender, Empresas Externas, Nómina Electrónica,
Contabilidad) están unificados bajo una tabla maestra `empresas` con NIT/cédula/tipo de
contribuyente, hay una pantalla `/empresas` para administrarlos, y desde ahí cualquier usuario
puede generarle a una empresa el token de acceso a la DIAN con un botón — todo esto está
**mergeado a `main` (PR #58) y desplegado en el servidor de producción**, probado en vivo con
datos reales, incluida una prueba de carga con 5 generaciones simultáneas.

---

## 1. Decisiones ya acordadas (no las reabras sin evidencia nueva)

- Las 4 tablas de módulo siguen siendo dueñas de sus propios campos — la tabla `empresas` solo
  centraliza identidad (`name`, `nit`, `tipo_contribuyente`, `cedula_representante`, `activa`) y
  qué módulos tiene habilitados cada una.
- Renombrar solo se hace desde el directorio maestro (`PUT /api/empresas/:id`), cascada
  automática hacia las tablas de módulo enlazadas.
- Permiso de edición: admin + leader. Lectura y "generar token" abiertos a cualquier autenticado
  (el usuario pidió explícitamente que ~14 usuarios puedan generar token en cualquier momento).
- Detección de "posible duplicado": mismo NIT (señal fuerte) o nombre con al menos una palabra
  significativa compartida (≥3 letras, sin figuras jurídicas ni "ASOCIACION"/"FUNDACION"
  genéricas). Un par ya revisado se puede marcar **"No es duplicado"** — se guarda en
  `empresas_duplicados_descartados` (migración 056) y no se vuelve a sugerir.
- **Generación de token DIAN** (`backend/src/services/dianTokenService.js`): automatiza el login
  de `catalogo-vpfe.dian.gov.co` con **Chrome real** (no el Chromium de Playwright — el WAF de
  Cloudflare lo bloquea) contra un **perfil persistente ya "calentado"** una sola vez con una
  verificación real de Cloudflare (después de eso, el checkbox se resuelve solo en ~7-20s). El
  perfil vive en `/home/gestionc-server/dian-perfil-real-chrome` en el servidor, montado por bind
  mount (no volumen nombrado, para no perder el calentado). Cola con concurrencia máxima
  (`DIAN_TOKEN_MAX_CONCURRENTE`, configurada en **5** en `docker-compose.yml`) — de más
  solicitudes simplemente esperan su turno, no se lanzan más Chromes en paralelo.
- Para persona natural, el "NIT" que pide la DIAN es su propia cédula — se reutiliza la columna
  `empresas.nit` para eso (`tipo_contribuyente = 'natural'`), no se agregó columna aparte.

---

## 2. Qué se implementó

### Backend
| Archivo | Qué hace |
|---|---|
| `backend/migrations/053-056` | Tabla `empresas` + backfill, `nit`, `tipo_contribuyente`/`cedula_representante`, `empresas_duplicados_descartados`. |
| `backend/src/controllers/empresasMaestroController.js` | CRUD del directorio, `getPosiblesDuplicados`, `descartarDuplicado`, `fusionar`, `generarTokenDian`. |
| `backend/src/services/dianTokenService.js` | Automatización real con Chrome + Xvfb (el contenedor no tiene monitor). |
| `backend/Dockerfile` | Pasó de `node:20-alpine` a `node:20-slim` (Debian) — Alpine no tiene paquete oficial de Chrome. Instala Chrome + Xvfb, crea `/tmp/.X11-unix`, reusa el usuario `node` ya existente en la imagen. |
| `backend/docker-entrypoint.sh` | Arranca Xvfb en background antes del proceso de Node. |

### Frontend
| Archivo | Qué hace |
|---|---|
| `src/pages/EmpresasPage.jsx` | Lista con NIT/cédula visibles, búsqueda por nombre/documento, botón "Generar token" siempre visible (solo si la empresa ya tiene `tipoContribuyente`), banner de posibles duplicados con "Fusionar"/"No es duplicado". |
| `src/components/EmpresaCombobox.jsx` | Extraído de `DianUploadPage.jsx`, reusado por el directorio. |

---

## 3. Datos: reconciliación con los Excel de claves (hecha, no repetir)

El usuario pidió completar NIT/cédula de todas las empresas ya existentes usando 5 Excel de
credenciales que él mismo trajo (`CLAVES CLIENTES...xlsx`, `CLAVES PROYECTOS FONDO...xlsx`) — ya
**se borraron de `docs/`** el 2026-09-17 (tenían contraseñas reales en texto plano, nunca se
subieron a git, y ya no hacía falta releerlos).

**Resultado final en producción**: de ~160 empresas del directorio, ~152 quedaron con NIT/cédula
completos. Quedan sin dato (confirmado que no aparecen en ningún catálogo real ni en los Excel,
no es un error, no insistir sin evidencia nueva):
- `NERY'S BLUE HEART` — sin cédula del representante.
- `CECILIA RINCON`, `EVENTOS SANDRA LOPEZ`, `SANDRA PATRICIA` — personas sin dato conocido.
- `NEBRASKA` — dejada así a propósito por el usuario.
- `GC` — es la oficina misma, no es una empresa real, no necesita token.
- Un puñado de empresas que existen en el directorio pero no en ningún módulo real todavía
  (crecieron después del último corte de datos).

Bugs reales encontrados durante esta reconciliación, por si se repite un trabajo similar:
1. **Encabezado repetido en el Excel** ("NOMBRE" aparecía dos veces en la misma hoja, una para el
   dato real y otra para una tabla secundaria más a la derecha) — un `colMap` que no respeta
   "primera ocurrencia gana" pierde silenciosamente la mayoría de las filas.
2. **El directorio maestro puede tener el nombre truncado** porque el backfill de la migración
   053 lo tomó de una tabla de módulo distinta a la que el usuario tenía en mente (ej. "ACHIRAS"
   en el maestro, pero "ACHIRAS DEL RANCHO" en `fondo_empresas`) — al buscar una empresa que
   "debería estar", buscar también en las 4 tablas de módulo, no solo en `empresas`.
3. **Empresas con NIT de una carga anterior a este trabajo** (aprendido antes, vía
   `dianController.js` desde reportes DIAN reales) nunca pasaron por el filtro "sin NIT" de este
   proceso, así que se saltaron sin revisar su cédula aunque sí estuviera en el Excel — hay que
   revisar también las que YA tenían NIT si se sospecha que falta la cédula.
4. Cada vez que se "fusionaban" dos filas duplicadas, había que copiar a mano NIT/tipo/cédula al
   sobreviviente — la función `fusionar` del controlador NO copia esos campos (solo mueve
   habilitaciones de módulo), hay que hacerlo aparte.

---

## 4. Verificación hecha

- 22 tests unitarios de `empresasMaestroController.test.js`, cobertura del backend por encima del
  umbral del 70% (se excluyó `dianTokenService.js` del cálculo, mismo criterio que
  `dianController.js`: es integración real con Playwright, mockearlo no da confianza real).
- Probado end-to-end en producción: generación de token individual y **prueba de carga con 3 y
  con 5 generaciones simultáneas** (CPU ~200% en el Celeron N4020 del servidor —los 2 núcleos casi
  al tope—, RAM entre 1.6 y 2.2 GB de 7 GB totales, sin errores ni caídas).
- Deploy verificado paso a paso: `docker compose build backend migrate` (imagen nueva con Chrome),
  `docker compose up -d migrate` (corre 055/056), `docker compose up -d backend` (healthcheck OK,
  Xvfb corriendo), `docker compose build/up frontend` (UI nueva).

---

## 5. Pendiente real (menor, no urgente)

- `NERY'S BLUE HEART` sin cédula — si el usuario la consigue, agregarla directo en `empresas.cedula_representante`.
- Las ~89 sugerencias de "posible duplicado" por palabra de sector (AVICOLA, GANADERIA,
  RESTAURANTE, VILLA, CLUB, FINCA, HACIENDA, CONSTRUCCIONES, CONTROLES) no se filtran — genera
  ruido real pero manejable con el botón "No es duplicado". No filtrar más palabras sin que el
  usuario lo pida explícitamente (ya pasó una vez con "ASOCIACION").
- Migrar los 4 puntos de creación actuales (Fondo Emprender, Empresas Externas, Nómina
  Electrónica, combobox de Contabilidad) para que busquen/creen contra el directorio maestro en
  vez de crear directo en su propia tabla — sigue sin hacerse, es el único paso del plan original
  que quedó fuera. Sin esto, alguien puede seguir creando una empresa duplicada desde esas 4
  pantallas sin pasar por el directorio.
- Edición de NIT/cédula desde el directorio: hoy se escribe directo en la base de datos cuando
  hace falta corregir algo puntual (no hay UI para eso todavía). Si se vuelve frecuente, valdría
  la pena agregar un formulario en `EmpresasPage.jsx`.

---

## 6. Archivos clave para retomar esto

- `backend/src/services/dianTokenService.js` — automatización de Chrome/DIAN.
- `backend/src/controllers/empresasMaestroController.js` — toda la lógica del directorio.
- `src/pages/EmpresasPage.jsx` — la pantalla.
- `docker-compose.yml` — bind mount del perfil de Chrome, `DIAN_TOKEN_MAX_CONCURRENTE`.
- `docs/ESTADO_CONTABILIDAD_EMPRESAS.md` — el otro feature que vive en el mismo directorio maestro (vía `contab_empresas.empresa_id`).
