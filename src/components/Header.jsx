import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTasks } from '../hooks/useTasks'
import { getInitials } from '../utils/helpers'

const USER_NAME = 'Carlos Mendoza'
const USER_ROLE = 'Project Manager'

export default function Header() {
  const [search, setSearch] = useState('')
  const { tasks } = useTasks()
  const navigate = useNavigate()

  const handleSearch = (e) => {
    e.preventDefault()
    if (search.trim()) {
      navigate(`/tasks?search=${encodeURIComponent(search.trim())}`)
      setSearch('')
    }
  }

  return (
    <header className="fixed top-0 right-0 left-[250px] h-16 z-40 bg-white border-b border-[#c3c6d7] shadow-sm flex items-center justify-between px-6">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex-1 max-w-md">
        <div className="relative focus-within:ring-2 focus-within:ring-[#004ac6] rounded-lg transition-all">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#434655]" style={{ fontSize: 18 }}>search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tareas, proyectos..."
            className="w-full h-10 pl-10 pr-4 bg-[#f3f4f6] border-none rounded-lg text-[14px] text-[#191c1e] focus:outline-none focus:ring-0"
          />
        </div>
      </form>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Task count pill */}
        <span className="hidden sm:block text-[12px] font-semibold px-3 py-1 bg-[#edeef0] text-[#434655] rounded-full">
          {tasks.length} tareas
        </span>

        {/* Icon buttons */}
        <div className="flex items-center gap-1">
          <button className="w-10 h-10 rounded-full flex items-center justify-center text-[#434655] hover:bg-[#e7e8ea] transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>notifications</span>
          </button>
          <button className="w-10 h-10 rounded-full flex items-center justify-center text-[#434655] hover:bg-[#e7e8ea] transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>help_outline</span>
          </button>
        </div>

        {/* Divider */}
        <div className="h-8 w-px bg-[#c3c6d7]" />

        {/* User */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-[12px] font-semibold text-[#191c1e] leading-tight">{USER_NAME}</p>
            <p className="text-[12px] text-[#434655]">{USER_ROLE}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-[#004ac6] flex items-center justify-center text-white text-sm font-bold border border-[#c3c6d7]">
            {getInitials(USER_NAME)}
          </div>
        </div>
      </div>
    </header>
  )
}
