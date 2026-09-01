-- Nómina Electrónica — responsable para las empresas enlazadas con Fondo Emprender
-- Migración 049
--
-- Pedido del usuario: las empresas de Nómina Electrónica que están enlazadas
-- con una empresa de Fondo Emprender (ne_empresas.fondo_empresa_id) toman su
-- responsable según la categoría de esa empresa en Fondo Emprender
-- (fondo_empresas.categoria, el mismo filtro "Contable"/"Tributario" que usa
-- Pagos) — Contable va para Katerin Pineda, Tributario para Ruben Parada. No
-- toca las que no están enlazadas (esas se asignan aparte, a mano, cuando
-- corresponda).

UPDATE ne_empresas ne
SET responsable_id = (SELECT id FROM users WHERE name ILIKE 'Katerin Pineda%' LIMIT 1)
FROM fondo_empresas fe
WHERE ne.fondo_empresa_id = fe.id
  AND fe.categoria = 'contable';

UPDATE ne_empresas ne
SET responsable_id = (SELECT id FROM users WHERE name ILIKE 'Ruben Parada%' LIMIT 1)
FROM fondo_empresas fe
WHERE ne.fondo_empresa_id = fe.id
  AND fe.categoria = 'tributario';
