# WhatsApp Business + n8n — Plan de integración

**Fecha de análisis:** 2026-07-02  
**Estado:** Pendiente de implementación  
**Decisión:** Usar API oficial de Meta (WhatsApp Business Cloud API)

---

## Contexto de la empresa

- **Equipo:** 14 personas en oficina + 3 líderes remotos
- **Clientes:** completamente externos, no tienen acceso a GESTCON
- **Canales actuales con clientes:** WhatsApp, llamadas telefónicas, email
- **Documentos:** guardados localmente en 2 portátiles que también se usan para trabajar (sin nube)
- **Sistema de gestión:** GESTCON (`gestcon.work`) con API REST en `https://gestcon.work/api/`

---

## Dolores que se resuelven con WhatsApp + n8n

1. **Recordar a clientes que envíen documentos** — mensajes manuales pidiendo soportes, facturas, estados de cuenta
2. **Reportar avances a los líderes remotos** — actualizaciones manuales sobre el estado de tareas
3. **Crear tareas desde solicitudes de WhatsApp/email** — alguien pide algo por mensaje y hay que crearlo a mano en GESTCON
4. **Seguimiento de pagos Fondo Emprender** — revisar y notificar vencimientos de cuotas o fechas clave del programa

---

## Opción elegida: WhatsApp Business Cloud API (oficial Meta)

### Por qué oficial y no Evolution API

| Criterio | Oficial (Meta) | Evolution API |
|---|---|---|
| Costo | ~$5.000–15.000 COP/mes (número) | $0 |
| Setup | 1–3 días (verificación Meta) | 30 minutos |
| Riesgo de ban | Ninguno | Bajo pero existe |
| Número necesario | Dedicado | Cualquier número con WhatsApp |
| Integración n8n | Nodo oficial | HTTP Request manual |
| Mensajes gratuitos/mes | 1.000 conversaciones | Ilimitado |

Para una firma contable con clientes reales se eligió la opción oficial: el riesgo de perder un número de WhatsApp por ban no es aceptable. El volumen mensual estimado cabe dentro del tier gratuito de Meta (1.000 conversaciones/mes).

---

## Requisitos para activar la API oficial

### 1. Número de teléfono dedicado
Un número que **no esté registrado en WhatsApp** (o que se desconecte de la app al migrar).  
Opciones en Colombia:
- Línea virtual con Claro, Tigo, o Movistar (~$10.000–15.000 COP/mes)
- Número virtual por VoIP (Twilio número colombiano: ~$1 USD/mes)
- Una SIM física dedicada solo para esto

> El número queda vinculado a la cuenta Meta, no a ningún celular físico. Funciona aunque el teléfono esté apagado.

### 2. Meta Business Suite
- Cuenta gratuita en [business.facebook.com](https://business.facebook.com)
- Si ya existe una cuenta de Facebook empresarial, se usa esa

### 3. Verificación del negocio en Meta
Meta requiere verificar que la empresa es legítima. Documentos típicos:
- RUT de la empresa
- Documento de identidad del representante legal
- A veces: extracto bancario o factura de servicios

Tiempo de aprobación: **1–3 días hábiles** (puede tardar más si Meta pide documentación adicional).

### 4. App en Facebook Developers
- Crear app en [developers.facebook.com](https://developers.facebook.com)
- Agregar el producto "WhatsApp"
- Obtener: `Access Token` permanente + `Phone Number ID` + `WhatsApp Business Account ID`
- Configurar webhook (URL que n8n expondrá para recibir mensajes entrantes)

---

## Flujos n8n a implementar (en orden de prioridad)

### Flujo 1 — Reporte diario a líderes remotos
**Trigger:** Cron todos los días a las 7:00 AM  
**Pasos:**
1. `GET https://gestcon.work/api/stats` → estadísticas generales
2. `GET https://gestcon.work/api/tasks?status=pending` → tareas vencidas
3. Armar mensaje de resumen con los datos
4. Enviar por WhatsApp a los 3 líderes (números hardcodeados en n8n)

**Complejidad:** baja — solo usa la API de GESTCON que ya existe.

---

### Flujo 2 — Alerta de pagos Fondo Emprender próximos a vencer
**Trigger:** Cron todos los lunes a las 8:00 AM  
**Pasos:**
1. `GET https://gestcon.work/api/fondo/pagos` → lista de pagos
2. Filtrar los que vencen en los próximos 7 días
3. Enviar alerta por WhatsApp al líder responsable con: empresa, monto, fecha

**Complejidad:** baja — API ya existe.

---

### Flujo 3 — Recordatorio automático a clientes
**Trigger:** Cron diario o disparado por estado de tarea  
**Pasos:**
1. Leer lista de clientes/documentos pendientes (Google Sheet o CSV en servidor)
2. Si el documento lleva más de X días sin recibirse → enviar mensaje al cliente
3. Mensaje tipo: *"Hola [nombre], te recordamos que estamos pendientes del [documento] para continuar con tu proceso. ¿Puedes enviarlo hoy?"*

**Complejidad:** media — requiere mantener la lista de clientes con sus números.

---

### Flujo 4 — Email entrante → Tarea en GESTCON
**Trigger:** Nuevo email en bandeja IMAP/Gmail  
**Pasos:**
1. n8n detecta email entrante
2. Extrae asunto y cuerpo
3. `POST https://gestcon.work/api/tasks` con el asunto como título
4. Responde al remitente confirmando que se recibió la solicitud

**Complejidad:** media — requiere configurar acceso IMAP o Gmail API.

---

### Flujo 5 — WhatsApp entrante → Tarea en GESTCON
**Trigger:** Webhook de Meta cuando llega un mensaje al número empresarial  
**Pasos:**
1. Meta envía el mensaje al webhook de n8n
2. n8n crea tarea en GESTCON: `POST /api/tasks`
3. Responde al cliente por WhatsApp: *"Recibimos tu solicitud, en breve te contactamos."*

**Complejidad:** media — el nodo oficial de n8n maneja la integración con Meta.

---

## Autenticación de n8n contra GESTCON

n8n necesita un JWT para llamar a la API de GESTCON. Opciones:

**Opción A (recomendada):** Crear un usuario de servicio en GESTCON con rol `leader`, hacer login una vez desde n8n (`POST /api/auth/login`), guardar el `accessToken` y `refreshToken` en las credenciales de n8n. Configurar un flujo de renovación automática cuando el token expire (cada 1h).

**Opción B:** Agregar en el backend un endpoint especial para tokens de larga duración (tipo API key) — requiere desarrollo en GESTCON.

---

## Estado del servidor (confirmado 2026-07-02)

```
RAM Total:      7.0 GiB
RAM Disponible: 6.3 GiB
Swap:           4.0 GiB (sin usar)
```

n8n en reposo usa ~400–600 MB. El servidor tiene capacidad suficiente para correrlo junto al stack actual.

---

## Plan de instalación de n8n en el servidor

Agregar al `docker-compose.yml` como perfil separado para que no afecte al stack principal:

```yaml
n8n:
  image: n8nio/n8n:latest
  profiles: ["automation"]
  restart: unless-stopped
  environment:
    DB_TYPE: sqlite
    N8N_PORT: 5678
    WEBHOOK_URL: https://gestcon.work/n8n/
    N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
  volumes:
    - n8n_data:/home/node/.n8n
  ports:
    - "5678:5678"
  deploy:
    resources:
      limits:
        memory: 1g

volumes:
  n8n_data:
```

Arrancar por separado (nunca junto a `--build` del stack principal):
```bash
docker compose --profile automation up -d n8n
```

Acceso local: `http://192.168.1.12:5678`  
Acceso externo (si se configura en nginx): `https://gestcon.work/n8n/`

---

## Próximos pasos

- [ ] Confirmar si existe cuenta de Meta Business Suite o crearla
- [ ] Conseguir número de teléfono dedicado para WhatsApp empresarial
- [ ] Hacer verificación del negocio en Meta (RUT + documento representante legal)
- [ ] Crear app en Facebook Developers y obtener credenciales
- [ ] Instalar n8n en el servidor (agregar al docker-compose.yml)
- [ ] Implementar Flujo 1 (reporte diario) como prueba inicial
- [ ] Implementar Flujo 2 (alertas Fondo Emprender)
- [ ] Implementar Flujos 3, 4 y 5 en sesiones posteriores
