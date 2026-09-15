-- Datos necesarios para generar el token de acceso a la DIAN (catalogo-vpfe.dian.gov.co/User/Login)
-- desde el directorio maestro de empresas — ver empresasMaestroController.js#generarTokenDian.
-- Migración 055
--
-- 'empresa' usa NIT (ya existe en empresas.nit) + cedula del representante legal (columna
-- nueva). 'natural' solo necesita un documento — se reutiliza empresas.nit para eso (en
-- Colombia el NIT de una persona natural para efectos tributarios es su propia cédula), sin
-- agregar una columna aparte para un dato que ya cabe en la existente.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS tipo_contribuyente VARCHAR(20)
  CHECK (tipo_contribuyente IN ('empresa', 'natural'));
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS cedula_representante VARCHAR(20);

UPDATE empresas SET tipo_contribuyente = 'empresa', cedula_representante = '1052395147'
WHERE name = 'LIQUEN';
