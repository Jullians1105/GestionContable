const KEYS = {
  TASKS: 'tasks',
  MEMBERS: 'team_members',
}

export const storage = {
  getTasks: () => {
    try {
      const data = localStorage.getItem(KEYS.TASKS)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  },
  saveTasks: (tasks) => {
    localStorage.setItem(KEYS.TASKS, JSON.stringify(tasks))
  },
  getMembers: () => {
    try {
      const data = localStorage.getItem(KEYS.MEMBERS)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  },
  saveMembers: (members) => {
    localStorage.setItem(KEYS.MEMBERS, JSON.stringify(members))
  },
}
