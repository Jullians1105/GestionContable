export default function StatsCard({ title, value, icon, borderColor = '#004ac6', iconColor = '#004ac6', sub, subColor = '#434655' }) {
  return (
    <div className={`bg-white p-6 rounded-xl shadow-sm border-l-4 flex flex-col justify-between hover:shadow-md transition-shadow`}
      style={{ borderLeftColor: borderColor }}>
      <div className="flex justify-between items-start">
        <span className="text-[12px] font-semibold text-[#434655]">{title}</span>
        <span className="material-symbols-outlined" style={{ color: iconColor, fontSize: 22 }}>{icon}</span>
      </div>
      <div className="mt-4">
        <h3 className="text-[32px] font-bold text-[#191c1e] leading-none">{value}</h3>
        {sub && (
          <p className="text-[12px] mt-1 flex items-center gap-1" style={{ color: subColor }}>{sub}</p>
        )}
      </div>
    </div>
  )
}
