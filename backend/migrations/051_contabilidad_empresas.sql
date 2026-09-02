-- Contabilidad — catálogo de empresas + base de datos mensual de facturas clasificadas
-- Migración 051
--
-- Hasta ahora el módulo Contabilidad (antes "DIAN") no tenía noción de "empresa": cada
-- corrida era un borrador desechable (calculo_borradores) que se borraba al exportar el
-- Excel — decisión explícita en su momento (docs/PROPUESTA_MODULO_CONTABILIDAD_DIAN.md).
-- El equipo revisa las mismas facturas varias veces al año con fines distintos (retención
-- mensual, IVA cuatrimestral, exógena anual) y cada vez arrancaba de cero. Esta migración
-- agrega el catálogo de las 52 empresas que se atienden desde este módulo (conjunto propio,
-- verificado sin solapes con fondo_empresas ni ext_empresas) y las tablas para guardar,
-- factura por factura, lo que ya se clasifica hoy en pantalla — igual patrón que
-- ext_empresas + ext_checklist_meses/items, adaptado a "una fila por documento" en vez de
-- "una fila por proceso del checklist".
--
-- Todo es aditivo: no se toca ninguna tabla existente salvo agregar una columna nullable a
-- calculo_borradores (el borrador transitorio sigue funcionando exactamente igual si no se
-- asocia a una empresa).

-- ── 1. Catálogo de empresas ─────────────────────────────────────────────────────
-- nit queda NULL al sembrar (el listado de origen no lo trae) y se completa solo con el
-- primer reporte DIAN que se suba para esa empresa (ver dianController.js#uploadDian) —
-- mismo espíritu que terceros, que también se completa por uso en vez de precargarse.
CREATE TABLE IF NOT EXISTS contab_empresas (
  id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(255) NOT NULL,
  nit        TEXT         UNIQUE,
  activa     BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER contab_empresas_updated_at
  BEFORE UPDATE ON contab_empresas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO contab_empresas (name) VALUES
  ('ACCADEMIA DELLA PASTA TUNJA S.A.S'),
  ('AYC GANADERIA LAS MARIAS S.A.S (RST)'),
  ('CAFE EL LANCERO'),
  ('CARGO GROUP'),
  ('CATACAKES PASTELERIA CREATIVA'),
  ('CERVECERIA RUTA 55'),
  ('CLUB DEPORTIVO “VILLA DE LEYVA TENIS CLUB”'),
  ('COMPAÑIA DE DANZA VITAL ARABE'),
  ('CONSTRUCCIONES EL MOLINO'),
  ('CONTROLES INDUSTRIALES'),
  ('DAYMON'),
  ('ECM INGENIERIA COL S.A.S (RST)'),
  ('ECOVAPOR MULTISERVICIOS'),
  ('ENCOFRADOS BOYACA'),
  ('ESCUELA MINERO SIDERURGICA'),
  ('ESSENZA ACCESORIOS S.A.S.'),
  ('FE ROOM'),
  ('FINCA AGROPECUARIA SAN RAFAEL S.A.S'),
  ('FOUR HILLS TENNIS CLUB'),
  ('FRUTIN HELADO ARTESANAL DESDE 1965 (RST)'),
  ('FUNDACION NUESTRA SEÑORA DE BELENCITO'),
  ('FUNDACION SUBMERCE CULTURA Y FUTURO'),
  ('GANADERIA F.M&L SAS'),
  ('GRANOMIEL'),
  ('HACIENDA PINZON'),
  ('HELICESOLUCIONESINTEGRALES'),
  ('HERENCIA PASTRY'),
  ('HONGOS DEL BOSQUE S.A.S (RST)'),
  ('INGEOMESA'),
  ('INVERSIONES OLITRANS'),
  ('IPSUM'),
  ('JOSE MIGUEL GONZALEZ'),
  ('LA CASONA DE SOFIA UN DULCE PLACER S.A.S'),
  ('LA ESTAMPERIA'),
  ('LIQUEN'),
  ('LOVE STORY'),
  ('MANGUERAS DEL TUNDAMA S.A.S'),
  ('NATURAL ORGANIC PET S.A.S'),
  ('NERY`S BLUE HEART'),
  ('PAEZ MOBILIARIO'),
  ('RESTAURANTE DINO'),
  ('RESTAURANTE ITALIANO PORTONOVO S.A.S'),
  ('RODRIGUEZ ALBA TEJIDOS'),
  ('SANDRA PATRICIA RODRIGUEZ ROJAS'),
  ('SB DIGITAL PUBLICIDAD'),
  ('SIIWA S.A.S'),
  ('SUBLINGENIO S.A.S'),
  ('SUBMERCE'),
  ('TALLER DS ARQUITECTURA E INGENIERIA'),
  ('TRAELO DE USA'),
  ('VIVERO AUTO SOSTENIBLE'),
  ('ZOOM MODELS')
ON CONFLICT DO NOTHING;

-- ── 2. Qué empresa/mes ya está cargado ──────────────────────────────────────────
-- Alimenta la pantalla de consulta (qué períodos existen y se pueden exportar como
-- mensual/cuatrimestral/anual) sin tener que agregar contab_documentos cada vez.
CREATE TABLE IF NOT EXISTS contab_periodos (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id       UUID        NOT NULL REFERENCES contab_empresas(id) ON DELETE CASCADE,
  anio             SMALLINT    NOT NULL,
  mes              SMALLINT    NOT NULL CHECK (mes BETWEEN 1 AND 12),
  nombre_archivo   TEXT,
  total_documentos INTEGER     NOT NULL DEFAULT 0,
  guardado_por     UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, anio, mes)
);

CREATE INDEX idx_contab_periodos_empresa ON contab_periodos(empresa_id);
CREATE INDEX idx_contab_periodos_anio_mes ON contab_periodos(anio, mes);

CREATE TRIGGER contab_periodos_updated_at
  BEFORE UPDATE ON contab_periodos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 3. Una fila por documento del reporte DIAN, ya clasificado ──────────────────
-- cufe es la llave natural que identifica una factura entre re-subidas del mismo mes
-- (UNIQUE con empresa_id): permite decidir en el backend si una fila entrante es nueva o
-- ya existía, sin depender de que el usuario suba el archivo completo exacto cada vez.
-- subtotal se calcula igual que getBaseRetencion en dianController.js (total menos todos
-- los impuestos de la fila), no solo restando IVA.
-- impuestos guarda el resto de impuestos poco comunes (timbre, INC bolsas, IN carbono,
-- IN combustibles, IC datos, ICL, INPP, IBUA, ICUI) como JSONB en vez de una columna por
-- cada uno — son opcionales y rara vez traen valor; evita once columnas casi siempre NULL.
CREATE TABLE IF NOT EXISTS contab_documentos (
  id                       UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id               UUID          NOT NULL REFERENCES contab_empresas(id) ON DELETE CASCADE,
  anio                     SMALLINT      NOT NULL,
  mes                      SMALLINT      NOT NULL CHECK (mes BETWEEN 1 AND 12),
  cufe                     TEXT          NOT NULL,
  tipo_documento           TEXT,
  grupo                    TEXT          NOT NULL CHECK (grupo IN ('Emitido', 'Recibido')),
  fecha_emision            DATE,
  folio                    TEXT,
  prefijo                  TEXT,
  nit_tercero              TEXT,
  nombre_tercero           TEXT,
  subtotal                 NUMERIC(16,2),
  total                    NUMERIC(16,2),
  iva                      NUMERIC(16,2),
  ic                       NUMERIC(16,2),
  inc                      NUMERIC(16,2),
  impuestos                JSONB         NOT NULL DEFAULT '{}',
  clasificacion_retencion  TEXT,
  tasa_retencion           NUMERIC(6,3),
  valor_retencion          NUMERIC(16,2),
  clasificacion_iva        TEXT,
  concepto                 TEXT,
  creado_por               UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, cufe)
);

CREATE INDEX idx_contab_documentos_empresa_periodo ON contab_documentos(empresa_id, anio, mes);
CREATE INDEX idx_contab_documentos_nit_tercero      ON contab_documentos(nit_tercero);

CREATE TRIGGER contab_documentos_updated_at
  BEFORE UPDATE ON contab_documentos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 4. Enganche del borrador transitorio con la empresa ─────────────────────────
-- Nullable a propósito: un borrador sin empresa sigue comportándose exactamente igual que
-- hoy (no exige las clasificaciones nuevas, no se guarda en contab_documentos al exportar).
ALTER TABLE calculo_borradores ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES contab_empresas(id);
