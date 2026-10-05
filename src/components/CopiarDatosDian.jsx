import { useState, useEffect } from 'react'
import { api } from '../services/api'
import { useToast } from '../context/ToastContext'

// Datos para ingresar a mano a la DIAN (NIT, cédula del representante y clave), visibles y copiables con un clic,
// al estilo del documento en el Directorio. Sirven cuando la revisión automática falla y hay que presentar algo a
// mano, sin ir a buscar en el Excel. Decisión del usuario: las claves están a la vista de quien entra a la página (hoy
// están en un Excel abierto a toda la oficina); solo los usuarios "viewer" no las reciben.

// Trae UNA vez las claves guardadas ({ [empresaId]: clave }). Si el servidor las niega (viewer) o falla, queda {} y
// las filas solo muestran NIT y cédula.
export function useClavesDian() {
  const [claves, setClaves] = useState({})
  useEffect(() => {
    let vivo = true
    api.getClavesDian().then((r) => { if (vivo) setClaves(r?.claves ?? {}) }).catch(() => {})
    return () => { vivo = false }
  }, [])
  return claves
}

function Copiable({ etiqueta, texto, visible, aviso, mono = false }) {
  const { addToast } = useToast()
  const [copiado, setCopiado] = useState(false)

  const copiar = async (e) => {
    e.stopPropagation() // no abrir/cerrar la fila al copiar
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      addToast(aviso, 'success', 2000)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      addToast('No se pudo copiar al portapapeles', 'error')
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      title="Copiar"
      className="group inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-[#434655] hover:bg-[#E3EEEE] transition whitespace-nowrap"
    >
      <span className="font-semibold text-[#9ca3af]">{etiqueta}</span>
      <span className={mono ? 'font-mono' : ''}>{visible ?? texto}</span>
      <span className="material-symbols-outlined opacity-0 group-hover:opacity-60 transition" style={{ fontSize: 12 }}>
        {copiado ? 'check' : 'content_copy'}
      </span>
    </button>
  )
}

// `empresa`: { nit, tipoContribuyente, cedulaRepresentante }. `clave`: la clave en claro (si hay). `mostrarClave`:
// false la tapa con puntos en pantalla (sigue copiándose con un clic).
export default function CopiarDatosDian({ empresa, clave, mostrarClave = true }) {
  const esNatural = empresa.tipoContribuyente === 'natural'
  const documento = (empresa.nit ?? '').replace(/\D/g, '')
  const cedulaRep = !esNatural ? (empresa.cedulaRepresentante ?? '').replace(/\D/g, '') : ''

  return (
    <div className="flex items-center gap-x-1 gap-y-0.5 flex-wrap -mx-1.5" onClick={(e) => e.stopPropagation()}>
      {documento
        ? <Copiable etiqueta={esNatural ? 'C.C.' : 'NIT'} texto={documento} aviso={esNatural ? 'Cédula copiada' : 'NIT copiado'} />
        : <span className="px-1.5 text-[11px] italic text-amber-600">Sin NIT/cédula</span>}
      {cedulaRep && <Copiable etiqueta="C.C. rep." texto={cedulaRep} aviso="Cédula del representante copiada" />}
      {clave && <Copiable etiqueta="Clave" texto={clave} visible={mostrarClave ? clave : '••••••••'} aviso="Clave copiada" mono />}
    </div>
  )
}
