const KEYS = {
  TASKS: 'tasks',
  MEMBERS: 'team_members',
  GROUPS: 'groups',
  TAGS: 'tags',
  NOTIFICATIONS: 'notifications',
  SAVED_FILTERS: 'saved_filters',
  THEME: 'theme',
  AUTH_USER: 'auth_user',
  AUTH_TOKEN: 'auth_token',
}

function get(key) {
  try {
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

function set(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

export const storage = {
  getTasks: () => get(KEYS.TASKS),
  saveTasks: (tasks) => set(KEYS.TASKS, tasks),
  getMembers: () => get(KEYS.MEMBERS),
  saveMembers: (members) => set(KEYS.MEMBERS, members),
  getGroups: () => get(KEYS.GROUPS),
  saveGroups: (groups) => set(KEYS.GROUPS, groups),
  getTags: () => get(KEYS.TAGS),
  saveTags: (tags) => set(KEYS.TAGS, tags),
  getNotifications: (userId) => get(userId ? `notifications_${userId}` : KEYS.NOTIFICATIONS) ?? [],
  saveNotifications: (notifs, userId) => set(userId ? `notifications_${userId}` : KEYS.NOTIFICATIONS, notifs),
  pushNotificationToUser: (userId, notif) => {
    const key = `notifications_${userId}`
    const existing = get(key) ?? []
    const next = [notif, ...existing].slice(0, 50)
    set(key, next)
  },
  getSavedFilters: () => get(KEYS.SAVED_FILTERS) ?? [],
  saveSavedFilters: (filters) => set(KEYS.SAVED_FILTERS, filters),
  getTheme: () => localStorage.getItem(KEYS.THEME) ?? 'light',
  saveTheme: (theme) => localStorage.setItem(KEYS.THEME, theme),
  clearAll: () => Object.values(KEYS).forEach((k) => localStorage.removeItem(k)),
}
