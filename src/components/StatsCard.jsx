export default function StatsCard({ title, value, icon, colorClass = 'bg-blue-50 text-blue-600' }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`p-3 rounded-xl ${colorClass}`}>
        <span className="text-2xl">{icon}</span>
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )
}
