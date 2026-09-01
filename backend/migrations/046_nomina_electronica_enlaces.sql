-- Nómina Electrónica — enlaces adicionales confirmados con el usuario
-- Migración 046
--
-- La migración 045 enlazó por coincidencia exacta/prefijo de nombre normalizado.
-- Estas son la misma empresa escrita distinto entre el Excel y los catálogos
-- de Fondo Emprender / Empresas Externas (typos, "Asociación"/"Granja"/etc. de
-- más, abreviaturas) — confirmado manualmente con el usuario, no por match
-- automático. Mismo patrón que 039_empresas_externas_responsables.sql: UPDATE
-- por nombre exacto, si alguno no existe en el entorno la fila simplemente no
-- se toca.

UPDATE ne_empresas SET ext_empresa_id = (SELECT id FROM ext_empresas WHERE name = 'PROYECTOS IMPERIO')
WHERE name = 'PROYECTO IMPERIO';

UPDATE ne_empresas SET fondo_empresa_id = (SELECT id FROM fondo_empresas WHERE name = 'INDUSTRIA SAE')
WHERE name = 'INDUSTRIAS SAE';

UPDATE ne_empresas SET fondo_empresa_id = (SELECT id FROM fondo_empresas WHERE name = 'ISOMETRICOS 3D')
WHERE name = 'ISOMÉTRICO 3D';

UPDATE ne_empresas SET fondo_empresa_id = (SELECT id FROM fondo_empresas WHERE name = 'CAPROVIVA')
WHERE name = 'CAPRO VIVA';

UPDATE ne_empresas SET fondo_empresa_id = (SELECT id FROM fondo_empresas WHERE name = 'ELIARCHIRA')
WHERE name = 'ELIARCHILA';

UPDATE ne_empresas SET ext_empresa_id = (SELECT id FROM ext_empresas WHERE name = 'TISAU MATERIALES')
WHERE name = 'TISAU MATERIALS SAS';

UPDATE ne_empresas SET fondo_empresa_id = (SELECT id FROM fondo_empresas WHERE name = 'ASOCIACION MAGIA FURA Y TENA')
WHERE name = 'ASOCIACION FURA Y TENA';

UPDATE ne_empresas SET fondo_empresa_id = (SELECT id FROM fondo_empresas WHERE name = 'ASOCIACIÓN GANADERIA EL PORVENIR')
WHERE name = 'ASO. GANADERIA EL PORVENIR';

UPDATE ne_empresas SET fondo_empresa_id = (SELECT id FROM fondo_empresas WHERE name = 'GRANJA AVICOLA DOS ALMAS')
WHERE name = 'AVICOLA DOS ALMAS';

UPDATE ne_empresas SET fondo_empresa_id = (SELECT id FROM fondo_empresas WHERE name = 'ASOCIACION DE APICULTORES CARRANGUEROS')
WHERE name = 'ASO. APICULTORES CARRANGUEROS';

UPDATE ne_empresas SET fondo_empresa_id = (SELECT id FROM fondo_empresas WHERE name = 'ASOCIACIÓN DE MUJERES EMPRENDEDORAS')
WHERE name = 'ASO. MUJERES EMPRENDEDORAS';

UPDATE ne_empresas SET fondo_empresa_id = (SELECT id FROM fondo_empresas WHERE name = 'AVICOLA EL CORRAL DE DANIELA')
WHERE name = 'EL CORRAL DE DANIELA';

UPDATE ne_empresas SET fondo_empresa_id = (SELECT id FROM fondo_empresas WHERE name = 'ASOCIACION HERENCIA ANCESTRAL')
WHERE name = 'HERENCIA ANCESTRAL';

UPDATE ne_empresas SET fondo_empresa_id = (SELECT id FROM fondo_empresas WHERE name = 'PANADERIA ARTESANAL')
WHERE name = 'PANADERIA Y PASTELERIA ARTESANAL';

UPDATE ne_empresas SET fondo_empresa_id = (SELECT id FROM fondo_empresas WHERE name = 'FUNDACION PLANETA 24/7')
WHERE name = 'PLANETA 24/7';

UPDATE ne_empresas SET ext_empresa_id = (SELECT id FROM ext_empresas WHERE name = 'LUIS ALBEIRO BECERRA DIAZ')
WHERE name = 'ALBEIRO BECERRA';

UPDATE ne_empresas SET fondo_empresa_id = (SELECT id FROM fondo_empresas WHERE name = 'INDUSTRIAS ALTUZARRA')
WHERE name = 'ALTUZARRA';

UPDATE ne_empresas SET fondo_empresa_id = (SELECT id FROM fondo_empresas WHERE name = 'ASOCIACION ASOFRESAS')
WHERE name = 'ASOFRESAS';

UPDATE ne_empresas SET ext_empresa_id = (SELECT id FROM ext_empresas WHERE name = 'INVERSIONES LOGISTICAS FRUANTI')
WHERE name = 'FRUANTI';

UPDATE ne_empresas SET ext_empresa_id = (SELECT id FROM ext_empresas WHERE name = 'COMERCIALIZADORA DE ALIMENTOS TEREMAR S & R')
WHERE name = 'TEREMAR';

UPDATE ne_empresas SET fondo_empresa_id = (SELECT id FROM fondo_empresas WHERE name = 'GANADERIA DE CRIA THERMOGAN')
WHERE name = 'THERMOGAN';
