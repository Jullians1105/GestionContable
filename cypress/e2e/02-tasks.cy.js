describe('Gestión de tareas (admin)', () => {
  beforeEach(() => {
    cy.loginAsAdmin()
    cy.visit('/tasks')
  })

  it('muestra la página de tareas con el botón Nueva Tarea', () => {
    cy.contains('Mis Tareas').should('be.visible')
    cy.contains('button', 'Nueva Tarea').should('be.visible')
  })

  it('abre el modal al hacer click en Nueva Tarea', () => {
    cy.contains('button', 'Nueva Tarea').click()
    cy.get('input[placeholder="Nombre de la tarea"]').should('be.visible')
    cy.contains('button', 'Crear tarea').should('be.visible')
  })

  it('crea una tarea nueva y aparece en la lista', () => {
    const titulo = `Tarea E2E ${Date.now()}`

    cy.contains('button', 'Nueva Tarea').click()

    // Título
    cy.get('input[placeholder="Nombre de la tarea"]').type(titulo)

    // Prioridad (primer select vacío → elegir "Alta")
    cy.get('select').eq(0).select('high')

    // Estado (segundo select → dejar "Pendiente" que es el default)
    cy.get('select').eq(1).select('pending')

    // Responsable (tercer select → elegir el primero disponible que no sea vacío)
    cy.get('select').eq(2).find('option').not('[value=""]').first().then(($opt) => {
      cy.get('select').eq(2).select($opt.val())
    })

    // Fecha de entrega
    cy.get('input[type="date"]').type('2026-12-31')

    cy.contains('button', 'Crear tarea').click()

    // La tarea aparece en la lista
    cy.contains(titulo).should('be.visible')
  })

  it('edita una tarea existente', () => {
    // Tomar la primera tarea visible y editarla
    cy.get('[title="Editar"]').first().click()
    cy.get('input[placeholder="Nombre de la tarea"]')
      .clear()
      .type('Tarea editada por E2E')
    cy.contains('button', 'Guardar cambios').click()
    cy.contains('Tarea editada por E2E').should('be.visible')
  })

  it('completa una tarea cambiando el estado desde el modal de detalle', () => {
    // Abrir la primera tarjeta de tarea haciendo click en su título
    cy.get('.grid > div').first().click()

    // En el TaskDetailModal, hacer click en "Completada"
    cy.contains('Completada').click()

    // El badge de estado en el modal debe actualizarse
    cy.get('[style*="10B981"]').should('exist')
  })

  it('elimina una tarea con confirmación', () => {
    // Leer el título de la primera tarea
    cy.get('.grid > div h3').first().invoke('text').then((titulo) => {
      cy.get('[title="Eliminar"]').first().click()

      // Confirmar eliminación en el diálogo
      cy.contains('button', 'Eliminar').last().click()

      // La tarea ya no aparece
      cy.contains(titulo).should('not.exist')
    })
  })
})
