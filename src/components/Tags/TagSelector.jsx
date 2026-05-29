import { useState } from 'react'
import { useTags } from '../../context/TagContext'

const PRESET_COLORS = ['#004ac6', '#10B981', '#EF4444', '#FBBF24', '#F97316', '#8B5CF6', '#EC4899', '#06B6D4']

export default function TagSelector({ selectedIds = [], onChange }) {
  const { tags, createTag } = useTags()
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#004ac6')

  const toggleTag = (id) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((t) => t !== id) : [...selectedIds, id])
  }

  const handleCreate = (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    const tag = createTag(newName.trim(), newColor)
    onChange([...selectedIds, tag.id])
    setNewName('')
    setNewColor('#004ac6')
  }

  const selectedTags = tags.filter((t) => selectedIds.includes(t.id))

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {selectedTags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-white"
            style={{ background: t.color }}
          >
            {t.name}
            <button type="button" onClick={() => toggleTag(t.id)} className="hover:opacity-75">
              <span className="material-symbols-outlined text-xs leading-none">close</span>
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border border-dashed border-[#c3c6d7] text-[#434655] hover:border-[#004ac6] hover:text-[#004ac6] transition"
        >
          <span className="material-symbols-outlined text-xs">add</span>
          Etiqueta
        </button>
      </div>

      {open && (
        <div className="bg-[#edeef0] dark:bg-[#252840] rounded-xl p-3 space-y-2">
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {tags.map((t) => (
              <label key={t.id} className="flex items-center gap-2 cursor-pointer hover:bg-white dark:hover:bg-[#1e2030] rounded-lg px-2 py-1 transition">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(t.id)}
                  onChange={() => toggleTag(t.id)}
                  className="accent-[#004ac6]"
                />
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: t.color }} />
                <span className="text-xs text-[#191c1e] dark:text-[#e4e6f0]">{t.name}</span>
              </label>
            ))}
          </div>
          <div className="border-t border-[#c3c6d7] dark:border-[#2e3148] pt-2">
            <p className="text-xs font-semibold text-[#434655] mb-1.5">Nueva etiqueta</p>
            <form onSubmit={handleCreate} className="flex gap-2 items-center">
              <div className="flex gap-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className="w-4 h-4 rounded-full transition-transform hover:scale-110"
                    style={{ background: c, outline: newColor === c ? `2px solid ${c}` : 'none', outlineOffset: '1px' }}
                  />
                ))}
              </div>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="nombre..."
                className="flex-1 h-7 px-2 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-white dark:bg-[#1e2030] text-xs text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-1 focus:ring-[#004ac6]"
              />
              <button type="submit" disabled={!newName.trim()} className="h-7 px-2 rounded-lg text-xs text-white font-semibold disabled:opacity-40" style={{ background: '#004ac6' }}>
                +
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
