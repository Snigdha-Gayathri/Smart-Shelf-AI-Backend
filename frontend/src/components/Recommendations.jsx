import React, { useState } from 'react'
import EducationalInsightPanel from './EducationalInsightPanel'
import ReadingInsightsPanel from './ReadingInsightsPanel'
import CategoryStyledBookCard from './CategoryStyledBookCard'
import SkeletonLoader from './SkeletonLoader'

export default function Recommendations({ recommendations = [], onAddToCurrentlyReading, loading = false, currentUsername = '' }) {
  const [message, setMessage] = useState('')
  const API_BASE = (import.meta.env.VITE_BACKEND_URL || '').trim() || (import.meta.env.PROD ? window.location.origin : '')

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
      {recommendations.map((book, idx) => (
        <CategoryStyledBookCard key={idx} book={book} index={idx} forceDodgerOutline>
          {(() => {
            const rawType = String(book.type || '').trim().toLowerCase()
            const normalizedType = rawType === 'self_help' || rawType === 'self help' ? 'self-help' : rawType
            const isEducational = normalizedType === 'educational'
            const isSelfHelp = normalizedType === 'self-help'

            return (
              <>
          {/* Select button */}
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
          {message && <div className="text-xs sm:text-sm mt-2 text-cool-slate">{message}</div>}

          {isEducational ? (
            <EducationalInsightPanel book={book} />
          ) : (
            <ReadingInsightsPanel book={book} />
          )}
              </>
            )
          })()}
        </CategoryStyledBookCard>
      ))}
    </div>
  );
}
