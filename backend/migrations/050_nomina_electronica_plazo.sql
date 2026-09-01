-- Nómina Electrónica — plazo de presentación (editable a mano cada mes)
-- Migración 050
--
-- El plazo real de la DIAN son los primeros 10 días hábiles del mes (sin
-- sábados, domingos ni festivos) — varía cada mes y no vale la pena calcularlo
-- acá (festivos colombianos, etc.): el usuario lo actualiza a mano una vez al
-- mes desde la propia página. Singleton (una sola fila), mismo criterio que
-- fondo_pagos_mes_actual (migración 019) para un valor que se controla manual
-- en vez de derivarse de la fecha del sistema.

CREATE TABLE IF NOT EXISTS ne_plazo (
  id            SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  fecha_limite  DATE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER ne_plazo_updated_at
  BEFORE UPDATE ON ne_plazo
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO ne_plazo (id, fecha_limite) VALUES (1, NULL)
  ON CONFLICT (id) DO NOTHING;
