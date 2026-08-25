const path = require('path');
const JSZip = require('jszip');

// Duplicado deliberadamente desde dianController.js en vez de importarlo: el módulo DIAN
// existente está en producción y funcionando, y la instrucción explícita para esta fase fue
// no tocarlo ni exponerlo a riesgo por un cambio de Exógenas. Es la misma corrección, no una
// reescritura — si el bug de exceljs cambia, hay que aplicar el fix en los dos lados.
//
// El portal de la DIAN exporta el .xlsx con las etiquetas de estos dos namespaces prefijadas
// (ej. <x:workbook>, <x:sheets>, <ap:Properties>) — válido según OOXML, pero el parser SAX de
// exceljs compara nombres de etiqueta sin tener en cuenta el prefijo, así que nunca reconoce
// nada y devuelve un modelo vacío. Se quita el prefijo antes de pasarlo a exceljs. En un .xlsx
// normal (guardado por Excel real) estos dos namespaces van sin prefijo, así que esto no les
// afecta. NO tocar "r:", "vt:", "cp:"/"dc:"/"dcterms:" — esos sí los espera exceljs prefijados.
const NAMESPACES_A_DESPREFIJAR = [
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties',
];

const stripKnownNamespacePrefixes = (xml) => {
  let out = xml;
  for (const ns of NAMESPACES_A_DESPREFIJAR) {
    const nsMatch = out.match(new RegExp(`xmlns:(\\w+)="${ns.replace(/[/.]/g, '\\$&')}"`));
    if (!nsMatch) continue;
    const prefix = nsMatch[1];
    out = out
      .replace(new RegExp(`</${prefix}:`, 'g'), '</')
      .replace(new RegExp(`<${prefix}:`, 'g'), '<');
  }
  return out;
};

// El mismo exportador escribe los Target de sus .rels como rutas absolutas del paquete en vez
// de relativas al part que las contiene. exceljs tolera esto para workbook→hoja, pero no para
// hoja→tabla. Se recalcula el Target relativo a la carpeta del part dueño de cada .rels.
const normalizeRelsTargets = (relsPath, xml) => {
  const ownerDir = path.posix.dirname(path.posix.dirname(relsPath));
  return xml.replace(/Target="([^"]+)"/g, (match, target) => {
    if (!target.startsWith('/')) return match;
    const absolute = target.replace(/^\/+/, '');
    const relative = path.posix.relative(ownerDir === '.' ? '' : ownerDir, absolute);
    return `Target="${relative}"`;
  });
};

const normalizeXlsxBuffer = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  let changed = false;
  await Promise.all(
    Object.keys(zip.files)
      .filter((name) => !zip.files[name].dir && (name.endsWith('.xml') || name.endsWith('.rels')))
      .map(async (name) => {
        const content = await zip.file(name).async('string');
        let normalized = stripKnownNamespacePrefixes(content);
        if (name.endsWith('.rels')) {
          normalized = normalizeRelsTargets(name, normalized);
        }
        if (normalized !== content) {
          zip.file(name, normalized);
          changed = true;
        }
      })
  );
  return changed ? zip.generateAsync({ type: 'nodebuffer' }) : buffer;
};

module.exports = { normalizeXlsxBuffer };
