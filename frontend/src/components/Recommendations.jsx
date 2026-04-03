import React, { useMemo, useState } from 'react'
import EducationalInsightPanel from './EducationalInsightPanel'
import ReadingInsightsPanel from './ReadingInsightsPanel'
import CategoryStyledBookCard from './CategoryStyledBookCard'
import SkeletonLoader from './SkeletonLoader'
import { getApiBase } from '../utils/apiBase'

function normalizeKeyPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildBookKey(book) {
  const id = normalizeKeyPart(book?.id)
  if (id) return `id:${id}`
  const title = normalizeKeyPart(book?.title)
  const author = normalizeKeyPart(book?.author)
  return `ta:${title}::${author}`
}

function buildLooseTitleKey(book) {
  return `t:${normalizeKeyPart(book?.title)}`
}

function isEducationalBook(book) {
  const raw = String(book?.type || book?.category || '').trim().toLowerCase()
  return raw === 'educational'
}

export default function Recommendations({ recommendations = [], onAddToCurrentlyReading, loading = false, currentUsername = '', currentlyReadingBooks = [] }) {
  const [message, setMessage] = useState('')
  const API_BASE = getApiBase()
  const currentlyReadingKeySet = useMemo(
    () => new Set(currentlyReadingBooks.map((book) => buildBookKey(book))),
    [currentlyReadingBooks]
  )
  const currentlyReadingTitleKeySet = useMemo(
    () => new Set(currentlyReadingBooks.map((book) => buildLooseTitleKey(book))),
    [currentlyReadingBooks]
  )

  if (loading) {
    return <SkeletonLoader count={6} variant="card" />
  }

  if (!recommendations.length) {
    return (
      <div className="text-center text-on-light py-8 sm:py-12 text-sm sm:text-lg">No recommendations yet. Try entering a prompt above!</div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
      {recommendations.map((book, idx) => {
        const rawType = String(book.type || '').trim().toLowerCase()
        const normalizedType = rawType === 'self_help' || rawType === 'self help' ? 'self-help' : rawType
        const isEducational = isEducationalBook(book)
        const isSelfHelp = normalizedType === 'self-help'
        const isAlreadyCurrentlyReading =
          currentlyReadingKeySet.has(buildBookKey(book)) ||
          currentlyReadingTitleKeySet.has(buildLooseTitleKey(book))

        return (
          <CategoryStyledBookCard
            key={idx}
            book={book}
            index={idx}
            forceDodgerOutline
            enableSynopsisToggle
            synopsisPreviewChars={140}
            statusBadge={
              isAlreadyCurrentlyReading ? (
                <span className="ribbon-banner">
                  Currently Reading
                </span>
              ) : null
            }
          >
            <>
          {/* Select button */}
          {!isAlreadyCurrentlyReading && (
            <button
              onClick={async () => {
                setMessage('');
                
                if (onAddToCurrentlyReading) {
                  onAddToCurrentlyReading(book);
                }
                
                try {
                  const payload = {
                    book_name: book.title,
                    genre: book.genre,
                    theme: (book.emotion_tags && book.emotion_tags[0]) || book.mood || book.tone,
                    username: (currentUsername || '').trim().toLowerCase() || undefined,
                  };
                  const res = await fetch(`${API_BASE}/api/v1/select_book`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                  });
                  const data = await res.json();
                  if (res.ok) {
                    setMessage(isEducational ? '✓ Added to Educational Reads!' : '✓ Added to Currently Reading!')
                  } else {
                    setMessage('Failed to save selection: ' + (data.error || JSON.stringify(data)))
                  }
                } catch (e) {
                  setMessage('Error saving selection: ' + e.message)
                }
                setTimeout(() => setMessage(''), 3000)
              }}
              className="w-full inline-flex items-center justify-center rounded-md text-white px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition"
              style={{ backgroundColor: isEducational ? '#059669' : isSelfHelp ? '#0D9488' : '#1E90FF' }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.88'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              {isEducational ? '🎓 Start Learning' : isSelfHelp ? '🌿 Start Reading' : '✨ Select to Read'}
            </button>
          )}
          {message && <div className="text-xs sm:text-sm mt-2 text-cool-slate">{message}</div>}

          {/* Buy Online button */}
          {book.buy_link && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                window.open(book.buy_link, '_blank', 'noopener,noreferrer')
              }}
              className="w-full inline-flex items-center justify-center rounded-md px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition bg-amber-600 hover:bg-amber-700 text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              🛒 Buy Online
            </button>
          )}

          {isEducational ? (
            <EducationalInsightPanel book={book} />
          ) : (
            <ReadingInsightsPanel book={book} />
          )}
            </>
          </CategoryStyledBookCard>
        )
      })}
    </div>
  );
}
