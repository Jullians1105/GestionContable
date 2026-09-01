-- Seguimiento de Nómina Electrónica — catálogo de empresas y estado mensual
-- Migración 045
--
-- Reemplaza el Excel "LISTADO NOMINAS ELECTRONICAS.xlsx" que llevaba una sola
-- persona. Cada empresa tiene un responsable propio (Maritza, Diana, o quien
-- corresponda) y puede opcionalmente enlazarse a una empresa de Fondo
-- Emprender y/o de Empresas Externas — ese enlace es lo que permite que la
-- celda "Nómina electrónica" de esos dos seguimientos mensuales pase a
-- reflejar en vivo lo que se marque acá (ver fondoDetalleController.js,
-- fondoChecklistController.js y extChecklistController.js).

-- ── 1. Catálogo de empresas ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ne_empresas (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(255) NOT NULL,
  responsable_id    UUID         REFERENCES users(id)          ON DELETE SET NULL,
  fondo_empresa_id  UUID         REFERENCES fondo_empresas(id) ON DELETE SET NULL,
  ext_empresa_id    UUID         REFERENCES ext_empresas(id)   ON DELETE SET NULL,
  activa            BOOLEAN      NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ne_empresas_responsable ON ne_empresas(responsable_id);

-- Una empresa de Fondo Emprender o de Empresas Externas no puede quedar
-- enlazada dos veces (rompería la derivación: ¿cuál de las dos manda?).
CREATE UNIQUE INDEX idx_ne_empresas_fondo_unico ON ne_empresas(fondo_empresa_id) WHERE fondo_empresa_id IS NOT NULL;
CREATE UNIQUE INDEX idx_ne_empresas_ext_unico   ON ne_empresas(ext_empresa_id)   WHERE ext_empresa_id   IS NOT NULL;

CREATE TRIGGER ne_empresas_updated_at
  BEFORE UPDATE ON ne_empresas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 2. Estado mensual por empresa ──────────────────────────────────────────────
-- estado: 'pendiente' (rojo, ya se puede presentar y falta confirmar) es el
-- default — no hace falta insertar una fila para que una empresa se vea
-- pendiente en un mes vencido, el GET la sintetiza igual que en
-- ext_checklist_items. tiene_novedad/novedad_nota es un eje aparte (el "SI/NO"
-- que se anotaba al lado del nombre en el Excel, con el motivo en un
-- comentario) — no cambia el color del estado. nota es el motivo obligatorio
-- en UI cuando estado = 'no_aplica' (bloqueada, ya no se le hace, o no envía
-- información).

CREATE TABLE IF NOT EXISTS ne_meses (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id     UUID        NOT NULL REFERENCES ne_empresas(id) ON DELETE CASCADE,
  anio           SMALLINT    NOT NULL,
  mes            SMALLINT    NOT NULL CHECK (mes BETWEEN 1 AND 12),
  estado         VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                 CHECK (estado IN ('pendiente', 'presentada', 'no_aplica')),
  tiene_novedad  BOOLEAN     NOT NULL DEFAULT false,
  novedad_nota   TEXT,
  nota           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, anio, mes)
);

CREATE INDEX idx_ne_meses_anio_mes ON ne_meses(anio, mes);
CREATE INDEX idx_ne_meses_empresa  ON ne_meses(empresa_id);

CREATE TRIGGER ne_meses_updated_at
  BEFORE UPDATE ON ne_meses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 3. Semilla — listado vigente según docs/LISTADO NOMINAS ELECTRONICAS.xlsx ──
-- (hoja "N.E AGO 26", la más reciente al momento de esta migración). Solo se
-- importa el catálogo (empresa + enlaces); el histórico mes a mes del Excel
-- NO se migra — el seguimiento arranca limpio desde el mes vigente.
--
-- responsable_id queda deliberadamente NULL para las 109: en el Excel,
-- "MARITZA"/"DIANA" identificaban de quién era el cliente en general, no
-- quién presenta la nómina electrónica — asignar eso quedó pendiente,
-- se hace luego a mano desde el catálogo (solo admin).
--
-- Los enlaces a fondo_empresa_id / ext_empresa_id se resolvieron por nombre
-- normalizado (mayúsculas, sin tildes/puntuación) contra los catálogos
-- existentes; lo que no cruzó queda sin enlazar.

INSERT INTO ne_empresas (name, fondo_empresa_id, ext_empresa_id) VALUES
  ('COMPAÑIA DE DANZA VITAL', NULL, NULL),
  ('LA CASONA DE SOFIA', NULL, NULL),
  ('DAYMON COLOMBIA S.A.S', NULL, NULL),
  ('ESSENZA ACCESORIOS S.A.S.', NULL, NULL),
  ('RESTAURANTE ITALIANO PORTONOVO', NULL, NULL),
  ('TISAU MATERIALS SAS', NULL, NULL),
  ('LA ESTAMPERÍA S.A.S', NULL, NULL),
  ('MANGUERAS DEL TUNDAMA', NULL, NULL),
  ('HATO LECHERO HACIENDA PINZON', NULL, NULL),
  ('FRUTIN HELADO ARTESANAL DESDE 1965', NULL, NULL),
  ('TRANSPORTES ELITE', NULL, (SELECT id FROM ext_empresas WHERE name = 'TRANSPORTES ELITE')),
  ('AGENCIA MOBA', (SELECT id FROM fondo_empresas WHERE name = 'AGENCIA MOBA'), NULL),
  ('ROSAS VILLA ALCIRA', (SELECT id FROM fondo_empresas WHERE name = 'ROSAS VILLA ALCIRA'), NULL),
  ('OVINOS EL CAYADO', (SELECT id FROM fondo_empresas WHERE name = 'OVINOS EL CAYADO'), NULL),
  ('LATTE CORAZON', (SELECT id FROM fondo_empresas WHERE name = 'LATTE CORAZÓN'), NULL),
  ('DE LA FINCA HUEVOS', (SELECT id FROM fondo_empresas WHERE name = 'DE LA FINCA HUEVOS'), NULL),
  ('SALVITA', (SELECT id FROM fondo_empresas WHERE name = 'SALVITA'), NULL),
  ('INDUSTRIAS SAE', NULL, NULL),
  ('ARANDANOS DE LA FUENTE', (SELECT id FROM fondo_empresas WHERE name = 'ARANDANOS DE LA FUENTE'), NULL),
  ('ASOCIACION ALEYA', (SELECT id FROM fondo_empresas WHERE name = 'ASOCIACIÓN ALEYA'), NULL),
  ('ALBEIRO BECERRA', NULL, NULL),
  ('PORCICOLA GERONIMO', (SELECT id FROM fondo_empresas WHERE name = 'PORCICOLA GERONIMO'), NULL),
  ('ASOCIACION APICULTURA AL RESCATE', (SELECT id FROM fondo_empresas WHERE name = 'ASOCIACION APICULTURA AL RESCATE'), NULL),
  ('TRAELODEUSA', NULL, NULL),
  ('SUBMERCE', NULL, NULL),
  ('JR AVICOLA ZETAQUIRA', (SELECT id FROM fondo_empresas WHERE name = 'JR AVICOLA ZETAQUIRA'), NULL),
  ('ASOCIACION VILLARTEC', NULL, NULL),
  ('LAVONIA LABS', (SELECT id FROM fondo_empresas WHERE name = 'LAVONIA LABS'), NULL),
  ('FRUANTI', NULL, NULL),
  ('ASO. GANADERIA EL PORVENIR', NULL, NULL),
  ('ASO. MUJERES EMPRENDEDORAS', NULL, NULL),
  ('ASO. APICULTORES CARRANGUEROS', NULL, NULL),
  ('SABORES ANCESTRALES', (SELECT id FROM fondo_empresas WHERE name = 'SABORES ANCESTRALES'), NULL),
  ('KUNA EXPERIENCES', (SELECT id FROM fondo_empresas WHERE name = 'KUNA EXPERIENCES SAS'), NULL),
  ('ESPINOSETAS', (SELECT id FROM fondo_empresas WHERE name = 'ESPINOSETAS'), NULL),
  ('HAPS', (SELECT id FROM fondo_empresas WHERE name = 'HAPS'), NULL),
  ('ASOCIACION AVICOLA CHICAMOCHA', (SELECT id FROM fondo_empresas WHERE name = 'ASOCIACION AVICOLA CHICAMOCHA'), NULL),
  ('TRADICION DE LOS ABUELOS', (SELECT id FROM fondo_empresas WHERE name = 'TRADICION DE LOS ABUELOS CAFE ARTESANAL PAIPANO'), NULL),
  ('PRIATOLI', NULL, (SELECT id FROM ext_empresas WHERE name = 'PRIATOLI')),
  ('ASOCIACION BOYAFRUIT', (SELECT id FROM fondo_empresas WHERE name = 'ASOCIACION BOYAFRUIT'), NULL),
  ('LA ESTACION', NULL, NULL),
  ('CAMSILAC', (SELECT id FROM fondo_empresas WHERE name = 'CAMSILAC'), NULL),
  ('AMASIJOS DON PABLO SAS', (SELECT id FROM fondo_empresas WHERE name = 'AMASIJOS DON PABLO SAS'), NULL),
  ('BIOBRASA', (SELECT id FROM fondo_empresas WHERE name = 'BIOBRASA'), NULL),
  ('AVORAP SAS', (SELECT id FROM fondo_empresas WHERE name = 'AVORAP'), NULL),
  ('INVENTO COLOMBIA', (SELECT id FROM fondo_empresas WHERE name = 'INVENTO COLOMBIA'), NULL),
  ('BRULEE REPOSTERIA', (SELECT id FROM fondo_empresas WHERE name = 'BRULEE REPOSTERIA'), NULL),
  ('CLARO QUE SI', (SELECT id FROM fondo_empresas WHERE name = 'CLARO QUE SI'), NULL),
  ('CATACAKES PASTELERIA', NULL, NULL),
  ('ECOVAPOR MULTISERVICIOS', NULL, NULL),
  ('ELIBRY', NULL, (SELECT id FROM ext_empresas WHERE name = 'ELIBRY SAS')),
  ('FINCA AGROPECUARIA SAN RAFAEL', NULL, NULL),
  ('FOUR HILLS TENNIS CLUB', NULL, NULL),
  ('GRANJA AVICOLA PARAISO REAL', NULL, (SELECT id FROM ext_empresas WHERE name = 'GRANJA AVICOLA PARAISO REAL')),
  ('HERENCIA PASTRY', NULL, NULL),
  ('LA GALERIA NOBSA', NULL, NULL),
  ('NATURAL ORGANIC PET S.A.S', NULL, NULL),
  ('VETERINARIA TABBY', NULL, NULL),
  ('GANADERIA F.M&L', NULL, NULL),
  ('ELIARCHILA', NULL, NULL),
  ('ALTUZARRA', NULL, NULL),
  ('CAPRO VIVA', NULL, NULL),
  ('THERMOGAN', NULL, NULL),
  ('MIELE DI BOSCO', (SELECT id FROM fondo_empresas WHERE name = 'MIELE DI BOSCO'), NULL),
  ('AVICOLA DOS ALMAS', NULL, NULL),
  ('MAMANKANA', (SELECT id FROM fondo_empresas WHERE name = 'MAMANKANA PARRILLA SABOR Y TRADICION S.A.S'), NULL),
  ('ACHIRAS', (SELECT id FROM fondo_empresas WHERE name = 'ACHIRAS DEL RANCHO'), NULL),
  ('DESHIDRATADOS', (SELECT id FROM fondo_empresas WHERE name = 'DESHIDRATADOS DE MI PROVINCIA'), NULL),
  ('EL CORRAL DE DANIELA', NULL, NULL),
  ('SEVEN BLESS', (SELECT id FROM fondo_empresas WHERE name = 'SEVEN BLESS SAS'), NULL),
  ('ASOCIACION FURA Y TENA', NULL, NULL),
  ('JAIM YAFE', (SELECT id FROM fondo_empresas WHERE name = 'JAIM YAFE'), NULL),
  ('BISTRO CHIA', (SELECT id FROM fondo_empresas WHERE name = 'BISTRO CHIA SAS'), NULL),
  ('ASOCIACION AROMATICAS', NULL, NULL),
  ('PLANETA 24/7', NULL, NULL),
  ('ASOCIACION ARTE BOIACA', (SELECT id FROM fondo_empresas WHERE name = 'ASOCIACION ARTE BOIACA'), NULL),
  ('HERENCIA ANCESTRAL', NULL, NULL),
  ('TY SUASIA', (SELECT id FROM fondo_empresas WHERE name = 'TY SUASIA HOSPEDAJE RURAL'), NULL),
  ('ASOFRESAS', NULL, NULL),
  ('ENTRE NOPALES', (SELECT id FROM fondo_empresas WHERE name = 'ENTRE NOPALES'), NULL),
  ('ISOMÉTRICO 3D', NULL, NULL),
  ('ESENZA ESPECIAS SAS', (SELECT id FROM fondo_empresas WHERE name = 'ESENZA ESPECIAS'), NULL),
  ('PANADERIA Y PASTELERIA ARTESANAL', NULL, NULL),
  ('RUSTIC HOUSE COLOMBIA', (SELECT id FROM fondo_empresas WHERE name = 'RUSTIC HOUSE'), NULL),
  ('ASERCOM', NULL, (SELECT id FROM ext_empresas WHERE name = 'ASERCOM')),
  ('RESTAURANTE DINO', NULL, NULL),
  ('PROYECTO IMPERIO', NULL, NULL),
  ('CORTILINE', NULL, (SELECT id FROM ext_empresas WHERE name = 'CORTILINE')),
  ('SERVIBANDAS', NULL, (SELECT id FROM ext_empresas WHERE name = 'SERVIBANDAS')),
  ('REFUGIO GENESIS', NULL, (SELECT id FROM ext_empresas WHERE name = 'REFUGIO GENESIS')),
  ('UN MUNDO APICOLA', NULL, (SELECT id FROM ext_empresas WHERE name = 'UN MUNDO APICOLA EN SUS MANOS')),
  ('FE ROOM', NULL, NULL),
  ('SIGEMIN', NULL, (SELECT id FROM ext_empresas WHERE name = 'SIGEMIN')),
  ('LACTEOS LAS ROCAS', NULL, (SELECT id FROM ext_empresas WHERE name = 'LACTEOS LAS ROCAS')),
  ('CONCEPT', NULL, (SELECT id FROM ext_empresas WHERE name = 'CONCEPT CONSTRUCTORA')),
  ('FUNDICIONES METALICAS', NULL, (SELECT id FROM ext_empresas WHERE name = 'FUNDICIONES METALICAS')),
  ('ERNESTO BECERRA', NULL, NULL),
  ('JOSE MIGUEL', NULL, NULL),
  ('CONSTRUCCIONES', NULL, NULL),
  ('GLOB BERRY', NULL, (SELECT id FROM ext_empresas WHERE name = 'GLOB BERRY S.A.S.')),
  ('MANFIL', NULL, (SELECT id FROM ext_empresas WHERE name = 'MANFIL')),
  ('INGEOMESA', NULL, NULL),
  ('GC', NULL, NULL),
  ('CONTROLES', NULL, NULL),
  ('VERTIFEX', NULL, (SELECT id FROM ext_empresas WHERE name = 'VERTIFEX S.A.S.')),
  ('SB PUBLICIDAD', NULL, NULL),
  ('SANDRA PATRICIA', NULL, NULL),
  ('TEREMAR', NULL, NULL),
  ('NEBRASKA', NULL, NULL);
