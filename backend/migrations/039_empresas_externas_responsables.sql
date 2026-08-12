-- Empresas Externas — asignar responsable inicial según docs/EMPRESAS.xlsx
-- Migración 039
--
-- Se vincula por NOMBRE (ILIKE 'Nombre%'), no por un UUID fijo: el Excel solo
-- trae el primer nombre (KAREN, YENY, NATALIA, ANGELA) y la cuenta real de
-- cada persona puede tener un id distinto en cada entorno. Si no existe
-- ningún usuario con ese nombre en la base donde corre esta migración, la
-- subconsulta devuelve NULL y la empresa simplemente queda sin responsable
-- asignado — no falla, y se puede asignar luego a mano desde la grilla.

UPDATE ext_empresas SET responsable_id = (SELECT id FROM users WHERE name ILIKE 'Karen%' LIMIT 1)
WHERE name IN (
  'AGROESANA', 'ANALIZAR', 'DEFENSA CIVIL DUITAMA', 'EQUIPXA SAS',
  'FUNDICIONES METALICAS', 'GLOB BERRY S.A.S.', 'JORGE MARTINEZ', 'MANFIL',
  'REFUGIO GENESIS', 'SERVIBANDAS', 'VERLEIH'
);

UPDATE ext_empresas SET responsable_id = (SELECT id FROM users WHERE name ILIKE 'Yeny%' LIMIT 1)
WHERE name IN (
  'ASERCOM', 'AVICOLA VILLA MAR', 'COMERCIALIZADORA DE ALIMENTOS TEREMAR S & R',
  'CONCEPT CONSTRUCTORA', 'CORTILINE', 'ELIBRY SAS', 'GRANJA AVICOLA PARAISO REAL',
  'INVERSIONES LOGISTICAS FRUANTI', 'LACTEOS LAS ROCAS', 'PRIATOLI', 'PROYECTOS IMPERIO',
  'SIGEMIN', 'TABBY CENTRO MEDICO', 'TISAU MATERIALES', 'UN MUNDO APICOLA EN SUS MANOS',
  'VERTIFEX S.A.S.'
);

UPDATE ext_empresas SET responsable_id = (SELECT id FROM users WHERE name ILIKE 'Natalia%' LIMIT 1)
WHERE name IN (
  'CECILIA RINCON', 'EDS LA ISLA', 'HACIENDA SUESCUN', 'LUIS ALBEIRO BECERRA DIAZ',
  'MARTHA PATRICIA ROJAS RINCON', 'PEDRO NEL ROJAS RINCON', 'TRANSPORTES ELITE'
);

UPDATE ext_empresas SET responsable_id = (SELECT id FROM users WHERE name ILIKE 'Angela%' LIMIT 1)
WHERE name IN ('TORR.CAS IMPORTACIONES');
