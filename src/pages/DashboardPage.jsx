import Dashboard from "../components/Dashboard"

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-[24px] font-bold text-[#191c1e]">Dashboard General</h2>
        <p className="text-[14px] text-[#434655] mt-1">Bienvenido de nuevo. Aqui tienes un resumen del estado de tus proyectos.</p>
      </div>
      <Dashboard />
    </div>
  )
}
