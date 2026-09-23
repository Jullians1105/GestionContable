import TeamManager from "../components/TeamManager"

export default function TeamPage() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-[24px] font-bold text-[#191c1e]">Equipo</h2>
        <p className="text-[14px] text-[#434655] mt-1">Gestiona los miembros de tu organizacion y sus permisos.</p>
      </div>
      <TeamManager />
    </div>
  )
}
