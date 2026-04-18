import React, { useMemo, useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/*
 * Annual Wrapped Intelligence Report Dashboard
 * Dodger Blue (#1E90FF) theme - No Plotly - No purple
 */

const BLUE   = '#1E90FF'
const GREEN  = '#06D6A0'
const GOLD   = '#FFD166'
const ROSE   = '#EF476F'
const CYAN   = '#22D3EE'
const ORANGE = '#F97316'
const SLATE  = '#64748B'
const CARD_BG     = 'rgba(15,23,42,0.65)'
const CARD_BORDER = 'rgba(30,144,255,0.22)'
const LIGHT_CARD_BG = 'linear-gradient(145deg, rgba(8,46,122,0.96) 0%, rgba(10,68,154,0.95) 52%, rgba(16,94,186,0.94) 100%)'
const LIGHT_CARD_BORDER = 'rgba(186, 218, 255, 0.42)'
const LIGHT_CARD_SHADOW = '0 18px 42px rgba(11, 66, 156, 0.38), 0 0 0 1px rgba(255, 255, 255, 0.10) inset'
const LIGHT_HOVER_GLOW = '0 0 0 1px rgba(186, 218, 255, 0.48), 0 0 28px rgba(11,79,197,0.86), 0 0 48px rgba(8,58,152,0.72)'
const GLOW        = `0 0 20px ${BLUE}, 0 0 40px rgba(30,144,255,0.6)`
const GLOW_SOFT   = `0 0 14px rgba(30,144,255,0.25)`
const PIE_COLORS  = [BLUE, GREEN, GOLD, ROSE, CYAN, ORANGE, SLATE]

// 
function stableHash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// 
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

// 
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

// 
const GROWTH_MAP = {
  Discipline: ['discipline', 'habit', 'routine', 'consistency', 'grit', 'willpower'],
  Productivity: ['productivity', 'efficiency', 'time', 'focus', 'work', 'output'],
  Mindset: ['mindset', 'growth', 'thinking', 'mental', 'belief', 'attitude'],
  'Emotional Intelligence': ['emotional', 'empathy', 'relationship', 'social', 'communication', 'feelings'],
  Leadership: ['leadership', 'management', 'influence', 'team', 'power', 'authority'],
  Finance: ['money', 'finance', 'wealth', 'investment', 'financial', 'income'],
}

// 
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
  if (hasFiction && diverse) return { title: 'The Narrative Strategist', desc: `With a broad fiction palette spanning ${Object.keys(gc).length} genres, you approach stories strategically, extracting meaning from diverse narratives. You do not just read; you analyze.` }
  if (hasSH && hasEdu) return { title: 'The Growth Architect', desc: 'Your reading is a deliberate investment in personal evolution. By balancing self-help with educational material, you are systematically designing your intellectual and emotional growth.' }
  if (hasFiction && darkTags > lightTags) return { title: 'The Escapist Explorer', desc: 'You immerse yourself in intense, emotionally charged fiction. Your preference for darker, gripping narratives suggests a reader who seeks adventure in the shadows of storytelling.' }
  if (diverse && likeRatio > 75) return { title: 'The Reflective Polymath', desc: 'With exceptional genre diversity and a high satisfaction rate, you are a true intellectual omnivore, equally at home in fiction, philosophy, and practical knowledge.' }
  if (hasSH) return { title: 'The Growth Architect', desc: 'Your reading choices reveal a clear mission: systematic self-improvement. Each book is a building block in your personal development architecture.' }
  if (hasEdu) return { title: 'The Knowledge Seeker', desc: 'You pursue learning with purpose. Your educational reading density shows a reader committed to mastery and deep understanding across multiple domains.' }
  return { title: 'The Curious Mind', desc: 'Your reading patterns reveal genuine intellectual curiosity. You explore diverse topics and genres, driven by a desire to understand the world from multiple perspectives.' }
}

//
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

//
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

function titleCase(v) {
  return String(v || '')
    .replace(/[-_]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ')
}

function moodToneLabel(mood, genre) {
  const g = String(genre || '').toLowerCase()
  if (mood === 'Dark' && g.includes('romance')) return 'Dark Romance Phase'
  if (['psychology', 'philosophy', 'sociology', 'education', 'history', 'science'].some(k => g.includes(k))) return 'Intellectual Exploration'
  if (mood === 'Intense' || g.includes('fiction') || g.includes('literary')) return 'Emotional Fiction Return'
  if (g.includes('romance')) return 'Romance Reinforcement'
  if (mood) return `${mood} Reading Phase`
  if (genre) return `${titleCase(genre)} Phase`
  return 'Discovery Phase'
}

function normalizeRating(book) {
  const val = Number(book?.rating)
  if (Number.isFinite(val) && val >= 1 && val <= 5) return val
  if (book?.liked === true) return 4.4
  if (book?.liked === false) return 2.6
  return 3.6
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}


export default function Dashboard({ personalityProfile, annualWrapped, previousReads = [], educationalBooks = [], reviewInsights = {}, theme = 'light' }) {
  const isDarkMode = theme === 'dark'
  const primaryBlue = isDarkMode ? BLUE : '#0B4FC5'
  const cardHover = isDarkMode ? undefined : { boxShadow: LIGHT_HOVER_GLOW, scale: 1.005 }
  const subtleTextColor = isDarkMode ? '#94A3B8' : '#DCEBFF'
  const strongTextColor = isDarkMode ? '#FFFFFF' : '#F8FBFF'
  const brightNumberStyle = isDarkMode
    ? undefined
    : { color: '#8FDBFF', textShadow: '0 0 10px rgba(143,219,255,0.95), 0 0 22px rgba(32,159,255,0.8)' }
  const analyticsCardStyle = isDarkMode
    ? { background: CARD_BG, border: `2px solid ${CARD_BORDER}`, boxShadow: GLOW_SOFT }
    : { background: LIGHT_CARD_BG, border: `1px solid ${LIGHT_CARD_BORDER}`, boxShadow: LIGHT_CARD_SHADOW, backdropFilter: 'blur(16px)' }
  // Month names constant (used in multiple useMemo hooks)
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  // All year books (merged)
  const yearBooks = useMemo(() => {
    const year = new Date().getFullYear()
    const compEdu = educationalBooks.filter(b => b.eduStatus === 'completed' && b.completedAt).map(b => ({ ...b, finishedAt: b.completedAt, liked: true }))
    return [...previousReads, ...compEdu].filter(b => b.finishedAt && new Date(b.finishedAt).getFullYear() === year)
  }, [previousReads, educationalBooks])

  // Enriched books (with derived pages and days)
  const enriched = useMemo(() => yearBooks.map(b => ({ ...b, pages: derivePages(b), days: deriveDays(b) })), [yearBooks])

  // Like ratio
  const likeRatio = useMemo(() => {
    const { liked = 0, disliked = 0 } = annualWrapped?.likeDislikeRatio || {}
    return liked + disliked > 0 ? Math.round((liked / (liked + disliked)) * 100) : 0
  }, [annualWrapped])

  // Average rating summary card metric
  const averageRating = useMemo(() => {
    if (enriched.length === 0) return 0
    const sum = enriched.reduce((acc, book) => acc + normalizeRating(book), 0)
    return Math.round((sum / enriched.length) * 10) / 10
  }, [enriched])

  // Genre pie data (top 6 + Others)
  const pieData = useMemo(() => {
    const gd = annualWrapped?.genreDistribution || {}
    const sorted = Object.entries(gd).sort((a, b) => b[1] - a[1])
    if (sorted.length <= 6) return sorted.map(([g, p]) => ({ genre: g, pct: p }))
    const top6 = sorted.slice(0, 6)
    const othersPct = sorted.slice(6).reduce((s, [, p]) => s + p, 0)
    return [...top6.map(([g, p]) => ({ genre: g, pct: p })), { genre: 'Others', pct: othersPct }]
  }, [annualWrapped])
  const totalForPie = useMemo(() => annualWrapped?.totalBooksRead || 0, [annualWrapped])

  // Archetype
  const archetype = useMemo(() => determineArchetype(yearBooks, likeRatio), [yearBooks, likeRatio])

  // AI Summary
  const aiSummary = useMemo(() => generateAISummary(yearBooks, annualWrapped), [yearBooks, annualWrapped])

  // Author diversity
  const authorStats = useMemo(() => {
    const authors = new Set(yearBooks.map(b => b.author).filter(Boolean))
    const ac = {}; yearBooks.forEach(b => { if (b.author) ac[b.author] = (ac[b.author] || 0) + 1 })
    const topAuthor = Object.entries(ac).sort((a, b) => b[1] - a[1])[0]
    return { unique: authors.size, total: yearBooks.length, topAuthor: topAuthor?.[0] || 'N/A', topCount: topAuthor?.[1] || 0 }
  }, [yearBooks])

  // GG Consistency score GG
  const consistency = useMemo(() => {
    const mr = annualWrapped?.monthlyReads || {}
    const active = Object.values(mr).filter(c => c > 0).length
    return Math.round((active / 12) * 100)
  }, [annualWrapped])

  // GG Mood consistency score from month-wise mood variance GG
  const moodConsistency = useMemo(() => {
    const moodKeys = Object.keys(MOOD_MAP)
    const byMonth = {}

    enriched.forEach((book) => {
      if (!book.finishedAt) return
      const monthName = monthNames[new Date(book.finishedAt).getMonth()]
      if (!byMonth[monthName]) {
        byMonth[monthName] = moodKeys.reduce((acc, key) => {
          acc[key] = 0
          return acc
        }, {})
      }

      const moods = getMoods(book.emotion_tags || book.tags || [])
      Object.entries(moods).forEach(([mood, count]) => {
        if (Object.prototype.hasOwnProperty.call(byMonth[monthName], mood)) {
          byMonth[monthName][mood] += count
        }
      })
    })

    const vectors = Object.values(byMonth)
    if (!vectors.length) {
      return {
        score: 0,
        level: 'Low',
        subtitle: 'Highly dynamic mood shifts',
      }
    }

    const normalizedVectors = vectors.map((vector) => {
      const total = Object.values(vector).reduce((sum, value) => sum + value, 0)
      return moodKeys.map((key) => (total > 0 ? (vector[key] || 0) / total : 0))
    })

    const avgVariance = moodKeys.reduce((sum, _, moodIdx) => {
      const values = normalizedVectors.map((vector) => vector[moodIdx])
      const mean = values.reduce((s, v) => s + v, 0) / values.length
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
      return sum + variance
    }, 0) / Math.max(moodKeys.length, 1)

    const normalizedVariance = Math.min(1, avgVariance / 0.08)

    const dominantMoodSequence = normalizedVectors
      .map((vector) => {
        const maxValue = Math.max(...vector)
        if (maxValue <= 0) return null
        return moodKeys[vector.indexOf(maxValue)]
      })
      .filter(Boolean)

    const dominantCounts = {}
    dominantMoodSequence.forEach((mood) => {
      dominantCounts[mood] = (dominantCounts[mood] || 0) + 1
    })

    const dominantRepetition = dominantMoodSequence.length
      ? Math.max(...Object.values(dominantCounts)) / dominantMoodSequence.length
      : 0

    const score = clampPercent(((1 - normalizedVariance) * 60) + (dominantRepetition * 40))
    if (score >= 70) {
      return { score, level: 'High', subtitle: 'Stable reading mood pattern' }
    }
    if (score >= 45) {
      return { score, level: 'Medium', subtitle: 'Moderate variation in mood' }
    }
    return { score, level: 'Low', subtitle: 'Highly dynamic mood shifts' }
  }, [enriched])

  // GG Fiction immersion hours GG
  const fictionHours = useMemo(() => {
    const fBooks = enriched.filter(b => (b.type || 'fiction') === 'fiction')
    const totalPages = fBooks.reduce((s, b) => s + b.pages, 0)
    return Math.round(totalPages / 40)
  }, [enriched])

  // GG Self-help growth focus GG
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

  // GG Fastest vs Longest read GG
  const fastSlow = useMemo(() => {
    if (enriched.length < 2) return null
    const sorted = [...enriched].sort((a, b) => a.days - b.days)
    return { fastest: sorted[0], slowest: sorted[sorted.length - 1] }
  }, [enriched])

  // GG Monthly momentum (books per month) GG
  const monthlyData = useMemo(() => {
    const mr = annualWrapped?.monthlyReads || {}
    return monthNames.map(m => ({ month: m, count: mr[m] || 0 }))
  }, [annualWrapped])
  const peakCount = useMemo(() => Math.max(...monthlyData.map(m => m.count), 1), [monthlyData])

  // GG Reading depth per month GG
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

  // GG Emotional journey heatmap GG
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

  // GG Like interpretation GG
  const likeInterpretation = useMemo(() => {
    if (likeRatio >= 90) return 'Your reading choices were almost perfectly aligned with your interests.'
    if (likeRatio >= 75) return 'Your reading choices were strongly aligned with your interests.'
    if (likeRatio >= 60) return 'You found satisfaction in most of your reads this year.'
    if (likeRatio >= 40) return 'Your reads were a balanced mix of hits and misses.'
    return 'You took bold risks with experimental reading choices.'
  }, [likeRatio])

  // GG Consistency interpretation GG
  const consistencyLabel = consistency >= 80 ? 'You maintained excellent reading discipline.' : consistency >= 60 ? 'You maintained strong reading discipline.' : consistency >= 40 ? 'You had moderate reading regularity.' : 'You read in concentrated bursts.'

  // GG Reader evolution timeline by quarter GG
  const evolutionTimeline = useMemo(() => {
    const quarters = [
      { id: 'Q1', label: 'Jan-Mar', months: [0, 1, 2] },
      { id: 'Q2', label: 'Apr-Jun', months: [3, 4, 5] },
      { id: 'Q3', label: 'Jul-Sep', months: [6, 7, 8] },
      { id: 'Q4', label: 'Oct-Dec', months: [9, 10, 11] },
    ]

    return quarters.map((q) => {
      const quarterBooks = yearBooks.filter((b) => {
        if (!b.finishedAt) return false
        const m = new Date(b.finishedAt).getMonth()
        return q.months.includes(m)
      })

      const genreCount = {}
      const moodCount = {}
      quarterBooks.forEach((b) => {
        const g = (b.genre || 'mixed').toLowerCase()
        genreCount[g] = (genreCount[g] || 0) + 1
        const moods = getMoods(b.emotion_tags || b.tags || [])
        Object.entries(moods).forEach(([mood, c]) => {
          moodCount[mood] = (moodCount[mood] || 0) + c
        })
      })

      const dominantGenre = Object.entries(genreCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'mixed'
      const dominantMood = Object.entries(moodCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Exploratory'

      return {
        ...q,
        totalBooks: quarterBooks.length,
        dominantGenre,
        dominantMood,
        phaseLabel: moodToneLabel(dominantMood, dominantGenre),
      }
    })
  }, [yearBooks])

  // GG Reading DNA metrics GG
  const readingDNA = useMemo(() => {
    const gd = annualWrapped?.genreDistribution || {}
    const tags = yearBooks.flatMap((b) => (b.emotion_tags || b.tags || []).map((t) => String(t).toLowerCase()))
    const totalTags = Math.max(tags.length, 1)
    const fictionShare = annualWrapped?.totalBooksRead > 0
      ? ((annualWrapped?.typeBreakdown?.fiction || 0) / annualWrapped.totalBooksRead) * 100
      : 0

    const pctForGenres = (keywords) => Object.entries(gd).reduce((sum, [genre, pct]) => {
      const gl = String(genre).toLowerCase()
      return keywords.some((k) => gl.includes(k)) ? sum + Number(pct || 0) : sum
    }, 0)

    const tagRatio = (keywords) => {
      const hit = tags.filter((t) => keywords.some((k) => t.includes(k))).length
      return hit / totalTags
    }

    const romanceIntensity = clampPercent(pctForGenres(['romance']) + tagRatio(['romance', 'love', 'tender', 'heart']) * 45)
    const darkPreference = clampPercent(pctForGenres(['thriller', 'horror', 'dark', 'mystery']) + tagRatio(['dark', 'gritty', 'sinister', 'thriller']) * 55)
    const emotionalDepth = clampPercent((tagRatio(['emotional', 'poignant', 'intense', 'dramatic']) * 70) + (likeRatio * 0.28))
    const intellectualCuriosity = clampPercent(pctForGenres(['psychology', 'philosophy', 'sociology', 'history', 'science', 'education']) + tagRatio(['philosophical', 'thought-provoking', 'introspective']) * 50)
    const narrativeImmersion = clampPercent((fictionShare * 0.7) + (likeRatio * 0.3) + tagRatio(['immersive', 'gripping', 'cinematic']) * 20)

    return [
      { label: 'Romance Intensity', value: romanceIntensity, color: ROSE },
      { label: 'Dark Theme Preference', value: darkPreference, color: SLATE },
      { label: 'Emotional Depth', value: emotionalDepth, color: GOLD },
      { label: 'Intellectual Curiosity', value: intellectualCuriosity, color: CYAN },
      { label: 'Narrative Immersion', value: narrativeImmersion, color: BLUE },
    ]
  }, [annualWrapped, yearBooks, likeRatio])

  // GG Hidden taste (low-frequency, high-rating genre) GG
  const hiddenTaste = useMemo(() => {
    if (!yearBooks.length) return null
    const byGenre = {}
    yearBooks.forEach((b) => {
      const g = (b.genre || 'unknown').toLowerCase()
      const r = normalizeRating(b)
      if (!byGenre[g]) byGenre[g] = { count: 0, sum: 0 }
      byGenre[g].count += 1
      byGenre[g].sum += r
    })

    const entries = Object.entries(byGenre).map(([genre, v]) => ({
      genre,
      count: v.count,
      avg: v.sum / v.count,
    }))
    const globalAvg = entries.reduce((s, e) => s + (e.avg * e.count), 0) / Math.max(entries.reduce((s, e) => s + e.count, 0), 1)
    const topCount = Math.max(...entries.map(e => e.count), 1)

    const candidates = entries
      .filter((e) => e.count < topCount && e.count <= Math.max(2, Math.ceil(topCount * 0.6)) && e.avg >= globalAvg + 0.35)
      .sort((a, b) => ((b.avg - globalAvg) / b.count) - ((a.avg - globalAvg) / a.count))

    if (!candidates.length) return null
    const winner = candidates[0]
    return {
      ...winner,
      message: `You rate ${titleCase(winner.genre)} books unusually high compared to how often you read them.`
    }
  }, [yearBooks])

  // GG Recommendation confidence score GG
  const recommendationConfidence = useMemo(() => {
    const sortedGenres = Object.entries(annualWrapped?.genreDistribution || {}).sort((a, b) => b[1] - a[1])
    const topGenre = sortedGenres[0]?.[0] || 'mixed'
    const rawTop = Number(sortedGenres[0]?.[1] || 0)
    const dominance = rawTop > 1 ? rawTop / 100 : rawTop
    const score = clampPercent(dominance * likeRatio)
    let summary = 'Our AI is still learning your preferences from mixed signals.'
    if (score >= 85) summary = 'Our AI understands your reading taste with high certainty.'
    else if (score >= 65) summary = 'Our AI has a strong signal of your preferences with room to refine.'
    else if (score >= 45) summary = 'Our AI sees evolving patterns and is adapting recommendations dynamically.'
    return { score, topGenre, summary }
  }, [annualWrapped, likeRatio])

  // GG Reading universe clusters GG
  const universeClusters = useMemo(() => {
    const clusterRules = {
      'Romance Cluster': ['romance', 'love', 'contemporary romance'],
      'Dark Fiction Cluster': ['thriller', 'horror', 'mystery', 'dark', 'crime', 'gothic'],
      'Academic Cluster': ['education', 'science', 'history', 'economics', 'biography'],
      'Philosophical Cluster': ['psychology', 'philosophy', 'sociology', 'literary'],
    }

    const totals = {
      'Romance Cluster': 0,
      'Dark Fiction Cluster': 0,
      'Academic Cluster': 0,
      'Philosophical Cluster': 0,
    }

    Object.entries(annualWrapped?.genreDistribution || {}).forEach(([genre, pct]) => {
      const gl = String(genre).toLowerCase()
      const target = Object.entries(clusterRules).find(([, keys]) => keys.some((k) => gl.includes(k)))?.[0]
      if (target) totals[target] += Number(pct || 0)
      else totals['Dark Fiction Cluster'] += Number(pct || 0) * 0.5
    })

    const sum = Object.values(totals).reduce((s, v) => s + v, 0)
    if (sum <= 0) return []
    return Object.entries(totals)
      .map(([cluster, value], i) => ({
        cluster,
        value: (value / sum) * 100,
        color: PIE_COLORS[i % PIE_COLORS.length],
      }))
      .filter((c) => c.value > 1)
      .sort((a, b) => b.value - a.value)
  }, [annualWrapped])

  // GG Rarest discovery GG
  const rarestDiscovery = useMemo(() => {
    if (!yearBooks.length) return null
    const genreCount = {}
    const authorCount = {}
    yearBooks.forEach((b) => {
      const g = (b.genre || 'unknown').toLowerCase()
      const a = (b.author || 'unknown').toLowerCase()
      genreCount[g] = (genreCount[g] || 0) + 1
      authorCount[a] = (authorCount[a] || 0) + 1
    })

    const scored = yearBooks.map((b) => {
      const g = (b.genre || 'unknown').toLowerCase()
      const a = (b.author || 'unknown').toLowerCase()
      const genreFreq = genreCount[g] / yearBooks.length
      const authorFreq = authorCount[a] / yearBooks.length
      const popularityScore = (genreFreq * 0.7) + (authorFreq * 0.3)
      return { ...b, popularityScore }
    })

    return scored.sort((a, b) => a.popularityScore - b.popularityScore)[0]
  }, [yearBooks])

  // GG AI reflection + forecast GG
  const aiReflection = useMemo(() => {
    const topGenres = Object.entries(annualWrapped?.genreDistribution || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => titleCase(g))
    const moodTotals = {}
    yearBooks.forEach((b) => {
      const moods = getMoods(b.emotion_tags || b.tags || [])
      Object.entries(moods).forEach(([m, c]) => { moodTotals[m] = (moodTotals[m] || 0) + c })
    })
    const topMood = Object.entries(moodTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'introspective'
    const [g1 = 'stories', g2 = 'psychological themes'] = topGenres
    return `You are drawn to ${topMood.toLowerCase()} narratives where ${g1.toLowerCase()} and ${g2.toLowerCase()} intertwine with emotional precision.`
  }, [annualWrapped, yearBooks])

  const readingForecast = useMemo(() => {
    const activeQuarters = evolutionTimeline.filter((q) => q.totalBooks > 0)
    const genres = activeQuarters.map((q) => q.dominantGenre).filter((g) => g !== 'mixed')
    if (genres.length >= 2 && genres[genres.length - 1] !== genres[0]) {
      return `Your taste is gradually shifting toward ${titleCase(genres[genres.length - 1])}. Expect future recommendations to explore this direction.`
    }
    if (hiddenTaste) {
      return `A subtle preference for ${titleCase(hiddenTaste.genre)} is emerging. Expect recommendations to lean into this hidden affinity.`
    }
    return `Your preference remains stable around ${titleCase(recommendationConfidence.topGenre)} with nuanced mood-driven variations ahead.`
  }, [evolutionTimeline, hiddenTaste, recommendationConfidence])

  const advancedMetrics = useMemo(() => {
    if (!annualWrapped) return []
    const metrics = [
      {
        key: 'predictionAlignment',
        title: 'Prediction Alignment',
        icon: '=',
        color: BLUE,
        metric: annualWrapped.predictionAlignment,
      },
      {
        key: 'preferenceStability',
        title: 'Preference Stability',
        icon: '=',
        color: GREEN,
        metric: annualWrapped.preferenceStability,
      },
      {
        key: 'explorationProfile',
        title: 'Exploration Profile',
        icon: '=',
        color: GOLD,
        metric: annualWrapped.explorationProfile,
      },
    ]

    return metrics.filter((entry) => entry.metric && typeof entry.metric === 'object')
  }, [annualWrapped])

  // GG EMPTY STATE GG
  if (!annualWrapped || annualWrapped.totalBooksRead === 0) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
          className="text-center p-10 rounded-2xl max-w-md"
          style={{ background: CARD_BG, border: `2px solid ${CARD_BORDER}`, boxShadow: GLOW_SOFT }}>
          <div className="text-5xl mb-5">R</div>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">No reading data yet. Start reading and rating books to unlock your annual intelligence report.</p>
          <div className="mt-5 h-0.5 w-28 mx-auto rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${BLUE}80, transparent)` }} />
        </motion.div>
      </div>
    )
  }

  // GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG
  return (
    <div className="w-full space-y-6 sm:space-y-8">

      {/* AI SUMMARY */}
      {aiSummary && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} whileHover={cardHover}
          className="p-5 sm:p-7 rounded-2xl" style={analyticsCardStyle}>
          <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 mb-3">
            <span style={{ color: BLUE }}>*</span> AI Reading Intelligence Summary
          </h3>
          <p className="text-sm sm:text-base text-slate-200 leading-relaxed">{aiSummary}</p>
        </motion.div>
      )}

      {/* REVIEW INTELLIGENCE INSIGHTS */}
      {(reviewInsights?.topDetectedThemes?.length > 0 || reviewInsights?.preferredStorytellingStyle?.length > 0) && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }} whileHover={cardHover}
          className="p-5 sm:p-7 rounded-2xl" style={analyticsCardStyle}>
          <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 mb-3">
            <span style={{ color: BLUE }}>*</span> Insights: Review Intelligence
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Top detected themes</p>
              <div className="flex flex-wrap gap-2">
                {(reviewInsights?.topDetectedThemes || []).slice(0, 6).map((theme) => (
                  <span
                    key={theme}
                    className="px-3 py-1 rounded-full text-xs font-medium"
                    style={{ background: `${BLUE}24`, border: `1px solid ${BLUE}50`, color: '#dbeafe' }}
                  >
                    {theme}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Preferred storytelling style</p>
              <ul className="space-y-1">
                {(reviewInsights?.preferredStorytellingStyle || []).slice(0, 4).map((style) => (
                  <li key={style} className="text-sm text-slate-200">- {style}</li>
                ))}
              </ul>
            </div>

            <div className="md:col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Reading profile</p>
              {(reviewInsights?.readingProfile?.primaryInterest || reviewInsights?.readingProfile?.secondaryInterest || reviewInsights?.readingProfile?.preferredTone) ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <p className="text-slate-300">
                    <span className="text-slate-400">Primary Interest:</span>{' '}
                    <span className="text-white">{reviewInsights?.readingProfile?.primaryInterest || 'Not enough data'}</span>
                  </p>
                  <p className="text-slate-300">
                    <span className="text-slate-400">Secondary Interest:</span>{' '}
                    <span className="text-white">{reviewInsights?.readingProfile?.secondaryInterest || 'Not enough data'}</span>
                  </p>
                  <p className="text-slate-300">
                    <span className="text-slate-400">Preferred Tone:</span>{' '}
                    <span className="text-white">{reviewInsights?.readingProfile?.preferredTone || 'Not enough data'}</span>
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-400">Complete more ratings to generate a reading profile.</p>
              )}
            </div>
          </div>

          {Array.isArray(reviewInsights?.reviewWordCloud) && reviewInsights.reviewWordCloud.length > 0 && (
            <div className="mt-5">
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Review word cloud</p>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 flex flex-wrap items-end gap-x-3 gap-y-1">
                {reviewInsights.reviewWordCloud.slice(0, 24).map((w) => (
                  <span
                    key={w.word}
                    style={{
                      fontSize: `${w.size || 12}px`,
                      color: '#e2e8f0',
                      opacity: Math.max(0.45, Math.min(1, (w.count || 1) / 6)),
                    }}
                  >
                    {w.word}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* STATS GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard theme={theme} label="Books Read" value={annualWrapped.totalBooksRead} sub="this year" icon="📚" color={BLUE} delay={0} />
        <StatCard theme={theme} label="Like Ratio" value={`${likeRatio}%`} sub="positive reads" icon="👍" color={GREEN} delay={0.08} />
        <StatCard theme={theme} label="Consistency" value={`${consistency}%`} sub={consistencyLabel} icon="📈" color={GOLD} delay={0.16} />
        <StatCard theme={theme} label="Avg Rating" value={`${averageRating.toFixed(1)}/5`} sub="reader sentiment" icon="⭐" color={CYAN} delay={0.24} />
      </div>

      {/* BACKEND ANALYTICS */}
      {advancedMetrics.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.28 }}
          className="p-5 sm:p-6 rounded-2xl"
          style={analyticsCardStyle}
          whileHover={cardHover}
        >
          <Heading icon="A" title="Advanced Annual Analytics" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mt-4">
            {advancedMetrics.map((entry, idx) => {
              const rawScore = Number(entry.metric?.score)
              const safeScore = Number.isFinite(rawScore) ? Math.max(0, Math.min(1, rawScore)) : 0
              const scorePercent = Math.round(safeScore * 100)
              const label = entry.metric?.label || 'N/A'
              const context = Array.isArray(entry.metric?.context) ? entry.metric.context.filter(Boolean) : []
              const titleLower = String(entry.title || '').toLowerCase()
              const analyticsEmoji = titleLower.includes('prediction')
                ? '🔮'
                : titleLower.includes('preference')
                  ? '🧭'
                  : titleLower.includes('exploration')
                    ? '🛰️'
                    : '📊'
              const analyticsItemStyle = isDarkMode
                ? { border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.05)' }
                : {
                    border: '1px solid rgba(186, 218, 255, 0.34)',
                    background: 'linear-gradient(150deg, rgba(30, 144, 255, 0.33), rgba(20, 96, 198, 0.28))',
                    backdropFilter: 'blur(14px)',
                    boxShadow: '0 8px 24px rgba(9, 58, 142, 0.28)',
                  }

              return (
                <motion.div
                  key={entry.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.32 + idx * 0.06 }}
                  className="rounded-xl p-4"
                  style={analyticsItemStyle}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs uppercase tracking-wide" style={{ color: subtleTextColor }}>{entry.title}</p>
                    <span className="text-base">{analyticsEmoji}</span>
                  </div>
                  <div className="flex items-end gap-2 mb-2">
                    <span className="text-2xl font-black" style={{ color: strongTextColor }}>{scorePercent}%</span>
                    <span className="text-xs font-semibold" style={{ color: entry.color }}>{label}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden mb-2">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${scorePercent}%`, background: entry.color }}
                    />
                  </div>
                  {context.length > 0 && (
                    <p className="text-[11px] leading-relaxed" style={{ color: subtleTextColor }}>{context[0]}</p>
                  )}
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* TYPE BREAKDOWN BAR */}
      {annualWrapped.typeBreakdown && Object.keys(annualWrapped.typeBreakdown).length > 1 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} whileHover={cardHover}
          className="p-5 sm:p-6 rounded-2xl" style={analyticsCardStyle}>
          <Heading icon="T" title="Reading Breakdown by Type" />
          <div className="flex rounded-full overflow-hidden h-5 sm:h-6 mt-4">
            {Object.entries(annualWrapped.typeBreakdown).map(([type, count], i) => {
              const pct = Math.round((count / annualWrapped.totalBooksRead) * 100)
              const c = { fiction: primaryBlue, 'self-help': GOLD, educational: GREEN }[type] || SLATE
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
              const c = { fiction: primaryBlue, 'self-help': GOLD, educational: GREEN }[type] || SLATE
              return <LegendDot key={type} color={c} label={`${type}: ${count}`} />
            })}
          </div>
        </motion.div>
      )}

      {/* READING ARCHETYPE */}
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="p-6 sm:p-8 rounded-2xl text-center" style={{ background: `linear-gradient(135deg, ${BLUE}12, ${GREEN}08)`, border: `2px solid ${BLUE}`, boxShadow: GLOW }}>
        <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] font-semibold mb-3" style={{ color: `${BLUE}CC` }}>Your {new Date().getFullYear()} Reading Archetype</p>
        <motion.h2 initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5, type: 'spring', stiffness: 180 }}
          className="text-2xl sm:text-3xl md:text-4xl font-black text-white mb-4" style={{ textShadow: `0 0 30px ${BLUE}` }}>
          {archetype.title}
        </motion.h2>
        <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl mx-auto">{archetype.desc}</p>
      </motion.div>

      {/* GENRE PIE + LIKE DONUT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

        {/* Genre Distribution Pie */}
        {pieData.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} whileHover={cardHover}
            className="p-5 sm:p-6 rounded-2xl" style={analyticsCardStyle}>
            <Heading icon="G" title="Genre Distribution" />
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
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} whileHover={cardHover}
            className="p-5 sm:p-6 rounded-2xl flex flex-col items-center" style={analyticsCardStyle}>
            <Heading icon="R" title="Like vs Dislike Ratio" />
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
                <AnimatedNumber value={likeRatio} className="text-3xl font-black" suffix="%" styleOverride={brightNumberStyle} />
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

      {/* DEPTH CURVE + EMOTIONAL HEATMAP */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

        {/* Intellectual Depth Curve */}
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} whileHover={cardHover}
            className="p-5 sm:p-6 rounded-2xl" style={analyticsCardStyle}>
          <Heading icon="I" title="Intellectual Intensity Curve" />
          <div className="mt-5 relative" style={{ height: '180px' }}>
            <svg width="100%" height="180" viewBox="0 0 360 180" preserveAspectRatio="none">
              {/* Grid lines */}
              {[0.25, 0.5, 0.75].map(f => (
                <line key={f} x1="0" y1={180 - f * 160} x2="360" y2={180 - f * 160} stroke={`${primaryBlue}16`} strokeWidth="1" />
              ))}
              {/* Area fill */}
              <motion.path
                d={`M ${depthCurve.map((d, i) => `${i * (360 / 11)} ${180 - (d.depth / maxDepth) * 155}`).join(' L ')} L ${11 * (360 / 11)} 180 L 0 180 Z`}
                fill={`${primaryBlue}1A`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.8 }}
              />
              {/* Line */}
              <motion.polyline
                points={depthCurve.map((d, i) => `${i * (360 / 11)},${180 - (d.depth / maxDepth) * 155}`).join(' ')}
                fill="none" stroke={primaryBlue} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.6, duration: 1.2 }}
                style={{ filter: `drop-shadow(0 0 6px ${primaryBlue})` }}
              />
              {/* Dots */}
              {depthCurve.map((d, i) => d.depth > 0 && (
                <motion.circle key={i} cx={i * (360 / 11)} cy={180 - (d.depth / maxDepth) * 155} r="4"
                  fill={primaryBlue} stroke="#fff" strokeWidth="1.5"
                  initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.8 + i * 0.04, type: 'spring' }}
                  style={{ filter: `drop-shadow(0 0 4px ${primaryBlue})` }} />
              ))}
            </svg>
            {/* Month labels */}
            <div className="flex justify-between mt-1 px-0">
              {depthCurve.map(d => <span key={d.month} className="text-[8px] sm:text-[9px] text-slate-500 w-[30px] text-center">{d.month}</span>)}
            </div>
          </div>
        </motion.div>

        {/* Emotional Journey Heatmap */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} whileHover={cardHover}
          className="p-5 sm:p-6 rounded-2xl" style={analyticsCardStyle}>
          <Heading icon="J" title="Emotional Reading Journey" />
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
                          title={`${cat} - ${m}: ${val}`}
                          style={{
                            background: val > 0 ? `rgba(${isDarkMode ? '30,144,255' : '11,79,197'},${0.18 + intensity * 0.72})` : `rgba(${isDarkMode ? '30,144,255' : '11,79,197'},0.06)`,
                            boxShadow: val > 0 ? `0 0 ${intensity * 8}px rgba(${isDarkMode ? '30,144,255' : '11,79,197'},${intensity * 0.45})` : 'none',
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

      {/* INTEL CARDS */}
      <div className="space-y-3 sm:space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Author Diversity */}
          <GlowCard theme={theme} delay={0.6}>
            <div className="text-center">
              <div className="text-2xl mb-2">👥</div>
              <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: `${BLUE}CC` }}>Author Diversity</div>
              <AnimatedNumber value={authorStats.unique} className="text-3xl sm:text-4xl font-black" styleOverride={brightNumberStyle} />
              <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">unique authors</p>
              {authorStats.topCount > 1 && <p className="text-[8px] text-slate-500 mt-0.5">Top: {authorStats.topAuthor} ({authorStats.topCount})</p>}
            </div>
          </GlowCard>

          {/* Fiction Immersion */}
          <GlowCard theme={theme} delay={0.68}>
            <div className="text-center">
              <div className="text-2xl mb-2">📚</div>
              <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: `${GREEN}CC` }}>Fiction Immersion</div>
              <AnimatedNumber value={fictionHours} className="text-3xl sm:text-4xl font-black" suffix="h" styleOverride={brightNumberStyle} />
              <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">in fictional worlds</p>
            </div>
          </GlowCard>

          {/* Mood Consistency */}
          <GlowCard theme={theme} delay={0.74}>
            <div className="text-center">
              <div className="text-2xl mb-2">🎭</div>
              <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: `${CYAN}CC` }}>Mood Consistency</div>
              <AnimatedNumber value={moodConsistency.score} className="text-3xl sm:text-4xl font-black" suffix="%" styleOverride={brightNumberStyle} />
              <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">{moodConsistency.subtitle}</p>
            </div>
          </GlowCard>

          {/* Growth Focus */}
          <GlowCard theme={theme} delay={0.76}>
            <div className="text-center flex flex-col items-center justify-center h-full">
              <div className="text-2xl mb-2">🚀</div>
              <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: `${GOLD}CC` }}>Growth Focus</div>
              <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.9, type: 'spring' }}
                className="px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold"
                style={{ background: `${GOLD}20`, border: `2px solid ${GOLD}`, color: '#fff', boxShadow: `0 0 16px ${GOLD}40` }}>
                {selfHelpFocus || 'Emerging Focus'}
              </motion.div>
              <p className="text-[8px] text-slate-500 mt-2">{new Date().getFullYear()} growth theme</p>
            </div>
          </GlowCard>
        </div>

        {/* Reading Velocity + 3 New Features */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <GlowCard theme={theme} delay={0.84}>
            <div className="text-center w-full space-y-2">
              <div className="text-2xl mb-2">⚡</div>
              <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold" style={{ color: `${ORANGE}CC` }}>Reading Velocity</div>
              <div className="space-y-1.5 mt-2">
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-slate-400">Fastest</span>
                  <span className="font-bold text-white truncate max-w-[80px]" title={fastSlow?.fastest?.title || 'N/A'}>{fastSlow?.fastest?.days ?? 0}d</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-slate-400">Longest</span>
                  <span className="font-bold text-white truncate max-w-[80px]" title={fastSlow?.slowest?.title || 'N/A'}>{fastSlow?.slowest?.days ?? 0}d</span>
                </div>
              </div>
              <p className="text-[8px] text-slate-500 truncate" title={fastSlow?.fastest?.title || 'N/A'}>{fastSlow?.fastest?.title || 'No completed books yet'}</p>
            </div>
          </GlowCard>

          <GlowCard theme={theme} delay={0.9}>
            <div className="text-center">
              <div className="text-2xl mb-2">📖</div>
              <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: '#FFD166CC' }}>Reading Pace</div>
              <AnimatedNumber value={enriched.length > 0 ? Math.round(365 / enriched.length) : 0} className="text-3xl sm:text-4xl font-black" suffix="d" styleOverride={brightNumberStyle} />
              <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">per book avg</p>
            </div>
          </GlowCard>

          <GlowCard theme={theme} delay={0.96}>
            <div className="text-center">
              <div className="text-2xl mb-2">🎨</div>
              <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: '#5EEAD4CC' }}>Genre Diversity</div>
              <AnimatedNumber value={Object.keys(annualWrapped?.genreDistribution || {}).length} className="text-3xl sm:text-4xl font-black" styleOverride={brightNumberStyle} />
              <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">genres explored</p>
            </div>
          </GlowCard>

          <GlowCard theme={theme} delay={1.02}>
            <div className="text-center">
              <div className="text-2xl mb-2">💫</div>
              <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: '#EF476FCC' }}>Emotional Spectrum</div>
              <AnimatedNumber value={Object.keys(MOOD_MAP).length} className="text-3xl sm:text-4xl font-black" styleOverride={brightNumberStyle} />
              <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">moods experienced</p>
            </div>
          </GlowCard>
        </div>
      </div>

      {/* READING MOMENTUM */}
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }} whileHover={cardHover}
        className="p-5 sm:p-6 rounded-2xl" style={analyticsCardStyle}>
        <Heading icon="M" title="Reading Momentum" />
        <div className="flex items-end gap-1.5 sm:gap-2 mt-5" style={{ height: '140px' }}>
          {monthlyData.map((d, i) => {
            const hPct = d.count > 0 ? (d.count / peakCount) * 100 : 4
            const isPeak = d.count === peakCount && d.count > 0
            return (
              <div key={d.month} className="flex-1 flex flex-col items-center gap-1" style={{ height: '100%', justifyContent: 'flex-end' }}>
                {d.count > 0 && (
                  <span className="text-[9px] font-bold" style={{ color: isPeak ? GOLD : primaryBlue }}>{d.count}</span>
                )}
                <motion.div initial={{ height: 0 }} animate={{ height: `${hPct}%` }}
                  transition={{ delay: 0.7 + i * 0.04, duration: 0.5, ease: 'easeOut' }}
                  className="w-full rounded-t-md min-h-[3px]"
                  style={{
                    background: isPeak
                      ? `linear-gradient(to top, ${GOLD}60, ${GOLD})`
                      : d.count > 0
                        ? `linear-gradient(to top, ${primaryBlue}55, ${primaryBlue})`
                        : `${primaryBlue}22`,
                      boxShadow: d.count > 0 ? `0 0 10px ${isPeak ? GOLD : primaryBlue}30` : 'none',
                      borderTop: d.count > 0 ? `2px solid ${isPeak ? GOLD : primaryBlue}` : 'none',
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
              <span className="text-[10px] text-slate-400">Longest streak: <strong className="text-white">{maxStreak} month{maxStreak !== 1 ? 's' : ''}</strong></span>
              <span className="text-[10px] text-slate-400">Break months: <strong className="text-white">{breaks}</strong></span>
            </div>
          )
        })()}
      </motion.div>

      {/* MOOD PREFERENCES */}
      {personalityProfile && Object.keys(personalityProfile.dominantMoods || {}).length > 0 && (
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
          className="p-5 sm:p-6 rounded-2xl" style={analyticsCardStyle}>
          <Heading icon="P" title="Mood Preferences" />
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

      {/* READER EVOLUTION TIMELINE */}
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.72 }}
        className="p-5 sm:p-6 rounded-2xl" style={analyticsCardStyle}>
        <Heading icon="E" title="Reader Evolution Timeline" />
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {evolutionTimeline.map((q) => (
            <div
              key={q.id}
              className="rounded-xl p-3"
              style={isDarkMode
                ? { border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.05)' }
                : {
                    border: '1px solid rgba(186, 218, 255, 0.34)',
                    background: 'linear-gradient(150deg, rgba(30, 144, 255, 0.33), rgba(20, 96, 198, 0.28))',
                    backdropFilter: 'blur(14px)',
                    boxShadow: '0 8px 24px rgba(9, 58, 142, 0.28)',
                  }}
            >
              <p className="text-[10px] uppercase tracking-wide" style={{ color: subtleTextColor }}>{q.label}</p>
              <p className="text-sm font-semibold mt-1" style={{ color: strongTextColor }}>{q.phaseLabel}</p>
              <p className="text-[11px] mt-2" style={{ color: strongTextColor }}>Genre: {titleCase(q.dominantGenre)}</p>
              <p className="text-[11px]" style={{ color: subtleTextColor }}>Mood: {q.dominantMood}</p>
              <p className="text-[11px]" style={{ color: subtleTextColor }}>Books: {q.totalBooks}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* READING DNA + CONFIDENCE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75 }}
          className="p-5 sm:p-6 rounded-2xl" style={analyticsCardStyle}>
          <Heading icon="D" title="Reading DNA Profile" />
          <div className="mt-4 space-y-3">
            {readingDNA.map((metric) => (
              <div key={metric.label}>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="text-slate-300">{metric.label}</span>
                  <span className="text-white font-semibold">{metric.value}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-800/80 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${metric.value}%` }}
                    transition={{ duration: 0.8 }}
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, ${metric.color}80, ${metric.color})` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.78 }}
          className="p-5 sm:p-6 rounded-2xl flex flex-col justify-center" style={analyticsCardStyle}>
          <Heading icon="S" title="Recommendation Intelligence Score" />
          <div className="mt-5 text-center">
            <div className="text-5xl sm:text-6xl font-black text-white" style={{ textShadow: `0 0 24px ${BLUE}` }}>{recommendationConfidence.score}%</div>
            <p className="text-xs text-slate-400 mt-2">Recommendation Confidence</p>
            <p className="text-sm text-slate-200 mt-4 max-w-sm mx-auto leading-relaxed">{recommendationConfidence.summary}</p>
          </div>
        </motion.div>
      </div>

      {/* HIDDEN TASTE + UNIVERSE MAP */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
          className="p-5 sm:p-6 rounded-2xl" style={analyticsCardStyle}>
          <Heading icon="H" title="Hidden Taste Detection" />
          {hiddenTaste ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Hidden Taste Detected</p>
              <p className="text-lg text-white font-semibold mt-1">{titleCase(hiddenTaste.genre)}</p>
              <p className="text-sm text-slate-300 mt-2 leading-relaxed">{hiddenTaste.message}</p>
              <p className="text-xs text-slate-400 mt-3">Avg Rating: {hiddenTaste.avg.toFixed(1)} | Reads: {hiddenTaste.count}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-400 mt-4">No strong hidden affinity detected yet. Keep rating across genres to reveal latent tastes.</p>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.84 }}
          className="p-5 sm:p-6 rounded-2xl" style={analyticsCardStyle}>
          <Heading icon="U" title="Reading Universe Map" />
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="h-6 rounded-lg overflow-hidden flex">
              {universeClusters.map((cluster) => (
                <div
                  key={cluster.cluster}
                  className="h-full"
                  style={{ width: `${cluster.value}%`, background: cluster.color }}
                  title={`${cluster.cluster}: ${Math.round(cluster.value)}%`}
                />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {universeClusters.map((cluster) => (
                <div key={cluster.cluster} className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: cluster.color }} />
                  <span>{cluster.cluster}</span>
                  <span className="text-slate-400 ml-auto">{Math.round(cluster.value)}%</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* RAREST DISCOVERY */}
      {rarestDiscovery && (
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.88 }}
          className="p-5 sm:p-6 rounded-2xl" style={analyticsCardStyle}>
          <Heading icon="R" title="Your Rarest Discovery" />
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
            <div>
              <p className="text-lg text-white font-semibold">{rarestDiscovery.title}</p>
              <p className="text-sm text-slate-300 mt-1">{rarestDiscovery.author || 'Unknown author'} | {titleCase(rarestDiscovery.genre || 'mixed')}</p>
              <p className="text-sm text-slate-300 mt-3 leading-relaxed">Only a small fraction of readers explore books like this.</p>
            </div>
            <div className="self-end text-right">
              <p className="text-xs text-slate-500">Popularity score</p>
              <p className="text-xl font-bold text-white">{(rarestDiscovery.popularityScore * 100).toFixed(1)}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* FORECAST + REFLECTION */}
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.92 }}
        className="p-5 sm:p-6 rounded-2xl" style={analyticsCardStyle}>
        <Heading icon="F" title="Reading Forecast" />
        <p className="text-sm sm:text-base text-slate-200 leading-relaxed mt-4">{readingForecast}</p>
        <div className="mt-5 pt-4 border-t border-white/10">
          <p className="text-xs uppercase tracking-wide text-slate-400">AI Reading Reflection</p>
          <p className="text-sm sm:text-base text-slate-200 leading-relaxed mt-2">{aiReflection}</p>
        </div>
      </motion.div>
    </div>
  )
}


/*
 * SUB-COMPONENTS
 */

function AnimatedNumber({ value, className = '', suffix = '', styleOverride }) {
  const [display, setDisplay] = useState(0)
  const numVal = typeof value === 'string' ? parseInt(value) || 0 : value
  useEffect(() => {
    if (numVal === 0) { setDisplay(0); return }
    let start = 0; const dur = 1200; const step = Math.max(1, Math.floor(dur / numVal))
    const timer = setInterval(() => { start++; setDisplay(start); if (start >= numVal) clearInterval(timer) }, step)
    return () => clearInterval(timer)
  }, [numVal])
  return <div className={className} style={styleOverride}>{display}{suffix}</div>
}

function StatCard({ label, value, sub, icon, color, delay, theme = 'dark' }) {
  const isDarkMode = theme === 'dark'
  const hoverGlow = isDarkMode ? `0 0 24px ${color}, 0 0 48px ${color}60` : LIGHT_HOVER_GLOW
  const numberStyle = isDarkMode
    ? undefined
    : { color: '#8FDBFF', textShadow: '0 0 10px rgba(143,219,255,0.95), 0 0 22px rgba(32,159,255,0.8)' }
  const labelColor = !isDarkMode && color === BLUE ? '#0A4FC5' : `${color}CC`
  const localCardStyle = isDarkMode
    ? { background: CARD_BG, border: `2px solid ${CARD_BORDER}`, boxShadow: GLOW_SOFT }
    : { background: LIGHT_CARD_BG, border: `1px solid ${LIGHT_CARD_BORDER}`, boxShadow: LIGHT_CARD_SHADOW, backdropFilter: 'blur(16px)' }
  return (
    <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.5 }} whileHover={{ scale: 1.02, boxShadow: hoverGlow }}
      className="relative p-4 sm:p-5 rounded-2xl overflow-hidden transition-shadow duration-100"
      style={localCardStyle}>
      <motion.div initial={{ top: '-20%' }} animate={{ top: '120%' }}
        transition={{ duration: 3.5, repeat: Infinity, repeatDelay: 3, delay: delay + 1 }}
        className="absolute left-0 right-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }} />
      <div className="text-lg mb-1">{icon}</div>
      <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: labelColor }}>{label}</div>
      <div className="text-2xl sm:text-3xl font-black" style={numberStyle}>{value}</div>
      <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 truncate">{sub}</p>
    </motion.div>
  )
}

function GlowCard({ children, delay = 0, theme = 'dark' }) {
  const isDarkMode = theme === 'dark'
  const localCardStyle = isDarkMode
    ? { background: CARD_BG, border: `2px solid ${CARD_BORDER}`, boxShadow: GLOW_SOFT }
    : { background: LIGHT_CARD_BG, border: `1px solid ${LIGHT_CARD_BORDER}`, boxShadow: LIGHT_CARD_SHADOW, backdropFilter: 'blur(16px)' }
  const hoverGlow = isDarkMode ? GLOW : LIGHT_HOVER_GLOW
  return (
    <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.5 }} whileHover={{ scale: 1.02, boxShadow: hoverGlow }}
      className="relative p-4 sm:p-5 rounded-2xl flex items-center justify-center overflow-hidden transition-shadow duration-100"
      style={localCardStyle}>
      {children}
    </motion.div>
  )
}

function Heading({ title }) {
  return (
    <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
      {title}
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
