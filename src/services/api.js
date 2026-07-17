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

async function refreshAccessToken() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: getRefreshToken() }),
  }).then(async (res) => {
    if (!res.ok) { clearTokens(); window.location.href = '/login'; throw new Error('Session expired'); }
    const data = await res.json();
    setTokens(data.token, data.refreshToken);
    return data.token;
  }).finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

async function request(path, options = {}, retry = true) {
  const { skipAuthRedirect, ...fetchOptions } = options;
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...fetchOptions.headers,
  };

  const res = await fetch(`${BASE}${path}`, { ...fetchOptions, headers });

  if (res.status === 401 && retry) {
    if (getRefreshToken()) {
      try {
        await refreshAccessToken();
        return request(path, options, false);
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

export const api = {
  // Auth
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
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
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token, password) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),

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
  updateFondoChecklistConfirmado: (empresaId, anio, mes, data) => {
    const qs = new URLSearchParams({ anio, mes }).toString();
    return request(`/fondo/checklist/${empresaId}/confirmado?${qs}`,
      { method: 'PUT', body: JSON.stringify(data) });
  },
  updateFondoChecklistEnviado: (empresaId, anio, mes, data) => {
    const qs = new URLSearchParams({ anio, mes }).toString();
    return request(`/fondo/checklist/${empresaId}/enviado?${qs}`,
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
  createFondoEmpresa: (data) => request('/fondo/empresas', { method: 'POST', body: JSON.stringify(data) }),
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
