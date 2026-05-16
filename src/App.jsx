import { useState } from 'react'
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
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
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
