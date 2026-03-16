const KEYWORD_GROUPS = {
  romance: ['romance', 'romantic', 'chemistry', 'love story'],
  dark: ['dark', 'morally grey', 'morally gray', 'gritty', 'brooding'],
  thriller: ['thriller', 'suspense', 'edge of my seat', 'intense'],
  mystery: ['mystery', 'whodunit', 'detective', 'investigation'],
  'slow burn': ['slow burn', 'slow-burn', 'gradual romance'],
  emotional: ['emotional', 'heartbreaking', 'tearjerker', 'deep feelings'],
  'character driven': ['character driven', 'character-driven', 'character development', 'well developed characters'],
  'plot twist': ['plot twist', 'twist ending', 'unexpected ending'],
  'fantasy worldbuilding': ['worldbuilding', 'fantasy world', 'magic system', 'immersive world'],
}

const STORY_STYLE_MAP = {
  'Character Driven': ['character driven', 'character-driven', 'character development', 'inner conflict'],
  'Plot Twist Heavy': ['plot twist', 'twist', 'unexpected ending', 'unpredictable'],
  'Slow Burn Relationships': ['slow burn', 'slow-burn', 'gradual'],
  'Emotionally Intense': ['emotional', 'heartbreaking', 'intense', 'angst'],
  'Dark Atmospheric': ['dark', 'brooding', 'morally grey', 'morally gray', 'gritty'],
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'for', 'with',
  'it', 'this', 'that', 'was', 'is', 'are', 'were', 'be', 'been', 'i', 'you', 'we',
  'they', 'he', 'she', 'my', 'your', 'our', 'their', 'book', 'story', 'very', 'really',
])

function ratingWeight(rating) {
  if (rating >= 5) return 1.25
  if (rating >= 4) return 1.0
  if (rating === 3) return 0.7
  if (rating === 2) return 0.4
  return 0.25
}

function normalizeText(text) {
  return String(text || '').toLowerCase().trim()
}

function tokenize(text) {
  return normalizeText(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && w.length > 2 && !STOP_WORDS.has(w))
}

export function analyzeReviewKeywords(reviews = []) {
  const preference = {}
  const genreRatingBuckets = {}
  const allWords = {}

  Object.keys(KEYWORD_GROUPS).forEach((k) => {
    preference[k] = 0
  })

  for (const item of reviews) {
    const reviewText = normalizeText(item.review)
    const weight = ratingWeight(Number(item.rating || 0))

    for (const [group, terms] of Object.entries(KEYWORD_GROUPS)) {
      for (const term of terms) {
        if (reviewText.includes(term)) {
          preference[group] += weight
        }
      }
    }

    const genre = normalizeText(item.genre)
    if (genre) {
      if (!genreRatingBuckets[genre]) genreRatingBuckets[genre] = { sum: 0, count: 0 }
      genreRatingBuckets[genre].sum += Number(item.rating || 0)
      genreRatingBuckets[genre].count += 1
    }

    for (const token of tokenize(reviewText)) {
      allWords[token] = (allWords[token] || 0) + 1
    }
  }

  const userPreferenceModel = Object.fromEntries(
    Object.entries(preference)
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, Number(v.toFixed(2))])
  )

  const genrePreferenceScores = {}
  for (const [genre, bucket] of Object.entries(genreRatingBuckets)) {
    genrePreferenceScores[genre] = Number((bucket.sum / bucket.count).toFixed(2))
  }

  const preferredStorytellingStyle = Object.entries(STORY_STYLE_MAP)
    .map(([label, terms]) => {
      let score = 0
      for (const item of reviews) {
        const text = normalizeText(item.review)
        for (const term of terms) {
          if (text.includes(term)) score += ratingWeight(Number(item.rating || 0))
        }
      }
      return { label, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.label)

  const topDetectedThemes = Object.entries(userPreferenceModel)
    .slice(0, 6)
    .map(([k]) => k)

  const readingProfile = generateReadingProfile({
    reviews,
    userPreferenceModel,
    genrePreferenceScores,
    topDetectedThemes,
    preferredStorytellingStyle,
  })

  const wordCloud = Object.entries(allWords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([word, count]) => ({
      word,
      count,
      size: Math.min(30, 12 + count * 3),
    }))

  return {
    userPreferenceModel,
    genrePreferenceScores,
    reviewWordCloud: wordCloud,
    topDetectedThemes,
    preferredStorytellingStyle,
    readingProfile,
  }
}

export function generateReadingProfile({
  reviews = [],
  userPreferenceModel = {},
  genrePreferenceScores = {},
  topDetectedThemes = [],
  preferredStorytellingStyle = [],
} = {}) {
  const primaryGenre = Object.entries(genrePreferenceScores)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Diverse'

  const secondaryTheme = topDetectedThemes[1] || topDetectedThemes[0] || 'character driven'
  const toneParts = [topDetectedThemes[0], topDetectedThemes[2], preferredStorytellingStyle[0]]
    .filter(Boolean)
    .slice(0, 2)

  const avgRating = reviews.length
    ? Number((reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviews.length).toFixed(2))
    : 0

  return {
    primaryInterest: titleCaseLabel(primaryGenre),
    secondaryInterest: titleCaseLabel(secondaryTheme),
    preferredTone: toneParts.length ? toneParts.map(titleCaseLabel).join(' / ') : 'Balanced',
    averageRating: avgRating,
    topSignals: Object.entries(userPreferenceModel)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k),
  }
}

function titleCaseLabel(value) {
  const raw = String(value || '').replace(/[-_]/g, ' ').trim()
  if (!raw) return 'Unknown'
  return raw
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function scoreRecommendationSignals(book, reviewModel = {}) {
  const prefModel = reviewModel.userPreferenceModel || {}
  const genreScores = reviewModel.genrePreferenceScores || {}

  const text = normalizeText([
    book.title,
    book.genre,
    book.tone,
    book.pacing,
    book.synopsis,
    ...(book.emotion_tags || []),
    ...(book.tags || []),
    ...(book.embedding_tags || []),
  ].join(' '))

  let reviewKeywordScore = 0
  let matchedThemes = []
  for (const [group, terms] of Object.entries(KEYWORD_GROUPS)) {
    const hit = terms.some((t) => text.includes(t))
    if (hit && prefModel[group]) {
      reviewKeywordScore += prefModel[group]
      matchedThemes.push(group)
    }
  }

  const reviewSignal = Math.min(1, reviewKeywordScore / 8)

  const genre = normalizeText(book.genre)
  const ratingSignal = genre && genreScores[genre]
    ? Math.min(1, Number(genreScores[genre]) / 5)
    : 0.5

  const totalThemeWeight = Object.values(prefModel).reduce((a, b) => a + b, 0) || 1
  const genreSignal = matchedThemes.reduce((sum, theme) => sum + (prefModel[theme] || 0), 0) / totalThemeWeight

  const weightedScore = (ratingSignal * 0.4) + (reviewSignal * 0.35) + (genreSignal * 0.25)

  return {
    weightedScore,
    matchedThemes,
    reviewSignal,
    ratingSignal,
    genreSignal,
  }
}

export function generateRecommendationExplanation(book, reviewModel = {}) {
  const { matchedThemes } = scoreRecommendationSignals(book, reviewModel)
  const top = matchedThemes.slice(0, 3)

  if (!top.length) {
    return 'Recommended because this aligns with your recent reading and genre preferences.'
  }

  if (top.length === 1) {
    return `Recommended because you frequently enjoy ${top[0]} stories.`
  }

  if (top.length === 2) {
    return `Recommended because you tend to like ${top[0]} and ${top[1]} elements.`
  }

  return `Recommended because you often enjoy ${top[0]}, ${top[1]}, and ${top[2]} themes.`
}
