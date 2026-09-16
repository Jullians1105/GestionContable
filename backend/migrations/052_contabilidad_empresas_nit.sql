-- Contabilidad — completa el NIT de las 52 empresas sembradas en la migración 051
-- Migración 052
--
-- El listado de origen (docs/LISTADO EMPRESAS.xlsx) no traía NIT, así que 051 las sembró
-- solo con el nombre. Estos NITs salen de docs/VENCIMIENTOS 2026.xlsx (columnas EMPRESA/NIT
-- de las hojas mensuales de retención), cruzados por nombre normalizado contra las 52
-- empresas: 45 coincidieron exacto, 7 por variantes obvias de la planilla (typos o razón
-- social con palabras de más, ej. "PAEZ MOVILIARIO" → "PAEZ MOBILIARIO", mismo NIT en 9 filas
-- de ese archivo). Sin conflictos: cada nombre mapeó a un único NIT en todas sus apariciones,
-- y no hay dos empresas de las 52 con el mismo NIT.
--
-- `AND nit IS NULL` en cada UPDATE es deliberado: si para cuando esto se despliegue ya se
-- completó algún NIT por uso real (primer reporte subido para esa empresa, ver
-- dianController.js#uploadDian), este seed no lo pisa — evita reintroducir un dato viejo
-- sobre uno más reciente y real.

UPDATE contab_empresas SET nit = '901790075' WHERE name = 'ACCADEMIA DELLA PASTA TUNJA S.A.S' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901800656' WHERE name = 'AYC GANADERIA LAS MARIAS S.A.S (RST)' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901628937' WHERE name = 'CAFE EL LANCERO' AND nit IS NULL;
UPDATE contab_empresas SET nit = '902062338' WHERE name = 'CARGO GROUP' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901794612' WHERE name = 'CATACAKES PASTELERIA CREATIVA' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901705893' WHERE name = 'CERVECERIA RUTA 55' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901896875' WHERE name = 'CLUB DEPORTIVO “VILLA DE LEYVA TENIS CLUB”' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901786191' WHERE name = 'COMPAÑIA DE DANZA VITAL ARABE' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901445854' WHERE name = 'CONSTRUCCIONES EL MOLINO' AND nit IS NULL;
UPDATE contab_empresas SET nit = '826001659' WHERE name = 'CONTROLES INDUSTRIALES' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901797513' WHERE name = 'DAYMON' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901796876' WHERE name = 'ECM INGENIERIA COL S.A.S (RST)' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901795146' WHERE name = 'ECOVAPOR MULTISERVICIOS' AND nit IS NULL;
UPDATE contab_empresas SET nit = '900746343' WHERE name = 'ENCOFRADOS BOYACA' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901792223' WHERE name = 'ESCUELA MINERO SIDERURGICA' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901793974' WHERE name = 'ESSENZA ACCESORIOS S.A.S.' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901178092' WHERE name = 'FE ROOM' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901816250' WHERE name = 'FINCA AGROPECUARIA SAN RAFAEL S.A.S' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901798011' WHERE name = 'FOUR HILLS TENNIS CLUB' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901792586' WHERE name = 'FRUTIN HELADO ARTESANAL DESDE 1965 (RST)' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901782992' WHERE name = 'FUNDACION NUESTRA SEÑORA DE BELENCITO' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901993850' WHERE name = 'FUNDACION SUBMERCE CULTURA Y FUTURO' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901918843' WHERE name = 'GANADERIA F.M&L SAS' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901603900' WHERE name = 'GRANOMIEL' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901814240' WHERE name = 'HACIENDA PINZON' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901557533' WHERE name = 'HELICESOLUCIONESINTEGRALES' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901793944' WHERE name = 'HERENCIA PASTRY' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901792613' WHERE name = 'HONGOS DEL BOSQUE S.A.S (RST)' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901559102' WHERE name = 'INGEOMESA' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901607418' WHERE name = 'INVERSIONES OLITRANS' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901452221' WHERE name = 'IPSUM' AND nit IS NULL;
UPDATE contab_empresas SET nit = '7223752'   WHERE name = 'JOSE MIGUEL GONZALEZ' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901786151' WHERE name = 'LA CASONA DE SOFIA UN DULCE PLACER S.A.S' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901797777' WHERE name = 'LA ESTAMPERIA' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901559756' WHERE name = 'LIQUEN' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901790132' WHERE name = 'LOVE STORY' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901816390' WHERE name = 'MANGUERAS DEL TUNDAMA S.A.S' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901794836' WHERE name = 'NATURAL ORGANIC PET S.A.S' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901620207' WHERE name = 'NERY`S BLUE HEART' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901178051' WHERE name = 'PAEZ MOBILIARIO' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901566482' WHERE name = 'RESTAURANTE DINO' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901799745' WHERE name = 'RESTAURANTE ITALIANO PORTONOVO S.A.S' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901808082' WHERE name = 'RODRIGUEZ ALBA TEJIDOS' AND nit IS NULL;
UPDATE contab_empresas SET nit = '47430977'  WHERE name = 'SANDRA PATRICIA RODRIGUEZ ROJAS' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901605503' WHERE name = 'SB DIGITAL PUBLICIDAD' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901798317' WHERE name = 'SIIWA S.A.S' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901607455' WHERE name = 'SUBLINGENIO S.A.S' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901639699' WHERE name = 'SUBMERCE' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901796778' WHERE name = 'TALLER DS ARQUITECTURA E INGENIERIA' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901797832' WHERE name = 'TRAELO DE USA' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901795141' WHERE name = 'VIVERO AUTO SOSTENIBLE' AND nit IS NULL;
UPDATE contab_empresas SET nit = '901798514' WHERE name = 'ZOOM MODELS' AND nit IS NULL;
