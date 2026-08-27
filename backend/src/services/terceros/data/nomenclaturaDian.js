// Nomenclatura oficial de direcciones DIAN (MUISCA), fuente: docs/NomenclaturaDian.pdf
// (documento pasado por el usuario). [[código, forma completa]] — se excluyen del PDF las
// entradas donde el código es igual a la palabra (NORTE, OESTE, SUITE, SUR, "NOMBRE VIA"): no
// aportan ninguna transformación real.
const NOMENCLATURA_OFICIAL = [
  ['AC', 'Avenida calle'], ['AD', 'Administración'], ['ADL', 'Adelante'], ['AER', 'Aeropuerto'],
  ['AG', 'Agencia'], ['AGP', 'Agrupación'], ['AK', 'Avenida carrera'], ['AL', 'Altillo'],
  ['ALD', 'Al lado'], ['ALM', 'Almacén'], ['AP', 'Apartamento'], ['APTDO', 'Apartado'],
  ['ATR', 'Atrás'], ['AUT', 'Autopista'], ['AV', 'Avenida'], ['AVIAL', 'Anillo vial'],
  ['BG', 'Bodega'], ['BL', 'Bloque'], ['BLV', 'Boulevard'], ['BRR', 'Barrio'],
  ['C', 'Corregimiento'], ['CA', 'Casa'], ['CAS', 'Caserío'], ['CC', 'Centro comercial'],
  ['CD', 'Ciudadela'], ['CEL', 'Célula'], ['CEN', 'Centro'], ['CIR', 'Circular'], ['CL', 'Calle'],
  ['CLJ', 'Callejón'], ['CN', 'Camino'], ['CON', 'Conjunto residencial'], ['CONJ', 'Conjunto'],
  ['CR', 'Carrera'], ['CRT', 'Carretera'], ['CRV', 'Circunvalar'], ['CS', 'Consultorio'],
  ['DG', 'Diagonal'], ['DP', 'Depósito'], ['DPTO', 'Departamento'], ['DS', 'Depósito sótano'],
  ['ED', 'Edificio'], ['EN', 'Entrada'], ['ES', 'Escalera'], ['ESQ', 'Esquina'],
  ['ET', 'Etapa'], ['EX', 'Exterior'], ['FCA', 'Finca'], ['GJ', 'Garaje'],
  ['GS', 'Garaje sótano'], ['GT', 'Glorieta'], ['HC', 'Hacienda'], ['HG', 'Hangar'],
  ['IN', 'Interior'], ['IP', 'Inspección de Policía'], ['IPD', 'Inspección Departamental'],
  ['IPM', 'Inspección Municipal'], ['KM', 'Kilómetro'], ['LC', 'Local'],
  ['LM', 'Local mezzanine'], ['LT', 'Lote'], ['MD', 'Módulo'], ['MJ', 'Mojón'],
  ['MLL', 'Muelle'], ['MN', 'Mezzanine'], ['MZ', 'Manzana'], ['O', 'Oriente'],
  ['OCC', 'Occidente'], ['OF', 'Oficina'], ['P', 'Piso'], ['PA', 'Parcela'], ['PAR', 'Parque'],
  ['PD', 'Predio'], ['PH', 'Penthouse'], ['PJ', 'Pasaje'], ['PL', 'Planta'], ['PN', 'Puente'],
  ['POR', 'Portería'], ['POS', 'Poste'], ['PQ', 'Parqueadero'], ['PRJ', 'Paraje'],
  ['PS', 'Paseo'], ['PT', 'Puesto'], ['PW', 'Park Way'], ['RP', 'Round Point'], ['SA', 'Salón'],
  ['SC', 'Salón comunal'], ['SD', 'Salida'], ['SEC', 'Sector'], ['SL', 'Solar'],
  ['SM', 'Súper manzana'], ['SS', 'Semisótano'], ['ST', 'Sótano'], ['TER', 'Terminal'],
  ['TERPLN', 'Terraplén'], ['TO', 'Torre'], ['TV', 'Transversal'], ['TZ', 'Terraza'],
  ['UN', 'Unidad'], ['UR', 'Unidad residencial'], ['URB', 'Urbanización'], ['VRD', 'Vereda'],
  ['VTE', 'Variante'], ['ZF', 'Zona franca'], ['ZN', 'Zona'],
];

// Alias/abreviaturas NO oficiales pero de uso muy común en Colombia (ej. "Vda" por Vereda, "Cra"
// por Carrera) — no vienen de docs/NomenclaturaDian.pdf, son criterio propio a partir de cómo se
// escriben las direcciones en la práctica. A diferencia de la tabla oficial, esta lista se espera
// ir ampliando con el tiempo según lo que aparezca sin reconocer en direcciones reales.
const ALIAS_COMUNES = [
  ['CL', 'Cll'], ['CL', 'Call'], ['CR', 'Cra'], ['CR', 'Kr'], ['CR', 'Kra'], ['AV', 'Avda'],
  ['TV', 'Trans'], ['TV', 'Transv'], ['DG', 'Diag'], ['VRD', 'Vda'], ['MZ', 'Mza'],
  ['AP', 'Apto'], ['ED', 'Edif'], ['IN', 'Int'], ['BRR', 'Br'],
];

module.exports = { NOMENCLATURA_OFICIAL, ALIAS_COMUNES };
