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
import ProfilePage from './pages/ProfilePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import GroupsPage from './pages/GroupsPage'
import KanbanPage from './pages/KanbanPage'
import CalendarPage from './pages/CalendarPage'
import ReportsPage from './pages/ReportsPage'
import NotificationsPage from './pages/NotificationsPage'
import UsersPage from './pages/UsersPage'
import FondoEmprenderPage from './pages/FondoEmprenderPage'
import FondoEmprenderEmpresasPage from './pages/FondoEmprenderEmpresasPage'
import FondoEmprenderEmpresaDetallePage from './pages/FondoEmprenderEmpresaDetallePage'
import FondoEmprenderPagosPage from './pages/FondoEmprenderPagosPage'
import DianClasificacionPage from './pages/DianClasificacionPage'
import DianUploadPage from './pages/DianUploadPage'
import DianNominaPage from './pages/DianNominaPage'
import DianExportacionPage from './pages/DianExportacionPage'

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
      <main className="lg:ml-[var(--sidebar-w,112px)] pt-16 min-h-screen transition-[margin-left] duration-200">
        <div className="p-6">
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
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/usuarios" element={<UsersPage />} />
            <Route path="/fondo-emprender" element={<FondoEmprenderPage />} />
            <Route path="/fondo-emprender/empresas" element={<FondoEmprenderEmpresasPage />} />
            <Route path="/fondo-emprender/empresas/:empresaId" element={<FondoEmprenderEmpresaDetallePage />} />
            <Route path="/fondo-emprender/pagos" element={<FondoEmprenderPagosPage />} />
            <Route path="/dian/upload"         element={<DianUploadPage />} />
            <Route path="/dian/clasificacion" element={<DianClasificacionPage />} />
            <Route path="/dian/nomina"        element={<DianNominaPage />} />
            <Route path="/dian/exportacion"   element={<DianExportacionPage />} />
          </Routes>
        </div>
      </main>
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
                          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                          <Route path="/reset-password" element={<ResetPasswordPage />} />
                          <Route path="/*" element={<Layout />} />
                        </Routes>
                      </TagProvider>
                    </NotificationProvider>
                  </GroupProvider>
                </TaskProvider>
              </TeamProvider>
            </SocketProvider>
          </AuthProvider>
          <Toast />
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
