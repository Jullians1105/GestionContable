import { storage } from '../utils/storage'

export default function SettingsPage() {
  const handleClearData = () => {
    if (window.confirm('¿Borrar todos los datos y restaurar los datos de ejemplo? Esta acción no se puede deshacer.')) {
      localStorage.removeItem('tasks')
      localStorage.removeItem('team_members')
      window.location.reload()
    }
  }

  const handleExportData = () => {
    const data = {
      tasks: storage.getTasks(),
      team_members: storage.getMembers(),
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gestion-tareas-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-500 mt-1">Gestiona las opciones de la aplicación</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Sobre la app */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-3">Sobre la aplicación</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Nombre</dt>
              <dd className="font-medium text-gray-900">Gestor de Tareas Empresarial</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Versión</dt>
              <dd className="font-medium text-gray-900">0.1.0 - Fase 1 MVP</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Almacenamiento</dt>
              <dd className="font-medium text-gray-900">localStorage (navegador)</dd>
            </div>
          </dl>
        </div>

        {/* Datos */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-1">Gestión de Datos</h2>
          <p className="text-sm text-gray-500 mb-4">
            Todos los datos se almacenan localmente en tu navegador.
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={handleExportData} className="btn-secondary text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Exportar datos (JSON)
            </button>
            <button onClick={handleClearData} className="btn-danger text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Restaurar datos de ejemplo
            </button>
          </div>
        </div>

        {/* Paleta de colores */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-3">Paleta de Colores</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { name: 'Azul Profesional', color: '#2563EB' },
              { name: 'Rojo (Urgente)', color: '#EF4444' },
              { name: 'Amarillo (Medio)', color: '#FBBF24' },
              { name: 'Verde (OK)', color: '#10B981' },
              { name: 'Gris Oscuro', color: '#1F2937' },
              { name: 'Naranja', color: '#F97316' },
            ].map(({ name, color }) => (
              <div key={color} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md shrink-0 shadow-sm" style={{ backgroundColor: color }} />
                <span className="text-xs text-gray-600">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
