// ─── Shared data module — Fondo Emprender ────────────────────────────────────
// Single source of truth for localStorage keys, helpers and constants used
// across all Fondo Emprender pages.

// ── Company defaults ──────────────────────────────────────────────────────────

export const INITIAL_COMPANY_NAMES = [
  'CAPROVIVA', 'GANADERIA DE CRIA THERMOGAN', 'MIELE DI BOSCO',
  'INDUSTRIAS ALTUZARRA', 'GRANJA AVICOLA DOS ALMAS', 'ELIARCHIRA',
  'ASOCIACION MAGIA FURA Y TENA', 'MAMANKANA PARRILLA SABOR Y TRADICION S.A.S',
  'SEVEN BLESS SAS', 'ACHIRAS DEL RANCHO', 'AVICOLA EL CORRAL DE DANIELA',
  'DESHIDRATADOS DE MI PROVINCIA', 'JAIM YAFE',
  'ASOCIACION DE AROMATICAS Y MEDICINALES SALAMANCA', 'BISTRO CHIA SAS',
  'JOSE ANDRES PEDROZA', 'FUNDACION PLANETA 24/7',
  'ASOCIACION HERENCIA ANSESTRAL', 'ASOCIACION ARTE BOIACA',
  'ASOCIACION ASOFRESAS', 'ASOCIACION PROD MANDARINA',
  'TY SUASIA HOSPEDAJE RURAL', 'ALIX JULIANA SOSA CORREA', 'ISOMETRICOS 3D',
  'RUSTIC HOUSE', 'INDUSTRIAS PIMET', 'ESENZA ESPECIAS',
  'PANADERIA ARTESANAL', 'ENTRE NOPALES', 'EVENTOS SANDRA LOPEZ',
]

export const DEFAULT_PROCESS_NAMES = [
  'Nómina electrónica', 'Ventas', 'Descargar fac DIAN', 'Excel Fondo',
  'Compras', 'Mirar IVA compras', 'Autorretencion', 'Depreciacion',
  'Nómina Excel', 'Pre-liquidación', 'Nómina Siigo', 'Pago nómina',
  'Descargar egresos salario', 'Certificado paz y salvo', 'Extracto',
  'Conciliación', 'Revisar libro aux fondo', 'Estados financieros',
  'Pago seguridad social', 'Descargar egresos SS', 'Pago impuestos rete fuente',
  'Declaración IVA/imp consumo', 'Registro terminado',
]

// ── The 7 macro processes per company ────────────────────────────────────────
// 'mp5' (Contabilidad) is always auto-calculated from the monthly confirmed flag
// and must never accept a manual status change.

export const MACRO_PROCESSES = [
  { id: 'mp1', name: 'Facturación' },
  { id: 'mp2', name: 'Nómina' },
  { id: 'mp3', name: 'Nómina electrónica' },
  { id: 'mp4', name: 'Documentos contador' },
  { id: 'mp5', name: 'Contabilidad' },        // auto — read-only status
  { id: 'mp6', name: 'Información tributaria' },
  { id: 'mp7', name: 'Producción y ventas' },
]

// ── Storage keys ──────────────────────────────────────────────────────────────

export const PROC_KEY = 'fondo_emprender_processes'
export const DATA_PFX = 'fondo_emprender'

// ── Checklist process helpers ─────────────────────────────────────────────────

export function loadProcesses() {
  try {
    const r = localStorage.getItem(PROC_KEY)
    if (r) return JSON.parse(r)
  } catch {
    // ignore localStorage read/parse errors
  }
  return null
}

export function saveProcesses(procs) {
  localStorage.setItem(PROC_KEY, JSON.stringify(procs))
}

export function buildDefaultProcesses() {
  return DEFAULT_PROCESS_NAMES.map((name, i) => ({ id: `p${i}`, name }))
}

// ── Monthly company data helpers ──────────────────────────────────────────────
// Format: { companies: [{ id, name, cells, confirmed }] }

export function loadMonthData(year, month) {
  try {
    const r = localStorage.getItem(`${DATA_PFX}_${year}_${month}`)
    if (!r) return null
    const parsed = JSON.parse(r)
    return Array.isArray(parsed) ? { companies: parsed } : parsed   // back-compat
  } catch {
    // ignore localStorage read/parse errors
  }
  return null
}

export function saveMonthData(year, month, data) {
  localStorage.setItem(`${DATA_PFX}_${year}_${month}`, JSON.stringify(data))
}

export function buildDefaultCompanies(processes) {
  return INITIAL_COMPANY_NAMES.map((name, i) => ({
    id: `c${i}`,
    name,
    categoria: 'contable',
    cells: Object.fromEntries(processes.map(p => [p.name, { status: 'pending', note: '' }])),
    confirmed: null,
  }))
}

export function ensureCells(companies, processes) {
  return companies.map(c => ({
    ...c,
    categoria: c.categoria ?? 'contable',   // backward-compat for data without the field
    cells: Object.fromEntries(
      processes.map(p => [p.name, c.cells?.[p.name] ?? { status: 'pending', note: '' }])
    ),
  }))
}

// ── Empresa detail helpers (macro processes, month-agnostic) ──────────────────
// Format: [{ id, name, status, responsable, nota }]

export function loadEmpresaDetail(companyId) {
  try {
    const r = localStorage.getItem(`${DATA_PFX}_empresa_${companyId}`)
    if (r) return JSON.parse(r)
  } catch {
    // ignore localStorage read/parse errors
  }
  return null
}

export function saveEmpresaDetail(companyId, processes) {
  localStorage.setItem(`${DATA_PFX}_empresa_${companyId}`, JSON.stringify(processes))
}

export function buildDefaultEmpresaDetail() {
  return MACRO_PROCESSES.map(p => ({
    id: p.id,
    name: p.name,
    status: 'pending',
    responsable: '',
    nota: '',
  }))
}

// ── Quick macro-stats for a company (used in card views) ──────────────────────

export function getMacroStats(company) {
  const macrosDone       = company.macrosDone       ?? 0
  const macrosInProgress = company.macrosInProgress ?? 0
  const contabilidadDone = !!company.confirmed

  const totalDone = macrosDone + (contabilidadDone ? 1 : 0)

  let semaphore = 'red'
  if (totalDone === 7)                             semaphore = 'green'
  else if (macrosInProgress > 0 || totalDone > 0) semaphore = 'yellow'

  return { done: totalDone, total: 7, semaphore }
}
