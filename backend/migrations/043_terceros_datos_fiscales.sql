-- Agrega régimen fiscal, responsabilidad tributaria, teléfono y correo a `terceros`.
-- El PDF de factura DIAN ya trae estos 4 campos (junto a dirección/municipio/departamento que
-- ya se guardaban desde la migración 042) pero no se extraían. Se guardan igual que el resto
-- (upsert por NIT), pero deliberadamente NO se muestran en el resumen de la pantalla de subida
-- de PDFs ("Datos de Terceros") — solo en la nueva pantalla "Consulta Tercero", con aviso de que
-- vienen de la factura y no de un RUT verificado.
-- Migración 043

ALTER TABLE terceros
  ADD COLUMN IF NOT EXISTS regimen_fiscal             TEXT,
  ADD COLUMN IF NOT EXISTS responsabilidad_tributaria TEXT,
  ADD COLUMN IF NOT EXISTS telefono                   TEXT,
  ADD COLUMN IF NOT EXISTS correo                     TEXT;
