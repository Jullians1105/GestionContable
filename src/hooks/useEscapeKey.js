import { useEffect } from 'react'

// Cierra un modal con la tecla Escape. `activo` permite apagarlo (modal cerrado, o hay otro modal
// encima que debe cerrarse primero). El manejador más reciente es el que se usa, sin re-suscribirse.
export function useEscapeKey(onEscape, activo = true) {
  useEffect(() => {
    if (!activo) return undefined
    const alTeclear = (e) => { if (e.key === 'Escape') onEscape() }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [onEscape, activo])
}
