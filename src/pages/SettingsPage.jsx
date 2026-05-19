import { storage } from "../utils/storage"

export default function SettingsPage() {
  const handleClearData = () => {
    if (window.confirm("Borrar todos los datos y restaurar los datos de ejemplo? Esta accion no se puede deshacer.")) {
      localStorage.removeItem("tasks")
      localStorage.removeItem("team_members")
      window.location.reload()
    }
  }

  const handleExportData = () => {
    const data = {
      tasks: storage.getTasks(),
      team_members: storage.getMembers(),
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `taskflow-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-[24px] font-bold text-[#191c1e]">Configuracion de Cuenta</h2>
        <p className="text-[14px] text-[#434655] mt-1">Gestiona tu perfil personal y las opciones de la aplicacion.</p>
      </div>

      <div className="max-w-3xl space-y-6">
        {/* Sobre la app */}
        <div className="card">
          <h3 className="text-[18px] font-bold text-[#191c1e] mb-4">Sobre la aplicacion</h3>
          <dl className="space-y-3">
            {[
              { label: "Nombre", value: "TaskFlow Pro" },
              { label: "Version", value: "1.0.0 - Fase 1 MVP" },
              { label: "Almacenamiento", value: "localStorage (navegador)" },
              { label: "Stack", value: "React 18 + Vite + Tailwind CSS" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center py-2 border-b border-[#edeef0] last:border-0">
                <dt className="text-[14px] text-[#434655]">{label}</dt>
                <dd className="text-[14px] font-semibold text-[#191c1e]">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Gestion de datos */}
        <div className="card">
          <h3 className="text-[18px] font-bold text-[#191c1e] mb-1">Gestion de Datos</h3>
          <p className="text-[14px] text-[#434655] mb-6">
            Todos los datos se almacenan localmente en tu navegador.
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={handleExportData} className="btn-secondary">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
              Exportar datos (JSON)
            </button>
            <button onClick={handleClearData} className="btn-danger">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>restore</span>
              Restaurar datos de ejemplo
            </button>
          </div>
        </div>

        {/* Paleta de colores */}
        <div className="card">
          <h3 className="text-[18px] font-bold text-[#191c1e] mb-4">Paleta de Colores</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { name: "Primario", color: "#004ac6" },
              { name: "Primario container", color: "#2563EB" },
              { name: "Error / Alta", color: "#EF4444" },
              { name: "Warning / Media", color: "#FBBF24" },
              { name: "Success / Baja", color: "#10B981" },
              { name: "Info / Naranja", color: "#F97316" },
            ].map(({ name, color }) => (
              <div key={color} className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg shrink-0 shadow-sm border border-[#c3c6d7]" style={{ backgroundColor: color }} />
                <div>
                  <p className="text-[12px] font-semibold text-[#191c1e]">{name}</p>
                  <p className="text-[11px] text-[#434655]">{color}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
