#!/usr/bin/env node
// Carga las claves DIAN (columna INGRESO) de los Excel "CLAVES CLIENTES*.xlsx" en las empresas del
// Directorio. Cada clave se VERIFICA con un login real a la DIAN antes de guardarse (cifrada), igual que
// al cargarla desde la pantalla (dianDeudasService.guardarClave): un solo intento, y si la DIAN la
// rechaza no se guarda.
//
// Uso (desde backend/):
//   node scripts/importarClavesDian.js                         # SIMULACIÓN: solo muestra qué haría. No toca nada.
//   node scripts/importarClavesDian.js --aplicar --lote 5      # carga hasta 5 claves (verifica cada una en la DIAN)
//   node scripts/importarClavesDian.js --aplicar --nombre ACME # solo empresas cuyo nombre contenga ACME
//   node scripts/importarClavesDian.js --aplicar --conflictos [--max-intentos 2]
//        # empresas con claves DISTINTAS entre Excel: prueba primero la del archivo más reciente; si la DIAN la
//        # rechaza prueba la siguiente, hasta --max-intentos por empresa (2 por defecto, para no bloquear la cuenta).
//   Opciones: --pausa SEG (entre intentos, 5 por defecto) · --docs RUTA (carpeta de los Excel, ../docs por defecto)
//
// Reglas de seguridad:
//   - Nunca imprime ni escribe una clave: solo nombres y resultados.
//   - Solo se cargan las emparejadas con certeza ('segura', ver services/dianDeudas/cruceClaves.js). Los
//     conflictos (Excel con claves distintas), las dudosas y las que no aparecen se LISTAN, no se cargan.
//   - Salta las que ya tienen clave verificada, y las que la DIAN ya rechazó (para no bloquear la cuenta
//     del cliente): esas se reintentan solo a mano, con una clave nueva.
//   - Las claves de los Excel se leen en memoria; no se copian a ningún archivo.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const db = require('../src/config/database');
const { llaveConfigurada } = require('../src/utils/secretos');
const { decidirClave, faltaIdentidad } = require('../src/services/dianDeudas/cruceClaves');

const FUENTES = [
  ['CLAVES CLIENTES.xlsx', ['Hoja1']],
  ['CLAVES CLIENTES FONDO1.xlsx', ['Hoja1']],
  ['CLAVES CLIENTES FONDO 2.xlsx', ['GENERAL', 'CONV. 1 LIBERTAD']],
  ['CLAVES PROYECTOS FONDO DIANA GUTIERREZ.xlsx', ['GENERAL']],
];

function argumento(nombre, porDefecto = null) {
  const i = process.argv.indexOf(nombre);
  if (i === -1) return porDefecto;
  const siguiente = process.argv[i + 1];
  return siguiente && !siguiente.startsWith('--') ? siguiente : true;
}

const textoDeCelda = (celda) => {
  const v = celda?.value;
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('').trim();
    if ('result' in v) return String(v.result ?? '').trim();
    if (v.text) return String(v.text).trim();
    return '';
  }
  return String(v).trim();
};
const encabezado = (s) => s.replace(/\s+/g, ' ').trim().toUpperCase();

async function leerFilasClaves(carpeta) {
  const filas = [];
  for (const [archivo, hojas] of FUENTES) {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.readFile(path.join(carpeta, archivo));
    const fecha = fs.statSync(path.join(carpeta, archivo)).mtimeMs;   // el archivo más reciente manda al desempatar
    for (const nombreHoja of hojas) {
      const hoja = libro.getWorksheet(nombreHoja);
      if (!hoja) { console.warn(`  (no existe la hoja "${nombreHoja}" en ${archivo})`); continue; }
      let filaEncabezado = 0;
      for (let r = 1; r <= Math.min(6, hoja.rowCount) && !filaEncabezado; r++) {
        hoja.getRow(r).eachCell((c) => { if (encabezado(textoDeCelda(c)) === 'NOMBRE') filaEncabezado = r; });
      }
      if (!filaEncabezado) { console.warn(`  (sin encabezado NOMBRE en ${archivo} / ${nombreHoja})`); continue; }
      const columnas = {};
      hoja.getRow(filaEncabezado).eachCell((c, n) => { const h = encabezado(textoDeCelda(c)); if (!(h in columnas)) columnas[h] = n; });
      for (let r = filaEncabezado + 1; r <= hoja.rowCount; r++) {
        const fila = hoja.getRow(r);
        const nombre = textoDeCelda(fila.getCell(columnas.NOMBRE));
        if (!nombre) continue;
        filas.push({
          fuente: `${archivo.replace(/^CLAVES |\.xlsx$/g, '')} / ${nombreHoja}`,
          nombre, fecha,
          nit: columnas.NIT ? textoDeCelda(fila.getCell(columnas.NIT)) : '',
          cedula: columnas.CEDULA ? textoDeCelda(fila.getCell(columnas.CEDULA)) : '',
          ingreso: columnas.INGRESO ? textoDeCelda(fila.getCell(columnas.INGRESO)) : '',
        });
      }
    }
  }
  return filas;
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// Conflictos: varias claves distintas para la misma empresa. Se prueban de la más reciente a la más vieja
// (por fecha del archivo), una vez cada una, con tope de intentos por empresa. Una clave solo se guarda si
// la DIAN la acepta. Si se agotan los intentos con claves aún sin probar, NO se marca la empresa como
// rechazada (quedan sin clave, para decidir a mano).
async function resolverConflictos(servicio, grupos, pausaMs, maxIntentos) {
  console.log(`
Resolviendo ${grupos.conflicto.length} conflicto(s): hasta ${maxIntentos} intento(s) por empresa, la clave del archivo más reciente primero...
`);
  const resumen = { resueltas: 0, ningunaSirve: 0, sinProbar: 0, errores: 0 };
  for (const { e, d } of grupos.conflicto) {
    const falta = faltaIdentidad(e);
    if (falta) { console.log(`  - ${e.name}: se salta (${falta})`); continue; }
    const candidatas = [];
    for (const f of [...d.filas].sort((a, b) => b.fecha - a.fecha)) {
      if (!candidatas.some((c) => c.clave === f.ingreso)) candidatas.push({ clave: f.ingreso, fuente: f.fuente });
    }
    let resuelta = false; let rechazadas = 0; let error = false;
    for (const c of candidatas.slice(0, maxIntentos)) {
      try {
        await servicio.guardarClave(e.id, c.clave);
        console.log(`  ✔ ${e.name}: sirvió la clave de «${c.fuente}» (${rechazadas} rechazada(s) antes)`);
        resuelta = true; break;
      } catch (err) {
        if (err.codigo === 'CLAVE_INVALIDA') { rechazadas += 1; console.log(`    · ${e.name}: la DIAN rechazó la clave de «${c.fuente}»`); }
        else { error = true; console.log(`  ! ${e.name}: no se pudo verificar (${err.message}) — se detiene en esta empresa`); break; }
      }
      await pausa(pausaMs);
    }
    if (resuelta) resumen.resueltas += 1;
    else if (error) resumen.errores += 1;
    else if (candidatas.length > maxIntentos) { resumen.sinProbar += 1; console.log(`  ✘ ${e.name}: ${rechazadas} rechazada(s) y quedan ${candidatas.length - maxIntentos} clave(s) SIN probar (tope de intentos)`); }
    else {
      resumen.ningunaSirve += 1;
      await db.query(`UPDATE empresas SET dian_clave_estado = 'invalida' WHERE id = $1`, [e.id]);
      console.log(`  ✘ ${e.name}: ninguna de las ${candidatas.length} claves sirve (queda marcada; falta una clave nueva)`);
    }
    await pausa(pausaMs);
  }
  console.log(`
Conflictos: ${resumen.resueltas} resueltos, ${resumen.ningunaSirve} sin ninguna clave válida, ${resumen.sinProbar} con claves sin probar, ${resumen.errores} con error.`);
}

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const lote = parseInt(argumento('--lote', '0'), 10) || 0;
  const filtroNombre = String(argumento('--nombre', '') || '').toUpperCase();
  const pausaMs = (parseFloat(argumento('--pausa', '5')) || 5) * 1000;
  const carpeta = path.resolve(argumento('--docs', path.join(__dirname, '..', '..', 'docs')));

  if (aplicar && !llaveConfigurada()) {
    console.error('Falta DIAN_CLAVES_KEY en el entorno (backend/.env): sin ella no se pueden guardar claves cifradas.');
    process.exit(1);
  }

  console.log(`Leyendo los Excel de ${carpeta} ...`);
  const filasClaves = await leerFilasClaves(carpeta);
  console.log(`  ${filasClaves.length} filas, ${filasClaves.filter((f) => f.ingreso).length} con clave de INGRESO.\n`);

  const { rows: empresas } = await db.query(
    `SELECT id, name, nit, tipo_contribuyente, cedula_representante, dian_clave_estado, (dian_clave_cifrada IS NOT NULL) AS tiene_clave
     FROM empresas WHERE activa ORDER BY name`
  );

  const grupos = { segura: [], conflicto: [], revisar: [], sin_clave: [], sin_identidad: [], ya_cargada: [], rechazada_antes: [] };
  for (const e of empresas) {
    if (filtroNombre && !e.name.toUpperCase().includes(filtroNombre)) continue;
    const d = decidirClave(e, filasClaves);
    if (e.tiene_clave && e.dian_clave_estado === 'verificada') { grupos.ya_cargada.push({ e, d }); continue; }
    if (e.dian_clave_estado === 'invalida') { grupos.rechazada_antes.push({ e, d }); continue; }
    if (d.estado === 'segura') {
      const falta = faltaIdentidad(e);
      if (falta) { grupos.sin_identidad.push({ e, d: { ...d, motivo: falta } }); continue; }
    }
    grupos[d.estado].push({ e, d });
  }

  const titulo = (t, g) => console.log(`\n=== ${t}: ${g.length} ===`);
  const linea = ({ e, d }) => console.log(`  - ${e.name}${d.motivo ? `  [${d.motivo}]` : ''}`);
  titulo('LISTAS PARA CARGAR (emparejadas con certeza)', grupos.segura); grupos.segura.forEach(({ e }) => console.log(`  - ${e.name}`));
  titulo('CONFLICTO (los Excel traen claves distintas: decide una persona)', grupos.conflicto); grupos.conflicto.forEach(linea);
  titulo('POR REVISAR (algo no cuadra)', grupos.revisar); grupos.revisar.forEach(linea);
  titulo('Emparejadas pero FALTA IDENTIDAD en el Directorio (tipo / cédula del representante)', grupos.sin_identidad); grupos.sin_identidad.forEach(linea);
  titulo('Sin clave en los Excel', grupos.sin_clave); grupos.sin_clave.forEach(({ e, d }) => console.log(`  - ${e.name}  [${d.motivo}]`));
  titulo('Ya tienen clave verificada (se saltan)', grupos.ya_cargada);
  titulo('La DIAN rechazó su clave antes (se saltan: cargar una nueva a mano)', grupos.rechazada_antes); grupos.rechazada_antes.forEach(linea);

  if (!aplicar) {
    console.log('\nSIMULACIÓN: no se cargó nada. Usa --aplicar [--lote N] para cargar las "listas para cargar".');
    return;
  }

  const servicio = require('../src/services/dianDeudasService');
  if (process.argv.includes('--conflictos')) return resolverConflictos(servicio, grupos, pausaMs, parseInt(argumento('--max-intentos', '2'), 10) || 2);
  const aCargar = lote > 0 ? grupos.segura.slice(0, lote) : grupos.segura;
  console.log(`\nCargando ${aCargar.length} clave(s): un intento de ingreso real a la DIAN por empresa, con ${pausaMs / 1000}s de pausa...\n`);
  const resumen = { verificadas: 0, rechazadas: 0, errores: 0 };
  for (const { e, d } of aCargar) {
    try {
      await servicio.guardarClave(e.id, d.clave);
      resumen.verificadas += 1;
      console.log(`  ✔ ${e.name}: clave verificada y guardada`);
    } catch (err) {
      if (err.codigo === 'CLAVE_INVALIDA') {
        resumen.rechazadas += 1;
        // Se marca para no reintentar sola: la DIAN bloquea cuentas tras varios intentos fallidos.
        await db.query(`UPDATE empresas SET dian_clave_estado = 'invalida' WHERE id = $1`, [e.id]);
        console.log(`  ✘ ${e.name}: la DIAN RECHAZÓ la clave del Excel (queda marcada; falta una clave nueva)`);
      } else {
        resumen.errores += 1;
        console.log(`  ! ${e.name}: no se pudo verificar (${err.message}) — no se guardó`);
      }
    }
    await pausa(pausaMs);
  }
  console.log(`\nListo: ${resumen.verificadas} verificadas, ${resumen.rechazadas} rechazadas, ${resumen.errores} con error.`);
}

main()
  .catch((err) => { console.error('ERROR:', err.message); process.exitCode = 1; })
  .finally(async () => { await db.pool.end(); process.exit(process.exitCode ?? 0); });
