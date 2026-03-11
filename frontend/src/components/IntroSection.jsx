import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

const BLUE = '#1E90FF'
const GLOW = `0 0 20px ${BLUE}, 0 0 40px rgba(30,144,255,0.5)`
const GLOW_SOFT = `0 0 14px rgba(30,144,255,0.25)`

// Backend API base — falls back to same origin in production (Render)
const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BACKEND_URL
    ? import.meta.env.VITE_BACKEND_URL
    : ''
  ).trim() || (typeof window !== 'undefined' ? window.location.origin : '')



export default function IntroSection() {
  const [freeBooks, setFreeBooks] = useState([])

  useEffect(() => {
    fetch(`${API_BASE}/api/free-books`)
      .then(r => r.json())
      .then(data => setFreeBooks(data))
      .catch(() => setFreeBooks([]))
  }, [])

  return (
    <section
      className="relative w-full"
      style={{ minHeight: '100dvh', backgroundColor: '#0B4F8F' }}
    >
      {/* ── Background layers ── */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "url('/images/intro_library.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/35 to-black/55" />

      {/* ── Content ── */}
      <div
        className="relative z-10 w-full max-w-[1600px] mx-auto px-3 sm:px-6 md:px-8"
      >
        <div className="flex flex-col py-4 sm:py-8 md:py-10">
          <IntroContent freeBooks={freeBooks} />
        </div>
      </div>
    </section>
  )
}

function resolveDownloadUrl(downloadUrl) {
  if (!downloadUrl) return '#'
  if (/^https?:\/\//i.test(downloadUrl)) return downloadUrl
  return `${API_BASE}${downloadUrl.startsWith('/') ? '' : '/'}${downloadUrl}`
}

/* ═══════════════════════════════════════════════════════════
   Extracted content component — shared by mobile & desktop
   ═══════════════════════════════════════════════════════════ */
function IntroContent({ freeBooks }) {
  return (
    <>

          {/* Subtitle */}
          <motion.p
            className="text-sm sm:text-lg md:text-xl text-blue-100 drop-shadow-lg text-center mb-4 sm:mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.3 }}
          >
            Your friendly, quantum-powered reading companion
          </motion.p>

          {/* ─── Intro Message ─── */}
          <motion.div
            className="w-full mb-5 sm:mb-8"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.5 }}
          >
            <div
              className="relative rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-7 xl:p-8 text-sm sm:text-base md:text-[17px]"
              style={{
                background: 'rgba(255,255,255,0.10)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: `2px solid ${BLUE}`,
                boxShadow: GLOW,
              }}
            >

              <p className="whitespace-pre-line text-white/95 leading-relaxed font-medium drop-shadow-md">
{`Hi! I'm Q Lexi 🤍
I'm the little brain behind SmartShelf, and my job is to understand what you feel like reading — not just what you usually read.

When you tell SmartShelf your mood, preferences, or give feedback on books, I listen closely. Behind the scenes, I use PennyLane to simulate something called quantum thinking. Don't worry — it's not scary at all ✨

Quantum thinking lets me treat emotions and preferences like tiny spinning states that can exist together at the same time. You don't have just one mood — you might feel curious and emotional, calm and intense. I can hold all of that at once.

Instead of checking one option after another, I explore many possibilities simultaneously, comparing different combinations of genres, moods, and reading patterns. Then, I gently narrow them down to the ones that fit you best in that moment.

That's how I recommend books that don't just match your history —
they match your mood, your mindset, and your heart 💫`}
              </p>
            </div>
          </motion.div>

          {/* ─── Gift Section ─── */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.7 }}
          >
            {/* Gift Message */}
            <div
              className="rounded-xl sm:rounded-2xl p-3 sm:p-5 mb-4 sm:mb-6 text-xs sm:text-sm md:text-[15px]"
              style={{
                background: 'rgba(255,255,255,0.08)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                border: `2px solid ${BLUE}`,
                boxShadow: GLOW_SOFT,
              }}
            >
              <p className="text-white/95 leading-relaxed font-medium drop-shadow-md">
                Before you begin exploring, SmartShelf has a small gift for you.{' '}
                We've selected five books that you can download completely free — no limits, no conditions.{' '}
                Save them to your device and read them anytime, anywhere.{' '}
                Consider it our way of welcoming you. 🎁
              </p>
            </div>

            {/* 5 Free Books — single uniform row */}
            <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4 w-full">
              {freeBooks.map((book, i) => (
                <motion.div
                  key={book.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9 + i * 0.1, duration: 0.4 }}
                  className="group flex flex-col items-center"
                >
                  {/* Cover image with text fallback */}
                  <div
                    className="w-full aspect-[2/3] rounded-xl overflow-hidden mb-2.5 transition-all duration-300 group-hover:scale-105 group-hover:shadow-[0_0_18px_rgba(30,144,255,0.6)]"
                    style={{
                      background: 'linear-gradient(145deg, rgba(30,144,255,0.15), rgba(30,144,255,0.05))',
                      border: '2px solid rgba(30,144,255,0.4)',
                    }}
                  >
                    <img
                      src={book.cover}
                      alt={book.title}
                      className="w-full h-full object-cover"
                      onError={e => {
                        e.currentTarget.style.display = 'none'
                        e.currentTarget.parentElement.classList.add('flex', 'flex-col', 'items-center', 'justify-center')
                        e.currentTarget.parentElement.insertAdjacentHTML('beforeend',
                          `<span class="text-[10px] sm:text-xs font-bold text-white/90 text-center px-2 leading-tight">${book.title}</span>` +
                          (book.author ? `<span class="text-[8px] sm:text-[10px] text-white/50 mt-1 text-center px-2">${book.author}</span>` : '')
                        )
                      }}
                    />
                  </div>

                  {/* Download anchor */}
                  <a
                    href={resolveDownloadUrl(book.download_url)}
                    download
                    className="w-full text-center px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-white rounded-lg transition-all duration-300 hover:scale-105 no-underline block"
                    style={{
                      border: `1.5px solid ${BLUE}`,
                      background: 'rgba(30,144,255,0.12)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 0 14px ${BLUE}`; e.currentTarget.style.background = 'rgba(30,144,255,0.25)' }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.background = 'rgba(30,144,255,0.12)' }}
                  >
                    ⬇ Download
                  </a>
                </motion.div>
              ))}
            </div>
          </motion.div>
    </>
  )
}
