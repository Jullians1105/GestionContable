const BASE = '/api';

let _refreshPromise = null;

function getToken() {
  return localStorage.getItem('auth_token');
}

function getRefreshToken() {
  return localStorage.getItem('auth_refresh_token');
}

function setTokens(token, refreshToken) {
  localStorage.setItem('auth_token', token);
  if (refreshToken) localStorage.setItem('auth_refresh_token', refreshToken);
}

function clearTokens() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_refresh_token');
  localStorage.removeItem('auth_user');
}

const REFRESH_LOCK = 'gestcon-refresh-token';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// El token de renovación sirve UNA sola vez: con dos pestañas (o ventanas) abiertas, ambas intentan
// renovar a la vez, una gana y la otra recibía "inválido" y cerraba la sesión de todas (comparten
// localStorage). Se serializa entre pestañas con Web Locks y, si otra ya renovó, se reutiliza su token.
const conLockEntrePestanas = (fn) => (typeof navigator !== 'undefined' && navigator.locks?.request
  ? navigator.locks.request(REFRESH_LOCK, fn)
  : fn());

async function renovarSesion(tokenRechazado) {
  // Otra pestaña ya renovó mientras esperábamos el turno: usar lo que dejó guardado
  const vigente = getToken();
  if (vigente && vigente !== tokenRechazado) return vigente;

  const usado = getRefreshToken();
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: usado }),
  });

  if (res.ok) {
    const data = await res.json();
    setTokens(data.token, data.refreshToken);
    return data.token;
  }

  // Fallo del servidor o límite de peticiones (p. ej. 502 mientras se despliega): la sesión sigue
  // siendo válida, solo no se pudo renovar ahora. No se cierra, el siguiente intento lo reintenta.
  if (res.status !== 401 && res.status !== 403) throw new Error('No se pudo renovar la sesión ahora');

  // Sin Web Locks otra pestaña pudo ganar la carrera: darle un momento para guardar sus tokens nuevos
  for (let i = 0; i < 6; i++) {
    await sleep(500);
    const rt = getRefreshToken();
    if (rt && rt !== usado && getToken()) return getToken();
  }

  clearTokens();
  window.location.href = '/login';
  throw new Error('Session expired');
}

async function refreshAccessToken(tokenRechazado) {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = conLockEntrePestanas(() => renovarSesion(tokenRechazado))
    .finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

// fetch con el ciclo de refresh de token — sin asumir nada sobre el body de la respuesta
// (JSON, blob, lo que sea), a diferencia de request() más abajo. Se usa directamente en las
// llamadas que no son JSON puro (upload de FormData, descarga de blob) para que también se
// beneficien del refresh automático en vez de reimplementarlo cada una por su lado — eso fue
// exactamente lo que le pasó a exportarDian: al no pasar por acá, un token vencido durante
// una sesión larga se mostraba como "Token inválido o expirado" en vez de refrescarse solo.
async function fetchWithAuth(path, options = {}, retry = true) {
  const { skipAuthRedirect, ...fetchOptions } = options;
  const token = getToken();
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...fetchOptions.headers,
  };

  const res = await fetch(`${BASE}${path}`, { ...fetchOptions, headers });

  if (res.status === 401 && retry) {
    if (getRefreshToken()) {
      try {
        await refreshAccessToken(token);
        return fetchWithAuth(path, options, false);
      } catch {
        throw new Error('Sesión expirada');
      }
    }
    if (!skipAuthRedirect) {
      clearTokens();
      window.location.href = '/login';
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Credenciales incorrectas');
  }

  return res;
}

async function request(path, options = {}, retry = true) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const res = await fetchWithAuth(path, { ...options, headers }, retry);

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    if (body.details) console.error('[API]', path, body.details);
    const err = new Error(body.error || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

// Arma la query string de {anio, mes} | {anio, cuatrimestre} | {anio} para el consolidado de
// Contabilidad, sin incluir campos null/undefined (URLSearchParams los convertiría al string
// literal "null", que el validador del backend rechazaría).
function buildPeriodoParams(empresaId, periodo) {
  const params = { empresaId };
  for (const [k, v] of Object.entries(periodo ?? {})) {
    if (v !== null && v !== undefined) params[k] = v;
  }
  return new URLSearchParams(params);
}

export const api = {
  // Auth
  login: async (email, password) => {
    const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }), skipAuthRedirect: true });
    setTokens(data.token, data.refreshToken);
    return data;
  },
  logout: async (refreshToken) => {
    try {
      await request('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) });
    } finally {
      clearTokens();
    }
  },
  me: () => request('/auth/me'),
  updateMe: (data) => request('/auth/me', { method: 'PUT', body: JSON.stringify(data) }),

  // Tasks
  getTasks: (filters = {}) => {
    const params = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return request(`/tasks${params ? `?${params}` : ''}`);
  },
  getTask: (id) => request(`/tasks/${id}`),
  getTemplates: () => request('/tasks/templates'),
  createTask: (data) => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id, data) => request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
  searchTasks: (q, limit = 20) => request(`/tasks/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  getTaskHistory: (id) => request(`/tasks/${id}/history`),
  updateMyAssigneeStatus: (taskId, status) => request(`/tasks/${taskId}/assignees/me`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  createDeleteRequest: (taskId, reason) => request(`/tasks/${taskId}/delete-request`, { method: 'POST', body: JSON.stringify({ reason }) }),
  respondDeleteRequest: (taskId, requestId, action) => request(`/tasks/${taskId}/delete-request/${requestId}`, { method: 'PATCH', body: JSON.stringify({ action }) }),

  // Subtareas
  addSubtask: (taskId, title) => request(`/tasks/${taskId}/subtasks`, { method: 'POST', body: JSON.stringify({ title }) }),
  updateSubtask: (taskId, subtaskId, data) => request(`/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSubtask: (taskId, subtaskId) => request(`/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'DELETE' }),

  // Comentarios
  addComment: (taskId, text) => request(`/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ text }) }),
  updateComment: (taskId, commentId, text) => request(`/tasks/${taskId}/comments/${commentId}`, { method: 'PUT', body: JSON.stringify({ text }) }),
  deleteComment: (taskId, commentId) => request(`/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' }),

  // Tareas pendientes personales
  getPersonalTasks: () => request('/personal-tasks'),
  createPersonalTask: (data) => request('/personal-tasks', { method: 'POST', body: JSON.stringify(data) }),
  updatePersonalTask: (id, data) => request(`/personal-tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePersonalTask: (id) => request(`/personal-tasks/${id}`, { method: 'DELETE' }),
  addPersonalTaskItem: (taskId, title) => request(`/personal-tasks/${taskId}/items`, { method: 'POST', body: JSON.stringify({ title }) }),
  updatePersonalTaskItem: (taskId, itemId, data) => request(`/personal-tasks/${taskId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePersonalTaskItem: (taskId, itemId) => request(`/personal-tasks/${taskId}/items/${itemId}`, { method: 'DELETE' }),

  // Notas personales
  getPersonalNotes: () => request('/personal-notes'),
  getPersonalNote: (id) => request(`/personal-notes/${id}`),
  createPersonalNote: (data = {}) => request('/personal-notes', { method: 'POST', body: JSON.stringify(data) }),
  updatePersonalNote: (id, data) => request(`/personal-notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePersonalNote: (id) => request(`/personal-notes/${id}`, { method: 'DELETE' }),

  // Employees
  getEmployees: () => request('/employees'),
  createEmployee: (data) => request('/employees', { method: 'POST', body: JSON.stringify(data) }),
  updateEmployee: (id, data) => request(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmployee: (id) => request(`/employees/${id}`, { method: 'DELETE' }),

  // Groups
  getGroups: () => request('/groups'),
  createGroup: (data) => request('/groups', { method: 'POST', body: JSON.stringify(data) }),
  updateGroup: (id, data) => request(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGroup: (id) => request(`/groups/${id}`, { method: 'DELETE' }),
  addGroupMember: (groupId, userId) => request(`/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ userId }) }),
  removeGroupMember: (groupId, userId) => request(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
  setGroupLeader: (groupId, userId, isLeader) => request(`/groups/${groupId}/members/${userId}/leader`, { method: 'PUT', body: JSON.stringify({ isLeader }) }),

  // Tags
  getTags: () => request('/tags'),
  createTag: (data) => request('/tags', { method: 'POST', body: JSON.stringify(data) }),
  updateTag: (id, data) => request(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTag: (id) => request(`/tags/${id}`, { method: 'DELETE' }),

  // Stats
  getStats: () => request('/stats'),
  getWorkload: () => request('/stats/workload'),
  // Registro de actividad: qué hizo cada persona en un día (fecha=AAAA-MM-DD, userId opcional)
  getActividad: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/actividad${qs ? `?${qs}` : ''}`);
  },
  getAuditLog: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/audit${qs ? `?${qs}` : ''}`);
  },

  // Fondo Emprender — Checklist mensual por empresa
  getFondoChecklist: (empresaId, anio, mes) => {
    const qs = new URLSearchParams({ anio, mes }).toString();
    return request(`/fondo/checklist/${empresaId}?${qs}`);
  },
  // Checklist del mes para todas las empresas en una sola llamada (evita 1 request por empresa)
  getFondoChecklistMes: (anio, mes) => {
    const qs = new URLSearchParams({ anio, mes }).toString();
    return request(`/fondo/checklist/mes?${qs}`);
  },
  updateFondoChecklistItem: (empresaId, procesoId, anio, mes, data) => {
    const qs = new URLSearchParams({ anio, mes }).toString();
    return request(`/fondo/checklist/${empresaId}/item/${procesoId}?${qs}`,
      { method: 'PUT', body: JSON.stringify(data) });
  },
  // tipo: 'nomina' | 'contabilidad' — cada uno tiene su propio flag
  // confirmado/enviado, independiente del otro.
  updateFondoChecklistConfirmado: (empresaId, anio, mes, tipo, data) => {
    const qs = new URLSearchParams({ anio, mes }).toString();
    return request(`/fondo/checklist/${empresaId}/confirmado/${tipo}?${qs}`,
      { method: 'PUT', body: JSON.stringify(data) });
  },
  updateFondoChecklistEnviado: (empresaId, anio, mes, tipo, data) => {
    const qs = new URLSearchParams({ anio, mes }).toString();
    return request(`/fondo/checklist/${empresaId}/enviado/${tipo}?${qs}`,
      { method: 'PUT', body: JSON.stringify(data) });
  },

  // Fondo Emprender — Detalle macroprocesos
  getFondoDetalle: (empresaId, anio, mes) => {
    const qs = new URLSearchParams({ anio, mes }).toString();
    return request(`/fondo/detalle/${empresaId}?${qs}`);
  },
  updateFondoDetalle: (empresaId, macroId, anio, mes, data) =>
    request(`/fondo/detalle/${empresaId}/${macroId}`, { method: 'PUT', body: JSON.stringify({ anio, mes, ...data }) }),

  // Fondo Emprender — Checklist de impuestos (mp6 / Información tributaria)
  getFondoImpuestos: (empresaId, anio, mes) => {
    const qs = new URLSearchParams({ anio, mes }).toString();
    return request(`/fondo/impuestos/${empresaId}?${qs}`);
  },
  updateFondoImpuestoItem: (empresaId, impuestoId, anio, mes, data) => {
    const qs = new URLSearchParams({ anio, mes }).toString();
    return request(`/fondo/impuestos/${empresaId}/item/${impuestoId}?${qs}`,
      { method: 'PATCH', body: JSON.stringify(data) });
  },

  // Fondo Emprender — Pagos
  getFondoPagos:    (empresaId)         => request(`/fondo/pagos/${empresaId}`),
  getFondoPagosTodasEmpresas: () => request('/fondo/pagos/todas'),
  createFondoPago:  (empresaId, data)   => request(`/fondo/pagos/${empresaId}`, { method: 'POST', body: JSON.stringify(data) }),
  updateFondoPago:  (empresaId, pagoId, data) => request(`/fondo/pagos/${empresaId}/${pagoId}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateFondoPagoAutorizado: (empresaId, anio, mes, autorizado) => {
    const qs = new URLSearchParams({ anio, mes }).toString();
    return request(`/fondo/pagos/${empresaId}/autorizar?${qs}`, { method: 'PUT', body: JSON.stringify({ autorizado }) });
  },
  getFondoPagosMesActual: () => request('/fondo/pagos/mes-actual'),
  avanzarFondoPagosMesActual: () => request('/fondo/pagos/mes-actual/avanzar', { method: 'POST' }),
  retrocederFondoPagosMesActual: () => request('/fondo/pagos/mes-actual/retroceder', { method: 'POST' }),

  // Fondo Emprender — Empresas
  getFondoEmpresas: (categoria, anio, mes) => {
    const p = {};
    if (categoria) p.categoria = categoria;
    if (anio) p.anio = anio;
    if (mes)  p.mes  = mes;
    const qs = Object.keys(p).length ? `?${new URLSearchParams(p)}` : '';
    return request(`/fondo/empresas${qs}`);
  },
  getFondoEmpresa: (id) => request(`/fondo/empresas/${id}`),
  updateFondoEmpresa: (id, data) => request(`/fondo/empresas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFondoEmpresa: (id) => request(`/fondo/empresas/${id}`, { method: 'DELETE' }),

  // Fondo Emprender — Vínculo tarea↔fondo
  getFondoLink: (taskId) => request(`/tasks/${taskId}/fondo-link`),
  setFondoLink: (taskId, data) => request(`/tasks/${taskId}/fondo-link`, { method: 'POST', body: JSON.stringify(data) }),
  deleteFondoLink: (taskId) => request(`/tasks/${taskId}/fondo-link`, { method: 'DELETE' }),

  getFondoMacroTareas: () => request('/fondo/detalle/tareas-macro'),
  getFondoResponsables: (anio, mes) => request(`/fondo/detalle/responsables?anio=${anio}&mes=${mes}`),

  // Fondo Emprender — Catálogo de procesos (checklist)
  getFondoProcesos: (incluirInactivos) => {
    const qs = incluirInactivos ? '?incluirInactivos=true' : ''
    return request(`/fondo/procesos${qs}`)
  },
  createFondoProceso: (data) => request('/fondo/procesos', { method: 'POST', body: JSON.stringify(data) }),
  updateFondoProceso: (id, data) => request(`/fondo/procesos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Fondo Emprender — Grupos de procesos (agrupar columnas del checklist)
  getFondoProcesoGrupos: () => request('/fondo/proceso-grupos'),
  createFondoProcesoGrupo: (data) => request('/fondo/proceso-grupos', { method: 'POST', body: JSON.stringify(data) }),
  updateFondoProcesoGrupo: (id, data) => request(`/fondo/proceso-grupos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFondoProcesoGrupo: (id) => request(`/fondo/proceso-grupos/${id}`, { method: 'DELETE' }),

  // Empresas Externas — Empresas
  getExtEmpresas: () => request('/externas/empresas'),
  getExtEmpresa: (id) => request(`/externas/empresas/${id}`),
  updateExtEmpresa: (id, data) => request(`/externas/empresas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteExtEmpresa: (id) => request(`/externas/empresas/${id}`, { method: 'DELETE' }),

  // Contabilidad — Catálogo de empresas
  getContabEmpresas: () => request('/contabilidad/empresas'),
  getContabEmpresa: (id) => request(`/contabilidad/empresas/${id}`),
  updateContabEmpresa: (id, data) => request(`/contabilidad/empresas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteContabEmpresa: (id) => request(`/contabilidad/empresas/${id}`, { method: 'DELETE' }),

  // Directorio maestro de empresas — une fondo_empresas/ext_empresas/ne_empresas/contab_empresas
  getEmpresasDirectorio: () => request('/empresas'),
  getEmpresasDuplicados: () => request('/empresas/duplicados'),
  createEmpresaMaestro: (data) => request('/empresas', { method: 'POST', body: JSON.stringify(data) }),
  updateEmpresaMaestro: (id, data) => request(`/empresas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  habilitarEmpresaModulo: (id, data) => request(`/empresas/${id}/habilitar`, { method: 'POST', body: JSON.stringify(data) }),
  deshabilitarEmpresaModulo: (id, modulo) => request(`/empresas/${id}/habilitar/${modulo}`, { method: 'DELETE' }),
  fusionarEmpresas: (empresaIdA, empresaIdB) => request('/empresas/fusionar', { method: 'POST', body: JSON.stringify({ empresaIdA, empresaIdB }) }),
  descartarDuplicadoEmpresa: (empresaIdA, empresaIdB) => request('/empresas/duplicados/descartar', { method: 'POST', body: JSON.stringify({ empresaIdA, empresaIdB }) }),
  generarTokenDian: (id) => request(`/empresas/${id}/generar-token-dian`, { method: 'POST' }),
  // Consulta el RUES y actualiza la matrícula mercantil de las empresas (admin/líder). Por defecto
  // solo las pendientes (nunca verificadas o con más de 7 días); con forzar = true, todas.
  // Fecha de la última actualización de los datos del RUES (la "foto" que publica Confecámaras de vez
  // en cuando). { actualizadaAl: ISO | null }
  getRuesFuente: () => request('/empresas/rues-fuente'),
  verificarMatriculaEmpresas: (forzar = false) => request('/empresas/verificar-matricula', { method: 'POST', body: JSON.stringify({ forzar }) }),

  // Deudas vencidas DIAN — revisión mensual contra MUISCA (ver dianDeudasController.js).
  // `mes` = 'YYYY-MM' (por defecto el actual). La clave DIAN nunca vuelve del servidor.
  getDeudasDian: (mes) => request(`/dian-deudas${mes ? `?mes=${mes}` : ''}`),
  getDeudasDianProgreso: () => request('/dian-deudas/progreso'),
  revisarDeudasDian: (empresaId) => request(`/dian-deudas/empresas/${empresaId}/revisar`, { method: 'POST' }),
  revisarTodasDeudasDian: (soloPendientes = true) => request('/dian-deudas/revisar-todas', { method: 'POST', body: JSON.stringify({ soloPendientes }) }),
  guardarClaveDian: (empresaId, clave) => request(`/dian-deudas/empresas/${empresaId}/clave`, { method: 'PUT', body: JSON.stringify({ clave }) }),
  // Claves DIAN guardadas, descifradas: { claves: { [empresaId]: clave }, sinDescifrar }. Para mostrarlas/copiarlas (presentación
  // manual); el servidor responde 403 a los "viewer".
  getClavesDian: () => request('/dian-deudas/claves', { method: 'POST' }),
  quitarClaveDian: (empresaId) => request(`/dian-deudas/empresas/${empresaId}/clave`, { method: 'DELETE' }),
  setIvaPeriodicidadDian: (empresaId, ivaPeriodicidad) => request(`/dian-deudas/empresas/${empresaId}/dian-config`, { method: 'PUT', body: JSON.stringify({ ivaPeriodicidad }) }),
  getCorreoDeudaDian: (revisionId) => request(`/dian-deudas/revisiones/${revisionId}/correo`),
  marcarCorreoDeudaDian: (revisionId, enviado) => request(`/dian-deudas/revisiones/${revisionId}/correo-enviado`, { method: 'PUT', body: JSON.stringify({ enviado }) }),
  resolverDetalleDeudaDian: (detalleId, estado) => request(`/dian-deudas/detalle/${detalleId}`, { method: 'PATCH', body: JSON.stringify({ estado }) }),

  // Empresas Externas — Catálogo de procesos (checklist)
  getExtProcesos: (incluirInactivos) => {
    const qs = incluirInactivos ? '?incluirInactivos=true' : ''
    return request(`/externas/procesos${qs}`)
  },
  createExtProceso: (data) => request('/externas/procesos', { method: 'POST', body: JSON.stringify(data) }),
  updateExtProceso: (id, data) => request(`/externas/procesos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Empresas Externas — Grupos de procesos (agrupar columnas del checklist)
  getExtProcesoGrupos: () => request('/externas/proceso-grupos'),
  createExtProcesoGrupo: (data) => request('/externas/proceso-grupos', { method: 'POST', body: JSON.stringify(data) }),
  updateExtProcesoGrupo: (id, data) => request(`/externas/proceso-grupos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteExtProcesoGrupo: (id) => request(`/externas/proceso-grupos/${id}`, { method: 'DELETE' }),

  // Empresas Externas — Checklist mensual
  getExtChecklist: (empresaId, anio, mes) => {
    const qs = new URLSearchParams({ anio, mes }).toString();
    return request(`/externas/checklist/${empresaId}?${qs}`);
  },
  // Checklist del mes para todas las empresas en una sola llamada (evita 1 request por empresa)
  getExtChecklistMes: (anio, mes) => {
    const qs = new URLSearchParams({ anio, mes }).toString();
    return request(`/externas/checklist/mes?${qs}`);
  },
  updateExtChecklistItem: (empresaId, procesoId, anio, mes, data) => {
    const qs = new URLSearchParams({ anio, mes }).toString();
    return request(`/externas/checklist/${empresaId}/item/${procesoId}?${qs}`,
      { method: 'PUT', body: JSON.stringify(data) });
  },
  // data: { tipo: 'utilidad' | 'perdida' | null, valor: number | null }
  updateExtResultado: (empresaId, anio, mes, data) => {
    const qs = new URLSearchParams({ anio, mes }).toString();
    return request(`/externas/checklist/${empresaId}/resultado?${qs}`,
      { method: 'PUT', body: JSON.stringify(data) });
  },

  // Nómina Electrónica — Empresas (catálogo)
  getNEEmpresas: () => request('/nomina-electronica/empresas'),
  getNEEmpresa: (id) => request(`/nomina-electronica/empresas/${id}`),
  updateNEEmpresa: (id, data) => request(`/nomina-electronica/empresas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteNEEmpresa: (id) => request(`/nomina-electronica/empresas/${id}`, { method: 'DELETE' }),

  // Nómina Electrónica — Seguimiento mensual
  getNEMes: (anio, mes) => {
    const qs = new URLSearchParams({ anio, mes }).toString();
    return request(`/nomina-electronica/meses?${qs}`);
  },
  updateNEMes: (empresaId, anio, mes, data) => {
    const qs = new URLSearchParams({ anio, mes }).toString();
    return request(`/nomina-electronica/meses/${empresaId}?${qs}`,
      { method: 'PUT', body: JSON.stringify(data) });
  },

  // Nómina Electrónica — Plazo de presentación (editado a mano)
  getNEPlazo: (anio, mes) => request(`/nomina-electronica/plazo?${new URLSearchParams({ anio, mes })}`),
  updateNEPlazo: (anio, mes, fechaLimite) =>
    request('/nomina-electronica/plazo', { method: 'PUT', body: JSON.stringify({ anio, mes, fechaLimite }) }),

  // DIAN
  uploadDian: (formData) =>
    fetchWithAuth('/dian/upload', { method: 'POST', body: formData }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        const err = new Error(body.error || `Error ${res.status}`)
        err.status = res.status
        // El 409 de NIT no coincidente trae nitEsperado/nitReporte/empresaNombre para que la
        // pantalla de subida arme un mensaje específico en vez de solo el texto genérico.
        Object.assign(err, body)
        throw err
      }
      return res.json()
    }),
  getDianBorrador: (id) => request(`/dian/borradores/${id}`),

  patchDianBorrador: (id, data) =>
    request(`/dian/borradores/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  patchDianNomina: (id, data) =>
    request(`/dian/borradores/${id}/nomina`, { method: 'PATCH', body: JSON.stringify(data) }),

  // `campo` es opcional — sin él, aplica sobre clasificacionRetencion (comportamiento
  // original de este endpoint, antes de que existieran las clasificaciones de IVA/Concepto).
  patchDianClasificacionRapida: (borradorId, { campo, clasificacionRetencion, tasaRetencion, clasificacionIva, concepto }) =>
    request(`/dian/borradores/${borradorId}/aplicar-clasificacion-rapida`, {
      method: 'PATCH',
      body: JSON.stringify({ campo, clasificacionRetencion, tasaRetencion, clasificacionIva, concepto }),
    }),

  exportarDian: (borradorId, { empleados, meses, salario, tarifaArl, tasaAutorretencion, modo }) => {
    return fetchWithAuth(`/dian/borradores/${borradorId}/exportar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empleados, meses, salario, tarifaArl, tasaAutorretencion, modo }),
    }).then((res) => {
      if (!res.ok) return res.json().then((e) => {
        const err = new Error(e.error || `Error ${res.status}`)
        err.status = res.status
        // El 409 de "ya hay datos guardados para este mes" trae requiereConfirmacionGuardado
        // + periodos (ver dianController.js#guardarDocumentosPermanentes) para que la pantalla
        // de exportación ofrezca actualizar/reemplazar en vez de solo mostrar el error.
        Object.assign(err, e)
        throw err
      })
      // Extraer nombre sugerido del header Content-Disposition
      const cd = res.headers.get('content-disposition') ?? ''
      const match = cd.match(/filename="([^"]+)"/)
      const filename = match ? match[1] : `Contabilidad_${borradorId.slice(0,8)}.xlsx`
      return res.blob().then((blob) => ({ blob, filename }))
    })
  },

  // Contabilidad — Consolidado (guardado permanente por empresa/mes)
  getContabPeriodos: (empresaId) =>
    request(`/contabilidad/periodos?${new URLSearchParams({ empresaId })}`),

  // Base de compras/ventas por cada uno de los 12 meses del año — gráfico de tendencia.
  getContabResumenAnual: (empresaId, anio) =>
    request(`/contabilidad/consolidado/resumen-anual?${new URLSearchParams({ empresaId, anio })}`),

  // `periodo` es { anio, mes } | { anio, cuatrimestre } | { anio } (mensual/cuatrimestral/anual)
  // — se filtran null/undefined para no mandar "mes=null" literal en la URL.
  getContabConsolidado: (empresaId, periodo) =>
    request(`/contabilidad/consolidado?${buildPeriodoParams(empresaId, periodo)}`),

  exportarContabConsolidado: (empresaId, periodo) =>
    fetchWithAuth(`/contabilidad/consolidado/exportar?${buildPeriodoParams(empresaId, periodo)}`)
      .then((res) => {
        if (!res.ok) return res.json().then((e) => { throw new Error(e.error || `Error ${res.status}`) })
        const cd = res.headers.get('content-disposition') ?? ''
        const match = cd.match(/filename="([^"]+)"/)
        const filename = match ? match[1] : `Consolidado_${empresaId.slice(0, 8)}.xlsx`
        return res.blob().then((blob) => ({ blob, filename }))
      }),

  // Exógenas
  uploadExogenas: (formData) =>
    fetchWithAuth('/exogenas/upload', { method: 'POST', body: formData }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        const err = new Error(body.error || `Error ${res.status}`)
        err.status = res.status
        throw err
      }
      return res.json()
    }),

  getExogenasBorrador: (id) => request(`/exogenas/borradores/${id}`),

  generarExogenas: (id) => {
    return fetchWithAuth(`/exogenas/borradores/${id}/generar`, { method: 'POST' }).then((res) => {
      if (!res.ok) return res.json().then((e) => { throw new Error(e.error || `Error ${res.status}`) })
      const cd = res.headers.get('content-disposition') ?? ''
      const match = cd.match(/filename="([^"]+)"/)
      const filename = match ? match[1] : `Exogenas_${id.slice(0, 8)}.xlsx`
      return res.blob().then((blob) => ({ blob, filename }))
    })
  },

  // Un solo Excel con la hoja de cada formato analizado ya llena (reemplaza a generarExogenas
  // cuando hay varios formatos a la vez, que es el caso normal desde que existe más de uno).
  generarExogenasCombinado: (ids) => {
    return fetchWithAuth('/exogenas/generar-combinado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).then((res) => {
      if (!res.ok) return res.json().then((e) => { throw new Error(e.error || `Error ${res.status}`) })
      const cd = res.headers.get('content-disposition') ?? ''
      const match = cd.match(/filename="([^"]+)"/)
      const filename = match ? match[1] : 'Exogenas_GENERADO.xlsx'
      return res.blob().then((blob) => ({ blob, filename }))
    })
  },

  // Terceros — base de datos de dirección/municipio/departamento extraídos de PDFs de factura
  // DIAN. De uso general (no exclusiva de Exógenas), hoy alimenta el formato 1001.
  uploadTerceros: (formData) =>
    fetchWithAuth('/terceros/upload', { method: 'POST', body: formData }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        const err = new Error(body.error || `Error ${res.status}`)
        err.status = res.status
        throw err
      }
      return res.json()
    }),

  // Consulta Tercero — busca un tercero ya guardado por NIT/documento. Devuelve también régimen
  // fiscal, responsabilidad tributaria, teléfono y correo (a diferencia de uploadTerceros, que
  // nunca los expone en su resumen).
  consultarTercero: (nit) =>
    fetchWithAuth(`/terceros/${encodeURIComponent(nit)}`).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        const err = new Error(body.error || `Error ${res.status}`)
        err.status = res.status
        err.ruesNoDisponible = body.ruesNoDisponible === true
        throw err
      }
      return res.json()
    }),

  // Repaso por lote (admin/líder): verifica contra el RUES los terceros pendientes, o todos con
  // forzar = true. Devuelve { pendientes, verificados, noEncontrados, errores, omitidos }.
  verificarTercerosRuesLote: (forzar = false) =>
    fetchWithAuth('/terceros/verificar-rues-lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forzar }),
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        const err = new Error(body.error || `Error ${res.status}`)
        err.status = res.status
        throw err
      }
      return res.json()
    }),

  // Notifications
  getNotifications: () => request('/notifications'),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'PUT' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'PUT' }),
  deleteNotification: (id) => request(`/notifications/${id}`, { method: 'DELETE' }),

  // Push subscriptions (Web Push / iPhone PWA)
  getVapidPublicKey: () => request('/notifications/vapid-public-key'),
  subscribeToPush: (subscription) => request('/notifications/push-subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription),
  }),
  unsubscribeFromPush: (endpoint) => request('/notifications/push-subscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  }),
};
