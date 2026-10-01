-- Directorio de empresas — documento de personas naturales en `nit`
-- Migración 062
--
-- Para una persona natural el documento vive en `empresas.nit` (la lista y el token DIAN lo
-- leen de ahí). El formulario de edición ocultaba el campo NIT para naturales, solo dejaba
-- "Cédula representante", y al guardar mandaba nit = NULL: quien escribía la cédula en el
-- único campo visible borraba el documento real y quedaba "Sin NIT/cédula" en la lista.
-- Esto recoge esos casos: pasa la cédula a `nit` y limpia el campo del representante, que
-- para una persona natural no aplica. Solo toca filas con nit vacío.

UPDATE empresas
SET nit = cedula_representante,
    cedula_representante = NULL
WHERE tipo_contribuyente = 'natural'
  AND nit IS NULL
  AND cedula_representante IS NOT NULL;
