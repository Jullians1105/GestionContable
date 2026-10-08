// Cerrar un modal al hacer clic en el fondo oscuro, pero SOLO si el clic empezó y terminó ahí.
// Con un simple onClick en el fondo, seleccionar texto dentro del modal arrastrando el mouse hasta
// fuera (o seleccionar todo y soltar sobre el fondo) dispara el clic en el fondo y cierra el modal
// en medio de lo que la persona estaba escribiendo. Uso: <div {...backdropClose(cerrar)}>.
let empezoEnElFondo = false

export const backdropClose = (onClose) => ({
  onMouseDown: (e) => { empezoEnElFondo = e.target === e.currentTarget },
  onClick: (e) => {
    const cerrar = empezoEnElFondo && e.target === e.currentTarget
    empezoEnElFondo = false
    if (cerrar) onClose()
  },
})
