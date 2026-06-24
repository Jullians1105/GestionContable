-- Fondo Emprender — catálogo de empresas
-- Migración 007

CREATE TABLE IF NOT EXISTS fondo_empresas (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(255) NOT NULL,
  categoria  VARCHAR(20)  NOT NULL DEFAULT 'contable'
             CHECK (categoria IN ('contable', 'tributario')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fondo_empresas_categoria ON fondo_empresas(categoria);

CREATE TRIGGER fondo_empresas_updated_at
  BEFORE UPDATE ON fondo_empresas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO fondo_empresas (name, categoria) VALUES
  ('CAPROVIVA',                                          'contable'),
  ('GANADERIA DE CRIA THERMOGAN',                        'contable'),
  ('MIELE DI BOSCO',                                     'contable'),
  ('INDUSTRIAS ALTUZARRA',                               'contable'),
  ('GRANJA AVICOLA DOS ALMAS',                           'contable'),
  ('ELIARCHIRA',                                         'contable'),
  ('ASOCIACION MAGIA FURA Y TENA',                       'contable'),
  ('MAMANKANA PARRILLA SABOR Y TRADICION S.A.S',         'contable'),
  ('SEVEN BLESS SAS',                                    'contable'),
  ('ACHIRAS DEL RANCHO',                                 'contable'),
  ('AVICOLA EL CORRAL DE DANIELA',                       'contable'),
  ('DESHIDRATADOS DE MI PROVINCIA',                      'contable'),
  ('JAIM YAFE',                                          'contable'),
  ('ASOCIACION DE AROMATICAS Y MEDICINALES SALAMANCA',   'contable'),
  ('BISTRO CHIA SAS',                                    'contable'),
  ('JOSE ANDRES PEDROZA',                                'contable'),
  ('FUNDACION PLANETA 24/7',                             'contable'),
  ('ASOCIACION HERENCIA ANSESTRAL',                      'contable'),
  ('ASOCIACION ARTE BOIACA',                             'contable'),
  ('ASOCIACION ASOFRESAS',                               'contable'),
  ('ASOCIACION PROD MANDARINA',                          'contable'),
  ('TY SUASIA HOSPEDAJE RURAL',                          'contable'),
  ('ALIX JULIANA SOSA CORREA',                           'contable'),
  ('ISOMETRICOS 3D',                                     'contable'),
  ('RUSTIC HOUSE',                                       'contable'),
  ('INDUSTRIAS PIMET',                                   'contable'),
  ('ESENZA ESPECIAS',                                    'contable'),
  ('PANADERIA ARTESANAL',                                'contable'),
  ('ENTRE NOPALES',                                      'contable'),
  ('EVENTOS SANDRA LOPEZ',                               'contable');
