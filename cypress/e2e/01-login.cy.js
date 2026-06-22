describe('Login', () => {
  beforeEach(() => {
    cy.visit('/login')
  })

  it('muestra el formulario de login', () => {
    cy.get('input[type="email"]').should('be.visible')
    cy.get('input[type="password"]').should('be.visible')
    cy.get('button[type="submit"]').should('contain', 'Iniciar sesión')
  })

  it('login exitoso como admin redirige al dashboard', () => {
    cy.get('input[type="email"]').type('maria@empresa.com')
    cy.get('input[type="password"]').type('admin123')
    cy.get('button[type="submit"]').click()
    cy.url().should('eq', Cypress.config('baseUrl') + '/')
    cy.contains('Dashboard').should('be.visible')
  })

  it('login exitoso como leader redirige al dashboard', () => {
    cy.get('input[type="email"]').type('carlos@empresa.com')
    cy.get('input[type="password"]').type('leader123')
    cy.get('button[type="submit"]').click()
    cy.url().should('not.include', '/login')
  })

  it('credenciales incorrectas muestra mensaje de error', () => {
    cy.get('input[type="email"]').type('maria@empresa.com')
    cy.get('input[type="password"]').type('contraseña-incorrecta')
    cy.get('button[type="submit"]').click()
    cy.url().should('include', '/login')
    cy.contains('Credenciales').should('be.visible')
  })

  it('campos vacíos muestra validación', () => {
    cy.get('button[type="submit"]').click()
    cy.url().should('include', '/login')
    cy.contains('Completa todos los campos').should('be.visible')
  })

  it('logout limpia la sesión y redirige al login', () => {
    cy.loginAsAdmin()
    // Abrir menú de usuario y hacer logout
    cy.get('header').find('button').last().click()
    cy.contains('Cerrar sesión').click()
    cy.url().should('include', '/login')
  })
})
