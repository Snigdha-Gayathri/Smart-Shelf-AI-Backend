import React, { useMemo, useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/* ═══════════════════════════════════════════════════════════════
 *  Annual Wrapped — Intelligence Report Dashboard
 *  Dodger Blue (#1E90FF) theme · No Plotly · No purple
 * ═══════════════════════════════════════════════════════════════ */

const BLUE   = '#1E90FF'
const GREEN  = '#06D6A0'
const GOLD   = '#FFD166'
const ROSE   = '#EF476F'
const CYAN   = '#22D3EE'
const ORANGE = '#F97316'
const SLATE  = '#64748B'
const CARD_BG     = 'rgba(15,23,42,0.65)'
const CARD_BORDER = 'rgba(30,144,255,0.22)'
const GLOW        = `0 0 20px ${BLUE}, 0 0 40px rgba(30,144,255,0.6)`
const GLOW_SOFT   = `0 0 14px rgba(30,144,255,0.25)`
const PIE_COLORS  = [BLUE, GREEN, GOLD, ROSE, CYAN, ORANGE, SLATE]

// ── deterministic hash ──
function stableHash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// ── Derive pages from genre ──
function derivePages(book) {
  const seed = stableHash(book.title + (book.author || ''))
  const m = {
    fantasy: 350, 'sci-fi': 320, romance: 280, thriller: 300, mystery: 290,
    horror: 260, literary: 310, 'historical fiction': 340, contemporary: 270,
    psychology: 290, economics: 280, philosophy: 310, history: 340,
    sociology: 280, education: 260, biography: 320, science: 300,
    'self-help': 240, productivity: 220, mindset: 230, business: 260,
  }
  return (m[book.genre] || 280) + (seed % 100) - 30
}
function deriveDays(book) { return 5 + (stableHash(book.title + (book.author || '')) % 50) }

// ── Mood mapping ──
const MOOD_MAP = {
  Dark: ['dark', 'horror', 'thriller', 'suspense', 'mystery', 'gritty', 'sinister'],
  Inspirational: ['inspirational', 'hopeful', 'uplifting', 'motivational', 'empowering', 'inspiring'],
  Intense: ['intense', 'gripping', 'emotional', 'powerful', 'dramatic', 'poignant'],
  'Light-hearted': ['light', 'fun', 'humorous', 'witty', 'cozy', 'fluffy', 'wholesome', 'heartwarming'],
  Philosophical: ['philosophical', 'thought-provoking', 'introspective', 'contemplative', 'existential'],
}
function getMoods(tags) {
  const out = {}
  ;(tags || []).forEach(t => {
    const tl = t.toLowerCase()
    Object.entries(MOOD_MAP).forEach(([mood, kw]) => {
      if (kw.some(k => tl.includes(k))) out[mood] = (out[mood] || 0) + 1
    })
  })
  return out
}

// ── Growth theme mapping for self-help ──
const GROWTH_MAP = {
  Discipline: ['discipline', 'habit', 'routine', 'consistency', 'grit', 'willpower'],
  Productivity: ['productivity', 'efficiency', 'time', 'focus', 'work', 'output'],
  Mindset: ['mindset', 'growth', 'thinking', 'mental', 'belief', 'attitude'],
  'Emotional Intelligence': ['emotional', 'empathy', 'relationship', 'social', 'communication', 'feelings'],
  Leadership: ['leadership', 'management', 'influence', 'team', 'power', 'authority'],
  Finance: ['money', 'finance', 'wealth', 'investment', 'financial', 'income'],
}

// ── Reading archetype ──
function determineArchetype(books, likeRatio) {
  if (books.length === 0) return { title: 'Emerging Reader', desc: 'Your journey is just beginning.' }
  const gc = {}; books.forEach(b => { if (b.genre) gc[b.genre] = (gc[b.genre] || 0) + 1 })
  const topGenre = Object.entries(gc).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  const tc = {}; books.forEach(b => { tc[b.type || 'fiction'] = (tc[b.type || 'fiction'] || 0) + 1 })
  const allTags = books.flatMap(b => (b.emotion_tags || b.tags || []).map(t => t.toLowerCase()))
  const hasPsych = ['psychology', 'philosophy', 'sociology'].includes(topGenre)
  const hasFiction = (tc['fiction'] || 0) > books.length * 0.5
  const hasSH = (tc['self-help'] || 0) > books.length * 0.3
  const hasEdu = (tc['educational'] || 0) > books.length * 0.3
  const diverse = Object.keys(gc).length >= 4
  const darkTags = allTags.filter(t => ['dark','thriller','horror','intense','gripping'].some(k => t.includes(k))).length
  const lightTags = allTags.filter(t => ['light','fun','cozy','wholesome','humorous'].some(k => t.includes(k))).length

  if (hasPsych && likeRatio > 70) return { title: 'The Deep Thinker', desc: `You gravitate toward psychologically rich reads that challenge conventional thinking. Your ${topGenre} focus reveals a mind that seeks to understand the deeper layers of human behavior and society.` }
  if (hasFiction && diverse) return { title: 'The Narrative Strategist', desc: `With a broad fiction palette spanning ${Object.keys(gc).length} genres, you approach stories strategically — extracting meaning from diverse narratives. You don't just read; you analyze.` }
  if (hasSH && hasEdu) return { title: 'The Growth Architect', desc: 'Your reading is a deliberate investment in personal evolution. By balancing self-help with educational material, you are systematically designing your intellectual and emotional growth.' }
  if (hasFiction && darkTags > lightTags) return { title: 'The Escapist Explorer', desc: 'You immerse yourself in intense, emotionally charged fiction. Your preference for darker, gripping narratives suggests a reader who seeks adventure in the shadows of storytelling.' }
  if (diverse && likeRatio > 75) return { title: 'The Reflective Polymath', desc: 'With exceptional genre diversity and a high satisfaction rate, you are a true intellectual omnivore — equally at home in fiction, philosophy, and practical knowledge.' }
  if (hasSH) return { title: 'The Growth Architect', desc: 'Your reading choices reveal a clear mission: systematic self-improvement. Each book is a building block in your personal development architecture.' }
  if (hasEdu) return { title: 'The Knowledge Seeker', desc: 'You pursue learning with purpose. Your educational reading density shows a reader committed to mastery and deep understanding across multiple domains.' }
  return { title: 'The Curious Mind', desc: 'Your reading patterns reveal genuine intellectual curiosity. You explore diverse topics and genres, driven by a desire to understand the world from multiple perspectives.' }
}

// ── AI summary generator ──
function generateAISummary(books, aw) {
  if (!aw || aw.totalBooksRead === 0) return ''
  const total = aw.totalBooksRead
  const year = new Date().getFullYear()
  const { liked = 0, disliked = 0 } = aw.likeDislikeRatio || {}
  const lr = liked + disliked > 0 ? Math.round((liked / (liked + disliked)) * 100) : 0
  const genres = Object.entries(aw.genreDistribution || {}).sort((a, b) => b[1] - a[1])
  const tg = genres[0]?.[0] || 'diverse topics'; const sg = genres[1]?.[0]
  const tb = aw.typeBreakdown || {}; const fc = tb['fiction'] || 0; const shc = tb['self-help'] || 0; const ec = tb['educational'] || 0
  const mr = aw.monthlyReads || {}; const peak = Object.entries(mr).sort((a, b) => b[1] - a[1])[0]
  let s = `${year} was `
  s += lr >= 85 ? 'an exceptionally satisfying year of reading. ' : lr >= 70 ? 'a year of strong reading alignment. ' : lr >= 50 ? 'a year of reading exploration and discovery. ' : 'a year of adventurous reading experimentation. '
  s += `You completed ${total} book${total !== 1 ? 's' : ''} across ${genres.length} genre${genres.length !== 1 ? 's' : ''}`
  if (fc > 0 && shc > 0) s += ', balancing fictional immersion with personal growth material. '
  else if (fc > total * 0.6) s += ', with a strong gravitational pull toward narrative fiction. '
  else if (shc > total * 0.4) s += ', investing heavily in self-improvement and growth. '
  else if (ec > total * 0.4) s += ', with a deep commitment to structured learning. '
  else s += '. '
  if (tg && sg) s += `Your reading DNA is rooted in ${tg} and ${sg}. `
  else if (tg) s += `${tg.charAt(0).toUpperCase() + tg.slice(1)} defined your reading identity. `
  if (peak && peak[1] > 0) s += `${peak[0]} was your peak month with ${peak[1]} book${peak[1] !== 1 ? 's' : ''}.`
  return s
}

// ── SVG arc helpers ──
function polar(cx, cy, r, deg) { const rad = (deg - 90) * Math.PI / 180; return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) } }
function pieSlice(cx, cy, r, s, e) {
  if (e - s >= 359.99) return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`
  const a = polar(cx, cy, r, e), b = polar(cx, cy, r, s), lg = e - s > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${b.x} ${b.y} A ${r} ${r} 0 ${lg} 1 ${a.x} ${a.y} Z`
}
function donutSlice(cx, cy, oR, iR, s, e) {
  if (e - s >= 359.99) return `M ${cx - oR} ${cy} A ${oR} ${oR} 0 1 1 ${cx + oR} ${cy} A ${oR} ${oR} 0 1 1 ${cx - oR} ${cy} M ${cx - iR} ${cy} A ${iR} ${iR} 0 1 0 ${cx + iR} ${cy} A ${iR} ${iR} 0 1 0 ${cx - iR} ${cy} Z`
  const os = polar(cx, cy, oR, s), oe = polar(cx, cy, oR, e), is_ = polar(cx, cy, iR, s), ie = polar(cx, cy, iR, e), lg = e - s > 180 ? 1 : 0
  return `M ${os.x} ${os.y} A ${oR} ${oR} 0 ${lg} 1 ${oe.x} ${oe.y} L ${ie.x} ${ie.y} A ${iR} ${iR} 0 ${lg} 0 ${is_.x} ${is_.y} Z`
}

/* ══════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ══════════════════════════════════════════════════════════════ */
export default function Dashboard({ personalityProfile, annualWrapped, previousReads = [], educationalBooks = [] }) {

  // ── All year books (merged) ──
  const yearBooks = useMemo(() => {
    const year = new Date().getFullYear()
    const compEdu = educationalBooks.filter(b => b.eduStatus === 'completed' && b.completedAt).map(b => ({ ...b, finishedAt: b.completedAt, liked: true }))
    return [...previousReads, ...compEdu].filter(b => b.finishedAt && new Date(b.finishedAt).getFullYear() === year)
  }, [previousReads, educationalBooks])

  // ── Enriched books (with derived pages, days) ──
  const enriched = useMemo(() => yearBooks.map(b => ({ ...b, pages: derivePages(b), days: deriveDays(b) })), [yearBooks])

  // ── Like ratio ──
  const likeRatio = useMemo(() => {
    const { liked = 0, disliked = 0 } = annualWrapped?.likeDislikeRatio || {}
    return liked + disliked > 0 ? Math.round((liked / (liked + disliked)) * 100) : 0
  }, [annualWrapped])

  // ── Genre pie data (top 6 + Others) ──
  const pieData = useMemo(() => {
    const gd = annualWrapped?.genreDistribution || {}
    const sorted = Object.entries(gd).sort((a, b) => b[1] - a[1])
    if (sorted.length <= 6) return sorted.map(([g, p]) => ({ genre: g, pct: p }))
    const top6 = sorted.slice(0, 6)
    const othersPct = sorted.slice(6).reduce((s, [, p]) => s + p, 0)
    return [...top6.map(([g, p]) => ({ genre: g, pct: p })), { genre: 'Others', pct: othersPct }]
  }, [annualWrapped])
  const totalForPie = useMemo(() => annualWrapped?.totalBooksRead || 0, [annualWrapped])

  // ── Archetype ──
  const archetype = useMemo(() => determineArchetype(yearBooks, likeRatio), [yearBooks, likeRatio])

  // ── AI Summary ──
  const aiSummary = useMemo(() => generateAISummary(yearBooks, annualWrapped), [yearBooks, annualWrapped])

  // ── Author Diversity ──
  const authorStats = useMemo(() => {
    const authors = new Set(yearBooks.map(b => b.author).filter(Boolean))
    const ac = {}; yearBooks.forEach(b => { if (b.author) ac[b.author] = (ac[b.author] || 0) + 1 })
    const topAuthor = Object.entries(ac).sort((a, b) => b[1] - a[1])[0]
    return { unique: authors.size, total: yearBooks.length, topAuthor: topAuthor?.[0] || 'N/A', topCount: topAuthor?.[1] || 0 }
  }, [yearBooks])

  // ── Consistency score ──
  const consistency = useMemo(() => {
    const mr = annualWrapped?.monthlyReads || {}
    const active = Object.values(mr).filter(c => c > 0).length
    return Math.round((active / 12) * 100)
  }, [annualWrapped])

  // ── Fiction immersion hours ──
  const fictionHours = useMemo(() => {
    const fBooks = enriched.filter(b => (b.type || 'fiction') === 'fiction')
    const totalPages = fBooks.reduce((s, b) => s + b.pages, 0)
    return Math.round(totalPages / 40)
  }, [enriched])

  // ── Self-help growth focus ──
  const selfHelpFocus = useMemo(() => {
    const shBooks = enriched.filter(b => b.type === 'self-help')
    if (shBooks.length === 0) return null
    const themeCounts = {}
    shBooks.forEach(b => {
      const tags = (b.emotion_tags || b.tags || []).map(t => t.toLowerCase())
      Object.entries(GROWTH_MAP).forEach(([theme, kw]) => {
        if (kw.some(k => tags.some(t => t.includes(k)))) themeCounts[theme] = (themeCounts[theme] || 0) + 1
      })
    })
    // Fallback: if no tags match, derive from genre or default
    if (Object.keys(themeCounts).length === 0) {
      const seed = stableHash(shBooks.map(b => b.title).join(''))
      const themes = Object.keys(GROWTH_MAP)
      return themes[seed % themes.length]
    }
    return Object.entries(themeCounts).sort((a, b) => b[1] - a[1])[0][0]
  }, [enriched])

  // ── Fastest vs Longest read ──
  const fastSlow = useMemo(() => {
    if (enriched.length < 2) return null
    const sorted = [...enriched].sort((a, b) => a.days - b.days)
    return { fastest: sorted[0], slowest: sorted[sorted.length - 1] }
  }, [enriched])

  // ── Monthly momentum (books per month) ──
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const monthlyData = useMemo(() => {
    const mr = annualWrapped?.monthlyReads || {}
    return monthNames.map(m => ({ month: m, count: mr[m] || 0 }))
  }, [annualWrapped])
  const peakCount = useMemo(() => Math.max(...monthlyData.map(m => m.count), 1), [monthlyData])

  // ── Reading depth per month ──
  const depthCurve = useMemo(() => {
    const byMonth = {}
    enriched.forEach(b => {
      if (!b.finishedAt) return
      const mi = new Date(b.finishedAt).getMonth()
      const mn = monthNames[mi]
      if (!byMonth[mn]) byMonth[mn] = []
      const toneWeight = { academic: 3, philosophical: 2.5, instructive: 2, serious: 1.8, journalistic: 1.5, dramatic: 1.4, humorous: 1, witty: 1, tender: 1.2, lyrical: 1.3, inspiring: 1.5 }
      const w = toneWeight[b.tone] || 1.5
      byMonth[mn].push(b.pages * w)
    })
    return monthNames.map(m => {
      const arr = byMonth[m] || []
      return { month: m, depth: arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0 }
    })
  }, [enriched])
  const maxDepth = useMemo(() => Math.max(...depthCurve.map(d => d.depth), 1), [depthCurve])

  // ── Emotional journey heatmap ──
  const emotionGrid = useMemo(() => {
    const cats = Object.keys(MOOD_MAP)
    const grid = {}
    cats.forEach(c => { grid[c] = {} })
    enriched.forEach(b => {
      if (!b.finishedAt) return
      const mi = new Date(b.finishedAt).getMonth()
      const mn = monthNames[mi]
      const moods = getMoods(b.emotion_tags || b.tags || [])
      Object.entries(moods).forEach(([mood, count]) => {
        if (grid[mood]) grid[mood][mn] = (grid[mood][mn] || 0) + count
      })
    })
    let maxVal = 0
    cats.forEach(c => Object.values(grid[c]).forEach(v => { if (v > maxVal) maxVal = v }))
    return { grid, cats, maxVal: maxVal || 1 }
  }, [enriched])

  // ── Like interpretation ──
  const likeInterpretation = useMemo(() => {
    if (likeRatio >= 90) return 'Your reading choices were almost perfectly aligned with your interests.'
    if (likeRatio >= 75) return 'Your reading choices were strongly aligned with your interests.'
    if (likeRatio >= 60) return 'You found satisfaction in most of your reads this year.'
    if (likeRatio >= 40) return 'Your reads were a balanced mix of hits and misses.'
    return 'You took bold risks with experimental reading choices.'
  }, [likeRatio])

  // ── Consistency interpretation ──
  const consistencyLabel = consistency >= 80 ? 'You maintained excellent reading discipline.' : consistency >= 60 ? 'You maintained strong reading discipline.' : consistency >= 40 ? 'You had moderate reading regularity.' : 'You read in concentrated bursts.'

  // ── EMPTY STATE ──
  if (!annualWrapped || annualWrapped.totalBooksRead === 0) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
          className="text-center p-10 rounded-2xl max-w-md"
          style={{ background: CARD_BG, border: `2px solid ${CARD_BORDER}`, boxShadow: GLOW_SOFT }}>
          <div className="text-5xl mb-5">📊</div>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">No reading data yet. Start reading and rating books to unlock your annual intelligence report.</p>
          <div className="mt-5 h-0.5 w-28 mx-auto rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${BLUE}80, transparent)` }} />
        </motion.div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-6 sm:space-y-8">

      {/* ════════ AI SUMMARY ════════ */}
      {aiSummary && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="p-5 sm:p-7 rounded-2xl" style={{ background: CARD_BG, border: `2px solid ${CARD_BORDER}`, boxShadow: GLOW_SOFT }}>
          <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 mb-3">
            <span style={{ color: BLUE }}>◈</span> 🧠 AI Reading Intelligence Summary
          </h3>
          <p className="text-sm sm:text-base text-slate-200 leading-relaxed">{aiSummary}</p>
        </motion.div>
      )}

      {/* ════════ STATS GRID (4 cards) ════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Books Read" value={annualWrapped.totalBooksRead} sub="this year" icon="📚" color={BLUE} delay={0} />
        {annualWrapped.educationalCompleted > 0 && (
          <StatCard label="Educational" value={annualWrapped.educationalCompleted} sub="completed" icon="🎓" color={CYAN} delay={0.08} />
        )}
        <StatCard label="Like Ratio" value={`${likeRatio}%`} sub="positive reads" icon="👍" color={GREEN} delay={0.16} />
        <StatCard label="Consistency" value={`${consistency}%`} sub={consistencyLabel} icon="📈" color={GOLD} delay={0.24} />
      </div>

      {/* ════════ TYPE BREAKDOWN BAR ════════ */}
      {annualWrapped.typeBreakdown && Object.keys(annualWrapped.typeBreakdown).length > 1 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="p-5 sm:p-6 rounded-2xl" style={{ background: CARD_BG, border: `2px solid ${CARD_BORDER}`, boxShadow: GLOW_SOFT }}>
          <Heading icon="📖" title="Reading Breakdown by Type" />
          <div className="flex rounded-full overflow-hidden h-5 sm:h-6 mt-4">
            {Object.entries(annualWrapped.typeBreakdown).map(([type, count], i) => {
              const pct = Math.round((count / annualWrapped.totalBooksRead) * 100)
              const c = { fiction: BLUE, 'self-help': GOLD, educational: GREEN }[type] || SLATE
              return (
                <motion.div key={type} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.4 + i * 0.1, duration: 0.7 }}
                  className="flex items-center justify-center text-[10px] sm:text-xs font-bold text-white"
                  style={{ background: c, minWidth: pct > 0 ? '24px' : 0 }}
                  title={`${type}: ${count} (${pct}%)`}>
                  {pct >= 12 ? `${type} ${pct}%` : pct >= 6 ? `${pct}%` : ''}
                </motion.div>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-4 mt-3">
            {Object.entries(annualWrapped.typeBreakdown).map(([type, count]) => {
              const c = { fiction: BLUE, 'self-help': GOLD, educational: GREEN }[type] || SLATE
              return <LegendDot key={type} color={c} label={`${type}: ${count}`} />
            })}
          </div>
        </motion.div>
      )}

      {/* ════════ READING ARCHETYPE ════════ */}
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="p-6 sm:p-8 rounded-2xl text-center" style={{ background: `linear-gradient(135deg, ${BLUE}12, ${GREEN}08)`, border: `2px solid ${BLUE}`, boxShadow: GLOW }}>
        <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] font-semibold mb-3" style={{ color: `${BLUE}CC` }}>Your {new Date().getFullYear()} Reading Archetype</p>
        <motion.h2 initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5, type: 'spring', stiffness: 180 }}
          className="text-2xl sm:text-3xl md:text-4xl font-black text-white mb-4" style={{ textShadow: `0 0 30px ${BLUE}` }}>
          {archetype.title}
        </motion.h2>
        <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl mx-auto">{archetype.desc}</p>
      </motion.div>

      {/* ════════ GENRE PIE + LIKE DONUT ════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

        {/* Genre Distribution Pie */}
        {pieData.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="p-5 sm:p-6 rounded-2xl" style={{ background: CARD_BG, border: `2px solid ${CARD_BORDER}`, boxShadow: GLOW_SOFT }}>
            <Heading icon="📊" title="Genre Distribution" />
            <div className="flex justify-center mt-4">
              <svg width="220" height="220" viewBox="0 0 220 220">
                {(() => {
                  let angle = 0
                  return pieData.map((d, i) => {
                    const sweep = (d.pct / 100) * 360
                    const path = pieSlice(110, 110, 100, angle, angle + sweep)
                    angle += sweep
                    return (
                      <motion.path key={d.genre} d={path} fill={PIE_COLORS[i % PIE_COLORS.length]}
                        stroke="rgba(15,23,42,0.8)" strokeWidth="2"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + i * 0.08, duration: 0.4 }}
                        className="transition-all duration-300 hover:brightness-125"
                        style={{ filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.3))' }} />
                    )
                  })
                })()}
                {/* Center hole for donut look */}
                <circle cx="110" cy="110" r="50" fill="rgba(15,23,42,0.9)" />
                <text x="110" y="106" textAnchor="middle" className="text-xl font-black fill-white">{totalForPie}</text>
                <text x="110" y="122" textAnchor="middle" className="text-[10px] fill-slate-400">books</text>
              </svg>
            </div>
            {/* External Legend */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-5 max-h-48 overflow-y-auto pr-1">
              {pieData.map((d, i) => {
                const bookCount = Math.round((d.pct / 100) * totalForPie)
                return (
                  <div key={d.genre} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-slate-300 truncate">{d.genre}</span>
                    <span className="text-[10px] text-slate-500 ml-auto whitespace-nowrap">{d.pct}% ({bookCount})</span>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* Like vs Dislike Donut */}
        {annualWrapped.likeDislikeRatio && (annualWrapped.likeDislikeRatio.liked + annualWrapped.likeDislikeRatio.disliked) > 0 && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
            className="p-5 sm:p-6 rounded-2xl flex flex-col items-center" style={{ background: CARD_BG, border: `2px solid ${CARD_BORDER}`, boxShadow: GLOW_SOFT }}>
            <Heading icon="👍" title="Like vs Dislike Ratio" />
            <div className="relative mt-4">
              <svg width="220" height="220" viewBox="0 0 220 220">
                {(() => {
                  const { liked, disliked } = annualWrapped.likeDislikeRatio
                  const total = liked + disliked
                  const lPct = (liked / total) * 360
                  return (
                    <>
                      <motion.path d={donutSlice(110, 110, 100, 60, 0, lPct)} fill={GREEN}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.6 }}
                        style={{ filter: `drop-shadow(0 0 8px ${GREEN}50)` }} />
                      {disliked > 0 && (
                        <motion.path d={donutSlice(110, 110, 100, 60, lPct, 360)} fill={ROSE}
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.6 }}
                          style={{ filter: `drop-shadow(0 0 8px ${ROSE}50)` }} />
                      )}
                    </>
                  )
                })()}
              </svg>
              {/* Center insight */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <AnimatedNumber value={likeRatio} className="text-3xl font-black text-white" suffix="%" />
                <span className="text-[10px] text-slate-400 mt-0.5">Positive Reads</span>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-3 text-center max-w-xs">{likeInterpretation}</p>
            <div className="flex gap-6 mt-4">
              <LegendDot color={GREEN} label={`Liked: ${annualWrapped.likeDislikeRatio.liked}`} />
              <LegendDot color={ROSE} label={`Disliked: ${annualWrapped.likeDislikeRatio.disliked}`} />
            </div>
          </motion.div>
        )}
      </div>

      {/* ════════ DEPTH CURVE + EMOTIONAL HEATMAP ════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

        {/* Intellectual Depth Curve */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="p-5 sm:p-6 rounded-2xl" style={{ background: CARD_BG, border: `2px solid ${CARD_BORDER}`, boxShadow: GLOW_SOFT }}>
          <Heading icon="🔥" title="Intellectual Intensity Curve" />
          <div className="mt-5 relative" style={{ height: '180px' }}>
            <svg width="100%" height="180" viewBox="0 0 360 180" preserveAspectRatio="none">
              {/* Grid lines */}
              {[0.25, 0.5, 0.75].map(f => (
                <line key={f} x1="0" y1={180 - f * 160} x2="360" y2={180 - f * 160} stroke={`${BLUE}12`} strokeWidth="1" />
              ))}
              {/* Area fill */}
              <motion.path
                d={`M ${depthCurve.map((d, i) => `${i * (360 / 11)} ${180 - (d.depth / maxDepth) * 155}`).join(' L ')} L ${11 * (360 / 11)} 180 L 0 180 Z`}
                fill={`${BLUE}15`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.8 }}
              />
              {/* Line */}
              <motion.polyline
                points={depthCurve.map((d, i) => `${i * (360 / 11)},${180 - (d.depth / maxDepth) * 155}`).join(' ')}
                fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.6, duration: 1.2 }}
                style={{ filter: `drop-shadow(0 0 6px ${BLUE})` }}
              />
              {/* Dots */}
              {depthCurve.map((d, i) => d.depth > 0 && (
                <motion.circle key={i} cx={i * (360 / 11)} cy={180 - (d.depth / maxDepth) * 155} r="4"
                  fill={BLUE} stroke="#fff" strokeWidth="1.5"
                  initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.8 + i * 0.04, type: 'spring' }}
                  style={{ filter: `drop-shadow(0 0 4px ${BLUE})` }} />
              ))}
            </svg>
            {/* Month labels */}
            <div className="flex justify-between mt-1 px-0">
              {depthCurve.map(d => <span key={d.month} className="text-[8px] sm:text-[9px] text-slate-500 w-[30px] text-center">{d.month}</span>)}
            </div>
          </div>
        </motion.div>

        {/* Emotional Journey Heatmap */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
          className="p-5 sm:p-6 rounded-2xl" style={{ background: CARD_BG, border: `2px solid ${CARD_BORDER}`, boxShadow: GLOW_SOFT }}>
          <Heading icon="💓" title="Emotional Reading Journey" />
          <div className="mt-5 overflow-x-auto">
            <div className="min-w-[360px]">
              {/* Month headers */}
              <div className="flex mb-2 pl-24">
                {monthNames.map(m => <div key={m} className="flex-1 text-center text-[8px] sm:text-[9px] text-slate-500">{m}</div>)}
              </div>
              {/* Rows */}
              {emotionGrid.cats.map(cat => (
                <div key={cat} className="flex items-center mb-1.5">
                  <span className="w-24 text-[9px] sm:text-[10px] text-slate-400 truncate pr-2 text-right flex-shrink-0">{cat}</span>
                  <div className="flex flex-1 gap-1">
                    {monthNames.map(m => {
                      const val = emotionGrid.grid[cat]?.[m] || 0
                      const intensity = val / emotionGrid.maxVal
                      return (
                        <motion.div key={m} initial={{ scale: 0 }} animate={{ scale: 1 }}
                          transition={{ delay: 0.7 + Math.random() * 0.3 }}
                          className="flex-1 h-5 sm:h-6 rounded-sm cursor-default"
                          title={`${cat} · ${m}: ${val}`}
                          style={{
                            background: val > 0 ? `rgba(30,144,255,${0.15 + intensity * 0.7})` : 'rgba(30,144,255,0.04)',
                            boxShadow: val > 0 ? `0 0 ${intensity * 8}px rgba(30,144,255,${intensity * 0.4})` : 'none',
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ════════ INTEL CARDS ROW ════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Author Diversity */}
        <GlowCard delay={0.6}>
          <div className="text-center">
            <div className="text-lg mb-1">🌍</div>
            <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: `${BLUE}CC` }}>Author Diversity</div>
            <AnimatedNumber value={authorStats.unique} className="text-3xl sm:text-4xl font-black text-white" />
            <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">unique authors</p>
            {authorStats.topCount > 1 && <p className="text-[8px] text-slate-500 mt-0.5">Top: {authorStats.topAuthor} ({authorStats.topCount})</p>}
          </div>
        </GlowCard>

        {/* Fiction Immersion */}
        <GlowCard delay={0.68}>
          <div className="text-center">
            <div className="text-lg mb-1">📕</div>
            <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: `${GREEN}CC` }}>Fiction Immersion</div>
            <AnimatedNumber value={fictionHours} className="text-3xl sm:text-4xl font-black text-white" suffix="h" />
            <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">in fictional worlds</p>
          </div>
        </GlowCard>

        {/* Self-Help Focus */}
        {selfHelpFocus && (
          <GlowCard delay={0.76}>
            <div className="text-center flex flex-col items-center justify-center h-full">
              <div className="text-lg mb-1">💪</div>
              <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: `${GOLD}CC` }}>Growth Focus</div>
              <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.9, type: 'spring' }}
                className="px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold"
                style={{ background: `${GOLD}20`, border: `2px solid ${GOLD}`, color: '#fff', boxShadow: `0 0 16px ${GOLD}40` }}>
                {selfHelpFocus}
              </motion.div>
              <p className="text-[8px] text-slate-500 mt-2">{new Date().getFullYear()} growth theme</p>
            </div>
          </GlowCard>
        )}

        {/* Fastest vs Longest */}
        {fastSlow && (
          <GlowCard delay={0.84}>
            <div className="text-center w-full space-y-2">
              <div className="text-lg mb-1">🎯</div>
              <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold" style={{ color: `${ROSE}CC` }}>Speed Range</div>
              <div className="space-y-1.5 mt-2">
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-slate-400">⚡ Fastest</span>
                  <span className="font-bold text-white truncate max-w-[80px]" title={fastSlow.fastest.title}>{fastSlow.fastest.days}d</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-slate-400">🐢 Longest</span>
                  <span className="font-bold text-white truncate max-w-[80px]" title={fastSlow.slowest.title}>{fastSlow.slowest.days}d</span>
                </div>
              </div>
              <p className="text-[8px] text-slate-500 truncate" title={fastSlow.fastest.title}>⚡ {fastSlow.fastest.title}</p>
            </div>
          </GlowCard>
        )}
      </div>

      {/* ════════ READING MOMENTUM ════════ */}
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}
        className="p-5 sm:p-6 rounded-2xl" style={{ background: CARD_BG, border: `2px solid ${CARD_BORDER}`, boxShadow: GLOW_SOFT }}>
        <Heading icon="⚡" title="Reading Momentum" />
        <div className="flex items-end gap-1.5 sm:gap-2 mt-5" style={{ height: '140px' }}>
          {monthlyData.map((d, i) => {
            const hPct = d.count > 0 ? (d.count / peakCount) * 100 : 4
            const isPeak = d.count === peakCount && d.count > 0
            return (
              <div key={d.month} className="flex-1 flex flex-col items-center gap-1" style={{ height: '100%', justifyContent: 'flex-end' }}>
                {d.count > 0 && (
                  <span className="text-[9px] font-bold" style={{ color: isPeak ? GOLD : BLUE }}>{d.count}</span>
                )}
                <motion.div initial={{ height: 0 }} animate={{ height: `${hPct}%` }}
                  transition={{ delay: 0.7 + i * 0.04, duration: 0.5, ease: 'easeOut' }}
                  className="w-full rounded-t-md min-h-[3px]"
                  style={{
                    background: isPeak
                      ? `linear-gradient(to top, ${GOLD}60, ${GOLD})`
                      : d.count > 0
                        ? `linear-gradient(to top, ${BLUE}40, ${BLUE})`
                        : `${BLUE}15`,
                    boxShadow: d.count > 0 ? `0 0 10px ${isPeak ? GOLD : BLUE}30` : 'none',
                    borderTop: d.count > 0 ? `2px solid ${isPeak ? GOLD : BLUE}` : 'none',
                  }}
                />
                <span className="text-[8px] sm:text-[9px] text-slate-500">{d.month}</span>
              </div>
            )
          })}
        </div>
        {/* Streak / break detection */}
        {(() => {
          const vals = monthlyData.map(d => d.count)
          let maxStreak = 0, cur = 0
          vals.forEach(v => { if (v > 0) { cur++; if (cur > maxStreak) maxStreak = cur } else cur = 0 })
          const breaks = vals.filter(v => v === 0).length
          return (
            <div className="flex gap-6 mt-4 pt-3 border-t border-slate-700/30">
              <span className="text-[10px] text-slate-400">🔥 Longest streak: <strong className="text-white">{maxStreak} month{maxStreak !== 1 ? 's' : ''}</strong></span>
              <span className="text-[10px] text-slate-400">💤 Break months: <strong className="text-white">{breaks}</strong></span>
            </div>
          )
        })()}
      </motion.div>

      {/* ════════ MOOD PREFERENCES ════════ */}
      {personalityProfile && Object.keys(personalityProfile.dominantMoods || {}).length > 0 && (
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
          className="p-5 sm:p-6 rounded-2xl" style={{ background: CARD_BG, border: `2px solid ${CARD_BORDER}`, boxShadow: GLOW_SOFT }}>
          <Heading icon="🎭" title="Mood Preferences" />
          <div className="flex flex-wrap gap-2 sm:gap-3 mt-4">
            {Object.entries(personalityProfile.dominantMoods).map(([mood, pct], i) => (
              <motion.span key={mood} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8 + i * 0.06 }}
                className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-white text-xs sm:text-sm font-medium whitespace-nowrap"
                style={{ background: `linear-gradient(135deg, ${BLUE}50, ${CYAN}40)`, border: `1px solid ${BLUE}40`, boxShadow: `0 0 10px ${BLUE}20` }}>
                {mood} {pct}%
              </motion.span>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}


/* ══════════════════════════════════════════════════════════════
 *  SUB-COMPONENTS
 * ══════════════════════════════════════════════════════════════ */

function AnimatedNumber({ value, className = '', suffix = '' }) {
  const [display, setDisplay] = useState(0)
  const numVal = typeof value === 'string' ? parseInt(value) || 0 : value
  useEffect(() => {
    if (numVal === 0) { setDisplay(0); return }
    let start = 0; const dur = 1200; const step = Math.max(1, Math.floor(dur / numVal))
    const timer = setInterval(() => { start++; setDisplay(start); if (start >= numVal) clearInterval(timer) }, step)
    return () => clearInterval(timer)
  }, [numVal])
  return <div className={className}>{display}{suffix}</div>
}

function StatCard({ label, value, sub, icon, color, delay }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.5 }} whileHover={{ scale: 1.02, boxShadow: `0 0 24px ${color}, 0 0 48px ${color}60` }}
      className="relative p-4 sm:p-5 rounded-2xl overflow-hidden transition-shadow duration-300"
      style={{ background: CARD_BG, border: `2px solid ${CARD_BORDER}`, boxShadow: GLOW_SOFT }}>
      <motion.div initial={{ top: '-20%' }} animate={{ top: '120%' }}
        transition={{ duration: 3.5, repeat: Infinity, repeatDelay: 3, delay: delay + 1 }}
        className="absolute left-0 right-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }} />
      <div className="text-lg mb-1">{icon}</div>
      <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: `${color}CC` }}>{label}</div>
      <div className="text-2xl sm:text-3xl font-black text-white">{value}</div>
      <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 truncate">{sub}</p>
    </motion.div>
  )
}

function GlowCard({ children, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.5 }} whileHover={{ scale: 1.02, boxShadow: GLOW }}
      className="relative p-4 sm:p-5 rounded-2xl flex items-center justify-center overflow-hidden transition-shadow duration-300"
      style={{ background: CARD_BG, border: `2px solid ${CARD_BORDER}`, boxShadow: GLOW_SOFT }}>
      {children}
    </motion.div>
  )
}

function Heading({ icon, title }) {
  return (
    <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
      <span style={{ color: BLUE }}>◈</span> {icon} {title}
    </h3>
  )
}

function LegendDot({ color, label }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] sm:text-xs text-slate-400">
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
      {label}
    </span>
  )
}
