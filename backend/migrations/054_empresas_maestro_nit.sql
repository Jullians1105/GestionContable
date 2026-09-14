-- NIT en el directorio maestro de empresas — hoy solo contab_empresas lo captura (se aprende
-- del primer reporte DIAN subido, ver dianController.js#uploadDian). Se sube a `empresas`
-- porque el NIT es identidad de la empresa real, no algo propio de un módulo — permite usarlo
-- como señal fuerte de duplicado (mismo NIT en dos filas = casi seguro la misma empresa; NIT
-- distinto conocido en ambas = prueba de que NO lo son, así se descartan falsos positivos por
-- nombre parecido). Migración 054.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS nit VARCHAR(20);
CREATE UNIQUE INDEX IF NOT EXISTS idx_empresas_nit ON empresas(nit) WHERE nit IS NOT NULL;

UPDATE empresas e
SET nit = ce.nit
FROM contab_empresas ce
WHERE ce.empresa_id = e.id AND ce.nit IS NOT NULL AND e.nit IS NULL;
