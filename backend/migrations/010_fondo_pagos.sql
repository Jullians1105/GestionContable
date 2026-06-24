-- Fondo Emprender — mensualidad por empresa y registro de pagos a la fiduciaria
-- Migración 010

-- ── 1. Mensualidad base en fondo_empresas ─────────────────────────────────────
-- NULL para las 30 empresas existentes: el dato real se completa a mano desde la UI.

ALTER TABLE fondo_empresas
  ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC(12,2);

-- ── 2. Registro de pagos por empresa × mes vencido ────────────────────────────
-- Un registro por mes vencido que se está cobrando (no el mes de envío de documentos).
-- Se actualiza in-place a medida que avanza el proceso con la fiduciaria; nunca se crea
-- un registro nuevo para un reintento tras rechazo — se actualiza el existente.
--
-- estados:
--   pendiente  — no se ha subido nada todavía
--   enviado    — documentos subidos a la plataforma, esperando al fiduciario
--   aprobado   — fiduciario aprobó el desembolso (UI lo muestra como "Pagado")
--   rechazado  — fiduciario anuló; el registro se reutiliza cuando se reenvíe

CREATE TABLE IF NOT EXISTS fondo_pagos (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id        UUID        NOT NULL REFERENCES fondo_empresas(id) ON DELETE CASCADE,
  anio              SMALLINT    NOT NULL,
  mes               SMALLINT    NOT NULL CHECK (mes BETWEEN 1 AND 12),
  estado            VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','enviado','aprobado','rechazado')),
  fecha_envio       DATE,
  fecha_resolucion  DATE,
  monto             NUMERIC(12,2),
  -- snapshot de monthly_fee al crear este registro; no se recalcula si monthly_fee cambia
  registrado_por    UUID        REFERENCES users(id) ON DELETE SET NULL,
  -- quién hizo la última anotación manual (no un aprobador — el flujo de aprobación es externo)
  nota              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, anio, mes)
);

CREATE INDEX idx_fondo_pagos_anio_mes    ON fondo_pagos(anio, mes);
CREATE INDEX idx_fondo_pagos_empresa     ON fondo_pagos(empresa_id);
CREATE INDEX idx_fondo_pagos_estado      ON fondo_pagos(estado);

CREATE TRIGGER fondo_pagos_updated_at
  BEFORE UPDATE ON fondo_pagos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
