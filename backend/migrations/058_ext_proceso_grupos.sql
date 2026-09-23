-- Empresas Externas — agrupar procesos del Seguimiento Mensual en columnas
-- Migración 058
--
-- Mismo patrón que Fondo Emprender (ver 024_fondo_proceso_grupos.sql): tabla
-- aparte de grupos + grupo_id opcional en ext_procesos, ON DELETE SET NULL
-- porque un grupo no tiene historial propio (borrarlo no debe arrastrar sus
-- procesos). Sin macroproceso_id (eso es el vínculo a "Confirmar Nómina/
-- Contabilidad" de Fondo Emprender — Empresas Externas no tiene ese flujo).

CREATE TABLE IF NOT EXISTS ext_proceso_grupos (
  id         UUID     PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(255) NOT NULL,
  orden      SMALLINT     NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER ext_proceso_grupos_updated_at
  BEFORE UPDATE ON ext_proceso_grupos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE ext_procesos
  ADD COLUMN IF NOT EXISTS grupo_id UUID REFERENCES ext_proceso_grupos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ext_procesos_grupo ON ext_procesos(grupo_id);

-- Seed pedido explícitamente por el equipo: "Nómina" (Nómina, Nómina
-- electrónica, Pago seguridad social, Pago nómina, en ese orden) y
-- "Contabilidad" (el resto, mismo orden relativo que ya tenían). El `orden`
-- de cada proceso es NUEVO y propio de su grupo — no coincide con el
-- `orden` global que tenían antes de agruparse.

INSERT INTO ext_proceso_grupos (name, orden) VALUES
  ('Nómina',       0),
  ('Contabilidad', 1);

UPDATE ext_procesos SET grupo_id = (SELECT id FROM ext_proceso_grupos WHERE name = 'Nómina'), orden = 0 WHERE name = 'Nómina';
UPDATE ext_procesos SET grupo_id = (SELECT id FROM ext_proceso_grupos WHERE name = 'Nómina'), orden = 1 WHERE name = 'Nómina electrónica';
UPDATE ext_procesos SET grupo_id = (SELECT id FROM ext_proceso_grupos WHERE name = 'Nómina'), orden = 2 WHERE name = 'Pago seguridad social';
UPDATE ext_procesos SET grupo_id = (SELECT id FROM ext_proceso_grupos WHERE name = 'Nómina'), orden = 3 WHERE name = 'Pago nómina';

UPDATE ext_procesos SET grupo_id = (SELECT id FROM ext_proceso_grupos WHERE name = 'Contabilidad'), orden = 0 WHERE name = 'Ventas';
UPDATE ext_procesos SET grupo_id = (SELECT id FROM ext_proceso_grupos WHERE name = 'Contabilidad'), orden = 1 WHERE name = 'Compras';
UPDATE ext_procesos SET grupo_id = (SELECT id FROM ext_proceso_grupos WHERE name = 'Contabilidad'), orden = 2 WHERE name = 'Autorretención';
UPDATE ext_procesos SET grupo_id = (SELECT id FROM ext_proceso_grupos WHERE name = 'Contabilidad'), orden = 3 WHERE name = 'Depreciación';
UPDATE ext_procesos SET grupo_id = (SELECT id FROM ext_proceso_grupos WHERE name = 'Contabilidad'), orden = 4 WHERE name = 'Conciliación';
UPDATE ext_procesos SET grupo_id = (SELECT id FROM ext_proceso_grupos WHERE name = 'Contabilidad'), orden = 5 WHERE name = 'Pago impuestos';
UPDATE ext_procesos SET grupo_id = (SELECT id FROM ext_proceso_grupos WHERE name = 'Contabilidad'), orden = 6 WHERE name = 'Caja';
