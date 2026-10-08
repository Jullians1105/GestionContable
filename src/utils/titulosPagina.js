// Título de la pestaña del navegador por ruta ("Empresas · Gestcon"). Se evalúa en orden, así que
// las rutas más específicas van antes que las generales. Sin coincidencia queda solo "Gestcon".
const TITULOS = [
  [/^\/$/, 'Inicio'],
  [/^\/tasks\/recurrentes/, 'Tareas recurrentes'],
  [/^\/tasks/, 'Tareas'],
  [/^\/pendientes/, 'Mis pendientes'],
  [/^\/notas/, 'Notas'],
  [/^\/team/, 'Equipo'],
  [/^\/groups/, 'Grupos'],
  [/^\/kanban/, 'Kanban'],
  [/^\/calendar/, 'Calendario'],
  [/^\/reports/, 'Reportes'],
  [/^\/workload/, 'Carga de trabajo'],
  [/^\/notifications/, 'Notificaciones'],
  [/^\/settings/, 'Configuración'],
  [/^\/profile/, 'Perfil'],
  [/^\/usuarios/, 'Usuarios'],
  [/^\/fondo-emprender\/empresas\/[^/]+/, 'Empresa · Fondo Emprender'],
  [/^\/fondo-emprender\/empresas/, 'Empresas · Fondo Emprender'],
  [/^\/fondo-emprender\/pagos/, 'Pagos · Fondo Emprender'],
  [/^\/fondo-emprender/, 'Fondo Emprender'],
  [/^\/empresas-externas/, 'Empresas Externas'],
  [/^\/empresas/, 'Empresas'],
  [/^\/dian\/upload/, 'Cargar reporte DIAN'],
  [/^\/dian\/clasificacion/, 'Clasificación DIAN'],
  [/^\/dian\/nomina-electronica\/empresas/, 'Empresas · Nómina Electrónica'],
  [/^\/dian\/nomina-electronica/, 'Nómina Electrónica'],
  [/^\/dian\/nomina/, 'Nómina DIAN'],
  [/^\/dian\/exportacion/, 'Exportación DIAN'],
  [/^\/dian\/consolidado/, 'Consolidado'],
  [/^\/dian\/terceros/, 'Terceros'],
  [/^\/dian\/consulta-tercero/, 'Consulta de tercero'],
  [/^\/dian\/deudas/, 'Deudas DIAN'],
  [/^\/exogenas/, 'Exógenas'],
]

export function tituloDePagina(pathname) {
  const hallado = TITULOS.find(([patron]) => patron.test(pathname))
  return hallado ? `${hallado[1]} · Gestcon` : 'Gestcon'
}
