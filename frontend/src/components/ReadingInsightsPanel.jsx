import React, { useMemo } from 'react'

function normalizeType(typeValue) {
  const raw = String(typeValue || '').trim().toLowerCase()
  if (raw === 'self_help' || raw === 'self-help' || raw === 'self help') return 'self_help'
  if (raw === 'educational' || raw === 'non-fiction' || raw === 'nonfiction') return 'educational'
  return 'fiction'
}

function fallbackInsightsByType(normalizedType) {
  if (normalizedType === 'educational') {
    return {
      vocabulary_enrichment: 'High',
      cognitive_benefit: 'Analytical thinking and conceptual understanding',
      knowledge_domain: 'Subject learning',
      reading_value: 'Academic knowledge growth',
    }
  }

  if (normalizedType === 'self_help') {
    return {
      vocabulary_enrichment: 'Medium',
      cognitive_benefit: 'Mindset improvement and behavioral psychology',
      skill_development: 'Productivity, discipline, habit formation',
      reading_value: 'Practical life improvement',
    }
  }

  return {
    vocabulary_enrichment: 'Medium-High',
    cognitive_benefit: 'Emotional intelligence and narrative interpretation',
    narrative_complexity: 'Moderate-High',
    reading_value: 'Imagination, empathy, and storytelling depth',
  }
}

export default function ReadingInsightsPanel({ book }) {
  if (!book) return null

  const normalizedType = normalizeType(book.type)
  const insights = useMemo(() => {
    const fromBook = book.reading_insights
    if (fromBook && typeof fromBook === 'object') return fromBook
    return fallbackInsightsByType(normalizedType)
  }, [book.reading_insights, normalizedType])

  return (
    <div className="mt-3 rounded-xl border border-white/15 bg-white/10 p-3">
      <h4 className="text-xs font-semibold text-white mb-2">Reading Insights</h4>

      <div className="space-y-1.5 text-[11px] text-slate-200">
        {insights.vocabulary_enrichment && (
          <p>📚 Vocabulary Enrichment: {insights.vocabulary_enrichment}</p>
        )}
        {insights.cognitive_benefit && (
          <p>🧠 Cognitive Benefit: {insights.cognitive_benefit}</p>
        )}
        {insights.narrative_complexity && (
          <p>📖 Narrative Complexity: {insights.narrative_complexity}</p>
        )}
        {insights.skill_development && (
          <p>🎯 Skill Development: {insights.skill_development}</p>
        )}
        {insights.knowledge_domain && (
          <p>📘 Knowledge Domain: {insights.knowledge_domain}</p>
        )}
        {insights.reading_value && (
          <p>✨ Reading Value: {insights.reading_value}</p>
        )}
      </div>
    </div>
  )
}
