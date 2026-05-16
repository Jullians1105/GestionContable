import Dashboard from '../components/Dashboard'

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Resumen del estado del equipo y las tareas</p>
      </div>
      <Dashboard />
    </div>
  )
}
