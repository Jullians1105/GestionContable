-- Deudas DIAN: además de la "DEUDA VENCIDA", MUISCA muestra una fila "DEUDA NO VENCIDA" (obligaciones ya
-- declaradas cuyo plazo de pago aún no llega; no causan intereses todavía). La oficina también las avisa
-- al cliente por correo, así que se guardan junto a las vencidas, marcadas con este campo.
-- Migración 066
ALTER TABLE dian_deudas_detalle ADD COLUMN IF NOT EXISTS vencida BOOLEAN NOT NULL DEFAULT TRUE;
