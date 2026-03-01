import React, { useState } from 'react'
import EducationalInsightPanel from './EducationalInsightPanel'
import CategoryStyledBookCard from './CategoryStyledBookCard'
import SkeletonLoader from './SkeletonLoader'

export default function Recommendations({ recommendations = [], onAddToCurrentlyReading, loading = false }) {
  const [message, setMessage] = useState('')
  const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

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
                  theme: (book.emotion_tags && book.emotion_tags[0]) || book.mood || book.tone
                };
                const res = await fetch(`${API_BASE}/api/v1/select_book`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (res.ok) {
                  setMessage(book.type === 'educational' ? '✓ Added to Educational Reads!' : '✓ Added to Currently Reading!')
                } else {
                  setMessage('Failed to save selection: ' + (data.error || JSON.stringify(data)))
                }
              } catch (e) {
                setMessage('Error saving selection: ' + e.message)
              }
              setTimeout(() => setMessage(''), 3000)
            }}
            className="w-full inline-flex items-center justify-center rounded-md text-white px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition"
            style={{ backgroundColor: book.type === 'educational' ? '#059669' : book.type === 'self-help' ? '#0D9488' : '#1E90FF' }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.88'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            {book.type === 'educational' ? '🎓 Start Learning' : book.type === 'self-help' ? '🌿 Start Reading' : '✨ Select to Read'}
          </button>
          {message && <div className="text-xs sm:text-sm mt-2 text-cool-slate">{message}</div>}
          
          {/* Educational Insight Panel — only for educational books */}
          <EducationalInsightPanel book={book} />
        </CategoryStyledBookCard>
      ))}
    </div>
  );
}
