import { Link } from 'react-router-dom'

// Ruta que no existe dentro de la app (dirección mal escrita o enlace viejo).
export default function NotFoundPage() {
  return (
    <div className="max-w-md mx-auto mt-24 text-center">
      <span className="material-symbols-outlined text-[#9ca3af]" style={{ fontSize: 48 }}>travel_explore</span>
      <h1 className="mt-3 text-lg font-bold text-[#191c1e]">Página no encontrada</h1>
      <p className="mt-1 text-sm text-[#6b7280]">La dirección no existe o ya no está disponible.</p>
      <Link
        to="/"
        className="inline-block mt-5 px-4 py-2 rounded-lg text-sm font-semibold text-white"
        style={{ background: '#003B43' }}
      >
        Volver al inicio
      </Link>
    </div>
  )
}
