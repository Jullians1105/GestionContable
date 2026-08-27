-- Base de datos de terceros (dirección/municipio/departamento) extraídos de PDFs de factura
-- DIAN. De uso general, no exclusiva de Exógenas: nació para resolver el formato 1001
-- (pagos/abonos en cuenta, que necesita estos datos por tercero y no vienen en el TOKEN de
-- compras/ventas que ya usan 1005/1006), pero cualquier módulo puede consultarla.
-- Llave por NIT: cada factura procesada hace upsert, así que el registro de un tercero se va
-- completando/actualizando con la última factura vista, sin duplicar filas.
-- Migración 042

CREATE TABLE IF NOT EXISTS terceros (
  nit                       TEXT        PRIMARY KEY,
  razon_social              TEXT        NOT NULL,
  direccion                 TEXT,
  municipio                 TEXT,
  codigo_municipio_dane     CHAR(5),
  departamento              TEXT,
  codigo_departamento_dane  CHAR(2),
  actualizado_por           UUID        REFERENCES users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER terceros_updated_at
  BEFORE UPDATE ON terceros
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
