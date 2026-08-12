-- Empresas Externas — columna "contador" (texto libre, no FK a users)
-- Migración 040
--
-- A diferencia de responsable_id (migración 038/039), contador no referencia
-- una cuenta del sistema: es solo la etiqueta con el nombre del contador a
-- cargo, tomada de docs/EMPRESAS.xlsx. Texto libre porque al menos un caso
-- real (Transportes Elite) no tiene un único contador limpio: el Excel trae
-- dos filas con contadores distintos para esa empresa, así que se guarda
-- como "Maritza/Fernando" — un valor que no tendría sentido forzar a un FK.

ALTER TABLE ext_empresas ADD COLUMN contador VARCHAR(255);

UPDATE ext_empresas SET contador = 'Fernando'
WHERE name IN (
  'AGROESANA', 'ANALIZAR', 'ASERCOM', 'AVICOLA VILLA MAR',
  'COMERCIALIZADORA DE ALIMENTOS TEREMAR S & R', 'CONCEPT CONSTRUCTORA',
  'CORTILINE', 'DEFENSA CIVIL DUITAMA', 'EQUIPXA SAS', 'FUNDICIONES METALICAS',
  'GLOB BERRY S.A.S.', 'JORGE MARTINEZ', 'LACTEOS LAS ROCAS', 'MANFIL',
  'PROYECTOS IMPERIO', 'SERVIBANDAS', 'SIGEMIN', 'TORR.CAS IMPORTACIONES',
  'UN MUNDO APICOLA EN SUS MANOS', 'VERLEIH', 'VERTIFEX S.A.S.'
);

UPDATE ext_empresas SET contador = 'Maritza'
WHERE name IN (
  'CECILIA RINCON', 'EDS LA ISLA', 'HACIENDA SUESCUN',
  'INVERSIONES LOGISTICAS FRUANTI', 'LUIS ALBEIRO BECERRA DIAZ',
  'MARTHA PATRICIA ROJAS RINCON', 'PEDRO NEL ROJAS RINCON', 'PRIATOLI',
  'TISAU MATERIALES'
);

UPDATE ext_empresas SET contador = 'Diana'
WHERE name IN (
  'ELIBRY SAS', 'GRANJA AVICOLA PARAISO REAL', 'REFUGIO GENESIS', 'TABBY CENTRO MEDICO'
);

-- Caso ambiguo del Excel: dos filas para la misma empresa con contador distinto.
UPDATE ext_empresas SET contador = 'Maritza/Fernando'
WHERE name = 'TRANSPORTES ELITE';
