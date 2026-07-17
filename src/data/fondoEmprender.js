// ─── Shared data module — Fondo Emprender ────────────────────────────────────
// Single source of truth for storage keys, helpers and constants used across
// Fondo Emprender pages. The monthly checklist itself now lives in the
// backend (fondo_checklist_meses / fondo_checklist_items) — see
// services/api.js (getFondoChecklist, updateFondoChecklistItem,
// updateFondoChecklistConfirmado).

// ── The 7 macro processes per company ────────────────────────────────────────
// 'mp5' (Contabilidad) is always auto-calculated from the monthly confirmed flag
// and must never accept a manual status change.

// ── Mes habilitado para Seguimiento Mensual (checklist/macroprocesos/impuestos) ──
// Mes vencido: el mes en curso todavía no ha "vencido", así que el mes
// habilitado para editar es siempre el mes calendario anterior. Debe
// coincidir con getMesVencidoHabilitado en backend/src/utils/mesVencido.js
// (duplicado a propósito para no depender de una llamada de red solo para
// esto — mismo criterio que deriveImpuestosEstado en
// FondoEmprenderEmpresaDetallePage.jsx).
export function getMesVencidoHabilitado(now = new Date()) {
  const mesActual  = now.getMonth() + 1 // 1-12
  const anioActual = now.getFullYear()
  if (mesActual === 1) return { anio: anioActual - 1, mes: 12 }
  return { anio: anioActual, mes: mesActual - 1 }
}

// Punto de partida de month/year (0-indexed) para las páginas de Seguimiento
// Mensual: usa anio/mes de la URL solo si están dentro del rango habilitado;
// si no vienen, o si apuntan a un mes bloqueado (ej. un enlace viejo a julio
// antes de este límite), cae al mes habilitado en vez de "hoy" — así nunca
// se aterriza en un mes que de todos modos no se puede editar.
export function resolveMesInicial(searchParams) {
  const habilitado = getMesVencidoHabilitado()
  const m = parseInt(searchParams.get('mes')  ?? '', 10)
  const y = parseInt(searchParams.get('anio') ?? '', 10)
  const dentroDeRango = m >= 1 && m <= 12 && y >= 2000
    && (y * 100 + m) <= (habilitado.anio * 100 + habilitado.mes)
  return dentroDeRango
    ? { year: y, month: m - 1 }
    : { year: habilitado.anio, month: habilitado.mes - 1 }
}

export const MACRO_PROCESSES = [
  { id: 'mp1', name: 'Facturación' },
  { id: 'mp2', name: 'Nómina' },
  { id: 'mp3', name: 'Nómina electrónica' },
  { id: 'mp4', name: 'Documentos contador - Pagos' },
  { id: 'mp5', name: 'Contabilidad' },        // auto — read-only status
  { id: 'mp6', name: 'Información tributaria' },
  { id: 'mp7', name: 'Producción y ventas' },
]

// ── Quick macro-stats for a company (used in card views) ──────────────────────
// mp5/Contabilidad ya no se cuenta aparte a partir de "confirmed" — el
// backend deriva su estado del grupo CONTABILIDAD del checklist mensual y lo
// suma directo a macrosDone/macrosInProgress, igual que el resto de
// macroprocesos derivados (mp2, mp3, mp4, mp6).

export function getMacroStats(company) {
  const totalDone        = company.macrosDone       ?? 0
  const macrosInProgress = company.macrosInProgress ?? 0

  let semaphore = 'red'
  if (totalDone === 7)                             semaphore = 'green'
  else if (macrosInProgress > 0 || totalDone > 0) semaphore = 'yellow'

  return { done: totalDone, total: 7, semaphore }
}

// ── Legacy localStorage checklist (pre-backend) — read-only, migration only ──
// Before this fix the "Seguimiento Mensual" grid saved exclusively to
// localStorage under these keys, so it never left the browser it was
// entered in. Kept here only so migrateLegacyLocalStorage() can recover
// and upload whatever is still sitting in users' browsers.

const LEGACY_DATA_PFX = 'fondo_emprender'
const LEGACY_KEY_RE   = /^fondo_emprender_(\d{4})_(\d{1,2})$/

function loadLegacyMonthData(year, month) {
  try {
    const r = localStorage.getItem(`${LEGACY_DATA_PFX}_${year}_${month}`)
    if (!r) return null
    const parsed = JSON.parse(r)
    return Array.isArray(parsed) ? { companies: parsed } : parsed   // back-compat
  } catch {
    return null
  }
}

const MIGRATION_DONE_KEY   = 'fondo_emprender_migration_v1_done'
const MIGRATION_REPORT_KEY = 'fondo_emprender_migration_report'

// One-time, best-effort push of whatever is left in legacy localStorage keys
// into the backend, then archives the key so it's never processed again.
// Runs silently; unmatched company/process names are recorded in a report
// the page can show as a small banner so the user knows what wasn't recovered.
export async function migrateLegacyLocalStorage(api, empresas, procesos) {
  if (localStorage.getItem(MIGRATION_DONE_KEY)) return

  const legacyKeys = Object.keys(localStorage).filter(k => LEGACY_KEY_RE.test(k))
  if (legacyKeys.length === 0) {
    localStorage.setItem(MIGRATION_DONE_KEY, '1')
    return
  }

  const empresaByName = new Map(empresas.map(e => [e.name.trim().toUpperCase(), e.id]))
  const procesoByName = new Map(procesos.map(p => [p.name.trim(), p.id]))
  const skippedCompanies = new Set()

  for (const key of legacyKeys) {
    const [, yearStr, monthStr] = key.match(LEGACY_KEY_RE)
    const year = parseInt(yearStr, 10)
    const mes  = parseInt(monthStr, 10) + 1   // legacy month was 0-indexed, API is 1-indexed

    const data = loadLegacyMonthData(year, parseInt(monthStr, 10))
    const companies = data?.companies
    if (!Array.isArray(companies)) { localStorage.removeItem(key); continue }

    for (const company of companies) {
      const empresaId = empresaByName.get((company.name ?? '').trim().toUpperCase())
      if (!empresaId) { skippedCompanies.add(company.name); continue }

      for (const [procName, cell] of Object.entries(company.cells ?? {})) {
        const hasData = (cell?.status && cell.status !== 'pending') || (cell?.note && cell.note.trim())
        if (!hasData) continue

        let procesoId = procesoByName.get(procName.trim())
        if (!procesoId) {
          try {
            const created = await api.createFondoProceso({ name: procName.trim() })
            procesoId = created.id
            procesoByName.set(procName.trim(), procesoId)
            procesos.push(created)
          } catch (err) {
            console.warn('[migración fondo emprender] no se pudo crear proceso heredado', procName, err)
            continue
          }
        }

        try {
          await api.updateFondoChecklistItem(empresaId, procesoId, year, mes, {
            estado: cell.status ?? 'pending',
            nota:   cell.note || null,
          })
        } catch (err) {
          console.warn('[migración fondo emprender] no se pudo migrar celda', company.name, procName, err)
        }
      }

      if (company.confirmed) {
        try {
          await api.updateFondoChecklistConfirmado(empresaId, year, mes, { confirmed: true })
        } catch (err) {
          console.warn('[migración fondo emprender] no se pudo migrar confirmación', company.name, err)
        }
      }
    }

    // Archive instead of delete: keeps a recoverable backup and stops this
    // key from matching LEGACY_KEY_RE so it's never reprocessed.
    localStorage.setItem(`fondo_emprender_migrated_${yearStr}_${monthStr}`, localStorage.getItem(key))
    localStorage.removeItem(key)
  }

  localStorage.setItem(MIGRATION_DONE_KEY, '1')
  if (skippedCompanies.size > 0) {
    localStorage.setItem(MIGRATION_REPORT_KEY, JSON.stringify([...skippedCompanies]))
  }
}

export function getMigrationReport() {
  try {
    const r = localStorage.getItem(MIGRATION_REPORT_KEY)
    return r ? JSON.parse(r) : null
  } catch {
    return null
  }
}

export function dismissMigrationReport() {
  localStorage.removeItem(MIGRATION_REPORT_KEY)
}
