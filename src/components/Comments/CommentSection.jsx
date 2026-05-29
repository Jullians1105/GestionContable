import { useState } from 'react'
import { useTasks } from '../../context/TaskContext'
import { useAuth } from '../../context/AuthContext'
import { useTeam } from '../../hooks/useTeam'
import { useToast } from '../../context/ToastContext'
import { getInitials, getAvatarColor } from '../../utils/helpers'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

function Avatar({ name, size = 'sm' }) {
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'
  return (
    <div className={`${sz} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 ${getAvatarColor(name)}`}>
      {getInitials(name)}
    </div>
  )
}

function timeAgo(dateStr) {
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true, locale: es })
  } catch {
    return ''
  }
}

export default function CommentSection({ task }) {
  const { addComment, updateComment, deleteComment } = useTasks()
  const { user } = useAuth()
  const { getMemberById } = useTeam()
  const { addToast } = useToast()
  const [text, setText] = useState('')
  const [editId, setEditId] = useState(null)
  const [editText, setEditText] = useState('')

  const comments = task.comments || []

  const handleAdd = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    addComment(task.id, user.id, text.trim())
    addToast('Comentario agregado', 'success')
    setText('')
  }

  const handleEdit = (c) => {
    setEditId(c.id)
    setEditText(c.text)
  }

  const handleSaveEdit = (e) => {
    e.preventDefault()
    if (!editText.trim()) return
    updateComment(task.id, editId, editText.trim())
    setEditId(null)
    addToast('Comentario actualizado', 'success')
  }

  const handleDelete = (commentId) => {
    deleteComment(task.id, commentId)
    addToast('Comentario eliminado', 'info')
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0] flex items-center gap-1.5 mb-3">
        <span className="material-symbols-outlined text-base text-[#004ac6]">chat</span>
        Comentarios
        {comments.length > 0 && <span className="text-xs text-[#434655] font-normal">({comments.length})</span>}
      </h3>

      <div className="space-y-3 mb-4">
        {comments.map((c) => {
          const author = getMemberById(c.authorId)
          const authorName = author?.name || 'Usuario'
          const isOwn = c.authorId === user?.id

          return (
            <div key={c.id} className="flex gap-2.5">
              <Avatar name={authorName} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-[#191c1e] dark:text-[#e4e6f0]">{authorName}</span>
                  <span className="text-xs text-[#888]">{timeAgo(c.createdAt)}</span>
                </div>
                {editId === c.id ? (
                  <form onSubmit={handleSaveEdit} className="flex gap-2 mt-1">
                    <input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="flex-1 h-8 px-2 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6]"
                      autoFocus
                    />
                    <button type="submit" className="text-xs px-2 py-1 rounded-lg text-white font-semibold hover:opacity-90" style={{ background: '#004ac6' }}>Guardar</button>
                    <button type="button" onClick={() => setEditId(null)} className="text-xs px-2 py-1 rounded-lg border border-[#c3c6d7] text-[#434655] hover:bg-[#edeef0]">Cancelar</button>
                  </form>
                ) : (
                  <p className="text-sm text-[#434655] dark:text-[#c4c8e8] bg-[#edeef0] dark:bg-[#252840] rounded-xl px-3 py-2 inline-block max-w-full">{c.text}</p>
                )}
                {isOwn && editId !== c.id && (
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => handleEdit(c)} className="text-xs text-[#004ac6] hover:underline">Editar</button>
                    <button onClick={() => handleDelete(c.id)} className="text-xs text-[#EF4444] hover:underline">Eliminar</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <form onSubmit={handleAdd} className="flex gap-2 items-end">
        <Avatar name={user?.name || ''} />
        <div className="flex-1 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe un comentario..."
            className="flex-1 h-9 px-3 rounded-lg border border-[#c3c6d7] dark:border-[#2e3148] bg-[#edeef0] dark:bg-[#252840] text-sm text-[#191c1e] dark:text-[#e4e6f0] focus:outline-none focus:ring-2 focus:ring-[#004ac6] transition"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="h-9 px-3 rounded-lg text-sm font-semibold text-white disabled:opacity-40 hover:opacity-90 transition"
            style={{ background: '#004ac6' }}
          >
            <span className="material-symbols-outlined text-base">send</span>
          </button>
        </div>
      </form>
    </div>
  )
}
