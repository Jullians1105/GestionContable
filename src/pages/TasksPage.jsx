import { useSearchParams } from 'react-router-dom'
import TaskList from '../components/TaskList'

export default function TasksPage() {
  const [searchParams] = useSearchParams()
  const search = searchParams.get('search') || ''

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mis Tareas</h1>
        <p className="text-gray-500 mt-1">Gestiona y organiza todas las tareas del equipo</p>
      </div>
      <TaskList initialFilters={search ? { search } : {}} />
    </div>
  )
}
