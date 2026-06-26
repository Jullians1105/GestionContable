# 🔍 PROMPT DE EVALUACIÓN - RECORDATORIOS CON ALARMA
## Análisis antes de implementación

---

## 📌 CONTEXTO DEL PROYECTO

**Proyecto:** GestionTareasOficina / TaskFlow Pro  
**Stack:** React 18 + Node.js + Express + PostgreSQL + Docker  
**Estado:** FASE 3 completa (Backend, WebSockets, Tests ✅)  
**Servidor:** 192.168.1.12 (HTTPS con mkcert)  
**Usuarios:** 14 en oficina + 3 líderes remotos  
**Dominio:** gestcon.work (Cloudflare Tunnel)

---

## 🎯 REQUIMIENTO A EVALUAR

### Caso de uso específico

```
Líder crea tarea: "Seguimiento cliente ABC"
    ↓
Selecciona: "Recordarme mañana 3 PM"
    ↓
Selecciona sonido: "Alarma fuerte"
    ↓
Opcionalmente: "Notificar a Juan a las 2:30 PM"
    ↓
A LA HORA EXACTA:
├─ 📳 Alarma FUERTE en Android
├─ 📳 Alarma FUERTE en iPhone
└─ 📳 Notificaciones a otros usuarios seleccionados
```

### Requisitos

- ✅ Solo para líderes (crear tareas con recordatorios)
- ✅ Recordatorios programados para fecha/hora específica
- ✅ Sonido FUERTE (alarma, no notificación suave)
- ✅ Android + iPhone
- ✅ Opción de notificar a otros usuarios
- ✅ Cada usuario puede tener hora diferente
- ✅ Checkbox para activar/desactivar

---

## 🔍 TAREAS DE EVALUACIÓN

### EVALUACIÓN 1: Arquitectura General

**Analiza y responde:**

```
1. CRON JOB cada minuto:
   [ ] ¿Es viable en Node.js/Express actual?
   [ ] ¿Qué paquete usar? (node-cron vs node-schedule vs bull)
   [ ] ¿Impacto en performance con 14+ usuarios?
   [ ] ¿Qué pasa si falla? ¿Reintentos?

2. WEB PUSH CON SONIDO:
   [ ] ¿Android soporta sonido personalizado?
   [ ] ¿iPhone soporta sonido personalizado?
   [ ] ¿Qué diferencias hay entre los dos?
   [ ] ¿Requiere configuración especial en manifest?

3. VIBRACIÓN:
   [ ] ¿Se puede controlar desde Web Push?
   [ ] ¿Patrón de vibración customizable?
   [ ] ¿Funciona en ambos SO?

4. PERSISTENCIA DE DATOS:
   [ ] ¿Estructura de tabla task_reminders es óptima?
   [ ] ¿Índices suficientes?
   [ ] ¿Qué pasa con recordatorios pasados?
   [ ] ¿Limpiar automáticamente después de cuánto tiempo?
```

---

### EVALUACIÓN 2: Compatibilidad con FASE 3

**Analiza la integración:**

```
Código existente que DEBE SEGUIR FUNCIONANDO:

1. Socket.io:
   [ ] ¿Conflicta cron con Socket.io en tiempo real?
   [ ] ¿Necesita eventos Socket.io separados?
   [ ] ¿Cómo interactúan juntos?

2. NotificationContext:
   [ ] ¿Usar el existing NotificationContext o separar?
   [ ] ¿Estructura de notificación cambia?
   [ ] ¿Afecta a notificaciones de comentarios?

3. Service Worker:
   [ ] ¿Ya está registrado (public/sw.js)?
   [ ] ¿Qué cambios necesita?
   [ ] ¿Conflicta con listeners existentes?

4. Push Subscriptions:
   [ ] ¿Ya existe tabla push_subscriptions?
   [ ] ¿Qué campos ya tiene?
   [ ] ¿Se pueden reutilizar subscriptions?

5. Backend API:
   [ ] ¿Dónde va el código del cron? (middleware? service?)
   [ ] ¿Múltiples instancias de servidor causan duplicados?
   [ ] ¿Cómo evitar enviar 2 veces mismo recordatorio?
```

---

### EVALUACIÓN 3: Edge Cases & Problemas Potenciales

**Identifica riesgos:**

```
ESCENARIO 1: Múltiples instancias del servidor
├─ Si hay 2 contenedores backend corriendo
├─ ¿Se envía recordatorio 2 veces?
├─ Solución: lock en BD o single instance?

ESCENARIO 2: Servidor offline
├─ Si se apaga el servidor a las 3 PM
├─ ¿Se pierde el recordatorio?
├─ ¿Se envía cuando vuelva online?

ESCENARIO 3: Cambio de timezone
├─ Usuario en Duitama (CO) crea recordatorio
├─ Líder remoto está en otro timezone
├─ ¿Se envía a la hora correcta de cada uno?
├─ ¿O siempre hora del servidor?

ESCENARIO 4: Recordatorio muy próximo
├─ Usuario crea: "Recordarme en 30 segundos"
├─ ¿El cron lo detecta a tiempo?
├─ ¿O se pierde porque cron corre cada minuto?

ESCENARIO 5: Recordatorio en el pasado
├─ Usuario (sin darse cuenta) selecciona: "hace 1 hora"
├─ ¿Qué pasa?

ESCENARIO 6: Sin permiso de notificaciones
├─ Usuario aún no permitió push
├─ ¿Se guarda recordatorio?
├─ ¿Se intenta enviar sin permiso?

ESCENARIO 7: Web Push no soportado
├─ Safari en Mac, Firefox viejo, etc.
├─ ¿Fallback a email?
├─ ¿O solo aviso en UI?
```

---

### EVALUACIÓN 4: UX & Frontend

**Analiza interfaz:**

```
TASKFORM CAMBIOS:
[ ] ¿Dónde colocar date/time pickers? ¿Layout responsivo?
[ ] ¿Cómo mostrar "Notificar a otros"? ¿Dropdown? ¿Modal?
[ ] ¿Si hay 14 usuarios, es viable multi-select?
[ ] ¿Validación: fecha/hora no puede ser pasada?
[ ] ¿UX en celular (campos date/time son grandes)?

PREVISUALIZACION:
[ ] ¿Mostrar: "Recibirás notificación el X a las Y"?
[ ] ¿Mostrar: "Juan recibirá a las Z"?
[ ] ¿Confirmar antes de crear?

EDICIÓN:
[ ] ¿Puede editar un recordatorio después de crear la tarea?
[ ] ¿Puede cancela un recordatorio?
[ ] ¿Mostrar recordatorios próximos en dashboard?
```

---

### EVALUACIÓN 5: Sonidos & Notificaciones

**Evalúa comportamiento del sonido:**

```
ANDROID:
[ ] ¿Web Push soporta sonido personalizado?
[ ] ¿Cómo especificar sonido en payload?
[ ] ¿Android ignora sonido personalizado si DND activo?
[ ] ¿Vibración patrón es configurable?
[ ] ¿requireInteraction = true evita cierre automático?

IPHONE:
[ ] ¿Safari iOS soporta Web Push? (última versión)
[ ] ¿Qué versión iOS es mínimo requerido?
[ ] ¿Sonido personalizado o solo sistema?
[ ] ¿requireInteraction funciona en iPhone?

DESKTOP:
[ ] ¿Chrome desktop soporta sonido?
[ ] ¿Firefox desktop soporta sonido?
[ ] ¿Se puede silenciar desde navegador?
```

---

### EVALUACIÓN 6: Performance & Escalabilidad

**Analiza impacto:**

```
CRON JOB:
[ ] Si hay 100+ recordatorios próximos, ¿lag?
[ ] ¿Consulta a BD cada minuto (14 queries/min)?
[ ] ¿Impacto en conexión pool?
[ ] ¿Memory leak potencial?

PUSH NOTIFICATIONS:
[ ] Enviar 20 push simultáneos, ¿es problema?
[ ] ¿Throttling de web-push package?
[ ] ¿Rate limits de navegadores?

DATABASE:
[ ] ¿Tabla task_reminders crece indefinidamente?
[ ] ¿Índices suficientes para búsquedas rápidas?
[ ] ¿Necesita archival/cleanup automático?
```

---

### EVALUACIÓN 7: Seguridad

**Identifica riesgos:**

```
AUTORIZACIÓN:
[ ] ¿Solo líderes pueden crear recordatorios?
[ ] ¿Validar que user_id existe antes de crear?
[ ] ¿Prevenir recordatorios a usuarios sin permiso?

DATOS:
[ ] ¿Sensible guardar task_id + user_id?
[ ] ¿Alguien podría explotar para spam?
[ ] ¿Rate limit en creación de recordatorios?

PRIVACIDAD:
[ ] ¿Mostrar en historial cuáles recordatorios se enviaron?
[ ] ¿Logs incluyen user_id?
```

---

## ✅ DELIVERABLES ESPERADOS

### PASO 1: EVALUACIÓN DETALLADA

Analizar y responder cada sección arriba:

```
- Arquitectura: viable o ajustes necesarios
- Compatibilidad: conflictos identificados
- Edge cases: soluciones propuestas
- UX: mejoras sugeridas
- Performance: impacto estimado
- Seguridad: riesgos mitigados
```

### PASO 2: PROPUESTA FINAL

Documento que incluya:

```
1. ✅ RESUMEN EJECUTIVO
   ├─ ¿Es viable?
   ├─ ¿Problemas críticos encontrados?
   └─ ¿Cambios necesarios a la propuesta?

2. ✅ ARQUITECTURA MEJORADA
   ├─ Diagrama de flujo
   ├─ Decisiones sobre cron (node-cron vs bull vs scheduler)
   ├─ Estrategia de sincronización multi-instancia
   ├─ Fallback para sin Web Push
   └─ Timezone handling

3. ✅ ESPECIFICACIONES TÉCNICAS
   ├─ Tabla BD (fields, indices, constraints)
   ├─ API endpoints (crear, editar, cancelar recordatorio)
   ├─ Web Push payload (qué campos, qué sonidos)
   ├─ Service Worker listeners
   └─ Frontend state management

4. ✅ EDGE CASES RESUELTOS
   ├─ Servidor offline
   ├─ Recordatorio en pasado
   ├─ Sin permiso de notificaciones
   ├─ Múltiples instancias
   └─ Timezone del usuario

5. ✅ PLAN DE IMPLEMENTACIÓN
   ├─ Orden de desarrollo
   ├─ Cambios por archivo
   ├─ Tests necesarios
   ├─ Validaciones frontend
   └─ Timeline detallado

6. ✅ RIESGOS & MITIGACIONES
   ├─ Tabla de riesgos
   ├─ Probabilidad & impacto
   ├─ Solución para cada riesgo
   └─ Plan B si falla

7. ✅ PREGUNTAS ACLARATORIAS
   ├─ Decisions sin información
   └─ Confirmaciones del usuario antes de implementar
```

---

## 🎯 PREGUNTAS CLAVE A RESPONDER

```
1. CRON JOB:
   ¿Usar node-cron (simple) o bull/redis (robusto)?
   → Depende: ¿Múltiples instancias del server?

2. SONIDO:
   ¿Personalizado o sistema estándar del SO?
   → Investigar soporte actual en Web Push

3. TIMEZONE:
   ¿Recordatorio en hora local del user o servidor?
   → Afecta cálculos y BD

4. FALLBACK:
   Si no hay Web Push (Safari, sin permiso)
   ¿Email automático o solo aviso en UI?

5. ESCALABILIDAD:
   ¿Si crece a 100 usuarios, 1000 recordatorios?
   → ¿Es viable el cron cada minuto?

6. ACTUALIZACIONES:
   ¿Puede editar/cancelar recordatorio después?
   → Afecta UI y lógica backend
```

---

## 📋 FORMATO ESPERADO

**Entregar un documento que sea:**

```
- Claro: explicar decisiones
- Completo: cubrir todos los puntos arriba
- Crítico: identificar problemas reales
- Pragmático: soluciones que funcionen
- Listo para implementar: propuesta final ejecutable
```

---

## 🚀 CÓMO EJECUTAR

1. Copia ESTE PROMPT a Claude Code
2. Claude Code PRIMERO EVALÚA (no implementa aún)
3. Entrega: documento de evaluación + propuesta mejorada
4. TÚ REVISAS y confirmas cambios
5. LUEGO: implementación en próxima sesión

---

## ⏱️ TIEMPO ESPERADO

- Evaluación: 1-2 horas
- Documento: claro y estructurado
- Listo para: siguiente sesión de implementación

---

**Copia este prompt completo a Claude Code y pídele que EVALÚE primero, no que implemente.** 🔍

---

**Estado:** Listo para evaluación  
**Fecha:** 2026-06-24  
**Versión:** 1.0
