import React, { useState, useEffect, useRef } from 'react'

/**
 * SmartNotesPanel — Collapsible notes drawer for Currently Reading & Educational Reads.
 *
 * Data structure per note:
 * { id, bookId, content, tags[], createdAt }
 *
 * Props:
 *   bookId   — unique book identifier
 *   userId   — for scoped localStorage key
 *   visible  — whether the panel can appear (book is reading/learning)
 */

const STORAGE_PREFIX = 'user_notes_'

function getNotesKey(userId, bookId) {
  return `${STORAGE_PREFIX}${userId}_${bookId}`
}

function loadNotes(userId, bookId) {
  try {
    const raw = localStorage.getItem(getNotesKey(userId, bookId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveNotes(userId, bookId, notes) {
  try {
    localStorage.setItem(getNotesKey(userId, bookId), JSON.stringify(notes))
  } catch (e) {
    console.error('Failed to save notes:', e)
  }
}

const TAG_COLORS = [
  { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD' },
  { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' },
  { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
  { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' },
  { bg: '#FCE7F3', text: '#9D174D', border: '#F9A8D4' },
  { bg: '#E0E7FF', text: '#3730A3', border: '#A5B4FC' },
]

function getTagColor(tag) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

export default function SmartNotesPanel({ bookId, userId, visible = true }) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState([])
  const [content, setContent] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [currentTags, setCurrentTags] = useState([])
  const textareaRef = useRef(null)

  // Load notes on mount / bookId change
  useEffect(() => {
    if (userId && bookId) {
      setNotes(loadNotes(userId, bookId))
    }
  }, [userId, bookId])

  // Persist whenever notes change
  useEffect(() => {
    if (userId && bookId && notes.length >= 0) {
      saveNotes(userId, bookId, notes)
    }
  }, [notes, userId, bookId])

  if (!visible || !userId || !bookId) return null

  const handleAddTag = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault()
      const tag = tagInput.trim().replace(/,$/, '')
      if (tag && !currentTags.includes(tag)) {
        setCurrentTags(prev => [...prev, tag])
      }
      setTagInput('')
    }
  }

  const handleRemoveTag = (tag) => {
    setCurrentTags(prev => prev.filter(t => t !== tag))
  }

  const handleAddNote = () => {
    if (!content.trim()) return
    const note = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      bookId,
      content: content.trim(),
      tags: [...currentTags],
      createdAt: new Date().toISOString(),
    }
    setNotes(prev => [note, ...prev])
    setContent('')
    setCurrentTags([])
  }

  const handleDeleteNote = (noteId) => {
    setNotes(prev => prev.filter(n => n.id !== noteId))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleAddNote()
    }
  }

  const noteCount = notes.length

  return (
    <div className="w-full mt-2">
      {/* Toggle button */}
      <button
        onClick={() => {
          setOpen(prev => !prev)
          if (!open) setTimeout(() => textareaRef.current?.focus(), 300)
        }}
        className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors
          bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300
          hover:bg-slate-200 dark:hover:bg-slate-600/60"
        style={{ minHeight: '32px', minWidth: '32px' }}
      >
        <span>📝</span>
        <span>Notes</span>
        {noteCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
            {noteCount}
          </span>
        )}
        <svg
          className={`w-3 h-3 ml-auto transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsible drawer */}
      <div className={`notes-drawer ${open ? 'open' : ''}`}>
        <div className="pt-3 space-y-3">
          {/* New note input */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 p-3">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write a note… (Ctrl+Enter to save)"
              className="w-full text-xs bg-transparent resize-none outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              rows={2}
              style={{ minHeight: '44px' }}
            />

            {/* Tag input */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              {currentTags.map(tag => {
                const c = getTagColor(tag)
                return (
                  <span
                    key={tag}
                    className="note-tag-pill cursor-pointer"
                    style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}
                    onClick={() => handleRemoveTag(tag)}
                    title="Click to remove"
                  >
                    {tag} ×
                  </span>
                )
              })}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="Add tag…"
                className="flex-1 min-w-[60px] text-[10px] bg-transparent outline-none text-slate-600 dark:text-slate-300 placeholder:text-slate-400"
                style={{ minHeight: '28px' }}
              />
            </div>

            <div className="flex justify-end mt-2">
              <button
                onClick={handleAddNote}
                disabled={!content.trim()}
                className="px-3 py-1.5 text-[11px] font-medium rounded-md text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: content.trim() ? '#1E90FF' : '#94a3b8', minHeight: '28px', minWidth: '28px' }}
              >
                Save Note
              </button>
            </div>
          </div>

          {/* Notes list */}
          {notes.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {notes.map(note => (
                <div
                  key={note.id}
                  className="group/note rounded-lg bg-slate-50 dark:bg-slate-700/40 p-2.5 border border-slate-100 dark:border-slate-600/50 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700/60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap flex-1">
                      {note.content}
                    </p>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="opacity-0 group-hover/note:opacity-100 text-slate-400 hover:text-red-500 transition-opacity text-xs p-0.5"
                      title="Delete note"
                      style={{ minHeight: '24px', minWidth: '24px' }}
                    >
                      ✕
                    </button>
                  </div>
                  {note.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {note.tags.map(tag => {
                        const c = getTagColor(tag)
                        return (
                          <span
                            key={tag}
                            className="note-tag-pill"
                            style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}
                          >
                            {tag}
                          </span>
                        )
                      })}
                    </div>
                  )}
                  <p className="text-[9px] text-slate-400 mt-1.5">
                    {new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          )}

          {notes.length === 0 && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center py-2 italic">
              No notes yet. Start writing!
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
