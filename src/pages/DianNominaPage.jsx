import { useState, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const SMMLV_2026 = 1423500

// ── tasas ──────────────────────────────────────────────────────────────────────
const APORTES = [
  { label: 'Pensión',                 tasa: 0.12   },
  { label: 'ARL Clase I',             tasa: 0.0052 },
  { label: 'Caja de Compensación',    tasa: 0.04   },
]
const PROVISIONES = [
  { label: 'Prima de Servicios',      tasa: 0.0833 },
  { label: 'Cesantías',               tasa: 0.0833 },
  { label: 'Intereses Cesantías',     tasa: 0.01   },
  { label: 'Vacaciones',              tasa: 0.0417 },
]

const fmt = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

const toInt = (v) => {
  const n = parseInt(v, 10)
  return isNaN(n) || n < 0 ? 0 : n
}

const toFloat = (v) => {
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'))
  return isNaN(n) || n < 0 ? 0 : n
}

// ── subcomponente: fila del preview ───────────────────────────────────────────
function PreviewRow({ label, tasa, base, isTotal }) {
  const valor = base * tasa
  return (
    <div className={`flex items-center justify-between py-1.5 ${isTotal ? 'border-t border-[#e2e4ef] dark:border-[#2e3148] mt-1 pt-2.5 font-semibold' : ''}`}>
      <span className={`text-sm ${isTotal ? 'text-[#191c1e] dark:text-[#e4e6f0]' : 'text-[#6b7280] dark:text-[#8890b5]'}`}>
        {label}{!isTotal && tasa ? <span className="text-[11px] ml-1 opacity-70">({(tasa * 100).toFixed(tasa * 100 % 1 === 0 ? 0 : 2)}%)</span> : ''}
      </span>
      <span className={`text-sm tabular-nums ${isTotal ? 'text-[#191c1e] dark:text-[#e4e6f0]' : 'text-[#434655] dark:text-[#c4c8e8]'}`}>
        {fmt(valor)}
      </span>
    </div>
  )
}

// ── página ────────────────────────────────────────────────────────────────────
export default function DianNominaPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const state    = location.state ?? {}

  const [empleados, setEmpleados] = useState('')
  const [meses,     setMeses]     = useState('')
  const [salario,   setSalario]   = useState(String(SMMLV_2026))

  const empVal = toInt(empleados)
  const mesVal = toInt(meses)
  const salVal = toFloat(salario) || SMMLV_2026

  // Validación cruzada
  const error =
    empVal > 0 && mesVal === 0 ? 'Especifica el número de meses' :
    empVal === 0 && mesVal > 0 ? 'Especifica el número de empleados' :
    null

  // ── cálculos preview ───────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const totalAportesTasa    = APORTES.reduce((s, a) => s + a.tasa, 0)
    const totalProvisionesTasa = PROVISIONES.reduce((s, a) => s + a.tasa, 0)

    const aportes    = salVal * totalAportesTasa
    const provisiones = salVal * totalProvisionesTasa
    const costoMes   = salVal + aportes + provisiones
    const costoTotal = empVal > 0 && mesVal > 0 ? empVal * mesVal * costoMes : 0

    return {
      aportes,
      provisiones,
      costoMes,
      costoTotal,
      tieneNomina: empVal > 0 && mesVal > 0,
    }
  }, [salVal, empVal, mesVal])

  const handleContinuar = () => {
    if (error) return
    navigate('/dian/exportacion', {
      state: {
        ...state,
        empleados:        empVal,
        meses:            mesVal,
        salario:          salVal,
        costoNominaTotal: calc.costoTotal,
      },
    })
  }

  const handleVolver = () => {
    navigate('/dian/clasificacion', { state })
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[520px] mx-auto">

      {/* Encabezado */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-3xl text-[#004ac6]">badge</span>
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">
            Nómina
          </h1>
        </div>
        <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">
          Opcional — ingresa los datos de nómina si aplican para este período.
        </p>
      </div>

      {/* ── Formulario ───────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-6 mb-6">

        {/* Número de empleados */}
        <div className="mb-5">
          <label className="block text-sm font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5">
            Número de empleados
          </label>
          <input
            type="number"
            min="0"
            value={empleados}
            onChange={(e) => setEmpleados(e.target.value)}
            placeholder="Ej. 5"
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#d1d5db] dark:border-[#3a3e5c] bg-white dark:bg-[#181a2e] text-[#191c1e] dark:text-[#e4e6f0] text-sm focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent"
          />
          <p className="mt-1 text-xs text-[#9ca3af] dark:text-[#6b7280]">
            Deja en blanco o 0 si no tienes nómina
          </p>
        </div>

        {/* Número de meses */}
        <div className="mb-5">
          <label className="block text-sm font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5">
            Número de meses
          </label>
          <input
            type="number"
            min="0"
            value={meses}
            onChange={(e) => setMeses(e.target.value)}
            placeholder="Ej. 12"
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#d1d5db] dark:border-[#3a3e5c] bg-white dark:bg-[#181a2e] text-[#191c1e] dark:text-[#e4e6f0] text-sm focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent"
          />
          <p className="mt-1 text-xs text-[#9ca3af] dark:text-[#6b7280]">
            Período de nómina a reportar
          </p>
        </div>

        {/* Salario mensual */}
        <div className="mb-2">
          <label className="block text-sm font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5">
            Salario mensual
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#9ca3af] dark:text-[#6b7280] select-none">
              $
            </span>
            <input
              type="number"
              min="0"
              value={salario}
              onChange={(e) => setSalario(e.target.value)}
              placeholder="1423500"
              className="w-full pl-7 pr-3.5 py-2.5 rounded-xl border border-[#d1d5db] dark:border-[#3a3e5c] bg-white dark:bg-[#181a2e] text-[#191c1e] dark:text-[#e4e6f0] text-sm focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent"
            />
          </div>
          <p className="mt-1 text-xs text-[#9ca3af] dark:text-[#6b7280]">
            COP — SMMLV 2026 por defecto
          </p>
        </div>

        {/* Error de validación cruzada */}
        {error && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
            <span className="material-symbols-outlined text-amber-500 text-lg">warning</span>
            <span className="text-sm text-amber-700 dark:text-amber-400">{error}</span>
          </div>
        )}
      </div>

      {/* ── Preview de cálculo ───────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-6 mb-6">
        <h2 className="text-sm font-bold text-[#434655] dark:text-[#c4c8e8] uppercase tracking-wide mb-4">
          Vista previa del cálculo
        </h2>

        {!calc.tieneNomina ? (
          <p className="text-sm text-[#9ca3af] dark:text-[#6b7280] text-center py-4">
            Ingresa empleados y meses para ver el cálculo
          </p>
        ) : (
          <div className="space-y-5">
            {/* Salario base */}
            <div className="flex items-center justify-between pb-3 border-b border-[#f0f2f8] dark:border-[#2e3148]">
              <span className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0]">
                Salario mensual
              </span>
              <span className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] tabular-nums">
                {fmt(salVal)}
              </span>
            </div>

            {/* Aportes empresa */}
            <div>
              <p className="text-[11px] font-bold text-[#8890b5] uppercase tracking-wide mb-2">
                Aportes empresa
              </p>
              {APORTES.map((a) => (
                <PreviewRow key={a.label} label={a.label} tasa={a.tasa} base={salVal} />
              ))}
              <PreviewRow
                label="Total aportes"
                tasa={APORTES.reduce((s, a) => s + a.tasa, 0)}
                base={salVal}
                isTotal
              />
            </div>

            {/* Provisiones */}
            <div>
              <p className="text-[11px] font-bold text-[#8890b5] uppercase tracking-wide mb-2">
                Provisiones por mes
              </p>
              {PROVISIONES.map((p) => (
                <PreviewRow key={p.label} label={p.label} tasa={p.tasa} base={salVal} />
              ))}
              <PreviewRow
                label="Total provisiones"
                tasa={PROVISIONES.reduce((s, a) => s + a.tasa, 0)}
                base={salVal}
                isTotal
              />
            </div>

            {/* Costo por empleado/mes */}
            <div className="rounded-xl bg-[#f3f6ff] dark:bg-[#1a2040] border border-[#d6e0f3] dark:border-[#2a3560] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-[#434655] dark:text-[#c4c8e8]">
                  Costo por empleado / mes
                </span>
                <span className="text-sm font-bold text-[#004ac6] dark:text-[#7ba8f0] tabular-nums">
                  {fmt(calc.costoMes)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#6b7280] dark:text-[#8890b5]">
                  {empVal} empleado{empVal !== 1 ? 's' : ''} × {mesVal} mes{mesVal !== 1 ? 'es' : ''}
                </span>
                <span className="text-base font-bold text-[#191c1e] dark:text-[#e4e6f0] tabular-nums">
                  {fmt(calc.costoTotal)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Navegación ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleVolver}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-[#d1d5db] dark:border-[#3a3e5c] text-[#434655] dark:text-[#c4c8e8] hover:bg-[#f3f4f6] dark:hover:bg-[#252840] transition active:scale-[0.97]"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Volver
        </button>

        <button
          onClick={handleContinuar}
          disabled={!!error}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
          style={{ background: '#004ac6' }}
        >
          Generar Excel
          <span className="material-symbols-outlined text-base">table_view</span>
        </button>
      </div>
    </div>
  )
}
