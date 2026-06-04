import TeamManager from "../components/TeamManager"

export default function TeamPage() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-[24px] font-bold text-[#191c1e] dark:text-[#e4e6f0]">Equipo</h2>
        <p className="text-[14px] text-[#434655] dark:text-[#c4c8e8] mt-1">Gestiona los miembros de tu organizacion y sus permisos.</p>
      </div>
      <TeamManager />
    </div>
  )
}
