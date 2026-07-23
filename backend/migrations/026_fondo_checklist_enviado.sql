-- Seguimiento de envío: una vez confirmada la contabilidad del mes, hay que
-- enviarla y eso también se rastrea. confirmed_at/enviado_at van en columnas
-- propias (no reusar updated_at, que el trigger pisa con cualquier cambio a
-- la fila y volvería incorrecta la fecha mostrada de "confirmado el ...").

ALTER TABLE fondo_checklist_meses
  ADD COLUMN enviado      BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN enviado_at   TIMESTAMPTZ,
  ADD COLUMN confirmed_at TIMESTAMPTZ;

-- Backfill: para filas ya confirmadas, updated_at es lo más cercano que hay
-- a "cuándo se confirmó".
UPDATE fondo_checklist_meses SET confirmed_at = updated_at WHERE confirmed = true;
