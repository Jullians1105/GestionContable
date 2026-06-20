// Comando reutilizable: login por UI
Cypress.Commands.add('login', (email, password) => {
  cy.visit('/login')
  cy.get('input[type="email"]').clear().type(email)
  cy.get('input[type="password"]').clear().type(password)
  cy.get('button[type="submit"]').click()
  cy.url().should('not.include', '/login')
})

// Comando reutilizable: login como admin
Cypress.Commands.add('loginAsAdmin', () => {
  cy.login('maria@empresa.com', 'admin123')
})

// Comando reutilizable: login como viewer
Cypress.Commands.add('loginAsViewer', () => {
  cy.login('laura@empresa.com', 'viewer123')
})

// Comando reutilizable: login como member
Cypress.Commands.add('loginAsMember', () => {
  cy.login('ana@empresa.com', 'member123')
})
