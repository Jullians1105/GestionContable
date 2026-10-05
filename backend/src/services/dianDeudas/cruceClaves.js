// Empareja las empresas del Directorio con las filas de los Excel "CLAVES CLIENTES*.xlsx" para cargar
// su clave DIAN (columna INGRESO) — ver scripts/importarClavesDian.js.
//
// El peor error posible acá es ponerle a una empresa la clave de OTRA, así que la regla es conservadora:
//   - 'segura': el emparejamiento es por documento (NIT; o cédula si es persona natural) —o por un nombre
//     casi idéntico— y TODAS las filas que apuntan a la empresa traen la MISMA clave.
//   - 'conflicto': hay filas con claves distintas para la misma empresa (los Excel no concuerdan): no se
//     elige una, lo decide una persona.
//   - 'revisar': el documento coincide pero algo no cuadra (otra cédula de representante, varias
//     coincidencias por nombre, etc.).
//   - 'sin_clave': no hay fila, o la fila no trae clave de INGRESO.
// Este módulo no lee archivos ni imprime claves: recibe filas ya leídas y devuelve decisiones.
const UMBRAL_NOMBRE_SEGURO = 0.9;

const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '');

// NIT con o sin dígito de verificación: "9001234561" (10 dígitos) también cuenta como "900123456".
function variantesDocumento(valor) {
  const d = soloDigitos(valor);
  if (!d) return new Set();
  const v = new Set([d]);
  if (d.length === 10) v.add(d.slice(0, 9));
  return v;
}
const compartenDocumento = (a, b) => {
  const va = variantesDocumento(a);
  for (const x of variantesDocumento(b)) if (va.has(x)) return true;
  return false;
};

const FORMAS_LEGALES = /SOCIEDAD POR ACCIONES SIMPLIFICADA|SOCIEDAD ANONIMA SIMPLIFICADA|SOCIEDAD ANONIMA|SOCIEDAD LIMITADA/g;
const SIGLAS = /\b(S ?A ?S|SAS|S ?A|LTDA|E ?U|ZOMAC|CIA|Y CIA|S EN C|SCA)\b/g;

// Nombre en mayúsculas, sin tildes ni formas legales, con las palabras ordenadas (el orden no importa).
function normalizarNombre(valor) {
  const s = String(valor ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ').replace(FORMAS_LEGALES, ' ').replace(SIGLAS, ' ');
  return s.split(/\s+/).filter(Boolean).sort().join(' ');
}

// Parecido entre dos nombres YA normalizados (0 a 1): el mayor entre la razón de secuencia y el
// solapamiento de palabras.
function similitud(a, b) {
  if (!a || !b) return 0;
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  const union = new Set([...ta, ...tb]).size;
  const jaccard = [...ta].filter((t) => tb.has(t)).length / union;
  return Math.max(razonSecuencia(a, b), jaccard);
}

// Equivalente a difflib.SequenceMatcher.ratio() en lo que importa: 2*LCS/(|a|+|b|).
function razonSecuencia(a, b) {
  const n = a.length; const m = b.length;
  if (n === 0 || m === 0) return 0;
  let previa = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    const actual = new Array(m + 1).fill(0);
    for (let j = 1; j <= m; j++) {
      actual[j] = a[i - 1] === b[j - 1] ? previa[j - 1] + 1 : Math.max(previa[j], actual[j - 1]);
    }
    previa = actual;
  }
  return (2 * previa[m]) / (n + m);
}

// filaClave: { fuente, nombre, nit, cedula, ingreso }  (ingreso = la clave, o '' si no hay)
// empresa:   { id, name, nit, tipo_contribuyente, cedula_representante }
function emparejar(empresa, filas) {
  const porDocumento = filas.filter((f) => (
    f.nit ? compartenDocumento(f.nit, empresa.nit)
      // persona natural: en el Excel va sin NIT y su cédula es el documento
      : (f.cedula && compartenDocumento(f.cedula, empresa.nit))
  ));
  if (porDocumento.length > 0) {
    let candidatas = porDocumento;
    const cedulaRep = soloDigitos(empresa.cedula_representante);
    const alertas = [];
    if (cedulaRep && empresa.tipo_contribuyente !== 'natural') {
      const mismaCedula = porDocumento.filter((f) => soloDigitos(f.cedula) === cedulaRep);
      if (mismaCedula.length > 0) candidatas = mismaCedula;
      else alertas.push('La cédula del representante del Directorio no coincide con la de ninguna fila del Excel');
    }
    return { metodo: 'documento', candidatas, alertas };
  }

  const nombre = normalizarNombre(empresa.name);
  const parecidas = filas
    .map((f) => ({ f, s: similitud(nombre, normalizarNombre(f.nombre)) }))
    .filter((x) => x.s >= UMBRAL_NOMBRE_SEGURO)
    .sort((x, y) => y.s - x.s);
  if (parecidas.length > 0) {
    // Si el Excel trae un NIT distinto al del Directorio, el nombre se parece pero NO es la misma empresa.
    const conNitDistinto = parecidas.filter((x) => x.f.nit && empresa.nit && !compartenDocumento(x.f.nit, empresa.nit));
    if (conNitDistinto.length === parecidas.length) return { metodo: 'nombre', candidatas: [], alertas: ['Nombre parecido pero con otro NIT: no se toma'] };
    return { metodo: 'nombre', candidatas: parecidas.filter((x) => !conNitDistinto.includes(x)).map((x) => x.f), alertas: [] };
  }
  return { metodo: null, candidatas: [], alertas: [] };
}

// Decisión final para una empresa. Devuelve { estado, clave?, filas, motivo }.
function decidirClave(empresa, filas) {
  const { metodo, candidatas, alertas } = emparejar(empresa, filas);
  if (candidatas.length === 0) {
    return { estado: 'sin_clave', filas: [], motivo: alertas[0] ?? 'No aparece en los Excel' };
  }
  const conClave = candidatas.filter((f) => f.ingreso);
  if (conClave.length === 0) return { estado: 'sin_clave', filas: candidatas, motivo: 'Aparece en el Excel pero sin clave de INGRESO' };

  const distintas = [...new Set(conClave.map((f) => f.ingreso))];
  if (distintas.length > 1) {
    return { estado: 'conflicto', filas: conClave, motivo: `${distintas.length} claves distintas entre filas (${[...new Set(conClave.map((f) => f.fuente))].join(', ')})` };
  }
  if (metodo === 'documento' && alertas.length > 0) return { estado: 'revisar', filas: conClave, motivo: alertas[0] };
  if (metodo === 'nombre' && candidatas.length > 1 && new Set(candidatas.map((f) => f.nit || f.cedula)).size > 1) {
    return { estado: 'revisar', filas: conClave, motivo: 'Varias empresas distintas se parecen por nombre' };
  }
  return { estado: 'segura', clave: distintas[0], filas: conClave, motivo: metodo === 'documento' ? 'Coincide por documento' : 'Coincide por nombre (casi idéntico)' };
}

// ¿La empresa tiene lo mínimo para que el login a la DIAN sea posible? (mismo criterio que el servicio)
function faltaIdentidad(empresa) {
  if (!empresa.tipo_contribuyente) return 'Sin tipo de contribuyente (empresa/natural)';
  if (!empresa.nit) return 'Sin NIT/documento';
  if (empresa.tipo_contribuyente === 'empresa' && !empresa.cedula_representante) return 'Sin cédula del representante';
  return null;
}

module.exports = {
  UMBRAL_NOMBRE_SEGURO, soloDigitos, variantesDocumento, compartenDocumento, normalizarNombre, similitud,
  emparejar, decidirClave, faltaIdentidad,
};
