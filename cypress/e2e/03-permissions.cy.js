describe('Control de permisos por rol', () => {
  context('Viewer — solo lectura', () => {
    beforeEach(() => {
      cy.loginAsViewer()
      cy.visit('/tasks')
    })

    it('el botón Nueva Tarea existe pero muestra error de permisos al hacer click', () => {
      cy.contains('button', 'Nueva Tarea').click()
      cy.contains('No tienes permiso para crear tareas').should('be.visible')
      // El modal NO debe abrirse
      cy.get('input[placeholder="Nombre de la tarea"]').should('not.exist')
    })

    it('los botones de editar en las tarjetas muestran error de permisos', () => {
      cy.get('[title="Editar"]').first().click()
      cy.contains('No tienes permiso').should('be.visible')
    })

    it('no ve el enlace de Grupos en el sidebar', () => {
      cy.get('nav').should('not.contain', 'Grupos')
    })

    it('no ve el enlace de Reportes en el sidebar', () => {
      cy.get('nav').should('not.contain', 'Reportes')
    })
  })

  context('Member — puede comentar, no crear tareas', () => {
    beforeEach(() => {
      cy.loginAsMember()
      cy.visit('/tasks')
    })

    it('el botón Nueva Tarea muestra error de permisos', () => {
      cy.contains('button', 'Nueva Tarea').click()
      cy.contains('No tienes permiso para crear tareas').should('be.visible')
    })

    it('puede abrir el detalle de una tarea', () => {
      cy.get('.grid > div').first().click()
      cy.get('[class*="fixed inset-0"]').should('exist')
    })
  })

  context('Admin — acceso total', () => {
    beforeEach(() => {
      cy.loginAsAdmin()
    })

    it('puede crear tareas', () => {
      cy.visit('/tasks')
      cy.contains('button', 'Nueva Tarea').click()
      cy.get('input[placeholder="Nombre de la tarea"]').should('be.visible')
      cy.contains('Cancelar').click()
    })

    it('ve Grupos y Reportes en el sidebar', () => {
      cy.get('nav').should('contain', 'Grupos')
      cy.get('nav').should('contain', 'Reportes')
    })

    it('puede acceder a la página de Grupos directamente', () => {
      cy.visit('/groups')
      cy.url().should('include', '/groups')
      cy.contains('Grupos').should('be.visible')
    })
  })
})
