import React, { useState } from 'react'

/**
 * CategoryStyledBookCard — Premium themed cards with:
 *
 * • Category background images (school / fairy castle / healthy mind)
 * • Dark overlay for readability
 * • Dodger Blue (#1E90FF) glowing borders globally
 * • Hover-intensified glow effect
 * • Zero purple styling
 */

// ── Background image map ──
const backgroundImages = {
  educational: '/images/school.jpg',
  fiction: '/images/fairycastle.png',
  'self-help': '/images/healthymind.png',
}

// ── Theme palettes (zero purple — only blue/teal accents) ──
const themes = {
  educational: {
    accent: '#1E90FF',
    accentDark: '#93C5FD',
    fontFamily: "'Georgia', 'DM Serif Display', serif",
    badgeLabel: '🎓 Educational',
    badgeBg: 'rgba(30, 144, 255, 0.15)',
    badgeBgDark: 'rgba(30, 144, 255, 0.25)',
    badgeText: '#fff',
    badgeTextDark: '#93C5FD',
  },
  fiction: {
    accent: '#1E90FF',
    accentDark: '#60A5FA',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    badgeLabel: '✨ Fiction',
    badgeBg: 'rgba(30, 144, 255, 0.15)',
    badgeBgDark: 'rgba(30, 144, 255, 0.25)',
    badgeText: '#fff',
    badgeTextDark: '#60A5FA',
  },
  'self-help': {
    accent: '#1E90FF',
    accentDark: '#5EEAD4',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    badgeLabel: '🌿 Self-Help',
    badgeBg: 'rgba(30, 144, 255, 0.15)',
    badgeBgDark: 'rgba(30, 144, 255, 0.25)',
    badgeText: '#fff',
    badgeTextDark: '#5EEAD4',
  },
}

// Fallback cover gradient palettes per type
const coverColors = {
  educational: [
    ['#0d47a1', '#1565c0'], ['#1a237e', '#283593'], ['#004d40', '#00695c'], ['#263238', '#37474f'],
  ],
  fiction: [
    ['#e63946', '#a4133c'], ['#1E90FF', '#0066cc'], ['#06aed5', '#086788'], ['#f4a261', '#e76f51'],
  ],
  'self-help': [
    ['#1b5e20', '#2e7d32'], ['#00695c', '#00897b'], ['#2e7d32', '#43a047'], ['#0277bd', '#0288d1'],
  ],
}

export default function CategoryStyledBookCard({
  book,
  index = 0,
  children,
  statusBadge,
  onClick,
  forceDodgerOutline = false,
}) {
  const [imgError, setImgError] = useState(false)
  const [hovered, setHovered] = useState(false)

  const type = book.type || 'fiction'
  const t = themes[type] || themes.fiction
  const isDark = document.documentElement.classList.contains('dark')
  const bgImage = backgroundImages[type] || backgroundImages.fiction

  // ── Cover renderer ──
  const renderCover = () => {
    const cover = book.coverImage || book.cover
    const isDataUrl = cover && (cover.startsWith('data:') || cover.startsWith('blob:'))

    if (!cover || imgError || isDataUrl) {
      const palette = coverColors[type] || coverColors.fiction
      const pair = palette[index % palette.length]
      return (
        <div
          className="w-32 h-48 rounded-lg flex items-center justify-center text-center p-3 shrink-0 card-cover-lift"
          style={{ background: `linear-gradient(135deg, ${pair[0]} 0%, ${pair[1]} 100%)` }}
        >
          <span className="text-white font-bold text-xs leading-tight drop-shadow">{book.title}</span>
        </div>
      )
    }

    return (
      <img
        src={cover}
        alt={book.title}
        className="w-32 h-48 object-cover rounded-lg shrink-0 card-cover-lift"
        onError={() => setImgError(true)}
      />
    )
  }

  // ── Dodger Blue glow (always on, intensified on hover) ──
  const dodgerGlow = hovered
    ? '0 0 12px #1E90FF, 0 0 24px rgba(30,144,255,0.9), 0 0 40px rgba(30,144,255,0.7)'
    : '0 0 8px #1E90FF, 0 0 16px rgba(30,144,255,0.7), 0 0 24px rgba(30,144,255,0.5)'

  return (
    <div
      className="category-card relative rounded-2xl p-4 sm:p-5 flex flex-col overflow-hidden"
      style={{
        backgroundImage: `url(${bgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        border: '2px solid #1E90FF',
        boxShadow: dodgerGlow,
        fontFamily: t.fontFamily,
        cursor: onClick ? 'pointer' : 'default',
        transform: hovered ? 'translateY(-6px)' : 'translateY(0)',
        transition: 'all 0.25s ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] rounded-2xl" />

      {/* Status badge (top-right) */}
      {statusBadge && (
        <div className="absolute top-2.5 right-2.5 z-10">
          {statusBadge}
        </div>
      )}

      {/* Top row: cover + info */}
      <div className="flex gap-4 relative z-[2]">
        {renderCover()}

        <div className="flex flex-col flex-1 min-w-0">
          {/* Category badge */}
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit mb-2"
            style={{
              backgroundColor: isDark ? t.badgeBgDark : t.badgeBg,
              color: isDark ? t.badgeTextDark : t.badgeText,
            }}
          >
            {t.badgeLabel}
          </span>

          {/* Title */}
          <h3
            className="text-sm sm:text-base font-bold leading-snug mb-1 line-clamp-2"
            style={{ color: '#fff' }}
          >
            {book.title}
          </h3>

          <p className="text-xs text-slate-300 mb-2 line-clamp-1">{book.author}</p>

          {/* Genre tag */}
          {book.genre && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold w-fit mb-1.5 inline-block"
              style={{
                backgroundColor: 'rgba(30, 144, 255, 0.1)',
                color: '#93C5FD',
                border: '1px solid rgba(30, 144, 255, 0.3)',
              }}
            >
              {book.genre}
            </span>
          )}

          {/* Emotion tags */}
          {book.emotion_tags && book.emotion_tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-auto">
              {book.emotion_tags.slice(0, 3).map((tag, i) => (
                <span
                  key={i}
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: 'rgba(30, 144, 255, 0.2)',
                    color: '#93C5FD',
                    border: '1px solid rgba(30, 144, 255, 0.35)',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Synopsis */}
      {book.synopsis && (
        <p className="text-xs text-slate-300 mt-3 line-clamp-2 relative z-[2]">
          {book.synopsis}
        </p>
      )}

      {/* Score row — personality match + quantum indicator */}
      {(book.personality_match !== undefined || book.score !== undefined) && (
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/10 relative z-[2]">
          <span className="text-xs text-slate-300">
            {book.personality_match !== undefined ? (
              <>
                Personality Match:{' '}
                <strong style={{ color: '#1E90FF' }}>
                  {book.personality_match.toFixed(1)}%
                </strong>
              </>
            ) : (
              <>
                Match:{' '}
                <strong style={{ color: '#1E90FF' }}>
                  {(book.score * 100).toFixed(1)}%
                </strong>
              </>
            )}
          </span>
          {book.quantum_similarity !== undefined && (
            <span className="text-xs italic text-slate-400">⚛️ Quantum</span>
          )}
        </div>
      )}

      {book.reason && (
        <p className="text-xs italic text-slate-300 mt-2 relative z-[2]">💡 {book.reason}</p>
      )}

      {/* Children slot — for buttons, notes panel, etc. */}
      {children && <div className="mt-3 relative z-[2]">{children}</div>}
    </div>
  )
}
