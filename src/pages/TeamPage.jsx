import TeamManager from '../components/TeamManager'

export default function TeamPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Equipo</h1>
        <p className="text-gray-500 mt-1">Gestiona los miembros y sus roles en el proyecto</p>
      </div>
      <TeamManager />
    </div>
  )
}
