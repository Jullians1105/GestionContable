-- Separa el flag único confirmed/enviado de fondo_checklist_meses en dos
-- independientes: Nómina y Contabilidad compartían un solo "Confirmar
-- Contabilidad" y el equipo pidió llevarlos aparte, cada uno con su propio
-- flujo confirmar → enviar. Las columnas viejas pasan a ser las de
-- Contabilidad vía RENAME (es literalmente lo que siempre representaron —
-- el botón se llamó "Confirmar Contabilidad" desde el principio), así que
-- el historial existente queda intacto sin copiar datos. Nómina arranca
-- en blanco para todos los meses ya cargados.

ALTER TABLE fondo_checklist_meses RENAME COLUMN confirmed    TO confirmed_contabilidad;
ALTER TABLE fondo_checklist_meses RENAME COLUMN confirmed_at TO confirmed_contabilidad_at;
ALTER TABLE fondo_checklist_meses RENAME COLUMN enviado      TO enviado_contabilidad;
ALTER TABLE fondo_checklist_meses RENAME COLUMN enviado_at   TO enviado_contabilidad_at;

ALTER TABLE fondo_checklist_meses
  ADD COLUMN confirmed_nomina    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN confirmed_nomina_at TIMESTAMPTZ,
  ADD COLUMN enviado_nomina      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN enviado_nomina_at   TIMESTAMPTZ;
