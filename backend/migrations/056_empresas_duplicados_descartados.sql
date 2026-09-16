-- Permite marcar un par de "posibles duplicados" sugeridos (ver
-- empresasMaestroController.js#getPosiblesDuplicados) como "no es duplicado", para que dejen de
-- aparecer en el aviso — sin esto, dos personas naturales con apellido en común (ej. "CECILIA
-- RINCON" y "MARTHA PATRICIA ROJAS RINCON") quedan sugeridas para siempre, ya que la heurística
-- de nombre no tiene forma de aprender que ya se revisaron y son distintas.
-- Migración 056
CREATE TABLE IF NOT EXISTS empresas_duplicados_descartados (
  empresa_menor_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  empresa_mayor_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  descartado_por   UUID REFERENCES users(id),
  descartado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_menor_id, empresa_mayor_id),
  CHECK (empresa_menor_id < empresa_mayor_id)
);
