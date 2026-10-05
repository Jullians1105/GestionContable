-- Deudas vencidas DIAN — revisión mensual por empresa contra MUISCA (ver
-- services/dianDeudasService.js). Reemplaza al Excel "DEUDAS VENCIDAS DIAN" (una hoja por mes).
-- Migración 065
--
-- 1) empresas: la clave DIAN va CIFRADA (AES-256-GCM, ver utils/secretos.js), nunca en claro ni
--    expuesta por la API. `dian_clave_estado` registra el resultado del último login con ella:
--    se verifica al guardarla y se actualiza en cada revisión, para no seguir intentando con una
--    clave mala (la DIAN bloquea la cuenta del cliente tras varios intentos fallidos).
--    `iva_periodicidad` hace falta para traducir el "periodo 2" de la DIAN a un texto humano
--    (bimestre marzo-abril vs cuatrimestre mayo-agosto): el número solo no lo dice.
-- 2) dian_deudas_revisiones: UNA fila por empresa y mes (re-revisar el mismo mes la reemplaza).
-- 3) dian_deudas_detalle: una fila por obligación vencida encontrada, con el valor YA con
--    intereses a la fecha de la revisión (el de la liquidación), y su estado frente a los recibos
--    pagados: 'vigente' (se debe), 'pagada' (hay recibo del mismo año/periodo/concepto/valor) o
--    'revisar' (hay recibo del mismo año/periodo/concepto pero el valor difiere: lo decide una
--    persona).
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS dian_clave_cifrada TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS dian_clave_estado TEXT
  CHECK (dian_clave_estado IN ('verificada', 'invalida'));
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS dian_clave_verificada_at TIMESTAMPTZ;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS iva_periodicidad TEXT
  CHECK (iva_periodicidad IN ('bimestral', 'cuatrimestral'));

CREATE TABLE IF NOT EXISTS dian_deudas_revisiones (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id         UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  -- Primer día del mes de la revisión (zona Bogotá), ej. 2026-10-01.
  mes                DATE        NOT NULL,
  estado             TEXT        NOT NULL CHECK (estado IN ('al_dia', 'con_deuda', 'clave', 'error')),
  mensaje            TEXT,
  revisado_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revisado_por       UUID        REFERENCES users(id) ON DELETE SET NULL,
  correo_enviado_at  TIMESTAMPTZ,
  correo_enviado_por UUID        REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (empresa_id, mes)
);

CREATE INDEX IF NOT EXISTS idx_dian_deudas_revisiones_mes ON dian_deudas_revisiones (mes);

CREATE TABLE IF NOT EXISTS dian_deudas_detalle (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  revision_id     UUID          NOT NULL REFERENCES dian_deudas_revisiones(id) ON DELETE CASCADE,
  concepto        TEXT          NOT NULL CHECK (concepto IN ('rete_fte', 'inc', 'iva', 'renta', 'otro')),
  tipo_obligacion TEXT          NOT NULL,
  anio            SMALLINT      NOT NULL,
  periodo         SMALLINT      NOT NULL,
  obligacion      TEXT,
  valor_base      NUMERIC(16,2),
  valor_total     NUMERIC(16,2) NOT NULL,
  estado          TEXT          NOT NULL CHECK (estado IN ('vigente', 'pagada', 'revisar')),
  nota            TEXT
);

CREATE INDEX IF NOT EXISTS idx_dian_deudas_detalle_revision ON dian_deudas_detalle (revision_id);
