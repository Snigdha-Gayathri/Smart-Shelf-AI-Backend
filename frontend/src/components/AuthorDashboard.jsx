import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function titleCase(text) {
  const t = String(text || '').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Unknown'
}

function getRandomAuthor(authors) {
  if (!authors.length) return null
  return authors[Math.floor(Math.random() * authors.length)]
}

function analyzeAuthorUsage({ wantToRead = [], currentlyReading = [], finished = [] }) {
  const allShelves = [
    ...wantToRead.map((b) => ({ ...b, shelf: 'want' })),
    ...currentlyReading.map((b) => ({ ...b, shelf: 'current' })),
    ...finished.map((b) => ({ ...b, shelf: 'finished' })),
  ]

  const counts = {}
  const finishedCounts = {}
  const currentSet = new Set()

  allShelves.forEach((book) => {
    const author = String(book.author || '').trim()
    if (!author) return
    counts[author] = (counts[author] || 0) + 1
    if (book.shelf === 'finished') {
      finishedCounts[author] = (finishedCounts[author] || 0) + 1
    }
    if (book.shelf === 'current') {
      currentSet.add(author)
    }
  })

  const topRead = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  const topFinished = Object.entries(finishedCounts).sort((a, b) => b[1] - a[1])[0]

  return {
    totalAuthors: Object.keys(counts).length,
    mostReadAuthor: topRead ? topRead[0] : 'N/A',
    mostReadCount: topRead ? topRead[1] : 0,
    mostFinishedAuthor: topFinished ? topFinished[0] : 'N/A',
    mostFinishedCount: topFinished ? topFinished[1] : 0,
    currentlyReadingFrom: currentSet.size,
    authorCounts: counts,
  }
}

function generateAuthorRecommendations(libraryAuthors, similarityMap, allAuthorsMap) {
  const inLibrary = new Set(libraryAuthors.map((a) => normalize(a)))
  const candidateScores = {}
  const candidateSources = {}

  libraryAuthors.forEach((sourceAuthor) => {
    const similar = similarityMap[sourceAuthor] || []
    const possibleMatches = Math.max(similar.length, 1)
    similar.forEach((candidate) => {
      const key = normalize(candidate)
      if (!key || inLibrary.has(key)) return
      candidateScores[key] = (candidateScores[key] || 0) + 1
      const src = candidateSources[key] || new Set()
      src.add(sourceAuthor)
      candidateSources[key] = src
      candidateScores[`${key}__possible`] = Math.max(candidateScores[`${key}__possible`] || 0, possibleMatches)
    })
  })

  const results = Object.entries(candidateScores)
    .filter(([key]) => !key.endsWith('__possible'))
    .map(([key, count]) => {
      const possible = Math.max(candidateScores[`${key}__possible`] || 1, 1)
      const matchScore = Math.round((count / possible) * 100)
      const sources = [...(candidateSources[key] || [])]
      const reason = sources.length > 1
        ? `Recommended because you read ${sources.slice(0, 2).join(' and ')}.`
        : `Recommended because you read ${sources[0] || 'similar authors'}.`

      const authorObj = allAuthorsMap.get(key)
      return {
        name: authorObj?.name || titleCase(key),
        website: authorObj?.website || null,
        reason,
        matchScore,
        frequency: count,
      }
    })
    .sort((a, b) => b.frequency - a.frequency || b.matchScore - a.matchScore)

  return results
}

function getGenreDistribution(books) {
  const counts = {}
  books.forEach((book) => {
    const g = normalize(book.genre)
    if (!g) return
    const mapped = g.includes('romance')
      ? 'Romance'
      : g.includes('fantasy')
        ? 'Fantasy'
        : g.includes('thriller')
          ? 'Thriller'
          : g.includes('self-help') || g.includes('self help') || g.includes('productivity')
            ? 'Self Help'
            : 'Other'
    counts[mapped] = (counts[mapped] || 0) + 1
  })

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
  return Object.entries(counts)
    .map(([genre, count]) => ({ genre, pct: Math.round((count / total) * 100), count }))
    .sort((a, b) => b.pct - a.pct)
}

function DonutChart({ data = [] }) {
  const colors = ['#1E90FF', '#06B6D4', '#22C55E', '#F59E0B', '#94A3B8']
  let angle = -90
  const radius = 70
  const stroke = 26

  return (
    <div className="flex flex-col md:flex-row items-center gap-5">
      <svg width="190" height="190" viewBox="0 0 190 190" className="shrink-0">
        {data.map((d, i) => {
          const arc = (d.pct / 100) * 360
          const dash = (Math.PI * 2 * radius * arc) / 360
          const gap = Math.PI * 2 * radius - dash
          const transform = `rotate(${angle} 95 95)`
          angle += arc
          return (
            <circle
              key={d.genre}
              cx="95"
              cy="95"
              r={radius}
              fill="none"
              stroke={colors[i % colors.length]}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${gap}`}
              transform={transform}
              strokeLinecap="butt"
            />
          )
        })}
        <circle cx="95" cy="95" r="44" fill="rgba(15,23,42,0.88)" />
        <text x="95" y="95" textAnchor="middle" dominantBaseline="middle" fill="#e2e8f0" fontSize="12" fontWeight="700">Genres</text>
      </svg>

      <div className="space-y-2 w-full">
        {data.map((d, i) => (
          <div key={d.genre} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ background: colors[i % colors.length] }} />
              <span className="text-slate-200">{d.genre}</span>
            </div>
            <span className="text-slate-300">{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AuthorDashboard({
  previousReads = [],
  currentlyReading = [],
  educationalBooks = [],
  wantToRead = [],
}) {
  const [authorsData, setAuthorsData] = useState([])
  const [similarityMap, setSimilarityMap] = useState({})
  const [dataLoadingError, setDataLoadingError] = useState('')
  const [showDirectory, setShowDirectory] = useState(false)

  useEffect(() => {
    let mounted = true
    async function loadLocalData() {
      try {
        const [authorsRes, similarityRes] = await Promise.all([
          fetch('/data/authors.json'),
          fetch('/data/authorSimilarity.json'),
        ])
        if (!authorsRes.ok) throw new Error('Failed to load authors.json')
        if (!similarityRes.ok) throw new Error('Failed to load authorSimilarity.json')

        const [authorsJson, similarityJson] = await Promise.all([
          authorsRes.json(),
          similarityRes.json(),
        ])

        if (!mounted) return
        setAuthorsData(Array.isArray(authorsJson) ? authorsJson : [])
        setSimilarityMap(similarityJson && typeof similarityJson === 'object' ? similarityJson : {})
        setDataLoadingError('')
      } catch (e) {
        if (!mounted) return
        setDataLoadingError(e?.message || 'Unable to load local author data files.')
      }
    }

    loadLocalData()
    return () => {
      mounted = false
    }
  }, [])

  const allAuthors = authorsData || []
  const authorsMap = useMemo(() => new Map(allAuthors.map((a) => [normalize(a.name), a])), [allAuthors])
  const spotlight = useMemo(() => getRandomAuthor(allAuthors), [allAuthors])

  const finishedBooks = useMemo(() => {
    const completedEducational = educationalBooks
      .filter((b) => b?.eduStatus === 'completed')
      .map((b) => ({ ...b, shelf: 'finished' }))
    return [
      ...previousReads.map((b) => ({ ...b, shelf: 'finished' })),
      ...completedEducational,
    ]
  }, [previousReads, educationalBooks])

  const usage = useMemo(
    () => analyzeAuthorUsage({ wantToRead, currentlyReading, finished: finishedBooks }),
    [wantToRead, currentlyReading, finishedBooks]
  )

  const topAuthors = useMemo(() => {
    const entries = Object.entries(usage.authorCounts || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
    const max = Math.max(...entries.map(([, c]) => c), 1)
    return entries.map(([name, count]) => ({ name, count, pct: Math.round((count / max) * 100) }))
  }, [usage.authorCounts])

  const allShelfBooks = useMemo(
    () => [...wantToRead, ...currentlyReading, ...finishedBooks],
    [wantToRead, currentlyReading, finishedBooks]
  )

  const genreInfluence = useMemo(() => getGenreDistribution(allShelfBooks), [allShelfBooks])

  const libraryAuthorSet = useMemo(() => {
    const set = new Set()
    allShelfBooks.forEach((b) => {
      const n = normalize(b.author)
      if (n) set.add(n)
    })
    return set
  }, [allShelfBooks])

  const priorityNames = [
    'Ali Hazelwood',
    'Colleen Hoover',
    'Ana Huang',
    'Rina Kent',
    'Tahereh Mafi',
    'L.J. Shen',
    'Brandon Sanderson',
    'James Clear',
  ]

  const popularAuthors = useMemo(() => {
    const fromPriority = priorityNames
      .map((name) => authorsMap.get(normalize(name)))
      .filter(Boolean)

    if (fromPriority.length >= 8) return fromPriority.slice(0, 8)

    const used = new Set(fromPriority.map((a) => normalize(a.name)))
    const extras = allAuthors.filter((a) => !used.has(normalize(a.name))).slice(0, 8 - fromPriority.length)
    return [...fromPriority, ...extras]
  }, [authorsMap, allAuthors])

  const recommendations = useMemo(() => {
    const libraryAuthors = [...libraryAuthorSet]
      .map((k) => authorsMap.get(k)?.name || titleCase(k))
      .filter(Boolean)

    return generateAuthorRecommendations(libraryAuthors, similarityMap, authorsMap).slice(0, 6)
  }, [libraryAuthorSet, authorsMap, similarityMap])

  return (
    <section className="w-full space-y-5 sm:space-y-6 page-fade-in">
      <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary dark:text-primary">✒ Author Insights</h2>

      {dataLoadingError && (
        <div className="rounded-xl border border-red-300/40 bg-red-900/25 text-red-100 px-4 py-3 text-sm">
          {dataLoadingError}
        </div>
      )}

      {/* Row 1: Spotlight + Popular */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5">
        <motion.div
          className="xl:col-span-1 rounded-2xl p-4 sm:p-5 border border-white/20 bg-white/10 backdrop-blur-md shadow-md"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <h3 className="text-lg font-semibold text-white mb-3">Author Spotlight</h3>
          {spotlight ? (
            <>
              <a
                href={spotlight.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-base sm:text-lg font-bold text-blue-100 hover:text-white"
              >
                {spotlight.name}
              </a>
              <p className="text-sm text-slate-200 mt-2 leading-relaxed">
                Featured author from your SmartShelf directory. Explore their work and discover similar voices based on your reading profile.
              </p>
              <button
                onClick={() => window.open(spotlight.website, '_blank', 'noopener,noreferrer')}
                className="mt-4 px-3 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: '#1E90FF' }}
              >
                Visit Website
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-300">No spotlight author available.</p>
          )}
        </motion.div>

        <div className="xl:col-span-2 rounded-2xl p-4 sm:p-5 border border-white/20 bg-white/10 backdrop-blur-md shadow-md">
          <h3 className="text-lg font-semibold text-white mb-3">Popular Authors</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {popularAuthors.map((author) => {
              const inLibrary = libraryAuthorSet.has(normalize(author.name))
              return (
                <article
                  key={author.name}
                  className="rounded-xl border border-white/15 bg-slate-900/45 p-3 transition-all duration-200"
                  style={{ boxShadow: '0 4px 14px rgba(15,23,42,0.2)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-5px)'
                    e.currentTarget.style.boxShadow = '0 12px 26px rgba(30,144,255,0.25)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 4px 14px rgba(15,23,42,0.2)'
                  }}
                >
                  <a
                    href={author.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-blue-100 hover:text-white"
                  >
                    {author.name}
                  </a>
                  {inLibrary && (
                    <div className="mt-1">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-200 border border-emerald-300/30">
                        In Your Library
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => window.open(author.website, '_blank', 'noopener,noreferrer')}
                    className="mt-2 w-full px-2 py-1.5 rounded-md text-xs text-white"
                    style={{ background: '#1E90FF' }}
                  >
                    Visit Website
                  </button>
                </article>
              )
            })}
          </div>
        </div>
      </div>

      {/* Author Statistics */}
      <div className="rounded-2xl p-4 sm:p-5 border border-white/20 bg-white/10 backdrop-blur-md shadow-md">
        <h3 className="text-lg font-semibold text-white mb-3">Author Statistics</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl bg-slate-900/45 border border-white/10 p-3">
            <p className="text-xs text-slate-300">Total Authors in Library</p>
            <p className="text-xl font-bold text-white mt-1">{usage.totalAuthors}</p>
          </div>
          <div className="rounded-xl bg-slate-900/45 border border-white/10 p-3">
            <p className="text-xs text-slate-300">Most Read Author</p>
            <p className="text-sm font-semibold text-white mt-1">{usage.mostReadAuthor}</p>
            <p className="text-xs text-slate-400">{usage.mostReadCount} books</p>
          </div>
          <div className="rounded-xl bg-slate-900/45 border border-white/10 p-3">
            <p className="text-xs text-slate-300">Most Finished Author</p>
            <p className="text-sm font-semibold text-white mt-1">{usage.mostFinishedAuthor}</p>
            <p className="text-xs text-slate-400">{usage.mostFinishedCount} books</p>
          </div>
          <div className="rounded-xl bg-slate-900/45 border border-white/10 p-3">
            <p className="text-xs text-slate-300">Authors Currently Being Read</p>
            <p className="text-xl font-bold text-white mt-1">{usage.currentlyReadingFrom}</p>
          </div>
        </div>
      </div>

      {/* Top Authors */}
      <div className="rounded-2xl p-4 sm:p-5 border border-white/20 bg-white/10 backdrop-blur-md shadow-md">
        <h3 className="text-lg font-semibold text-white mb-3">Top Authors in Your Library</h3>
        {!topAuthors.length ? (
          <p className="text-sm text-slate-300">No author data yet.</p>
        ) : (
          <div className="space-y-3">
            {topAuthors.map((item, idx) => (
              <div key={item.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-slate-100">{idx + 1}. {item.name}</span>
                  <span className="text-slate-300">{item.count} books</span>
                </div>
                <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${item.pct}%`, background: '#1E90FF' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Genre Influence */}
      <div className="rounded-2xl p-4 sm:p-5 border border-white/20 bg-white/10 backdrop-blur-md shadow-md">
        <h3 className="text-lg font-semibold text-white mb-3">Author Genre Influence Chart</h3>
        {genreInfluence.length ? (
          <DonutChart data={genreInfluence} />
        ) : (
          <p className="text-sm text-slate-300">No genre influence data available.</p>
        )}
      </div>

      {/* Recommended Authors */}
      <div className="rounded-2xl p-4 sm:p-5 border border-white/20 bg-white/10 backdrop-blur-md shadow-md">
        <h3 className="text-lg font-semibold text-white mb-3">Recommended Authors For You</h3>
        {!recommendations.length ? (
          <p className="text-sm text-slate-300">Read more authors to unlock author recommendations.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {recommendations.map((rec) => (
              <article key={rec.name} className="rounded-xl border border-white/15 bg-slate-900/45 p-3">
                <a href={rec.website || '#'} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-blue-100 hover:text-white">
                  {rec.name}
                </a>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">{rec.reason}</p>
                <p className="text-xs text-slate-200 mt-2">Match Score: <span className="font-semibold">{rec.matchScore}%</span></p>
                {rec.website && (
                  <button
                    onClick={() => window.open(rec.website, '_blank', 'noopener,noreferrer')}
                    className="mt-2 px-2.5 py-1.5 rounded-md text-xs text-white"
                    style={{ background: '#1E90FF' }}
                  >
                    Visit Website
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Directory */}
      <div className="rounded-2xl p-4 sm:p-5 border border-white/20 bg-white/10 backdrop-blur-md shadow-md">
        <h3 className="text-lg font-semibold text-white mb-3">Explore Full Author Directory</h3>
        <button
          onClick={() => setShowDirectory(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: '#1E90FF' }}
        >
          Explore Full Author Directory
        </button>
      </div>

      {showDirectory && (
        <div className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowDirectory(false)}>
          <div className="w-full max-w-3xl rounded-2xl border border-white/20 bg-slate-950/95 p-4 sm:p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white">Author Directory</h3>
              <button onClick={() => setShowDirectory(false)} className="text-sm text-slate-300 hover:text-white">Close</button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto space-y-2 pr-1">
              {allAuthors.map((author) => (
                <div key={author.name} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <a href={author.website} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-100 hover:text-white">
                    {author.name}
                  </a>
                  <button
                    onClick={() => window.open(author.website, '_blank', 'noopener,noreferrer')}
                    className="px-2.5 py-1 rounded-md text-xs text-white"
                    style={{ background: '#1E90FF' }}
                  >
                    Visit Website
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
