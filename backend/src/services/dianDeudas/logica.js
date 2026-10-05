// Reglas de negocio de "Deudas vencidas DIAN", sin navegador ni base de datos (para poder probarlas):
// clasificar el tipo de obligación, traducir "periodo N" a un texto, cruzar las deudas con los
// recibos ya pagados y armar el correo al cliente.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Familia de un impuesto a partir del texto que muestra la DIAN. Sirve para dos pantallas que no se
// llaman igual: la deuda dice "Retención en la Fuente" / "Impuesto sobre las Ventas-IVA" y el
// recibo pagado dice "RETENCION ATITULO DE RENTA" / "VENTAS CUATRIMESTRAL".
// OJO con el orden: "RETENCION A TITULO DE VENTAS" y "RETENCION ... AL CONSUMO" son retenciones, no
// IVA ni consumo, así que la retención se mira primero.
function clasificarConcepto(texto) {
  const t = sinTildes(texto).toUpperCase();
  if (/SANCION/.test(t)) return 'otro';
  if (/RETENCION/.test(t)) return 'rete_fte';
  if (/VENTAS|\bIVA\b/.test(t)) return 'iva';
  if (/CONSUMO/.test(t)) return 'inc';
  if (/RENTA/.test(t)) return 'renta';
  return 'otro';
}

// "17.609.000,00" -> 17609000 ; "277.000" -> 277000 ; null si no es un número.
function parsearValor(texto) {
  const limpio = String(texto ?? '').replace(/[^\d.,-]/g, '');
  if (!limpio) return null;
  // Miles con COMA (1,414,000 / 332,000): es el formato inglés. Se rechaza en vez de adivinar, porque "332,000" se
  // leería como 332 (coma decimal) y se guardaría un valor mil veces menor sin avisar.
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(limpio)) return null;
  const numero = Number(limpio.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(numero) ? numero : null;
}

const mes = (n) => MESES[n - 1];

// Texto del periodo tal como se escribe en el correo. Retención: mensual. IVA: depende de la empresa
// (bimestral o cuatrimestral); sin saberlo se deja el número, que es lo único honesto. INC: bimestral.
function describirPeriodo({ concepto, anio, periodo, ivaPeriodicidad, tipoObligacion }) {
  if (concepto === 'rete_fte' && periodo >= 1 && periodo <= 12) {
    return `Retención en la fuente del mes de ${mes(periodo)} de ${anio}`;
  }
  if (concepto === 'iva') {
    if (ivaPeriodicidad === 'bimestral' && periodo >= 1 && periodo <= 6) {
      return `IVA del bimestre ${mes(periodo * 2 - 1)}-${mes(periodo * 2)} de ${anio}`;
    }
    if (ivaPeriodicidad === 'cuatrimestral' && periodo >= 1 && periodo <= 3) {
      return `IVA del cuatrimestre ${mes(periodo * 4 - 3)}-${mes(periodo * 4)} de ${anio}`;
    }
    return `IVA del periodo ${periodo} de ${anio}`;
  }
  if (concepto === 'inc' && periodo >= 1 && periodo <= 6) {
    return `Impuesto al consumo del bimestre ${mes(periodo * 2 - 1)}-${mes(periodo * 2)} de ${anio}`;
  }
  if (concepto === 'renta') return `Impuesto de renta del año gravable ${anio}`;
  // Concepto sin texto propio (Impuesto Unificado, sanciones...): se usa el nombre que da la DIAN.
  return `${tipoObligacion || descripcionGenerica(concepto)} del año ${anio}, periodo ${periodo}`;
}

const descripcionGenerica = (concepto) => ({
  rete_fte: 'Retención en la fuente', inc: 'Impuesto al consumo', iva: 'IVA', renta: 'Renta', otro: 'Obligación',
}[concepto] ?? 'Obligación');

// Cruza cada deuda con los recibos pagados (electrónicos). Misma familia de concepto + año + periodo:
//   - mismo valor  -> 'pagada'  (el recibo ya cubre la deuda; la DIAN a veces tarda en reflejarlo)
//   - valor distinto -> 'revisar' (puede ser pago parcial o con otros intereses: lo decide una persona)
//   - ningún recibo -> 'vigente'
// "Mismo valor" admite el valor sin intereses (el que muestra la tabla) o el liquidado, porque el
// recibo se pagó con los intereses de SU fecha, no los de hoy.
function cruzarConRecibos(deudas, recibos) {
  return deudas.map((d) => {
    const candidatos = recibos.filter((r) => (
      clasificarConcepto(r.concepto) === d.concepto
      && Number(r.anio) === Number(d.anio)
      && Number(r.periodo) === Number(d.periodo)
    ));
    if (candidatos.length === 0) {
      // Los intereses solo suman: si la liquidación da MENOS que el valor de la tabla, algo no cuadra (pasa con el
      // régimen SIMPLE: tabla $4.651.000 vs. liquidación $87.000). No se le avisa al cliente un monto dudoso.
      if (d.valorBase != null && d.valorTotal < d.valorBase) {
        return { ...d, estado: 'revisar', nota: `La liquidación de la DIAN da ${formatearPesos(d.valorTotal)}, menos que el valor de la tabla (${formatearPesos(d.valorBase)}): revisar en la DIAN antes de avisar al cliente (suele pasar en el régimen SIMPLE).` };
      }
      return { ...d, estado: 'vigente', nota: null };
    }

    const igual = candidatos.find((r) => r.total === d.valorBase || r.total === d.valorTotal);
    if (igual) {
      return { ...d, estado: 'pagada', nota: `Recibo pagado N° ${igual.numero} por ${formatearPesos(igual.total)}` };
    }
    const detalle = candidatos.map((r) => `N° ${r.numero} por ${formatearPesos(r.total)}`).join('; ');
    // El recibo se pagó con los intereses de SU fecha; si cubre al menos el valor sin intereses, casi
    // seguro es el pago de esta deuda y la DIAN solo tarda en reflejarlo (se deja para revisión igual).
    const cubreCapital = d.valorBase != null && candidatos.some((r) => r.total >= d.valorBase);
    const pista = cubreCapital ? ' El recibo cubre el valor sin intereses: probablemente ya está pagada.' : '';
    return { ...d, estado: 'revisar', nota: `Hay recibo pagado del mismo periodo (${detalle}) pero el valor difiere: debe ${formatearPesos(d.valorTotal)}.${pista}` };
  });
}

// Estado de la revisión a partir de sus obligaciones ya cruzadas: con_deuda si queda alguna por
// pagar o por revisar; si todas resultaron pagadas, la empresa está al día.
const estadoRevision = (detalle) => (detalle.some((d) => d.estado !== 'pagada') ? 'con_deuda' : 'al_dia');

// 1234567 -> "$1.234.567" (sin depender de que Node traiga los datos de idioma es-CO).
function formatearPesos(valor) {
  const entero = Math.round(Number(valor) || 0);
  return `${entero < 0 ? '-' : ''}$${String(Math.abs(entero)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

// Correo al cliente — la misma redacción que se usa hoy a mano. Solo entran las obligaciones que de
// verdad se deben ('vigente'); las 'revisar' no se le cobran al cliente hasta que alguien las defina.
// El párrafo del art. 580-1 E.T. es sobre declaraciones de retención en la fuente, así que solo va si
// hay retención entre lo que se debe.
//
// Las obligaciones "no vencidas" (aún dentro del plazo, sin intereses todavía) también se avisan, en su propio
// bloque: sin los párrafos de intereses/580-1, que hablan de lo ya vencido. Si SOLO hay no vencidas, el correo
// cambia de introducción en vez de decir que "debe" algo vencido. (Redacción propuesta para las no vencidas:
// la oficina no tenía plantilla escrita para ese caso.)
function armarCorreo({ empresa, detalle, ivaPeriodicidad }) {
  const pendientes = detalle.filter((d) => d.estado === 'vigente');
  if (pendientes.length === 0) return null;

  const linea = (d) => `- ${describirPeriodo({ ...d, ivaPeriodicidad })} por un valor de ${formatearPesos(d.valorTotal)}`;
  const vencidas = pendientes.filter((d) => d.vencida !== false);
  const noVencidas = pendientes.filter((d) => d.vencida === false);

  const parrafos = ['Buen día, espero que se encuentren bien'];
  if (vencidas.length > 0) {
    parrafos.push(
      `El presente correo tiene como fin informarle que revisando las deudas vencidas en la página de la DIAN se encontró que a la fecha la empresa ${empresa} debe pagar los siguientes impuestos:\n\n${vencidas.map(linea).join('\n')}`,
      'Por favor tener en cuenta que sobre ese monto se cobran intereses por lo cual sugiero pagar lo antes posible.'
    );
    if (vencidas.some((d) => d.concepto === 'rete_fte')) {
      parrafos.push('De igual manera, tener en cuenta el artículo 580-1 del estatuto tributario, el cual menciona que las declaraciones de retención en la fuente que sean presentadas y no se paguen dentro de los dos meses siguientes se consideran ineficaces, es decir, como si nunca se hubieran presentado y esto acarrea sanciones por parte de la Dian y así mismo tener en cuenta que sobre ese monto se cobran intereses por lo cual sugiero pagar lo antes posible');
    }
  }
  if (noVencidas.length > 0) {
    const lista = noVencidas.map(linea).join('\n');
    parrafos.push(vencidas.length > 0
      ? `Adicionalmente, en la página de la DIAN figuran las siguientes obligaciones pendientes de pago que aún no están vencidas:\n\n${lista}`
      : `El presente correo tiene como fin informarle que revisando la página de la DIAN se encontró que a la fecha la empresa ${empresa} tiene las siguientes obligaciones pendientes de pago, que aún no están vencidas:\n\n${lista}`);
    parrafos.push('Le sugiero pagarlas dentro del plazo establecido para evitar que se causen intereses.');
  }
  parrafos.push('Quedo atenta para generar el respectivo recibo de pago.');
  return { asunto: 'DEUDAS VENCIDAS DIAN', texto: parrafos.join('\n\n') };
}

// Primer día del mes actual en Bogotá, como 'YYYY-MM-01'. (La revisión de "octubre" se hace en
// octubre aunque el servidor corra en otra zona horaria.)
function mesActualBogota(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit' }).formatToParts(ahora);
  const get = (tipo) => partes.find((p) => p.type === tipo).value;
  return `${get('year')}-${get('month')}-01`;
}

module.exports = {
  clasificarConcepto, parsearValor, describirPeriodo, cruzarConRecibos, estadoRevision,
  formatearPesos, armarCorreo, mesActualBogota,
};
