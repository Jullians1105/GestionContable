import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TaskProvider } from './context/TaskContext'
import { TeamProvider } from './context/TeamContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { GroupProvider } from './context/GroupContext'
import { NotificationProvider } from './context/NotificationContext'
import { TagProvider } from './context/TagContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import { SocketProvider } from './context/SocketContext'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Toast from './components/Toast'
import DashboardPage from './pages/DashboardPage'
import TasksPage from './pages/TasksPage'
import TeamPage from './pages/TeamPage'
import SettingsPage from './pages/SettingsPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import GroupsPage from './pages/GroupsPage'
import KanbanPage from './pages/KanbanPage'
import CalendarPage from './pages/CalendarPage'
import ReportsPage from './pages/ReportsPage'
import NotificationsPage from './pages/NotificationsPage'
import UsersPage from './pages/UsersPage'
import './App.css'

function Layout() {
  const { isAuthenticated } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  if (!isAuthenticated) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen bg-[#f3f4f6] dark:bg-[#0f1117] text-[#191c1e] dark:text-[#e4e6f0]">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuToggle={() => setSidebarOpen(v => !v)} />
      <main className="lg:ml-[250px] pt-16 min-h-screen">
        <div className="p-4 sm:p-6">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/kanban" element={<KanbanPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/usuarios" element={<UsersPage />} />
          </Routes>
        </div>
      </main>
      <Toast />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <SocketProvider>
              <TeamProvider>
                <TaskProvider>
                  <GroupProvider>
                    <NotificationProvider>
                      <TagProvider>
                        <Routes>
                          <Route path="/login" element={<LoginPage />} />
                          <Route path="/register" element={<RegisterPage />} />
                          <Route path="/*" element={<Layout />} />
                        </Routes>
                      </TagProvider>
                    </NotificationProvider>
                  </GroupProvider>
                </TaskProvider>
              </TeamProvider>
            </SocketProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
