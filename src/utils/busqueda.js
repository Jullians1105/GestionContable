// Búsqueda de texto en las listas: sin importar mayúsculas, tildes ni espacios sobrantes
// ("comunicacion" encuentra "COMUNICACIÓN"). Antes cada pantalla comparaba con toLowerCase().includes().
export const normalizarBusqueda = (texto) =>
  String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// `q` ya normalizado (normalizarBusqueda) contra el texto de un campo.
export const contiene = (texto, q) => normalizarBusqueda(texto).includes(q)

// Lo que la persona escribió, como documento: sin puntos ni espacios y sin dígito de verificación
// ("901.234.567-1" -> "901234567"). Los NIT/cédulas se guardan solo con dígitos. '' si no es un número.
export const documentoDeBusqueda = (texto) => {
  const limpio = String(texto ?? '').replace(/[.\s]/g, '').split('-')[0]
  return /^\d+$/.test(limpio) ? limpio : ''
}
