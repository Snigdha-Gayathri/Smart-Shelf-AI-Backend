import React from 'react'
import CategoryStyledBookCard from './CategoryStyledBookCard'
import SmartNotesPanel from './SmartNotesPanel'

export default function CurrentlyReading({ books = [], onUpdateStatus, onLike, onDislike, userId }) {

  if (!books.length) {
    return (
      <div className="text-center text-on-light py-6 sm:py-8 text-xs sm:text-sm italic">
        No books currently reading. Click "Select to Read" on any recommendation to start!
      </div>
    )
  }

  // Filter out educational books — they belong in Educational Reads
  const nonEducationalBooks = books.filter(b => b.type !== 'educational')
  
  if (!nonEducationalBooks.length) {
    return (
      <div className="text-center text-on-light py-6 sm:py-8 text-xs sm:text-sm italic">
        No books currently reading. Click "Select to Read" on any recommendation to start!
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      {nonEducationalBooks.map((book, idx) => {
        const isFinished = book.status === 'finished';
        
        return (
          <CategoryStyledBookCard
            key={book.id}
            book={book}
            index={idx}
            statusBadge={
              <span className={`text-white text-xs font-bold px-2 py-1 rounded-full shadow-sm ${
                isFinished ? 'bg-green-600' : 'bg-green-500'
              }`}>
                {isFinished ? '✓ Finished' : '📖 Reading'}
              </span>
            }
          >
            {/* Status control */}
            <div className="w-full pt-2 border-t border-slate-200 dark:border-slate-700">
              <select
                value={book.status}
                onChange={(e) => onUpdateStatus && onUpdateStatus(book.id, e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cool-blue dark:focus:ring-cool-accent transition"
              >
                <option value="reading">📖 Reading</option>
                <option value="finished">✓ Finished</option>
              </select>
            </div>

            {/* Like/Dislike buttons - only show when finished */}
            {isFinished && (
              <div className="w-full mt-2 flex gap-2">
                <button
                  onClick={() => onLike && onLike(book)}
                  className="flex-1 px-2 py-1.5 text-xs rounded-md bg-green-500 hover:bg-green-600 text-white font-medium transition focus:outline-none focus:ring-2 focus:ring-green-400"
                >
                  👍 Like
                </button>
                <button
                  onClick={() => onDislike && onDislike(book)}
                  className="flex-1 px-2 py-1.5 text-xs rounded-md bg-red-500 hover:bg-red-600 text-white font-medium transition focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  👎 Dislike
                </button>
              </div>
            )}

            {/* Smart Notes — visible when actively reading */}
            <SmartNotesPanel
              bookId={book.id}
              userId={userId}
              visible={book.status === 'reading'}
            />
          </CategoryStyledBookCard>
        );
      })}
    </div>
  )
}
