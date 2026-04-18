import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import CategoryStyledBookCard from './CategoryStyledBookCard'
import SmartNotesPanel from './SmartNotesPanel'

export default function CurrentlyReading({ books = [], onUpdateStatus, onLike, onDislike, onSubmitReview, userId, theme = 'light' }) {
  const emptyTextClass = theme === 'dark' ? 'text-slate-300' : 'text-white'
  const [reviewTarget, setReviewTarget] = useState(null)
  const [rating, setRating] = useState(5)
  const [reviewText, setReviewText] = useState('')

  useEffect(() => {
    if (!reviewTarget) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [reviewTarget])

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
      <div className={`text-center py-6 sm:py-8 text-xs sm:text-sm italic ${emptyTextClass}`}>
        No books currently reading. Click "Select to Read" on any recommendation to start!
      </div>
    )
  }

  // Filter out educational books — they belong in Educational Reads
  const nonEducationalBooks = books.filter(b => b.type !== 'educational')
  
  if (!nonEducationalBooks.length) {
    return (
      <div className={`text-center py-6 sm:py-8 text-xs sm:text-sm italic ${emptyTextClass}`}>
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
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '12px',
                    borderRadius: '6px',
                    border: theme === 'dark' ? '1px solid #334155' : '1px solid #9CA3AF',
                    background: theme === 'dark' ? '#334155' : '#D1D5DB',
                    color: '#FFFFFF',
                    focusOutline: 'none',
                    focusRing: '2px',
                    focusRingColor: theme === 'dark' ? '#1E90FF' : '#1E90FF',
                    transition: 'all 0.2s',
                  }}
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

      {reviewTarget && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          onClick={closeReviewPrompt}
          role="dialog"
          aria-modal="true"
          aria-label="Rate finished book"
          style={{
            background: theme === 'dark' ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-4 sm:p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: theme === 'dark' ? 'rgba(2, 8, 23, 0.98)' : '#1E90FF',
              border: theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(255, 255, 255, 0.2)',
              color: '#FFFFFF',
            }}
          >
            <h3
              className="text-base sm:text-lg font-semibold"
              style={{ color: '#FFFFFF' }}
            >
              Rate this book
            </h3>
            <p
              className="text-xs sm:text-sm mt-1"
              style={{ color: '#FFFFFF' }}
            >
              {reviewTarget.title}
            </p>

            <div className="mt-3">
              <p
                className="text-xs mb-1.5"
                style={{ color: '#FFFFFF' }}
              >
                Star Rating (1-5)
              </p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="text-2xl leading-none transition-colors"
                    style={{ color: star <= rating ? '#FACC15' : '#80B0FF' }}
                    aria-label={`Rate ${star} star`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <label
                className="text-xs"
                style={{ color: '#FFFFFF' }}
              >
                Write a short review (optional)
              </label>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                rows={4}
                placeholder="What did you enjoy the most?"
                className="mt-1 w-full rounded-lg border p-2 text-sm focus:outline-none focus:ring-2"
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                  color: '#FFFFFF',
                  placeholderColor: '#80B0FF',
                }}
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={closeReviewPrompt}
                className="px-3 py-2 text-xs sm:text-sm rounded-md transition-colors"
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  color: '#FFFFFF',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReview}
                className="px-3 py-2 text-xs sm:text-sm rounded-md transition-colors"
                style={{
                  background: '#1E90FF',
                  color: '#FFFFFF',
                }}
              >
                Submit Review
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
