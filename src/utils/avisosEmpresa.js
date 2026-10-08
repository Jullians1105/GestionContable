// Avisos al escribir la identidad de una empresa (crear o editar en /empresas). Son solo
// informativos: nunca bloquean el guardado. Se comparan contra el directorio ya cargado, así que
// no hace falta ninguna consulta extra.
//
// El documento de una persona natural vive en `nit` (igual que el NIT de una empresa), por eso un
// mismo número en "NIT" de una empresa y en "Cédula" de una persona es el MISMO documento repetido.
// La cédula del representante legal es otra cosa: puede coincidir a propósito con una persona
// natural ya registrada o con el representante de otra empresa (un dueño con varias empresas), así
// que ahí se avisa con tono informativo ("ya existe"), no como duplicado.

// Misma limpieza que el backend (limpiarDocumento): sin puntos ni espacios y sin dígito de
// verificación ("901.234.567-1" -> "901234567").
export function limpiarDocumento(valor) {
  const crudo = String(valor ?? '').trim()
  if (crudo === '') return { limpio: null, invalido: false, conGuion: false }
  const limpio = crudo.replace(/[.\s]/g, '').split('-')[0]
  if (limpio === '') return { limpio: null, invalido: false, conGuion: false }
  return { limpio: /^\d+$/.test(limpio) ? limpio : null, invalido: !/^\d+$/.test(limpio), conGuion: crudo.includes('-') }
}

const nombres = (lista) => {
  const n = lista.slice(0, 3).map((e) => e.name)
  return n.join(', ') + (lista.length > 3 ? ` y ${lista.length - 3} más` : '')
}
const quien = (e) => (e.tipoContribuyente === 'natural' ? `persona natural ${e.name}` : e.name)

// campo: 'documento' (NIT de empresa o cédula de persona natural) | 'representante'
// Devuelve [{ nivel: 'repetido' | 'info' | 'error' | 'ayuda', texto }]
export function avisosDocumento({ campo, valor, tipoContribuyente, empresas, excluirId = null, documentoPropio = '' }) {
  const { limpio, invalido, conGuion } = limpiarDocumento(valor)
  if (invalido) return [{ nivel: 'error', texto: 'Solo puede tener números (puedes separar el dígito de verificación con guion).' }]
  if (!limpio) return []

  const otras = empresas.filter((e) => e.id !== excluirId)
  const avisos = []

  if (campo === 'documento') {
    const mismoDocumento = otras.filter((e) => e.nit === limpio)
    if (mismoDocumento.length) {
      avisos.push({ nivel: 'repetido', texto: `Este documento ya está registrado en ${mismoDocumento.map(quien).slice(0, 3).join(', ')}. Revisa que no sea un duplicado.` })
    }
    const comoRepresentante = otras.filter((e) => e.cedulaRepresentante === limpio)
    if (comoRepresentante.length) {
      avisos.push({ nivel: 'info', texto: `Esta cédula figura como representante legal de ${nombres(comoRepresentante)}.` })
    }
    if (tipoContribuyente === 'natural' && (limpio.length < 6 || limpio.length > 10)) {
      avisos.push({ nivel: 'ayuda', texto: 'Una cédula suele tener entre 6 y 10 dígitos. Revísala.' })
    }
    if (tipoContribuyente !== 'natural' && limpio.length > 9 && !conGuion) {
      avisos.push({ nivel: 'ayuda', texto: 'Un NIT tiene 9 dígitos. Si incluiste el dígito de verificación, sepáralo con guion (901234567-1).' })
    }
    if (tipoContribuyente !== 'natural' && limpio.length < 8) {
      avisos.push({ nivel: 'ayuda', texto: 'Un NIT suele tener 9 dígitos. Revísalo.' })
    }
  } else {
    const comoDocumento = otras.filter((e) => e.nit === limpio)
    if (comoDocumento.length) {
      avisos.push({ nivel: 'info', texto: `Esta cédula ya está registrada como ${comoDocumento.map(quien).slice(0, 3).join(', ')}.` })
    }
    const comoRepresentante = otras.filter((e) => e.cedulaRepresentante === limpio)
    if (comoRepresentante.length) {
      avisos.push({ nivel: 'info', texto: `Ya es representante legal de ${nombres(comoRepresentante)}.` })
    }
    if (limpio === limpiarDocumento(documentoPropio).limpio) {
      avisos.push({ nivel: 'ayuda', texto: 'Es el mismo número del NIT de esta empresa.' })
    }
    if (limpio.length < 6 || limpio.length > 10) {
      avisos.push({ nivel: 'ayuda', texto: 'Una cédula suele tener entre 6 y 10 dígitos. Revísala.' })
    }
  }
  return avisos
}

// Nombre comparado sin tildes, mayúsculas, puntuación ni figura jurídica ("Achiras del Rancho S.A.S." == "ACHIRAS DEL RANCHO").
export function normalizarNombre(nombre) {
  return String(nombre ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\b(S\.?\s?A\.?\s?S\.?|LTDA|S\.?\s?A\.?|E\.?\s?U\.?|BIC)\b/g, ' ')
    .replace(/[^A-Z0-9]/g, '')
}

export function avisosNombre({ valor, empresas, excluirId = null }) {
  const n = normalizarNombre(valor)
  if (n.length < 3) return []
  const iguales = empresas.filter((e) => e.id !== excluirId && normalizarNombre(e.name) === n)
  if (!iguales.length) return []
  return [{ nivel: 'repetido', texto: `Ya existe una empresa con este nombre: ${nombres(iguales)}. Revisa que no sea un duplicado.` }]
}
