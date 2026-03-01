import React, { useMemo } from 'react'

/**
 * EducationalInsightPanel — Renders only for educational books
 * Shows: Reading Time Estimate, Difficulty Level, Skill Impact Score,
 * Concept Density, Prerequisite Topics
 */
export default function EducationalInsightPanel({ book }) {
  if (!book || book.type !== 'educational') return null

  // Generate deterministic insights from book properties
  const insights = useMemo(() => {
    const hash = (str) => {
      let h = 0
      for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0
      }
      return Math.abs(h)
    }

    const seed = hash(book.title + (book.author || ''))
    
    // Pacing affects reading time
    const pacingMultiplier = { slow: 1.4, moderate: 1.0, fast: 0.8 }
    const basePacing = pacingMultiplier[book.pacing] || 1.0
    const readingTimeHours = Math.round((3 + (seed % 12)) * basePacing)
    
    // Tone affects difficulty
    const toneMap = { academic: 0.9, philosophical: 0.8, instructive: 0.6, serious: 0.7, journalistic: 0.5, humorous: 0.4, witty: 0.3, lyrical: 0.5 }
    const baseDifficulty = toneMap[book.tone] || 0.5
    const difficulty = Math.min(0.95, Math.max(0.2, baseDifficulty + ((seed % 20) - 10) / 100))
    
    // Skill impact based on genre
    const genreImpact = { 
      science: 0.85, economics: 0.8, philosophy: 0.75, education: 0.8, 
      history: 0.7, psychology: 0.75, sociology: 0.7, biography: 0.6, 
      'self-help': 0.5, finance: 0.7, business: 0.65 
    }
    const skillImpact = Math.min(0.98, Math.max(0.3, (genreImpact[book.genre] || 0.6) + ((seed % 15) - 7) / 100))
    
    // Concept density
    const conceptDensity = Math.min(0.95, Math.max(0.3, difficulty * 0.8 + ((seed % 10) / 50)))
    
    // Prerequisite topics based on genre
    const topicMap = {
      science: ['Scientific Method', 'Basic Mathematics', 'Critical Thinking'],
      economics: ['Supply & Demand', 'Market Principles', 'Statistics Basics'],
      philosophy: ['Logic Fundamentals', 'Ethics Overview', 'Historical Context'],
      education: ['Learning Theory', 'Cognitive Science', 'Pedagogy Basics'],
      history: ['World History Basics', 'Primary Sources', 'Analytical Reading'],
      psychology: ['Behavioral Science', 'Research Methods', 'Statistics'],
      sociology: ['Social Theory', 'Research Methods', 'Cultural Context'],
      biography: ['Historical Context', 'Critical Reading'],
      finance: ['Basic Accounting', 'Math Fundamentals', 'Market Basics'],
      business: ['Management Basics', 'Economics 101', 'Strategic Thinking'],
    }
    const prerequisites = topicMap[book.genre] || ['General Knowledge', 'Critical Thinking']
    
    return {
      readingTimeHours,
      difficulty,
      skillImpact,
      conceptDensity,
      prerequisites,
    }
  }, [book.title, book.author, book.pacing, book.tone, book.genre])

  const difficultyLabel = insights.difficulty > 0.7 ? 'Advanced' : insights.difficulty > 0.45 ? 'Intermediate' : 'Beginner'
  const difficultyColor = insights.difficulty > 0.7 ? '#ef4444' : insights.difficulty > 0.45 ? '#f59e0b' : '#10b981'

  return (
    <div className="mt-6 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-50/80 to-blue-50/80 dark:from-slate-800/60 dark:to-slate-900/60 backdrop-blur-sm">
      <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
        🎓 AI Educational Insights
      </h3>
      
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
        {/* Reading Time Estimate */}
        <div className="p-3 rounded-xl bg-white/70 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 transition-all duration-300 hover:shadow-md">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">⏱️</span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Reading Time</span>
          </div>
          <div className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white">
            ~{insights.readingTimeHours}h
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-500">estimated</div>
        </div>
        
        {/* Skill Impact Score — Circular Progress Ring */}
        <div className="p-3 rounded-xl bg-white/70 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 transition-all duration-300 hover:shadow-md flex flex-col items-center">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Skill Impact</span>
          <div className="relative w-16 h-16">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" className="text-slate-200 dark:text-slate-600" strokeWidth="5" />
              <circle 
                cx="32" cy="32" r="26" fill="none" 
                stroke="#3b82f6" strokeWidth="5" strokeLinecap="round"
                strokeDasharray={`${insights.skillImpact * 163.36} 163.36`}
                style={{ transition: 'stroke-dasharray 1.5s ease-out' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-white">
              {Math.round(insights.skillImpact * 100)}%
            </div>
          </div>
        </div>
      </div>
      
      {/* Difficulty Level Meter — Animated Horizontal Bar */}
      <div className="mb-4 p-3 rounded-xl bg-white/70 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
            📊 Difficulty Level
          </span>
          <span className="text-xs font-bold" style={{ color: difficultyColor }}>{difficultyLabel}</span>
        </div>
        <div className="w-full h-3 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
          <div 
            className="h-full rounded-full"
            style={{ 
              width: `${insights.difficulty * 100}%`, 
              background: `linear-gradient(90deg, #10b981, #f59e0b, #ef4444)`,
              transition: 'width 1.5s ease-out'
            }} 
          />
        </div>
      </div>
      
      {/* Concept Density Gauge — Vertical Indicator */}
      <div className="mb-4 p-3 rounded-xl bg-white/70 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">🧠 Concept Density</span>
          <div className="flex-1 flex items-center gap-1">
            {[...Array(10)].map((_, i) => (
              <div 
                key={i} 
                className="flex-1 rounded-sm transition-all duration-500"
                style={{ 
                  height: `${12 + i * 2}px`,
                  backgroundColor: i < Math.round(insights.conceptDensity * 10) 
                    ? `hsl(${210 + i * 5}, 70%, ${50 - i * 2}%)` 
                    : 'rgba(148, 163, 184, 0.3)',
                  transitionDelay: `${i * 80}ms`
                }} 
              />
            ))}
          </div>
          <span className="text-xs font-bold text-slate-700 dark:text-white">
            {Math.round(insights.conceptDensity * 100)}%
          </span>
        </div>
      </div>
      
      {/* Prerequisite Topics — Tag List */}
      <div className="p-3 rounded-xl bg-white/70 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 block">📋 Prerequisite Topics</span>
        <div className="flex flex-wrap gap-2">
          {insights.prerequisites.map((topic, i) => (
            <span 
              key={i} 
              className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition-all duration-300 hover:shadow-sm"
            >
              {topic}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
