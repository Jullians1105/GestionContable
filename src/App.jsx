import { useState, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { usePullToRefresh } from './hooks/usePullToRefresh'
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
import PersonalTasksPage from './pages/PersonalTasksPage'
// BlockNote (Tiptap/ProseMirror) agrega ~230KB gzip al bundle — separado en su
// propio chunk para que solo se descargue al entrar a /notas, no en cada carga.
const PersonalNotesPage = lazy(() => import('./pages/PersonalNotesPage'))
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
import WorkloadPage from './pages/WorkloadPage'
import NotificationsPage from './pages/NotificationsPage'
import UsersPage from './pages/UsersPage'
import FondoEmprenderPage from './pages/FondoEmprenderPage'
import FondoEmprenderEmpresasPage from './pages/FondoEmprenderEmpresasPage'
import FondoEmprenderEmpresaDetallePage from './pages/FondoEmprenderEmpresaDetallePage'
import FondoEmprenderPagosPage from './pages/FondoEmprenderPagosPage'
import RecurringTasksPage from './pages/RecurringTasksPage'

function Layout() {
  const { isAuthenticated } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pullY, releasing, ready } = usePullToRefresh()
  if (!isAuthenticated) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen bg-[#f3f4f6] dark:bg-[#0f1117] text-[#191c1e] dark:text-[#e4e6f0]">
      {/* Pull-to-refresh indicator — visible solo en móvil cuando se arrastra hacia abajo */}
      <div
        className="lg:hidden fixed top-16 left-0 right-0 z-30 flex justify-center pointer-events-none"
        style={{
          transform: `translateY(${pullY - 48}px)`,
          transition: releasing || pullY === 0 ? 'transform 0.25s ease' : 'none',
          opacity: pullY > 10 ? Math.min(pullY / 48, 1) : 0,
        }}
      >
        <div className={`w-10 h-10 rounded-full shadow-md flex items-center justify-center bg-white dark:bg-[#1e2030] border border-[#c3c6d7] dark:border-[#2e3148] ${releasing ? 'animate-spin' : ''}`}>
          <span
            className="material-symbols-outlined text-[#004ac6]"
            style={{
              fontSize: 20,
              transform: ready && !releasing ? 'rotate(180deg)' : `rotate(${(pullY / 48) * 180}deg)`,
              transition: 'transform 0.1s',
            }}
          >
            {releasing ? 'progress_activity' : 'arrow_downward'}
          </span>
        </div>
      </div>
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
            <Route path="/pendientes" element={<PersonalTasksPage />} />
            <Route
              path="/notas"
              element={
                <Suspense fallback={
                  <div className="flex items-center justify-center py-20 text-[#8890b5] dark:text-[#5a5f7a]">
                    <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  </div>
                }>
                  <PersonalNotesPage />
                </Suspense>
              }
            />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/kanban" element={<KanbanPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/workload" element={<WorkloadPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/usuarios" element={<UsersPage />} />
            <Route path="/fondo-emprender" element={<FondoEmprenderPage />} />
            <Route path="/fondo-emprender/empresas" element={<FondoEmprenderEmpresasPage />} />
            <Route path="/fondo-emprender/empresas/:empresaId" element={<FondoEmprenderEmpresaDetallePage />} />
            <Route path="/fondo-emprender/pagos" element={<FondoEmprenderPagosPage />} />
            <Route path="/tasks/recurrentes" element={<RecurringTasksPage />} />
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
