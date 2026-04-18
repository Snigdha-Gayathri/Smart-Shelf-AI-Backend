import React from 'react'
import CategoryStyledBookCard from './CategoryStyledBookCard'
import SmartNotesPanel from './SmartNotesPanel'

export default function EducationalReads({ books = [], onUpdateEduStatus, userId, theme = 'light' }) {
  const emptyTextClass = theme === 'dark' ? 'text-slate-300' : 'text-white'
  // Only show educational books that are currently learning
  const learningBooks = books.filter(b => b.type === 'educational' && b.eduStatus === 'learning')

  if (!learningBooks.length) {
    return (
      <div className={`text-center py-6 sm:py-8 text-xs sm:text-sm italic ${emptyTextClass}`}>
        No educational books currently in progress. Click "Start Learning" on any educational recommendation to begin!
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      {learningBooks.map((book, idx) => (
        <CategoryStyledBookCard
          key={book.id}
          book={book}
          index={idx}
          statusBadge={
            <span className="text-white text-xs font-bold px-2 py-1 rounded-full shadow-sm bg-emerald-600">
              📚 Learning
            </span>
          }
        >
          {/* Mark Complete button */}
          <button
            onClick={() => onUpdateEduStatus && onUpdateEduStatus(book.id, 'completed')}
            className="w-full px-3 py-2 text-xs sm:text-sm rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            ✓ Mark as Completed
          </button>

          {/* Buy Online button */}
          {book.buy_link && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                window.open(book.buy_link, '_blank', 'noopener,noreferrer')
              }}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-md bg-amber-600 hover:bg-amber-700 text-white font-medium transition focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              🛒 Buy Online
            </button>
          )}

          {/* Smart Notes — visible when actively learning */}
          <SmartNotesPanel
            bookId={book.id}
            userId={userId}
            visible={book.eduStatus === 'learning'}
          />
        </CategoryStyledBookCard>
      ))}
    </div>
  )
}
