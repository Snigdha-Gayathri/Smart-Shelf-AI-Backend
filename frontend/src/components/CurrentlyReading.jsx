import React, { useState } from 'react'
import CategoryStyledBookCard from './CategoryStyledBookCard'
import SmartNotesPanel from './SmartNotesPanel'

export default function CurrentlyReading({ books = [], onUpdateStatus, onLike, onDislike, onSubmitReview, userId }) {
  const [reviewTarget, setReviewTarget] = useState(null)
  const [rating, setRating] = useState(5)
  const [reviewText, setReviewText] = useState('')

  function openReviewPrompt(book) {
    setReviewTarget(book)
    setRating(5)
    setReviewText('')
  }

  function closeReviewPrompt() {
    setReviewTarget(null)
    setRating(5)
    setReviewText('')
  }

  function handleSubmitReview() {
    if (!reviewTarget) return
    if (onSubmitReview) {
      onSubmitReview(reviewTarget, Number(rating), reviewText.trim())
    }
    closeReviewPrompt()
  }

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
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {nonEducationalBooks.map((book, idx) => {
          const isFinished = book.status === 'finished';

          return (
            <CategoryStyledBookCard
              key={book.id}
              book={book}
              index={idx}
            >
              <div className="w-full text-xs text-slate-300 mb-2">
                Progress: {isFinished ? '100%' : 'In progress'}
              </div>

              {book.buy_link && (
                <div className="w-full mb-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      window.open(book.buy_link, '_blank', 'noopener,noreferrer')
                    }}
                    className="w-full px-2 py-1.5 text-xs rounded-md bg-green-600 hover:bg-green-700 text-white font-medium transition focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    Buy Online
                  </button>
                </div>
              )}

              {/* Status control */}
              <div className="w-full pt-2 border-t border-slate-200 dark:border-slate-700">
                <select
                  value={book.status}
                  onChange={(e) => {
                    const next = e.target.value
                    if (next === 'finished') {
                      openReviewPrompt(book)
                      return
                    }
                    if (onUpdateStatus) onUpdateStatus(book.id, next)
                  }}
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

      {reviewTarget && (
        <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeReviewPrompt}>
          <div className="w-full max-w-md rounded-2xl border border-white/20 bg-slate-900/95 p-4 sm:p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base sm:text-lg font-semibold text-white">Rate this book</h3>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">{reviewTarget.title}</p>

            <div className="mt-3">
              <p className="text-xs text-slate-300 mb-1.5">Star Rating (1-5)</p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="text-2xl leading-none"
                    style={{ color: star <= rating ? '#FACC15' : '#64748B' }}
                    aria-label={`Rate ${star} star`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <label className="text-xs text-slate-300">Write a short review (optional)</label>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                rows={4}
                placeholder="What did you enjoy the most?"
                className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-600 text-slate-100 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={closeReviewPrompt} className="px-3 py-2 text-xs sm:text-sm rounded-md bg-slate-700 text-white">Cancel</button>
              <button
                onClick={handleSubmitReview}
                className="px-3 py-2 text-xs sm:text-sm rounded-md text-white"
                style={{ background: '#1E90FF' }}
              >
                Submit Review
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
