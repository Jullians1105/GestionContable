-- Nómina Electrónica — fecha límite POR MES (reemplaza el singleton ne_plazo)
-- Migración 061
--
-- ne_plazo (migración 050) guardaba una sola fecha para todo el módulo: al
-- editar el plazo de un mes se pisaba el de los demás, y el mes recién
-- habilitado heredaba el plazo ya vencido del anterior. Ahora cada mes de
-- trabajo (anio, mes) tiene su propia fecha. ne_plazo se deja en su lugar sin
-- usarse (no se borra: sirve de respaldo del valor que había).

CREATE TABLE IF NOT EXISTS ne_plazo_mes (
  anio          SMALLINT    NOT NULL,
  mes           SMALLINT    NOT NULL CHECK (mes BETWEEN 1 AND 12),
  fecha_limite  DATE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (anio, mes)
);

CREATE TRIGGER ne_plazo_mes_updated_at
  BEFORE UPDATE ON ne_plazo_mes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- La fecha límite de un mes de trabajo cae siempre en el mes SIGUIENTE (los
-- primeros días hábiles), así que la fecha vigente se asigna al mes anterior a
-- su propio mes: 15-oct-2026 -> septiembre 2026.
INSERT INTO ne_plazo_mes (anio, mes, fecha_limite)
SELECT EXTRACT(YEAR  FROM (fecha_limite - INTERVAL '1 month'))::smallint,
       EXTRACT(MONTH FROM (fecha_limite - INTERVAL '1 month'))::smallint,
       fecha_limite
FROM ne_plazo
WHERE fecha_limite IS NOT NULL
ON CONFLICT (anio, mes) DO NOTHING;
