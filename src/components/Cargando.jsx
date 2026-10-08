// Indicador de "cargando" de pantalla completa — un solo diseño para toda la app (el de
// Nómina Electrónica): ícono girando + texto, centrado. Antes cada pantalla tenía el suyo.
export default function Cargando({ texto = 'Cargando…', className = 'py-20' }) {
  return (
    <div className={`flex items-center justify-center text-[#8890b5] ${className}`} role="status" aria-live="polite">
      <span className="material-symbols-outlined mr-2" style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}>
        progress_activity
      </span>
      {texto}
    </div>
  )
}
