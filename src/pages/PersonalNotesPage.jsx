import { useState, useEffect, useCallback, useRef } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { es as blockNoteEs } from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/ariakit'
import '@blocknote/ariakit/style.css'
import { api } from '../services/api'
import { useToast } from '../context/ToastContext'
import { useTheme } from '../context/ThemeContext'

const SAVE_DEBOUNCE_MS = 800

function relativeDate(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `hace ${days} d`
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

function NoteEditor({ note, onSaved, onBack }) {
  const { theme } = useTheme()
  const { addToast } = useToast()
  const [saveState, setSaveState] = useState('saved')
  // El input de título vive como estado local en vez de estar controlado por
  // `note.title` (que baja del padre): escribir rápido dispara un round-trip
  // hijo→padre→hijo en cada tecla, y si React re-renderiza con una prop
  // todavía desactualizada antes de que el estado del padre se ponga al día,
  // el input pisa lo que el usuario acaba de tipear y se comen caracteres.
  const [title, setTitle] = useState(note.title)
  const saveTimerRef = useRef(null)
  // Cambios de título y de contenido comparten un solo debounce — si cada uno
  // guardara su propio payload por separado, el último en dispararse pisaría
  // el campo que mandó el otro (ej: cambiás el título y seguís escribiendo en
  // el cuerpo, el guardado de contenido llega después y el título nunca se
  // manda). Se acumulan acá y se mandan juntos en un solo PUT.
  const pendingRef = useRef({})

  const editor = useCreateBlockNote(
    {
      initialContent: note.content && note.content.length ? note.content : undefined,
      dictionary: blockNoteEs,
    },
    [note.id]
  )

  const flushSave = useCallback(async () => {
    const payload = pendingRef.current
    pendingRef.current = {}
    if (!Object.keys(payload).length) return
    try {
      const updated = await api.updatePersonalNote(note.id, payload)
      onSaved(updated)
      setSaveState('saved')
    } catch {
      addToast('No se pudo guardar la nota', 'error')
      setSaveState('saved')
    }
  }, [note.id, onSaved, addToast])

  const scheduleSave = useCallback((patch) => {
    pendingRef.current = { ...pendingRef.current, ...patch }
    setSaveState('saving')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS)
  }, [flushSave])

  useEffect(() => {
    const unsubscribe = editor.onChange(() => {
      scheduleSave({ content: editor.document })
    })
    return () => {
      unsubscribe()
      // Si quedó un guardado pendiente (ej. el usuario cambió de nota antes de
      // que venciera el debounce), lo mandamos ya en vez de perder el cambio.
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        flushSave()
      }
    }
  }, [editor, scheduleSave, flushSave])

  useEffect(() => {
    setTitle(note.title)
    // Deliberadamente solo depende de note.id: no queremos pisar lo que el
    // usuario está tipeando cada vez que el padre recibe la confirmación del
    // guardado (note.title cambia, pero sigue siendo la misma nota).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  const handleTitleChange = (e) => {
    const value = e.target.value
    setTitle(value)
    scheduleSave({ title: value })
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 sm:px-6 pt-4 pb-2 flex-shrink-0">
        <button
          onClick={onBack}
          className="sm:hidden -ml-1 p-1.5 rounded-lg text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840] transition"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <input
          value={title}
          onChange={handleTitleChange}
          placeholder="Sin título"
          className="text-xl sm:text-2xl font-bold bg-transparent outline-none flex-1 min-w-0 text-[#191c1e] dark:text-[#e4e6f0]"
        />
        <span className="text-xs text-[#8890b5] dark:text-[#5a5f7a] flex-shrink-0">
          {saveState === 'saving' ? 'Guardando…' : 'Guardado'}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto pb-10">
        <BlockNoteView editor={editor} theme={theme} />
      </div>
    </div>
  )
}

function ConfirmDeleteModal({ noteTitle, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white dark:bg-[#1e2030] rounded-2xl shadow-2xl w-full max-w-sm border border-[#c3c6d7] dark:border-[#2e3148] p-6">
        <h3 className="text-base font-bold text-[#191c1e] dark:text-[#e4e6f0] mb-1">
          Eliminar nota
        </h3>
        <p className="text-sm text-[#434655] dark:text-[#c4c8e8] mb-5">
          ¿Eliminar <strong>{noteTitle || 'Sin título'}</strong>? No se puede deshacer.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="h-10 px-4 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] text-sm font-semibold text-[#434655] dark:text-[#c4c8e8] hover:bg-[#edeef0] dark:hover:bg-[#252840] transition"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="h-10 px-4 rounded-lg text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: '#EF4444' }}
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PersonalNotesPage() {
  const { addToast } = useToast()
  const [notes, setNotes] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getPersonalNotes()
      setNotes(Array.isArray(data) ? data : [])
    } catch {
      addToast('Error cargando tus notas', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  const handleSelect = async (id) => {
    try {
      const full = await api.getPersonalNote(id)
      setSelected(full)
    } catch {
      addToast('No se pudo abrir la nota', 'error')
    }
  }

  const handleCreate = async () => {
    try {
      const created = await api.createPersonalNote({})
      setNotes(prev => [{ id: created.id, title: created.title, position: created.position, createdAt: created.createdAt, updatedAt: created.updatedAt }, ...prev])
      setSelected(created)
    } catch {
      addToast('No se pudo crear la nota', 'error')
    }
  }

  const handleSaved = (updated) => {
    setSelected(updated)
    setNotes(prev => {
      const next = prev.map(n => n.id === updated.id ? { ...n, title: updated.title, updatedAt: updated.updatedAt } : n)
      return next.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    })
  }

  const handleDelete = async () => {
    const id = deleteTarget.id
    setDeleteTarget(null)
    const prevNotes = notes
    setNotes(notes.filter(n => n.id !== id))
    if (selected?.id === id) setSelected(null)
    try {
      await api.deletePersonalNote(id)
    } catch {
      addToast('No se pudo eliminar', 'error')
      setNotes(prevNotes)
    }
  }

  return (
    <div className="flex h-[calc(100vh-6.5rem)] -m-6 bg-white dark:bg-[#1e2030] rounded-none sm:rounded-xl sm:m-0 border-0 sm:border border-[#c3c6d7] dark:border-[#2e3148] overflow-hidden">
      {/* Panel de lista */}
      <div className={`w-full sm:w-72 sm:flex-shrink-0 border-r border-[#e2e4ef] dark:border-[#2e3148] flex-col ${selected ? 'hidden sm:flex' : 'flex'}`}>
        <div className="flex items-center justify-between px-4 py-4 flex-shrink-0">
          <h1 className="text-lg font-bold text-[#191c1e] dark:text-[#e4e6f0]">Mis Notas</h1>
          <button
            onClick={handleCreate}
            className="w-8 h-8 rounded-lg text-white flex items-center justify-center hover:opacity-90 transition active:scale-[0.95]"
            style={{ background: '#004ac6' }}
            title="Nueva nota"
          >
            <span className="material-symbols-outlined text-lg">add</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-[#8890b5] dark:text-[#5a5f7a]">
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 px-4 text-center text-[#8890b5] dark:text-[#5a5f7a]">
              <span className="material-symbols-outlined text-3xl">note_add</span>
              <p className="text-sm">Escribe lo que quieras — usa &quot;/&quot; para insertar títulos, listas, checkboxes, etc.</p>
            </div>
          ) : (
            notes.map(n => (
              <button
                key={n.id}
                onClick={() => handleSelect(n.id)}
                className={`w-full text-left group flex items-center gap-2 px-3 py-2.5 rounded-lg transition ${
                  selected?.id === n.id
                    ? 'bg-[#d6e0f3] dark:bg-[#1a2040]'
                    : 'hover:bg-[#edeef0] dark:hover:bg-[#252840]'
                }`}
              >
                <span className="material-symbols-outlined text-base text-[#8890b5] dark:text-[#5a5f7a] flex-shrink-0">description</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] truncate">
                    {n.title || 'Sin título'}
                  </span>
                  <span className="block text-xs text-[#8890b5] dark:text-[#5a5f7a]">{relativeDate(n.updatedAt)}</span>
                </span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(n) }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-[#c3c6d7] dark:text-[#3e4260] hover:text-[#EF4444] transition flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-base">delete</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Panel del editor */}
      <div className={`flex-1 min-w-0 flex-col ${selected ? 'flex' : 'hidden sm:flex'}`}>
        {selected ? (
          <NoteEditor key={selected.id} note={selected} onSaved={handleSaved} onBack={() => setSelected(null)} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[#8890b5] dark:text-[#5a5f7a]">
            <span className="material-symbols-outlined text-4xl">edit_note</span>
            <p className="text-sm">Elegí una nota o creá una nueva</p>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDeleteModal
          noteTitle={deleteTarget.title}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
