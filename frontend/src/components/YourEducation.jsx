import React, { useMemo, useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/* ═══════════════════════════════════════════════════════════════
 *  YourEducation — EdTech Analytics Dashboard
 *  Dodger Blue (#1E90FF) glowing theme. Zero purple.
 *  All metrics derived deterministically from available book data.
 * ═══════════════════════════════════════════════════════════════ */

const BLUE     = '#1E90FF'
const GREEN    = '#06D6A0'
const GOLD     = '#FFD166'
const ROSE     = '#EF476F'
const CYAN     = '#22D3EE'
const CARD_BG  = 'rgba(15,23,42,0.65)'
const CARD_BORDER = `rgba(30,144,255,0.22)`
const GLOW     = `0 0 20px ${BLUE}, 0 0 40px rgba(30,144,255,0.6)`
const GLOW_SOFT = `0 0 14px rgba(30,144,255,0.25)`
const LIGHT_CARD_BG = 'linear-gradient(145deg, rgba(8,46,122,0.96) 0%, rgba(10,68,154,0.95) 52%, rgba(16,94,186,0.94) 100%)'
const LIGHT_CARD_BORDER = 'rgba(186, 218, 255, 0.42)'
const LIGHT_CARD_SHADOW = '0 18px 42px rgba(11, 66, 156, 0.38), 0 0 0 1px rgba(255, 255, 255, 0.10) inset'
const LIGHT_HOVER_GLOW = '0 0 0 1px rgba(186, 218, 255, 0.48), 0 0 28px rgba(11,79,197,0.86), 0 0 48px rgba(8,58,152,0.72)'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ── deterministic hash for stable pseudo-random values ──
function stableHash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

// ── Derive missing fields from available book data ──
function enrichBook(book) {
  const seed = stableHash(book.title + (book.author || ''))

  // Pages (not in data — derive from pacing/tone)
  const pacingPages = { slow: 380, moderate: 280, fast: 200 }
  const pages = (pacingPages[book.pacing] || 280) + (seed % 120) - 40

  // estimatedHours  (pages / 40 as spec says)
  const estimatedHours = Math.max(3, Math.round(pages / 40))

  // Difficulty — derive from tone
  const advancedTones = ['academic', 'philosophical']
  const beginnerTones = ['humorous', 'witty', 'tender', 'lyrical']
  let difficulty = 'Intermediate'
  if (advancedTones.includes(book.tone)) difficulty = 'Advanced'
  else if (beginnerTones.includes(book.tone)) difficulty = 'Beginner'
  // edge tweak by seed
  if (difficulty === 'Intermediate' && seed % 5 === 0) difficulty = 'Advanced'
  if (difficulty === 'Intermediate' && seed % 7 === 0) difficulty = 'Beginner'

  // Skills array — derive from genre + tone
  const genreSkillMap = {
    science: ['Science', 'Critical Thinking', 'Research'],
    psychology: ['Psychology', 'Behavioral Science', 'Cognition'],
    economics: ['Economics', 'Finance', 'Data Analysis'],
    philosophy: ['Philosophy', 'Ethics', 'Logic'],
    history: ['History', 'Geopolitics', 'Cultural Studies'],
    sociology: ['Sociology', 'Social Science', 'Anthropology'],
    education: ['Education', 'Pedagogy', 'Learning Design'],
    biography: ['Leadership', 'History', 'Inspiration'],
  }
  const base = genreSkillMap[book.genre] || ['General Knowledge', 'Critical Thinking']
  // pick 2-3 skills deterministically
  const skills = base.slice(0, 2 + (seed % 2))

  // Dates — derive startDate/endDate from completedAt (or fallback)
  const completedAt = book.completedAt || new Date().toISOString()
  const daysTaken = 7 + (seed % 45)
  const endDate = new Date(completedAt)
  const startDate = new Date(endDate.getTime() - daysTaken * 86400000)

  return {
    ...book,
    pages,
    estimatedHours,
    difficulty,
    skills,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    daysTaken,
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function YourEducation({ educationalBooks = [], theme = 'light' }) {
  const isDarkMode = theme === 'dark'
  const primaryBlue = isDarkMode ? BLUE : '#0B4FC5'
  const darkLabelBlue = isDarkMode ? `${BLUE}CC` : '#0A4FC5'
  const cardHover = isDarkMode ? undefined : { boxShadow: LIGHT_HOVER_GLOW, scale: 1.005 }
  const brightNumberStyle = isDarkMode
    ? undefined
    : { color: '#8FDBFF', textShadow: '0 0 10px rgba(143,219,255,0.95), 0 0 22px rgba(32,159,255,0.8)' }
  const [expandedBookKey, setExpandedBookKey] = useState(null)
  const surfaceStyle = isDarkMode
    ? { background: CARD_BG, border: `2px solid ${CARD_BORDER}`, boxShadow: GLOW_SOFT }
    : { background: LIGHT_CARD_BG, border: `1px solid ${LIGHT_CARD_BORDER}`, boxShadow: LIGHT_CARD_SHADOW, backdropFilter: 'blur(18px)' }
  const emptyStateStyle = isDarkMode
    ? { background: CARD_BG, border: `2px solid ${CARD_BORDER}`, boxShadow: GLOW_SOFT }
    : { background: LIGHT_CARD_BG, border: `1px solid ${LIGHT_CARD_BORDER}`, boxShadow: LIGHT_CARD_SHADOW, backdropFilter: 'blur(20px)' }

  // 1️⃣ Filter only completed educational books
  const finishedEducationalBooks = useMemo(
    () =>
      educationalBooks
        .filter(b => (b.type === 'educational') && b.eduStatus === 'completed')
        .map(enrichBook),
    [educationalBooks]
  )

  const totalBooks = finishedEducationalBooks.length

  // 2A — Total Learning Hours
  const totalHours = useMemo(
    () => finishedEducationalBooks.reduce((sum, b) => sum + b.estimatedHours, 0),
    [finishedEducationalBooks]
  )

  // 2C — Average Hours Per Book
  const avgHours = totalBooks > 0 ? Math.round((totalHours / totalBooks) * 10) / 10 : 0

  // 2D — Difficulty Distribution
  const difficultyCounts = useMemo(() => {
    const counts = { Beginner: 0, Intermediate: 0, Advanced: 0 }
    finishedEducationalBooks.forEach(b => { counts[b.difficulty] = (counts[b.difficulty] || 0) + 1 })
    return counts
  }, [finishedEducationalBooks])

  // 2E — Skill Coverage
  const skillCounts = useMemo(() => {
    const sc = {}
    finishedEducationalBooks.forEach(b => b.skills.forEach(s => { sc[s] = (sc[s] || 0) + 1 }))
    return sc
  }, [finishedEducationalBooks])

  // 2F — Learning Depth Score (normalised to 100)
  const depthScore = useMemo(() => {
    if (totalBooks === 0) return 0
    const raw = finishedEducationalBooks.reduce((sum, b) => {
      const w = b.difficulty === 'Beginner' ? 1 : b.difficulty === 'Intermediate' ? 2 : 3
      return sum + w
    }, 0) / totalBooks
    return Math.round((raw / 3) * 100)
  }, [finishedEducationalBooks, totalBooks])

  // 2G — Academic Level Badge
  const academicLevel = depthScore < 40 ? 'Explorer' : depthScore < 60 ? 'Scholar' : depthScore < 80 ? 'Specialist' : 'Advanced Practitioner'

  // 2H — Completion Velocity
  const velocity = useMemo(() => {
    if (totalBooks === 0) return { avg: 0, fastest: 0, slowest: 0 }
    const days = finishedEducationalBooks.map(b => b.daysTaken)
    return {
      avg: Math.round(days.reduce((s, d) => s + d, 0) / days.length),
      fastest: Math.min(...days),
      slowest: Math.max(...days),
    }
  }, [finishedEducationalBooks, totalBooks])

  // Additional analytics: Learning Retention
  const learningRetention = useMemo(() => {
    if (totalBooks === 0) {
      return { score: 0, subtitle: 'Surface-level learning' }
    }

    const trackedEducational = educationalBooks.filter((book) => book.type === 'educational')
    const completionRate = trackedEducational.length > 0
      ? (totalBooks / trackedEducational.length) * 100
      : 100

    const weightedDifficulty = (
      (difficultyCounts.Beginner * 1) +
      (difficultyCounts.Intermediate * 2) +
      (difficultyCounts.Advanced * 3)
    ) / (totalBooks * 3) * 100

    const topicCounts = {}
    finishedEducationalBooks.forEach((book) => {
      const topic = String(book.genre || 'general').toLowerCase()
      topicCounts[topic] = (topicCounts[topic] || 0) + 1
    })
    const repeatedTopicCoverage = (Object.values(topicCounts).reduce((sum, count) => sum + (count > 1 ? count : 0), 0) / totalBooks) * 100

    const timeScore = Math.min(100, (avgHours / 10) * 100)

    const score = clampPercent(
      (timeScore * 0.2) +
      (completionRate * 0.35) +
      (weightedDifficulty * 0.25) +
      (repeatedTopicCoverage * 0.2)
    )

    if (score >= 70) return { score, subtitle: 'Strong long-term knowledge absorption' }
    if (score >= 45) return { score, subtitle: 'Moderate retention' }
    return { score, subtitle: 'Surface-level learning' }
  }, [avgHours, difficultyCounts, educationalBooks, finishedEducationalBooks, totalBooks])

  // Additional analytics: Cognitive Load
  const cognitiveLoad = useMemo(() => {
    if (totalBooks === 0) {
      return { value: 'Low' }
    }

    const advancedPct = (difficultyCounts.Advanced / totalBooks) * 100
    const avgCompletionTimeScore = Math.min(100, (velocity.avg / 45) * 100)
    const distinctSubjects = new Set(finishedEducationalBooks.map((book) => String(book.genre || 'general').toLowerCase())).size
    const subjectComplexity = Math.min(100, (distinctSubjects * 18) + (((difficultyCounts.Advanced * 3 + difficultyCounts.Intermediate * 2 + difficultyCounts.Beginner) / Math.max(totalBooks, 1)) * 12))

    const loadScore = (advancedPct * 0.45) + (avgCompletionTimeScore * 0.3) + (subjectComplexity * 0.25)
    if (loadScore >= 70) return { value: 'High' }
    if (loadScore >= 35) return { value: 'Moderate' }
    return { value: 'Low' }
  }, [difficultyCounts, finishedEducationalBooks, totalBooks, velocity.avg])

  // Additional analytics: Learning Growth (monthly progression of learning depth)
  const learningGrowth = useMemo(() => {
    const byMonth = MONTHS.reduce((acc, month) => {
      acc[month] = []
      return acc
    }, {})

    finishedEducationalBooks.forEach((book) => {
      const monthName = MONTHS[new Date(book.endDate).getMonth()]
      const weight = book.difficulty === 'Beginner' ? 1 : book.difficulty === 'Intermediate' ? 2 : 3
      byMonth[monthName].push(weight)
    })

    let cumulativeBooks = 0
    let cumulativeWeight = 0
    const points = MONTHS.map((month) => {
      const monthWeights = byMonth[month]
      cumulativeBooks += monthWeights.length
      cumulativeWeight += monthWeights.reduce((sum, weight) => sum + weight, 0)
      const depth = cumulativeBooks > 0 ? Math.round((cumulativeWeight / (cumulativeBooks * 3)) * 100) : 0
      return { month, depth }
    })

    const maxDepth = Math.max(...points.map((point) => point.depth), 1)
    return { points, maxDepth }
  }, [finishedEducationalBooks])

  // Additional analytics: Focus Stability
  const focusStability = useMemo(() => {
    if (totalBooks === 0) {
      return { score: 0 }
    }

    const topicCounts = {}
    finishedEducationalBooks.forEach((book) => {
      const topic = String(book.genre || 'general').toLowerCase()
      topicCounts[topic] = (topicCounts[topic] || 0) + 1
    })

    const counts = Object.values(topicCounts)
    const topicConsistency = (Math.max(...counts, 0) / totalBooks) * 100
    const normalizedSwitching = (Object.keys(topicCounts).length - 1) / Math.max(totalBooks - 1, 1)

    const score = clampPercent((topicConsistency * 0.6) + ((1 - Math.min(1, normalizedSwitching)) * 40))
    return { score }
  }, [finishedEducationalBooks, totalBooks])

  // Additional analytics: Interdisciplinary Index
  const interdisciplinaryIndex = useMemo(() => {
    const domainCount = new Set(
      finishedEducationalBooks.map((book) => String(book.genre || 'general').toLowerCase())
    ).size

    if (domainCount >= 5) return { value: 'High' }
    if (domainCount >= 3) return { value: 'Medium' }
    return { value: 'Low' }
  }, [finishedEducationalBooks])

  // Additional analytics: Completion Efficiency
  const completionEfficiency = useMemo(() => {
    if (totalBooks === 0) {
      return { score: 0 }
    }

    const speedByBook = finishedEducationalBooks.map((book) => {
      const expectedDays = Math.max(6, Math.round(book.estimatedHours * 1.6))
      const speedScore = Math.min(100, (expectedDays / Math.max(book.daysTaken, 1)) * 100)
      const difficultyWeight = book.difficulty === 'Beginner' ? 1 : book.difficulty === 'Intermediate' ? 1.2 : 1.45
      return Math.min(100, speedScore * difficultyWeight)
    })

    const score = clampPercent(speedByBook.reduce((sum, value) => sum + value, 0) / speedByBook.length)
    return { score }
  }, [finishedEducationalBooks, totalBooks])

  // ── Empty state ──
  if (totalBooks === 0) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center p-10 rounded-2xl max-w-md"
          style={emptyStateStyle}
        >
          <div className="text-5xl mb-5">📚</div>
          <p className={`text-sm sm:text-base leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-white'}`}>
            Complete your first educational book to unlock your learning analytics.
          </p>
          <div className="mt-5 h-0.5 w-28 mx-auto rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${BLUE}80, transparent)` }} />
        </motion.div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 sm:space-y-8">

      {/* ════════════════════  TOP ROW  ════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Learning Depth Score — Circular */}
        <GlowCard delay={0} theme={theme}>
          <CircularProgress value={depthScore} size={100} label="Learning Depth" color={primaryBlue} />
        </GlowCard>

        {/* Total Books */}
        <GlowCard delay={0.08} theme={theme}>
          <div className="text-center">
            <div className="text-lg mb-1">📘</div>
            <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: darkLabelBlue }}>Books Completed</div>
            <AnimatedNumber value={totalBooks} className="text-3xl sm:text-4xl font-black" styleOverride={brightNumberStyle} />
            <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">{avgHours} avg hrs/book</p>
          </div>
        </GlowCard>

        {/* Total Learning Hours */}
        <GlowCard delay={0.16} theme={theme}>
          <div className="text-center">
            <div className="text-lg mb-1">⏱️</div>
            <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: `${GREEN}CC` }}>Learning Hours</div>
            <AnimatedNumber value={totalHours} className="text-3xl sm:text-4xl font-black" suffix="h" styleOverride={brightNumberStyle} />
            <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">total estimated</p>
          </div>
        </GlowCard>

        {/* Academic Level Badge */}
        <GlowCard delay={0.24} theme={theme}>
          <div className="text-center flex flex-col items-center justify-center h-full">
            <div className="text-lg mb-1">🎓</div>
            <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: `${GOLD}CC` }}>Academic Level</div>
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
              className="px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold"
              style={{
                background: `linear-gradient(135deg, ${BLUE}30, ${GOLD}20)`,
                border: `2px solid ${BLUE}`,
                color: '#fff',
                boxShadow: GLOW
              }}
            >
              {academicLevel}
            </motion.div>
            <p className="text-[9px] text-slate-500 mt-2">Score: {depthScore}/100</p>
          </div>
        </GlowCard>
      </div>

      {/* Additional Education Analytics — Same grid as top row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <GlowCard delay={0.3} theme={theme}>
          <div className="text-center w-full h-full flex flex-col items-center justify-center">
            <div className="text-lg mb-1">🧩</div>
            <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: darkLabelBlue }}>Learning Retention</div>
            <AnimatedNumber value={learningRetention.score} className="text-3xl sm:text-4xl font-black" suffix="%" styleOverride={brightNumberStyle} />
            <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">{learningRetention.subtitle}</p>
          </div>
        </GlowCard>

        <GlowCard delay={0.36} theme={theme}>
          <div className="text-center w-full h-full flex flex-col items-center justify-center">
            <div className="text-lg mb-1">🧠</div>
            <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: `${ROSE}CC` }}>Cognitive Load</div>
            <p className="text-3xl sm:text-4xl font-black text-white">{cognitiveLoad.value}</p>
            <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">Advanced intensity and completion pressure</p>
          </div>
        </GlowCard>

        <GlowCard delay={0.42} theme={theme}>
          <div className="text-center w-full h-full flex flex-col items-center justify-center">
            <div className="text-lg mb-1">🎯</div>
            <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: `${GREEN}CC` }}>Focus Stability</div>
            <AnimatedNumber value={focusStability.score} className="text-3xl sm:text-4xl font-black" suffix="%" styleOverride={brightNumberStyle} />
            <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">Consistency of topics and switching control</p>
          </div>
        </GlowCard>

        <GlowCard delay={0.48} theme={theme}>
          <div className="text-center w-full h-full flex flex-col items-center justify-center">
            <div className="text-lg mb-1">🌐</div>
            <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: `${CYAN}CC` }}>Interdisciplinary Index</div>
            <p className="text-3xl sm:text-4xl font-black text-white">{interdisciplinaryIndex.value}</p>
            <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">Domain diversity across completed reads</p>
          </div>
        </GlowCard>

        <GlowCard delay={0.54} theme={theme}>
          <div className="text-center w-full h-full flex flex-col items-center justify-center">
            <div className="text-lg mb-1">⚙️</div>
            <div className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: `${GOLD}CC` }}>Completion Efficiency</div>
            <AnimatedNumber value={completionEfficiency.score} className="text-3xl sm:text-4xl font-black" suffix="%" styleOverride={brightNumberStyle} />
            <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1">Completion speed adjusted by difficulty</p>
          </div>
        </GlowCard>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.42 }}
        className="p-5 sm:p-6 rounded-2xl"
        style={surfaceStyle}
      >
        <SectionHeading icon="📈" title="Learning Growth" />
        <div className="mt-5" style={{ height: '180px' }}>
          <svg width="100%" height="180" viewBox="0 0 360 180" preserveAspectRatio="none">
            {[0.25, 0.5, 0.75].map((fraction) => (
              <line key={fraction} x1="0" y1={180 - fraction * 160} x2="360" y2={180 - fraction * 160} stroke={`${primaryBlue}16`} strokeWidth="1" />
            ))}

            <motion.path
              d={`M ${learningGrowth.points.map((point, idx) => `${idx * (360 / 11)} ${180 - (point.depth / learningGrowth.maxDepth) * 155}`).join(' L ')} L ${11 * (360 / 11)} 180 L 0 180 Z`}
              fill={`${primaryBlue}20`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.52, duration: 0.8 }}
            />

            <motion.polyline
              points={learningGrowth.points.map((point, idx) => `${idx * (360 / 11)},${180 - (point.depth / learningGrowth.maxDepth) * 155}`).join(' ')}
              fill="none"
              stroke={primaryBlue}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.5, duration: 1.1 }}
              style={{ filter: `drop-shadow(0 0 6px ${primaryBlue})` }}
            />

            {learningGrowth.points.map((point, idx) => point.depth > 0 && (
              <motion.circle
                key={point.month}
                cx={idx * (360 / 11)}
                cy={180 - (point.depth / learningGrowth.maxDepth) * 155}
                r="4"
                fill={primaryBlue}
                stroke="#fff"
                strokeWidth="1.5"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.62 + idx * 0.04, type: 'spring' }}
              />
            ))}
          </svg>

          <div className="flex justify-between mt-1 px-0">
            {learningGrowth.points.map((point) => (
              <span key={point.month} className="text-[8px] sm:text-[9px] text-slate-500 w-[30px] text-center">{point.month}</span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Topic Coverage & Knowledge Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Topic Focus Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.48 }}
          className="p-5 sm:p-6 rounded-2xl"
          style={surfaceStyle}
        >
          <SectionHeading icon="🎓" title="Topic Focus Distribution" />
          <div className="mt-5 space-y-3">
            {(() => {
              const topicCounts = {}
              finishedEducationalBooks.forEach((b) => {
                const topic = String(b.genre || 'general').toLowerCase()
                topicCounts[topic] = (topicCounts[topic] || 0) + 1
              })
              const sorted = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])
              const total = finishedEducationalBooks.length
              return sorted.map(([topic, count], i) => {
                const pct = total > 0 ? (count / total) * 100 : 0
                const colors = [primaryBlue, GREEN, GOLD, ROSE, CYAN]
                const color = colors[i % colors.length]
                return (
                  <div key={topic}>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-xs sm:text-sm text-slate-300 capitalize">{topic}</span>
                      <span className="text-xs font-bold" style={{ color }}>{count} book{count !== 1 ? 's' : ''} ({Math.round(pct)}%)</span>
                    </div>
                    <div className="h-3 sm:h-4 rounded-full overflow-hidden" style={{ background: 'rgba(30,144,255,0.08)' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: 0.58 + i * 0.08, duration: 0.8, ease: 'easeOut' }}
                        className="h-full rounded-full"
                        style={{
                          background: `linear-gradient(90deg, ${color}60, ${color})`,
                          boxShadow: `0 0 12px ${color}50`,
                        }}
                      />
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </motion.div>

        {/* Learning Insights */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.54 }}
          className="p-5 sm:p-6 rounded-2xl"
          style={surfaceStyle}
        >
          <SectionHeading icon="💡" title="Learning Intelligence" />
          <div className="mt-5 space-y-3">
            {(() => {
              const insights = []
              const allSkills = {}
              finishedEducationalBooks.forEach((b) => {
                b.skills.forEach((s) => {
                  allSkills[s] = (allSkills[s] || 0) + 1
                })
              })
              const topSkill = Object.entries(allSkills).sort((a, b) => b[1] - a[1])[0]
              if (topSkill) {
                insights.push({ emoji: '🏆', label: 'Top Skill', value: topSkill[0], color: GOLD })
              }

              const avgDifficulty = (
                (difficultyCounts.Beginner * 1 + difficultyCounts.Intermediate * 2 + difficultyCounts.Advanced * 3) /
                (totalBooks || 1)
              ).toFixed(1)
              const diffLevel = avgDifficulty < 1.5 ? 'Foundational' : avgDifficulty < 2.2 ? 'Intermediate' : 'Advanced'
              insights.push({ emoji: '📚', label: 'Avg Difficulty', value: diffLevel, color: ROSE })

              const comprehensiveness = Math.round((Object.keys(skillCounts).length / 15) * 100)
              insights.push({ emoji: '🎯', label: 'Skill Breadth', value: `${comprehensiveness}%`, color: CYAN })

              const learnVelocity = totalBooks > 0 ? Math.round((totalHours / totalBooks) * 10) / 10 : 0
              const paceLabel = learnVelocity < 5 ? 'Quick Learner' : learnVelocity < 8 ? 'Balanced Pace' : 'Deep Diver'
              insights.push({ emoji: '⚡', label: 'Learning Pace', value: paceLabel, color: GREEN })

              return insights.map((insight, i) => (
                <div key={insight.label} className="flex items-center justify-between p-3 rounded-lg" style={{ background: `${insight.color}0A`, border: `1px solid ${insight.color}20` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{insight.emoji}</span>
                    <span className="text-xs sm:text-sm text-slate-300">{insight.label}</span>
                  </div>
                  <span className="text-xs sm:text-sm font-bold" style={{ color: insight.color }}>{insight.value}</span>
                </div>
              ))
            })()}
          </div>
        </motion.div>
      </div>

      {/* Recommended Learning Path & Growth Opportunities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Knowledge Gaps & Opportunities */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="p-5 sm:p-6 rounded-2xl"
          style={surfaceStyle}
        >
          <SectionHeading icon="🎯" title="Growth Opportunities" />
          <div className="mt-5 space-y-3">
            {(() => {
              const suggestedTopics = ['Psychology', 'Philosophy', 'History', 'Economics', 'Science', 'Sociology']
              const readTopics = new Set(finishedEducationalBooks.map((b) => String(b.genre || '').toLowerCase()))
              const gaps = suggestedTopics.filter((topic) => !readTopics.has(topic.toLowerCase()))
              const topicCounts = {}
              finishedEducationalBooks.forEach((b) => {
                topicCounts[String(b.genre || '').toLowerCase()] = (topicCounts[String(b.genre || '').toLowerCase()] || 0) + 1
              })
              const sortedGaps = gaps.slice(0, 4)
              return sortedGaps.length > 0 ? (
                sortedGaps.map((topic, i) => (
                  <div key={topic} className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📖</span>
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-white">{topic}</p>
                        <p className="text-[9px] text-slate-400">Not yet explored</p>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: `${GREEN}20`, color: GREEN }}>
                      Recommended
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">You've explored most core topics! Consider deepening existing areas or exploring niche specializations.</p>
              )
            })()}
          </div>
        </motion.div>

        {/* Mastery Progression */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.66 }}
          className="p-5 sm:p-6 rounded-2xl"
          style={surfaceStyle}
        >
          <SectionHeading icon="🏔️" title="Subject Mastery Journey" />
          <div className="mt-5 space-y-3">
            {(() => {
              const topicCounts = {}
              const topicDifficulty = {}
              finishedEducationalBooks.forEach((b) => {
                const topic = String(b.genre || 'general').toLowerCase()
                topicCounts[topic] = (topicCounts[topic] || 0) + 1
                const diffWeight = b.difficulty === 'Beginner' ? 1 : b.difficulty === 'Intermediate' ? 2 : 3
                topicDifficulty[topic] = (topicDifficulty[topic] || 0) + diffWeight
              })
              return Object.entries(topicCounts) .sort((a, b) => b[1] - a[1]) .slice(0, 3) .map(([topic, count], i) => {
                const avgDiff = (topicDifficulty[topic] || 0) / count
                const masteryPct = Math.min(100, Math.round((count * avgDiff * 15)))
                const level = masteryPct < 30 ? 'Novice' : masteryPct < 60 ? 'Practitioner' : masteryPct < 85 ? 'Expert' : 'Master'
                const levelColor = masteryPct < 30 ? GREEN : masteryPct < 60 ? GOLD : masteryPct < 85 ? BLUE : CYAN
                return (
                  <div key={topic}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs sm:text-sm font-semibold text-white capitalize">{topic}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${levelColor}20`, color: levelColor }}>
                        {level}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(30,144,255,0.08)' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${masteryPct}%` }}
                        transition={{ delay: 0.7 + i * 0.1, duration: 0.8 }}
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, ${levelColor}60, ${levelColor})`, boxShadow: `0 0 8px ${levelColor}40` }}
                      />
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1">{count} book{count !== 1 ? 's' : ''} • avg difficulty: {(avgDiff).toFixed(1)}/3</p>
                  </div>
                )
              })
            })()}
          </div>
        </motion.div>
      </div>

      {/* ════════════════════  MIDDLE ROW  ════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Difficulty Distribution — Horizontal Bar Chart */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="p-5 sm:p-6 rounded-2xl"
          style={surfaceStyle}
        >
          <SectionHeading icon="📊" title="Difficulty Distribution" />
          <div className="space-y-4 mt-5">
            {(['Beginner', 'Intermediate', 'Advanced']).map((level, i) => {
              const count = difficultyCounts[level] || 0
              const pct = totalBooks > 0 ? (count / totalBooks) * 100 : 0
              const colors = { Beginner: GREEN, Intermediate: BLUE, Advanced: ROSE }
              return (
                <div key={level}>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-xs sm:text-sm text-slate-300 font-medium">{level}</span>
                    <span className="text-xs font-bold" style={{ color: colors[level] }}>{count} book{count !== 1 ? 's' : ''} ({Math.round(pct)}%)</span>
                  </div>
                  <div className="h-4 sm:h-5 rounded-full overflow-hidden" style={{ background: 'rgba(30,144,255,0.08)' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: 0.5 + i * 0.12, duration: 0.8, ease: 'easeOut' }}
                      className="h-full rounded-full flex items-center pl-2"
                      style={{
                        background: `linear-gradient(90deg, ${colors[level]}60, ${colors[level]})`,
                        boxShadow: `0 0 12px ${colors[level]}50`,
                        minWidth: count > 0 ? '24px' : '0px'
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>

        {/* Skill Coverage — Radar-style visual */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38 }}
          className="p-5 sm:p-6 rounded-2xl"
          style={surfaceStyle}
        >
          <SectionHeading icon="🧠" title="Skill Coverage Radar" />
          <SkillRadar skillCounts={skillCounts} theme={theme} />
        </motion.div>
      </div>

      {/* ════════════════════  BOTTOM ROW  ════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Completion Velocity */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="p-5 sm:p-6 rounded-2xl"
          style={surfaceStyle}
        >
          <SectionHeading icon="⚡" title="Completion Velocity" />
          <div className="grid grid-cols-3 gap-3 mt-5">
            <VelocityStat label="Average" value={`${velocity.avg}d`} color={primaryBlue} delay={0.55} />
            <VelocityStat label="Fastest" value={`${velocity.fastest}d`} color={GREEN} delay={0.63} />
            <VelocityStat label="Slowest" value={`${velocity.slowest}d`} color={GOLD} delay={0.71} />
          </div>
          <p className="text-[9px] sm:text-[10px] text-slate-500 mt-4 text-center">Days to complete a book (start → finish)</p>
        </motion.div>

        {/* Learning Streak / Summary */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.52 }}
          className="p-5 sm:p-6 rounded-2xl"
          style={surfaceStyle}
        >
          <SectionHeading icon="🔥" title="Learning Summary" />
          <div className="space-y-3 mt-5">
            <SummaryRow icon="📖" label="Total Pages Covered" value={`~${finishedEducationalBooks.reduce((s, b) => s + b.pages, 0).toLocaleString()}`} />
            <SummaryRow icon="🏆" label="Top Skill" value={Object.entries(skillCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'} />
            <SummaryRow icon="📚" label="Top Genre" value={(() => { const gc = {}; finishedEducationalBooks.forEach(b => { gc[b.genre] = (gc[b.genre] || 0) + 1 }); return Object.entries(gc).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A' })()} />
            <SummaryRow icon="⏱️" label="Avg Hours / Book" value={`${avgHours}h`} />
            <SummaryRow icon="📈" label="Depth Score" value={`${depthScore}/100`} />
          </div>
        </motion.div>
      </div>

      {/* ════════════════════  BOOK-BY-BOOK DETAIL  ════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="p-5 sm:p-6 rounded-2xl"
        style={surfaceStyle}
      >
        <SectionHeading icon="📘" title="Book-by-Book Intelligence" sub="Tap any book for detailed learning telemetry" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
          {finishedEducationalBooks.map((book, idx) => {
            const bookKey = String(book.id ?? `${book.title || 'book'}-${idx}`)
            return (
            <motion.div
              key={book.id || idx}
              layout
              onClick={() => setExpandedBookKey(expandedBookKey === bookKey ? null : bookKey)}
              className="cursor-pointer rounded-xl overflow-hidden transition-all duration-300"
              whileHover={{ scale: 1.02, boxShadow: isDarkMode ? GLOW : LIGHT_HOVER_GLOW }}
              style={{
                border: `2px solid ${expandedBookKey === bookKey ? BLUE : CARD_BORDER}`,
                background: expandedBookKey === bookKey ? `linear-gradient(135deg, ${BLUE}12, ${GREEN}06)` : 'rgba(15,23,42,0.5)',
                boxShadow: expandedBookKey === bookKey ? GLOW : 'none',
              }}
            >
              {/* Header */}
              <div className="p-3 sm:p-4 flex items-start gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold"
                  style={{ background: `${primaryBlue}30`, border: `1px solid ${primaryBlue}60`, color: primaryBlue }}
                >
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-semibold text-white truncate">{book.title}</div>
                  <div className="text-[10px] sm:text-xs text-slate-400">{book.author}</div>
                </div>
                <DifficultyBadge level={book.difficulty} />
              </div>

              {/* Expanded */}
              <AnimatePresence>
                {expandedBookKey === bookKey && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <MiniBar label="Hours" value={`${book.estimatedHours}h`} pct={(book.estimatedHours / Math.max(...finishedEducationalBooks.map(b => b.estimatedHours))) * 100} color={primaryBlue} />
                        <MiniBar label="Pages" value={book.pages} pct={(book.pages / Math.max(...finishedEducationalBooks.map(b => b.pages))) * 100} color={GREEN} />
                        <MiniBar label="Days" value={`${book.daysTaken}d`} pct={(book.daysTaken / velocity.slowest) * 100} color={GOLD} />
                        <MiniBar label="Difficulty" value={book.difficulty} pct={book.difficulty === 'Beginner' ? 33 : book.difficulty === 'Intermediate' ? 66 : 100} color={ROSE} />
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {book.skills.map(s => (
                          <span key={s} className="text-[9px] px-2 py-0.5 rounded-full font-medium"
                            style={{ background: `${BLUE}20`, border: `1px solid ${BLUE}30`, color: `${BLUE}DD` }}
                          >{s}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-[9px] text-slate-500 pt-0.5">
                        <span>{book.genre}</span>
                        {book.tone && <><span>·</span><span>{book.tone}</span></>}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}


/* ══════════════════════════════════════════════════════════════
 *  SUB-COMPONENTS
 * ══════════════════════════════════════════════════════════════ */

// ── Animated counter ──
function AnimatedNumber({ value, className = '', suffix = '', styleOverride }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef(null)
  useEffect(() => {
    let start = 0
    const end = value
    if (end === 0) { setDisplay(0); return }
    const duration = 1200
    const step = Math.max(1, Math.floor(duration / end))
    const timer = setInterval(() => {
      start += 1
      setDisplay(start)
      if (start >= end) clearInterval(timer)
    }, step)
    return () => clearInterval(timer)
  }, [value])
  return <div ref={ref} className={className} style={styleOverride}>{display}{suffix}</div>
}

// ── Circular progress ring ──
function CircularProgress({ value, size = 100, label, color }) {
  const radius = (size - 12) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference
  return (
    <div className="flex flex-col items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Track */}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(30,144,255,0.12)" strokeWidth="8" />
        {/* Progress */}
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ delay: 0.4, duration: 1.2, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-xl sm:text-2xl font-black text-white">{value}</span>
        <span className="text-[8px] sm:text-[9px] text-slate-400 uppercase tracking-wider">/100</span>
      </div>
      <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1.5 font-semibold uppercase tracking-wider">{label}</p>
    </div>
  )
}

function GlowCard({ children, delay = 0, theme = 'light' }) {
  const isDarkMode = theme === 'dark'
  const hoverGlow = isDarkMode ? GLOW : LIGHT_HOVER_GLOW
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.5 }}
      whileHover={{ scale: 1.02, boxShadow: hoverGlow }}
      className="relative p-4 sm:p-5 rounded-2xl flex items-center justify-center overflow-hidden transition-shadow duration-100"
      style={isDarkMode ? { background: CARD_BG, border: `2px solid ${CARD_BORDER}`, boxShadow: GLOW_SOFT } : { background: LIGHT_CARD_BG, border: `1px solid ${LIGHT_CARD_BORDER}`, boxShadow: LIGHT_CARD_SHADOW, backdropFilter: 'blur(18px)' }}
    >
      {/* Scan line */}
      <motion.div
        initial={{ top: '-20%' }}
        animate={{ top: '120%' }}
        transition={{ duration: 3.5, repeat: Infinity, repeatDelay: 3, delay: delay + 1 }}
        className="absolute left-0 right-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${BLUE}40, transparent)` }}
      />
      {children}
    </motion.div>
  )
}

// ── Section heading ──
function SectionHeading({ icon, title, sub }) {
  return (
    <>
      <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
        <span style={{ color: BLUE }}>◈</span> {icon} {title}
      </h3>
      {sub && <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">{sub}</p>}
    </>
  )
}

// ── Skill Radar (pure CSS/SVG) ──
function SkillRadar({ skillCounts, theme = 'light' }) {
  const isDarkMode = theme === 'dark'
  const chartBlue = isDarkMode ? BLUE : '#0B4FC5'
  const entries = Object.entries(skillCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const max = Math.max(...entries.map(e => e[1]), 1)

  if (entries.length === 0) return <p className="text-xs text-slate-500 mt-4">No skills data yet.</p>

  // If fewer than 3 skills, show horizontal bars instead
  if (entries.length < 3) {
    return (
      <div className="space-y-3 mt-5">
        {entries.map(([skill, count], i) => (
          <div key={skill}>
            <div className="flex justify-between mb-1">
              <span className="text-xs text-slate-300">{skill}</span>
              <span className="text-xs font-bold" style={{ color: chartBlue }}>{count}</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: `${chartBlue}10` }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(count / max) * 100}%` }}
                transition={{ delay: 0.5 + i * 0.1, duration: 0.7 }}
                className="h-full rounded-full"
                style={{ background: chartBlue, boxShadow: `0 0 8px ${chartBlue}50` }}
              />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // SVG Radar polygon
  const cx = 140, cy = 130, R = 100
  const n = entries.length
  const getPoint = (i, r) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
  }

  // Concentric guide rings
  const rings = [0.25, 0.5, 0.75, 1.0]

  // Data polygon
  const dataPoints = entries.map(([, count], i) => getPoint(i, (count / max) * R))
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z'

  return (
    <div className="flex justify-center mt-4">
      <svg width={280} height={280} viewBox="0 0 280 260" className="max-w-full">
        {/* Guide rings */}
        {rings.map(r => (
          <polygon
            key={r}
            points={entries.map((_, i) => getPoint(i, R * r).join(',')).join(' ')}
            fill="none" stroke={`${chartBlue}18`} strokeWidth="1"
          />
        ))}
        {/* Axis lines */}
        {entries.map((_, i) => {
          const [px, py] = getPoint(i, R)
          return <line key={i} x1={cx} y1={cy} x2={px} y2={py} stroke={`${chartBlue}15`} strokeWidth="1" />
        })}
        {/* Data polygon */}
        <motion.path
          d={dataPath}
          fill={`${chartBlue}20`}
          stroke={BLUE}
          strokeWidth="2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          style={{ filter: `drop-shadow(0 0 6px ${chartBlue}50)` }}
        />
        {/* Data dots + labels */}
        {entries.map(([skill, count], i) => {
          const [px, py] = getPoint(i, (count / max) * R)
          const [lx, ly] = getPoint(i, R + 18)
          return (
            <g key={skill}>
              <motion.circle
                cx={px} cy={py} r={4}
                fill={BLUE} stroke="#fff" strokeWidth="1.5"
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ delay: 0.7 + i * 0.06, type: 'spring' }}
                style={{ filter: `drop-shadow(0 0 4px ${chartBlue})` }}
              />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                className="text-[9px] sm:text-[10px] fill-slate-400 font-medium"
              >
                {skill}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Velocity stat card ──
function VelocityStat({ label, value, color, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="text-center p-3 rounded-xl"
      style={{ background: `${color}0D`, border: `1px solid ${color}25` }}
    >
      <p className="text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: `${color}BB` }}>{label}</p>
      <p className="text-xl sm:text-2xl font-black text-white">{value}</p>
    </motion.div>
  )
}

// ── Summary row ──
function SummaryRow({ icon, label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-b-0">
      <span className="text-xs sm:text-sm text-slate-300">
        <span className="mr-2">{icon}</span>{label}
      </span>
      <span className="text-xs sm:text-sm font-bold text-white">{value}</span>
    </div>
  )
}

// ── Difficulty badge ──
function DifficultyBadge({ level }) {
  const cfg = {
    Beginner: { bg: `${GREEN}20`, color: GREEN, border: `${GREEN}30` },
    Intermediate: { bg: `${GOLD}20`, color: GOLD, border: `${GOLD}30` },
    Advanced: { bg: `${ROSE}20`, color: ROSE, border: `${ROSE}30` },
  }
  const c = cfg[level] || cfg.Intermediate
  return (
    <span className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}
    >
      {level}
    </span>
  )
}

// ── Mini metric bar for book detail ──
function MiniBar({ label, value, pct, color }) {
  return (
    <div className="p-2 rounded-lg" style={{ background: 'rgba(15,23,42,0.6)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] text-slate-400">{label}</span>
        <span className="text-[10px] font-bold" style={{ color }}>{value}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: `${color}15` }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: color, boxShadow: `0 0 6px ${color}50` }}
        />
      </div>
    </div>
  )
}
