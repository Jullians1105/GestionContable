import './commands'

// Silenciar errores de socket.io que no afectan los tests
Cypress.on('uncaught:exception', (err) => {
  if (err.message.includes('socket') || err.message.includes('Socket')) return false
  return true
})
