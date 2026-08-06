import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../services/api'
import SALARY_CONSTANTS from '../../shared/salaryConstants.json'
import {
  calcularNomina, calcularCostoTotal, calcularVentasNetas,
  TASA_PENSION, TASA_CAJA_COMPENSACION, TARIFAS_ARL,
  TASA_VACACIONES, TASA_PRIMA, TASA_CESANTIAS, TASA_INTERESES_CESANTIAS,
} from '../../shared/calcularNomina.js'

// Año más reciente configurado — mismo criterio de fallback que usa el backend (getSalaryConstants)
const LATEST_YEAR   = Math.max(...Object.keys(SALARY_CONSTANTS).map(Number))
const SMMLV_ACTUAL   = SALARY_CONSTANTS[LATEST_YEAR].smmlv
const AUXILIO_ACTUAL = SALARY_CONSTANTS[LATEST_YEAR].auxilioTransporte

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

// Tarifas de autorretención en la renta — mismo criterio que la "clasificación rápida" de
// retenciones (dropdown con opciones fijas), pero acá es UNA sola tarifa para todo el
// período, no por fila. 'N/A' es una respuesta válida (empresa exenta pese a tener
// nómina+ventas), por eso el placeholder inicial queda vacío en vez de defaultear a algo.
const OPCIONES_AUTORRETENCION = [
  { label: '0,55%', value: '0.55' },
  { label: '1,10%', value: '1.10' },
  { label: '1,20%', value: '1.20' },
  { label: '1,70%', value: '1.70' },
  { label: '2,20%', value: '2.20' },
  { label: '2,70%', value: '2.70' },
  { label: '2,80%', value: '2.80' },
  { label: '3,50%', value: '3.50' },
  { label: '4,50%', value: '4.50' },
  { label: 'N/A (no aplica)', value: 'N/A' },
]

// Tarifas ARL por clase de riesgo (Decreto 1607 de 2002) — a diferencia de pensión/caja de
// compensación, varía según la labor del trabajador, así que hay que elegirla (no se puede
// calcular directo con una sola tarifa fija).
const OPCIONES_ARL = TARIFAS_ARL.map((tarifa, i) => ({
  label: `Clase ${['I', 'II', 'III', 'IV', 'V'][i]} (${tarifa.toString().replace('.', ',')}%)`,
  value: String(tarifa),
}))

// ── subcomponente: fila del preview (valor precomputado, o base*tasa si no se pasa) ────────────
// tasaLabel: permite mostrar un % distinto al que realmente usa el cálculo (ej. Pensión
// se muestra como "12%" informativo, pero se calcula con la tasa real del 4%).
function PreviewRow({ label, tasa, tasaLabel, base, valor: valorProp, isTotal, isNeg }) {
  const valor = valorProp !== undefined ? valorProp : base * tasa
  const pct = tasaLabel ?? (tasa ? `${(tasa * 100).toFixed(tasa * 100 % 1 === 0 ? 0 : 2)}%` : null)
  return (
    <div className={`flex items-center justify-between py-1.5 ${isTotal ? 'border-t border-[#e2e4ef] dark:border-[#2e3148] mt-1 pt-2.5 font-semibold' : ''}`}>
      <span className={`text-sm ${isTotal ? 'text-[#191c1e] dark:text-[#e4e6f0]' : 'text-[#6b7280] dark:text-[#8890b5]'}`}>
        {label}{!isTotal && pct ? <span className="text-[11px] ml-1 opacity-70">({pct})</span> : ''}
      </span>
      <span className={`text-sm tabular-nums ${isNeg ? 'text-red-600 dark:text-red-400' : isTotal ? 'text-[#191c1e] dark:text-[#e4e6f0]' : 'text-[#434655] dark:text-[#c4c8e8]'}`}>
        {isNeg ? `(${fmt(Math.abs(valor))})` : fmt(valor)}
      </span>
    </div>
  )
}

// ── página ────────────────────────────────────────────────────────────────────
export default function DianNominaPage() {
  const { borradorId } = useParams()
  const navigate = useNavigate()

  const [cargando,   setCargando]   = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [calculos,   setCalculos]   = useState(null)

  const [empleados, setEmpleados] = useState('')
  const [meses,     setMeses]     = useState('')
  const [salario,   setSalario]   = useState(String(SMMLV_ACTUAL))
  const [tasaAutorretencion, setTasaAutorretencion] = useState('')
  const [tarifaArl, setTarifaArl] = useState('')

  // Carga el borrador desde el backend al montar — igual que en Clasificación, para que
  // "volver" desde Exportación o un F5 accidental recuperen lo ya guardado en vez de un
  // formulario en blanco.
  useEffect(() => {
    let cancelado = false
    setCargando(true)
    setErrorCarga('')
    api.getDianBorrador(borradorId)
      .then((data) => {
        if (cancelado) return
        setCalculos(data.calculos ?? null)
        const n = data.nomina
        if (n?.empleados != null)          setEmpleados(String(n.empleados))
        if (n?.meses != null)              setMeses(String(n.meses))
        if (n?.salario != null)            setSalario(String(n.salario))
        if (n?.tarifaArl != null)          setTarifaArl(String(n.tarifaArl))
        if (n?.tasaAutorretencion != null) setTasaAutorretencion(n.tasaAutorretencion)
      })
      .catch((err) => {
        if (cancelado) return
        setErrorCarga(err.message || 'No se pudo cargar el borrador')
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => { cancelado = true }
  }, [borradorId])

  // Autoguardado de los campos de nómina (mismo patrón que la clasificación de retención)
  // para que no se pierdan al volver o recargar. Se salta mientras carga el borrador, para
  // no pisar lo persistido con los valores en blanco del formulario recién montado.
  useEffect(() => {
    if (cargando) return
    const timer = setTimeout(() => {
      api.patchDianNomina(borradorId, {
        empleados:           empleados.trim() === '' ? null : toInt(empleados),
        meses:                meses.trim() === '' ? null : toInt(meses),
        salario:              salario.trim() === '' ? null : toFloat(salario),
        tarifaArl:            tarifaArl === '' ? null : parseFloat(tarifaArl),
        tasaAutorretencion:   tasaAutorretencion === '' ? null : tasaAutorretencion,
      }).catch(() => {})
    }, 1000)
    return () => clearTimeout(timer)
  }, [cargando, borradorId, empleados, meses, salario, tarifaArl, tasaAutorretencion])

  const empVal = toInt(empleados)
  const mesVal = toInt(meses)
  const salVal = toFloat(salario) || SMMLV_ACTUAL

  const ventasNetas = useMemo(() => calcularVentasNetas(calculos), [calculos])
  const tieneNomina = empVal > 0 && mesVal > 0
  const mostrarAutorretencion = tieneNomina && ventasNetas > 0
  const valorAutorretencion = tasaAutorretencion && tasaAutorretencion !== 'N/A'
    ? ventasNetas * (parseFloat(tasaAutorretencion) / 100)
    : 0

  // Validación cruzada
  const error =
    empVal > 0 && mesVal === 0 ? 'Especifica el número de meses' :
    empVal === 0 && mesVal > 0 ? 'Especifica el número de empleados' :
    tieneNomina && !tarifaArl ? 'Selecciona la tarifa ARL' :
    mostrarAutorretencion && !tasaAutorretencion ? 'Selecciona la tarifa de autorretención' :
    null

  // ── cálculos preview — misma fórmula que usa el backend al exportar (shared/calcularNomina.js) ──
  const calc = useMemo(() => {
    const arlValida = tarifaArl !== '' && TARIFAS_ARL.includes(parseFloat(tarifaArl))
    const n = calcularNomina({
      salario: salVal,
      smmlv: SMMLV_ACTUAL,
      auxilioTransporte: AUXILIO_ACTUAL,
      tarifaArl: arlValida ? parseFloat(tarifaArl) : TARIFAS_ARL[0],
    })
    const tieneNomina = empVal > 0 && mesVal > 0
    const costoTotal  = tieneNomina && arlValida ? calcularCostoTotal({ empleados: empVal, meses: mesVal, costoMes: n.costoMes }) : 0

    return { ...n, costoTotal, tieneNomina, arlValida }
  }, [salVal, empVal, mesVal, tarifaArl])

  const handleContinuar = () => {
    if (error) return
    navigate(`/dian/exportacion/${borradorId}`)
  }

  const handleVolver = () => {
    navigate(`/dian/clasificacion/${borradorId}`)
  }

  // ── render ─────────────────────────────────────────────────────────────────
  if (cargando) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center">
        <svg className="animate-spin h-10 w-10 text-[#004ac6] mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="mt-4 text-[#6b7280] dark:text-[#8890b5]">Cargando borrador…</p>
      </div>
    )
  }

  if (errorCarga) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center">
        <span className="material-symbols-outlined text-5xl text-[#d1d5db] dark:text-[#3a3e5c]">error_outline</span>
        <p className="mt-4 text-[#6b7280] dark:text-[#8890b5]">{errorCarga}</p>
        <button
          onClick={() => navigate('/dian/upload')}
          className="mt-6 px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition active:scale-[0.97]"
          style={{ background: '#004ac6' }}
        >
          Subir otro reporte
        </button>
      </div>
    )
  }

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
              placeholder={String(SMMLV_ACTUAL)}
              className="w-full pl-7 pr-3.5 py-2.5 rounded-xl border border-[#d1d5db] dark:border-[#3a3e5c] bg-white dark:bg-[#181a2e] text-[#191c1e] dark:text-[#e4e6f0] text-sm focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent"
            />
          </div>
          <p className="mt-1 text-xs text-[#9ca3af] dark:text-[#6b7280]">
            COP — SMMLV {LATEST_YEAR} por defecto · Auxilio de transporte {LATEST_YEAR}: {fmt(AUXILIO_ACTUAL)} (aplica si el salario es ≤ 2 SMMLV)
          </p>
        </div>

        {/* Tarifa ARL — varía por clase de riesgo, no se puede calcular directo como pensión/caja */}
        {tieneNomina && (
          <div className="mb-2 mt-5">
            <label className="block text-sm font-semibold text-[#434655] dark:text-[#c4c8e8] mb-1.5">
              Tarifa ARL
            </label>
            <select
              value={tarifaArl}
              onChange={(e) => setTarifaArl(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#d1d5db] dark:border-[#3a3e5c] bg-white dark:bg-[#181a2e] text-[#191c1e] dark:text-[#e4e6f0] text-sm focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent"
            >
              <option value="">Selecciona…</option>
              {OPCIONES_ARL.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[#9ca3af] dark:text-[#6b7280]">
              Depende de la clase de riesgo de la labor del trabajador
            </p>
          </div>
        )}

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
            {/* Devengado */}
            <div>
              <p className="text-[11px] font-bold text-[#8890b5] uppercase tracking-wide mb-2">
                Devengado
              </p>
              <PreviewRow label="Salario" valor={salVal} />
              <PreviewRow
                label={`Auxilio de transporte${calc.auxilioAplica ? '' : ' (no aplica: salario > 2 SMMLV)'}`}
                valor={calc.auxilio}
              />
              <PreviewRow label="Vacaciones (s/ salario)"                  tasa={TASA_VACACIONES}          valor={calc.devengadoDetalle.vacaciones} />
              <PreviewRow label="Prima de Servicios (s/ salario+auxilio)"  tasa={TASA_PRIMA}               valor={calc.devengadoDetalle.prima} />
              <PreviewRow label="Cesantías (s/ salario+auxilio)"           tasa={TASA_CESANTIAS}            valor={calc.devengadoDetalle.cesantias} />
              <PreviewRow label="Intereses Cesantías (s/ cesantías)"       tasa={TASA_INTERESES_CESANTIAS}  valor={calc.devengadoDetalle.interesesCesantias} />
              <PreviewRow label="Total devengado" valor={calc.devengado} isTotal />
            </div>

            {/* Seguridad Social y Parafiscales */}
            <div>
              <p className="text-[11px] font-bold text-[#8890b5] uppercase tracking-wide mb-2">
                Seguridad Social y Parafiscales (sobre salario, a cargo del empleador)
              </p>
              {calc.arlValida ? (
                <>
                  <PreviewRow label="Pensión"              tasa={TASA_PENSION}           base={salVal} />
                  <PreviewRow label="ARL" tasaLabel={`${tarifaArl}%`} valor={calc.aportesDetalle.arl} />
                  <PreviewRow label="Caja de Compensación" tasa={TASA_CAJA_COMPENSACION} base={salVal} />
                  <PreviewRow label="Total seguridad social y parafiscales" valor={calc.aportesPatronales} isTotal />
                </>
              ) : (
                <p className="text-sm text-[#9ca3af] dark:text-[#6b7280] py-2">
                  Selecciona la tarifa ARL para ver el detalle
                </p>
              )}
            </div>

            {/* Costo por empleado/mes */}
            <div className="rounded-xl bg-[#f3f6ff] dark:bg-[#1a2040] border border-[#d6e0f3] dark:border-[#2a3560] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-[#434655] dark:text-[#c4c8e8]">
                  Costo por empleado / mes
                </span>
                <span className="text-sm font-bold text-[#004ac6] dark:text-[#7ba8f0] tabular-nums">
                  {calc.arlValida ? fmt(calc.costoMes) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#6b7280] dark:text-[#8890b5]">
                  {empVal} empleado{empVal !== 1 ? 's' : ''} × {mesVal} mes{mesVal !== 1 ? 'es' : ''}
                </span>
                <span className="text-base font-bold text-[#191c1e] dark:text-[#e4e6f0] tabular-nums">
                  {calc.arlValida ? fmt(calc.costoTotal) : '—'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Autorretención en la renta — solo si hay nómina Y hay ventas ────────── */}
      {mostrarAutorretencion && (
        <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-6 mb-6">
          <h2 className="text-sm font-bold text-[#434655] dark:text-[#c4c8e8] uppercase tracking-wide mb-4">
            Autorretención en la renta
          </h2>

          <div className="flex items-end gap-4 mb-4">
            {/* Base — ventas netas (emitidas antes de IVA, notas crédito descontadas) */}
            <div className="flex-1">
              <label className="block text-xs font-semibold text-[#8890b5] uppercase tracking-wide mb-1.5">
                Base (Ventas Netas)
              </label>
              <div className="px-3.5 py-2.5 rounded-xl border border-[#e2e4ef] dark:border-[#2e3148] bg-[#f8f9ff] dark:bg-[#181a2e] text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] tabular-nums">
                {fmt(ventasNetas)}
              </div>
            </div>

            {/* Tarifa — dropdown, una sola clasificación general para el período */}
            <div className="w-40">
              <label className="block text-xs font-semibold text-[#8890b5] uppercase tracking-wide mb-1.5">
                Tarifa
              </label>
              <select
                value={tasaAutorretencion}
                onChange={(e) => setTasaAutorretencion(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#d1d5db] dark:border-[#3a3e5c] bg-white dark:bg-[#181a2e] text-[#191c1e] dark:text-[#e4e6f0] text-sm focus:outline-none focus:ring-2 focus:ring-[#004ac6] focus:border-transparent"
              >
                <option value="">Selecciona…</option>
                {OPCIONES_AUTORRETENCION.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {tasaAutorretencion && (
            <div className="rounded-xl bg-[#f3f6ff] dark:bg-[#1a2040] border border-[#d6e0f3] dark:border-[#2a3560] p-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-[#434655] dark:text-[#c4c8e8]">
                Valor Autorretención
              </span>
              <span className="text-base font-bold text-[#004ac6] dark:text-[#7ba8f0] tabular-nums">
                {fmt(valorAutorretencion)}
              </span>
            </div>
          )}
        </div>
      )}

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
