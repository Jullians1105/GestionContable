import { useSearchParams } from "react-router-dom"
import TaskList from "../components/TaskList"

export default function TasksPage() {
  const [searchParams] = useSearchParams()
  const search = searchParams.get("search") || ""
  const openTaskId = searchParams.get("openTask") || null
  const openCommentId = searchParams.get("comment") || null

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-[24px] font-bold text-[#191c1e] dark:text-[#e4e6f0]">Mis Tareas</h2>
        <p className="text-[14px] text-[#434655] dark:text-[#c4c8e8] mt-1">Gestiona y organiza tus entregables activos</p>
      </div>
      <TaskList
        initialFilters={search ? { search } : {}}
        openTaskId={openTaskId}
        openCommentId={openCommentId}
      />
    </div>
  )
}
