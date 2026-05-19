import { useSearchParams } from "react-router-dom"
import TaskList from "../components/TaskList"

export default function TasksPage() {
  const [searchParams] = useSearchParams()
  const search = searchParams.get("search") || ""

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-[24px] font-bold text-[#191c1e]">Mis Tareas</h2>
        <p className="text-[14px] text-[#434655] mt-1">Gestiona y organiza tus entregables activos</p>
      </div>
      <TaskList initialFilters={search ? { search } : {}} />
    </div>
  )
}
