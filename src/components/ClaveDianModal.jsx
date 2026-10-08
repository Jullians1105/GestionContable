import { useState } from 'react'
import { api } from '../services/api'
import { useToast } from '../context/ToastContext'
import { backdropClose } from '../utils/backdropClose'
import { useEscapeKey } from '../hooks/useEscapeKey'

// Ventana modal simple (clic fuera = cerrar). La usan la ficha del Directorio y Deudas DIAN.
export function Modal({ onClose, children, ancho = 'max-w-md' }) {
  useEscapeKey(onClose)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className={`bg-white rounded-2xl shadow-xl p-6 ${ancho} w-full max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

const Spinner = ({ size = 16 }) => (
  <span className="material-symbols-outlined" style={{ fontSize: size, animation: 'spin 1s linear infinite' }}>progress_activity</span>
)

// Clave DIAN de una empresa + periodicidad del IVA. La clave se verifica con UN intento real de ingreso a
// la DIAN antes de guardarse (cifrada); si la rechaza, no se guarda. Nunca se muestra la clave guardada.
// `empresa`: { id, name, tipoContribuyente, tieneClave, claveEstado, ivaPeriodicidad }.
export default function ClaveDianModal({ empresa, llaveConfigurada = true, onClose, onCambio }) {
  const { addToast } = useToast()
  const [clave, setClave] = useState('')
  const [ver, setVer] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const faltaIdentidad = !empresa.tipoContribuyente
  const guardar = async () => {
    setError('')
    setGuardando(true)
    try {
      await api.guardarClaveDian(empresa.id, clave)
      addToast(`Clave de ${empresa.name} verificada y guardada`, 'success')
      onCambio()
      onClose()
    } catch (err) {
      setError(err.message || 'No se pudo guardar la clave')
    } finally {
      setGuardando(false)
    }
  }

  const quitar = async () => {
    if (!window.confirm(`¿Quitar la clave DIAN guardada de ${empresa.name}?`)) return
    try {
      await api.quitarClaveDian(empresa.id)
      addToast('Clave eliminada', 'info')
      onCambio()
      onClose()
    } catch (err) {
      setError(err.message || 'No se pudo quitar la clave')
    }
  }

  const cambiarPeriodicidad = async (valor) => {
    try {
      await api.setIvaPeriodicidadDian(empresa.id, valor || null)
      onCambio()
    } catch (err) {
      setError(err.message || 'No se pudo guardar la periodicidad')
    }
  }

  return (
    <Modal onClose={guardando ? () => {} : onClose}>
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-[#003B43]" style={{ fontSize: 20 }}>key</span>
        <h3 className="text-base font-bold text-[#191c1e]">Clave DIAN</h3>
      </div>
      <p className="text-sm font-semibold text-[#191c1e]">{empresa.name}</p>
      <p className="text-xs text-[#6b7280] mb-4">
        {empresa.tipoContribuyente === 'natural' ? 'Persona natural' : 'Ingresa como empresa (NIT + cédula del representante)'}
        {empresa.tieneClave && empresa.claveEstado === 'verificada' && ' · Ya tiene una clave verificada'}
        {empresa.claveEstado === 'invalida' && ' · La DIAN rechazó la clave guardada'}
      </p>

      {!llaveConfigurada && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-3">
          El servidor no tiene configurada la llave de cifrado (DIAN_CLAVES_KEY), así que no se pueden guardar claves. Avisa al administrador.
        </p>
      )}
      {faltaIdentidad && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
          Esta empresa no tiene tipo de contribuyente ni cédula del representante. Complétalos primero en el Directorio de empresas.
        </p>
      )}

      <label className="text-xs font-semibold text-[#434655] block mb-1">
        {empresa.tieneClave ? 'Clave nueva' : 'Clave'}
      </label>
      <div className="relative mb-3">
        <input
          type={ver ? 'text' : 'password'}
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          autoComplete="off"
          autoFocus
          spellCheck={false}
          disabled={guardando}
          onKeyDown={(e) => { if (e.key === 'Enter' && clave.trim() && !guardando) guardar() }}
          className="w-full pl-3 pr-10 py-2 rounded-lg border border-[#d1d5db] text-sm text-[#191c1e]"
        />
        <button
          type="button"
          onClick={() => setVer((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8890b5] hover:text-[#191c1e]"
          title={ver ? 'Ocultar' : 'Mostrar'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{ver ? 'visibility_off' : 'visibility'}</span>
        </button>
      </div>
      <p className="text-[11px] text-[#6b7280] mb-3">
        Se hace <b>un solo intento</b> de ingreso a la DIAN con esta clave antes de guardarla. Si la rechaza, no se guarda
        y no se vuelve a intentar sola (la DIAN bloquea la cuenta tras varios intentos fallidos). Se guarda cifrada.
      </p>

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      <div className="flex items-center justify-between gap-2 mb-4">
        {empresa.tieneClave ? (
          <button onClick={quitar} disabled={guardando} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-40">
            Quitar clave
          </button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <button onClick={onClose} disabled={guardando} className="px-3 py-2 rounded-lg text-xs font-semibold text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-40">
            Cerrar
          </button>
          <button
            onClick={guardar}
            disabled={guardando || !clave.trim() || !llaveConfigurada || faltaIdentidad}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#003B43] disabled:opacity-40 transition active:scale-[0.97]"
          >
            {guardando ? <><Spinner size={14} /> Verificando con la DIAN…</> : 'Guardar y verificar'}
          </button>
        </div>
      </div>

      <div className="border-t border-[#f0f2f8] pt-3">
        <label className="text-xs font-semibold text-[#434655] block mb-1">Periodicidad del IVA</label>
        <select
          value={empresa.ivaPeriodicidad ?? ''}
          onChange={(e) => cambiarPeriodicidad(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-[#d1d5db] text-sm text-[#191c1e] bg-white"
        >
          <option value="">Sin definir</option>
          <option value="bimestral">Bimestral</option>
          <option value="cuatrimestral">Cuatrimestral</option>
        </select>
        <p className="text-[11px] text-[#6b7280] mt-1">
          La DIAN solo dice &ldquo;periodo 2&rdquo;; con esto el correo dice &ldquo;bimestre marzo-abril&rdquo; o &ldquo;cuatrimestre mayo-agosto&rdquo;.
        </p>
      </div>
    </Modal>
  )
}
