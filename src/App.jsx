import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { TaskProvider } from './context/TaskContext'
import { TeamProvider } from './context/TeamContext'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import DashboardPage from './pages/DashboardPage'
import TasksPage from './pages/TasksPage'
import TeamPage from './pages/TeamPage'
import SettingsPage from './pages/SettingsPage'
import './App.css'

function Layout() {
  return (
    <div className="min-h-screen bg-[#f3f4f6] text-[#191c1e]">
      <Sidebar />
      <Header />
      <main className="ml-[250px] pt-16 min-h-screen">
        <div className="p-6">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <TeamProvider>
        <TaskProvider>
          <Layout />
        </TaskProvider>
      </TeamProvider>
    </BrowserRouter>
  )
}
