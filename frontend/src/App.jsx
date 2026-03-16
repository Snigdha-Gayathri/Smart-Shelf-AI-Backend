

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import HeaderSection from './components/HeaderSection';
import HamburgerMenu from './components/HamburgerMenu';
import Recommendations from './components/Recommendations';
import Dashboard from './components/Dashboard';
import BookPromptInput from './components/BookPromptInput';
import Auth from './components/Auth';
import CurrentlyReading from './components/CurrentlyReading';
import Settings from './components/Settings';
import QuantumLoader from './components/QuantumLoader';
import QLexiAssistant from './components/QLexiAssistant';
import PersonalityStoryScreen from './components/PersonalityStoryScreen';
import { GenreBarChart, MoodPieChart, TropeHorizontalBarChart } from './components/PersonalityCharts';
import { userStorage } from './utils/userStorage';
import IntroSection from './components/IntroSection';
import EducationalReads from './components/EducationalReads';
import YourEducation from './components/YourEducation';
import EducationalInsightPanel from './components/EducationalInsightPanel';
import CategoryStyledBookCard from './components/CategoryStyledBookCard';
import SkeletonLoader from './components/SkeletonLoader';
import { getApiBase } from './utils/apiBase';
import ThemeToggle from './components/ThemeToggle';
import CursorParticleCanvas from './components/CursorParticleCanvas';
import SpaceBackground from './components/SpaceBackground';
import AuthorDashboard from './components/AuthorDashboard';
import { loadUserSettings, updateSetting } from './utils/userSettings';
import {
  analyzeReviewKeywords,
  scoreRecommendationSignals,
  generateRecommendationExplanation,
  generateReadingProfile,
} from './utils/reviewIntelligence';

const API_BASE = getApiBase()
const DEFAULT_REVIEW_INSIGHTS = {
  topDetectedThemes: [],
  preferredStorytellingStyle: [],
  reviewWordCloud: [],
  readingProfile: null,
};
const DEFAULT_USER_FEEDBACK = {
  likedGenres: new Map(),
  dislikedGenres: new Map(),
  likedTags: new Map(),
  dislikedTags: new Map(),
};

function getSystemThemePreference() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveThemePreference(themePreference) {
  return themePreference === 'system' ? getSystemThemePreference() : themePreference;
}

export default function App({ clerk = { enabled: false, isLoaded: false, isSignedIn: false, user: null, signOut: null } }) {
  const clerkEnabled = Boolean(clerk?.enabled)
  const isClerkLoaded = Boolean(clerk?.isLoaded)
  const isSignedIn = Boolean(clerk?.isSignedIn)
  const clerkUser = clerk?.user || null

  const [userSettings, setUserSettings] = useState(() => loadUserSettings('guest'));
  const [theme, setTheme] = useState(() => resolveThemePreference(loadUserSettings('guest').theme));
  const [auth, setAuth] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('auth') || 'null');
      if (stored?.user) return { user: stored.user };
    } catch { /* ignore parse errors */ }
    return null;
  });
  
  // Initialize user state with hydration from persistent storage
  const [currentlyReading, setCurrentlyReading] = useState(() => 
    auth?.user?.id ? userStorage.load(auth.user.id, 'currentlyReading', []) : []
  );
  const [educationalBooks, setEducationalBooks] = useState(() =>
    auth?.user?.id ? userStorage.load(auth.user.id, 'educationalBooks', []) : []
  );
  const [previousReads, setPreviousReads] = useState(() =>
    auth?.user?.id ? userStorage.load(auth.user.id, 'previousReads', []) : []
  );
  const [userFeedback, setUserFeedback] = useState(() => {
    if (!auth?.user?.id) {
      return {
        ...DEFAULT_USER_FEEDBACK
      };
    }
    return userStorage.load(auth.user.id, 'userFeedback', DEFAULT_USER_FEEDBACK);
  });
  const [personalityProfile, setPersonalityProfile] = useState(() =>
    auth?.user?.id ? userStorage.load(auth.user.id, 'personalityProfile', null) : null
  );
  const [annualWrapped, setAnnualWrapped] = useState(() =>
    auth?.user?.id ? userStorage.load(auth.user.id, 'annualWrapped', null) : null
  );
  const [reviews, setReviews] = useState(() =>
    auth?.user?.id ? userStorage.load(auth.user.id, 'reviews', []) : []
  );
  const [reviewInsights, setReviewInsights] = useState(() =>
    auth?.user?.id
      ? userStorage.load(auth.user.id, 'reviewInsights', DEFAULT_REVIEW_INSIGHTS)
      : DEFAULT_REVIEW_INSIGHTS
  );
  const [userPreferenceModel, setUserPreferenceModel] = useState(() =>
    auth?.user?.id ? userStorage.load(auth.user.id, 'userPreferenceModel', {}) : {}
  );
  
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('introduction');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (window.location.pathname === '/author-dashboard') {
      setActiveSection('author_dashboard')
    }
  }, [])

  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const settingsOwner = auth?.user?.id || 'guest';
    setUserSettings(loadUserSettings(settingsOwner));
  }, [auth?.user?.id]);

  useEffect(() => {
    const applyResolvedTheme = () => {
      setTheme(resolveThemePreference(userSettings.theme));
    };

    applyResolvedTheme();

    if (userSettings.theme !== 'system' || typeof window === 'undefined' || !window.matchMedia) {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = () => applyResolvedTheme();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleThemeChange);
      return () => mediaQuery.removeEventListener('change', handleThemeChange);
    }
    mediaQuery.addListener(handleThemeChange);
    return () => mediaQuery.removeListener(handleThemeChange);
  }, [userSettings.theme]);

  useEffect(() => {
    const onPopState = () => {
      if (window.location.pathname === '/author-dashboard') {
        setActiveSection('author_dashboard')
      } else if (activeSection === 'author_dashboard') {
        setActiveSection('home')
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [activeSection])

  useEffect(() => {
    if (!auth) return
    const targetPath = activeSection === 'author_dashboard' ? '/author-dashboard' : '/'
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath)
    }
  }, [activeSection, auth])

  useEffect(() => {
    if (!clerkEnabled || !isClerkLoaded) return

    if (isSignedIn && clerkUser) {
      const nextUser = {
        id: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress || clerkUser.emailAddresses?.[0]?.emailAddress || '',
      }
      const currentId = auth?.user?.id
      const currentEmail = auth?.user?.email || ''
      if (currentId !== nextUser.id || currentEmail !== nextUser.email) {
        handleAuthSuccess({ user: nextUser })
      }
      return
    }

    // Only clear auth if it was NOT set by local login/register
    // (local auth uses authMethod: 'local' flag in localStorage)
    if (auth) {
      try {
        const stored = JSON.parse(localStorage.getItem('auth') || 'null')
        if (stored?.authMethod === 'local') {
          // Preserve local auth — user signed in via username/password, not Clerk
          return
        }
      } catch { /* ignore parse errors */ }
      localStorage.removeItem('auth')
      setAuth(null)
      setMenuOpen(false)
      setActiveSection('home')
      setRecommendations([])
    }
  }, [clerkEnabled, isClerkLoaded, isSignedIn, clerkUser, auth]);

  // Persist currentlyReading to storage whenever it changes
  useEffect(() => {
    if (auth?.user?.id) {
      userStorage.save(auth.user.id, 'currentlyReading', currentlyReading);
    }
  }, [currentlyReading, auth?.user?.id]);

  // Persist educationalBooks to storage whenever it changes
  useEffect(() => {
    if (auth?.user?.id) {
      userStorage.save(auth.user.id, 'educationalBooks', educationalBooks);
    }
  }, [educationalBooks, auth?.user?.id]);

  // Persist previousReads to storage whenever it changes
  useEffect(() => {
    if (auth?.user?.id) {
      userStorage.save(auth.user.id, 'previousReads', previousReads);
    }
  }, [previousReads, auth?.user?.id]);

  // Persist userFeedback to storage whenever it changes
  useEffect(() => {
    if (auth?.user?.id) {
      userStorage.save(auth.user.id, 'userFeedback', userFeedback);
    }
  }, [userFeedback, auth?.user?.id]);

  // Persist personalityProfile to storage whenever it changes
  useEffect(() => {
    if (auth?.user?.id && personalityProfile) {
      userStorage.save(auth.user.id, 'personalityProfile', personalityProfile);
    }
  }, [personalityProfile, auth?.user?.id]);

  // Persist annualWrapped to storage whenever it changes
  useEffect(() => {
    if (auth?.user?.id && annualWrapped) {
      userStorage.save(auth.user.id, 'annualWrapped', annualWrapped);
    }
  }, [annualWrapped, auth?.user?.id]);

  // Persist reviews + review intelligence to storage
  useEffect(() => {
    if (auth?.user?.id) {
      userStorage.save(auth.user.id, 'reviews', reviews)
      userStorage.save(auth.user.id, 'reviewInsights', reviewInsights)
      userStorage.save(auth.user.id, 'userPreferenceModel', userPreferenceModel)
    }
  }, [reviews, reviewInsights, userPreferenceModel, auth?.user?.id])

  // Recompute review intelligence model whenever reviews change
  useEffect(() => {
    if (!userSettings.reviewIntelligence) {
      setUserPreferenceModel({})
      setReviewInsights(DEFAULT_REVIEW_INSIGHTS)
      return
    }

    const resetCutoff = userSettings.lastRecommendationResetAt
      ? new Date(userSettings.lastRecommendationResetAt).getTime()
      : 0
    const sourceReviews = reviews.filter((review) => {
      const ts = new Date(review.updated_at || review.created_at || 0).getTime()
      return !resetCutoff || ts > resetCutoff
    })

    const analyzed = analyzeReviewKeywords(sourceReviews)
    const profile = generateReadingProfile({
      reviews: sourceReviews,
      userPreferenceModel: analyzed.userPreferenceModel,
      genrePreferenceScores: analyzed.genrePreferenceScores,
      topDetectedThemes: analyzed.topDetectedThemes,
      preferredStorytellingStyle: analyzed.preferredStorytellingStyle,
    })
    setUserPreferenceModel({
      userPreferenceModel: analyzed.userPreferenceModel,
      genrePreferenceScores: analyzed.genrePreferenceScores,
    })
    setReviewInsights({
      topDetectedThemes: analyzed.topDetectedThemes,
      preferredStorytellingStyle: analyzed.preferredStorytellingStyle,
      reviewWordCloud: analyzed.reviewWordCloud,
      readingProfile: profile,
    })
  }, [reviews, userSettings.reviewIntelligence, userSettings.lastRecommendationResetAt])

  // Sync user reviews from backend file-backed store (best effort)
  useEffect(() => {
    if (!auth?.user?.username) return
    let mounted = true
    async function loadUserReviews() {
      try {
        const res = await fetch(`${API_BASE}/api/v1/reviews?username=${encodeURIComponent(auth.user.username)}`)
        if (!res.ok) return
        const data = await res.json()
        if (!mounted) return
        if (Array.isArray(data?.reviews) && data.reviews.length) {
          const normalized = data.reviews.map((r, idx) => ({
            ...r,
            review_id: r.review_id || `${r.created_at || ''}-${r.book || ''}-${idx}`,
          }))
          setReviews(normalized)
        }
      } catch {
        // fallback to local persisted reviews only
      }
    }
    loadUserReviews()
    return () => {
      mounted = false
    }
  }, [auth?.user?.username])

  // Handle successful authentication - hydrate persisted user data
  function handleAuthSuccess(a){
    setAuth(a);
    if (a?.user) {
      localStorage.setItem('auth', JSON.stringify({ user: a.user }));
    }
    // Load persisted user data from storage after successful login
    if (a?.user?.id) {
      const persistedSettings = loadUserSettings(a.user.id)
      setUserSettings(persistedSettings)
      setCurrentlyReading(userStorage.load(a.user.id, 'currentlyReading', []));
      setEducationalBooks(userStorage.load(a.user.id, 'educationalBooks', []));
      setPreviousReads(userStorage.load(a.user.id, 'previousReads', []));
      setUserFeedback(userStorage.load(a.user.id, 'userFeedback', DEFAULT_USER_FEEDBACK));
      setPersonalityProfile(userStorage.load(a.user.id, 'personalityProfile', null));
      setAnnualWrapped(userStorage.load(a.user.id, 'annualWrapped', null));
      setReviews(userStorage.load(a.user.id, 'reviews', []));
      setReviewInsights(userStorage.load(a.user.id, 'reviewInsights', DEFAULT_REVIEW_INSIGHTS));
      setUserPreferenceModel(userStorage.load(a.user.id, 'userPreferenceModel', {}));
    }
  }

  // Handle logout - do NOT delete persisted user data (only clear in-memory state)
  function handleLogout() {
    setIsLoggingOut(true);
    const finish = () => {
      localStorage.removeItem('auth');
      setAuth(null);
      setUserSettings(loadUserSettings('guest'));
      setMenuOpen(false);
      setActiveSection('home');
      setRecommendations([]);
      setIsLoggingOut(false);
    };

    if (clerkEnabled) {
      Promise.resolve(clerk?.signOut?.()).catch(() => {}).finally(() => {
        window.setTimeout(finish, 160);
      });
      return;
    }

    window.setTimeout(finish, 160);
  }

  // Handle delete account - explicitly remove all persisted user data
  async function handleDeleteAccount() {
    if (!auth || !auth.user) return;
    
    try {
      const res = await fetch(`${API_BASE}/auth/delete`, {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: auth.user.username || auth.user.email })
      });
      
      if (res.ok) {
        // Explicitly delete all persisted user data from storage before logout
        userStorage.deleteUser(auth.user.id);
        handleLogout();
        alert('Your account has been deleted successfully.');
      } else {
        const data = await res.json();
        alert('Failed to delete account: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Error deleting account: ' + e.message);
    }
  }

  // Handle adding a book to currently reading (or educational learning)
  function handleAddToCurrentlyReading(book) {
    const bookId = book.id || `${book.title}-${book.author}`;
    const isEducational = book.type === 'educational';

    if (isEducational) {
      // Educational books go to separate educational list
      const exists = educationalBooks.some(b => 
        b.id === bookId || (b.title === book.title && b.author === book.author)
      );
      if (exists) return;

      const eduBook = {
        id: bookId,
        title: book.title,
        author: book.author,
        coverImage: book.cover,
        cover: book.cover,
        genre: book.genre,
        synopsis: book.synopsis,
        emotion_tags: book.emotion_tags || book.tags || [],
        tags: book.tags || [],
        type: 'educational',
        eduStatus: 'learning',
        buy_link: book.buy_link,
        reading_insights: book.reading_insights,
        pacing: book.pacing,
        tone: book.tone,
      };
      setEducationalBooks(prev => [...prev, eduBook]);
    } else {
      // Non-educational books use existing flow
      const exists = currentlyReading.some(b => 
        b.id === bookId || (b.title === book.title && b.author === book.author)
      );
      if (exists) return;

      const readingBook = {
        id: bookId,
        title: book.title,
        author: book.author,
        coverImage: book.cover,
        cover: book.cover,
        genre: book.genre,
        synopsis: book.synopsis,
        emotion_tags: book.emotion_tags || book.tags || [],
        tags: book.tags || [],
        type: book.type,
        buy_link: book.buy_link,
        reading_insights: book.reading_insights,
        status: 'reading'
      };
      setCurrentlyReading(prev => [...prev, readingBook]);
    }
    
    // Remove book from recommendations
    setRecommendations(prev => 
      prev.filter(r => !(r.title === book.title && r.author === book.author))
    );
  }

  // Handle updating educational book status
  function handleUpdateEduStatus(bookId, newStatus) {
    setEducationalBooks(prev =>
      prev.map(book =>
        book.id === bookId ? { ...book, eduStatus: newStatus, completedAt: newStatus === 'completed' ? new Date().toISOString() : book.completedAt } : book
      )
    );
  }

  // Handle updating book status in currently reading
  function handleUpdateBookStatus(bookId, newStatus) {
    setCurrentlyReading(prev => 
      prev.map(book => 
        book.id === bookId ? { ...book, status: newStatus } : book
      )
    );
  }

  // Helper: Update feedback map with genre/tag counts
  function updateFeedbackMap(map, items) {
    const newMap = new Map(map);
    items.forEach(item => {
      if (item) {
        const count = newMap.get(item) || 0;
        newMap.set(item, count + 1);
      }
    });
    return newMap;
  }

  // Handle liking a book (move to previousReads, update liked feedback)
  function handleLikeBook(book) {
    // Find the full book object from currentlyReading to get all metadata
    const fullBook = currentlyReading.find(b => b.id === book.id);
    if (!fullBook) return;

    // Move to previousReads with liked flag
    const finishedBook = {
      ...fullBook,
      finishedAt: new Date().toISOString(),
      liked: true
    };
    setPreviousReads(prev => [...prev, finishedBook]);

    // Remove from currentlyReading
    setCurrentlyReading(prev => prev.filter(b => b.id !== book.id));

    // Update feedback: increment liked genres and tags
    setUserFeedback(prev => ({
      likedGenres: updateFeedbackMap(prev.likedGenres, [fullBook.genre]),
      dislikedGenres: prev.dislikedGenres,
      likedTags: updateFeedbackMap(prev.likedTags, fullBook.emotion_tags || fullBook.tags || []),
      dislikedTags: prev.dislikedTags
    }));
  }

  // Handle disliking a book (move to previousReads, update disliked feedback)
  function handleDislikeBook(book) {
    // Find the full book object from currentlyReading to get all metadata
    const fullBook = currentlyReading.find(b => b.id === book.id);
    if (!fullBook) return;

    // Move to previousReads with disliked flag
    const finishedBook = {
      ...fullBook,
      finishedAt: new Date().toISOString(),
      liked: false
    };
    setPreviousReads(prev => [...prev, finishedBook]);

    // Remove from currentlyReading
    setCurrentlyReading(prev => prev.filter(b => b.id !== book.id));

    // Update feedback: increment disliked genres and tags
    setUserFeedback(prev => ({
      likedGenres: prev.likedGenres,
      dislikedGenres: updateFeedbackMap(prev.dislikedGenres, [fullBook.genre]),
      likedTags: prev.likedTags,
      dislikedTags: updateFeedbackMap(prev.dislikedTags, fullBook.emotion_tags || fullBook.tags || [])
    }));
  }

  async function persistReviewToBackend(reviewEntry) {
    try {
      await fetch(`${API_BASE}/api/v1/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewEntry),
      })
    } catch {
      // Keep local review data even if backend persistence fails
    }
  }

  async function updateReviewInBackend(reviewId, payload) {
    try {
      await fetch(`${API_BASE}/api/v1/reviews/${encodeURIComponent(reviewId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch {
      // keep local update even if backend update fails
    }
  }

  async function deleteReviewInBackend(reviewId) {
    try {
      await fetch(`${API_BASE}/api/v1/reviews/${encodeURIComponent(reviewId)}`, {
        method: 'DELETE',
      })
    } catch {
      // keep local delete even if backend delete fails
    }
  }

  // Handle transition from currently reading -> finished with rating + review
  function handleSubmitFinishedReview(book, rating, reviewText) {
    const fullBook = currentlyReading.find((b) => b.id === book.id)
    if (!fullBook) return

    const finishedAt = new Date().toISOString()
    const liked = rating >= 4 ? true : rating <= 2 ? false : null

    const finishedBook = {
      ...fullBook,
      status: 'finished',
      finishedAt,
      liked,
      rating,
      review: reviewText,
    }

    setPreviousReads((prev) => [...prev, finishedBook])
    setCurrentlyReading((prev) => prev.filter((b) => b.id !== book.id))

    const reviewId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const reviewEntry = {
      review_id: reviewId,
      username: auth?.user?.username || auth?.user?.email || '',
      bookId: fullBook.id,
      title: fullBook.title,
      bookTitle: fullBook.title,
      book: fullBook.title,
      author: fullBook.author,
      genre: fullBook.genre,
      rating,
      review: reviewText || '',
      created_at: finishedAt,
    }
    setReviews((prev) => [...prev, reviewEntry])
    persistReviewToBackend(reviewEntry)

    if (liked === true) {
      setUserFeedback((prev) => ({
        likedGenres: updateFeedbackMap(prev.likedGenres, [fullBook.genre]),
        dislikedGenres: prev.dislikedGenres,
        likedTags: updateFeedbackMap(prev.likedTags, fullBook.emotion_tags || fullBook.tags || []),
        dislikedTags: prev.dislikedTags,
      }))
    } else if (liked === false) {
      setUserFeedback((prev) => ({
        likedGenres: prev.likedGenres,
        dislikedGenres: updateFeedbackMap(prev.dislikedGenres, [fullBook.genre]),
        likedTags: prev.likedTags,
        dislikedTags: updateFeedbackMap(prev.dislikedTags, fullBook.emotion_tags || fullBook.tags || []),
      }))
    }
  }

  function handleUpdateReview(reviewId, rating, reviewText) {
    setReviews((prev) =>
      prev.map((r) =>
        r.review_id === reviewId
          ? { ...r, rating, review: reviewText, updated_at: new Date().toISOString() }
          : r
      )
    )
    updateReviewInBackend(reviewId, { rating, review: reviewText })
  }

  function handleDeleteReview(reviewId) {
    setReviews((prev) => prev.filter((r) => r.review_id !== reviewId))
    deleteReviewInBackend(reviewId)
  }

  // ============================================
  // ANALYTICS COMPUTATION FUNCTIONS
  // ============================================

  /**
   * Compute personality profile from previousReads and userFeedback
   * Returns: { topGenres, dominantMoods, topTropes }
   */
  function computePersonalityProfile() {
    if (previousReads.length === 0) {
      return {
        topGenres: {},
        dominantMoods: {},
        topTropes: {}
      };
    }

    // 1. Genre Affinity: Rank genres by positive vs negative feedback ratio
    const genreStats = {};
    previousReads.forEach(book => {
      if (!book.genre) return;
      if (!genreStats[book.genre]) {
        genreStats[book.genre] = { liked: 0, disliked: 0 };
      }
      if (book.liked) {
        genreStats[book.genre].liked++;
      } else {
        genreStats[book.genre].disliked++;
      }
    });

    // Calculate affinity scores and normalize to percentages
    const genreAffinities = {};
    const totalBooks = previousReads.length;
    Object.entries(genreStats).forEach(([genre, stats]) => {
      const total = stats.liked + stats.disliked;
      const affinityScore = total > 0 ? (stats.liked / total) * 100 : 0;
      genreAffinities[genre] = Math.round(affinityScore);
    });

    // Sort and get top genres
    const topGenres = Object.entries(genreAffinities)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .reduce((acc, [genre, score]) => {
        acc[genre] = score;
        return acc;
      }, {});

    // 2. Mood Preference: Infer mood from tags
    // Common mood categories mapped from tags
    const moodCategories = {
      dark: ['dark', 'horror', 'thriller', 'suspense', 'mystery'],
      fluffy: ['fluffy', 'wholesome', 'heartwarming', 'cozy', 'light'],
      emotional: ['emotional', 'sad', 'tearjerker', 'poignant', 'melancholic'],
      romantic: ['romance', 'romantic', 'love', 'passion'],
      adventurous: ['adventure', 'action', 'quest', 'epic', 'journey'],
      humorous: ['funny', 'comedy', 'humorous', 'witty', 'satire']
    };

    const moodCounts = {};
    previousReads.forEach(book => {
      if (!book.liked) return; // Only consider liked books for mood preference
      const tags = book.emotion_tags || book.tags || [];
      tags.forEach(tag => {
        const tagLower = tag.toLowerCase();
        Object.entries(moodCategories).forEach(([mood, keywords]) => {
          if (keywords.some(keyword => tagLower.includes(keyword))) {
            moodCounts[mood] = (moodCounts[mood] || 0) + 1;
          }
        });
      });
    });

    // Normalize mood counts to percentages
    const totalMoodTags = Object.values(moodCounts).reduce((sum, count) => sum + count, 0);
    const dominantMoods = {};
    if (totalMoodTags > 0) {
      Object.entries(moodCounts).forEach(([mood, count]) => {
        dominantMoods[mood] = Math.round((count / totalMoodTags) * 100);
      });
    }

    // 3. Trope Frequency: Count recurring tropes from tags
    const tropeCounts = {};
    previousReads.forEach(book => {
      const tags = book.emotion_tags || book.tags || [];
      tags.forEach(tag => {
        tropeCounts[tag] = (tropeCounts[tag] || 0) + 1;
      });
    });

    // Get top tropes (appearing in at least 2 books)
    const topTropes = Object.entries(tropeCounts)
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reduce((acc, [trope, count]) => {
        acc[trope] = count;
        return acc;
      }, {});

    return {
      topGenres,
      dominantMoods,
      topTropes
    };
  }

  /**
   * Generate annual wrapped analytics from previousReads + completed educationalBooks
   * Returns: { totalBooksRead, genreDistribution, likeDislikeRatio, monthlyReads, educationalCompleted, typeBreakdown }
   */
  function computeAnnualWrapped(year = new Date().getFullYear()) {
    // Merge completed educational books into the pool
    const completedEduBooks = educationalBooks
      .filter(b => b.eduStatus === 'completed' && b.completedAt)
      .map(b => ({
        ...b,
        finishedAt: b.completedAt,
        liked: true, // educational completions count as positive
      }));

    const allBooks = [...previousReads, ...completedEduBooks];

    // Filter books completed in the specified year
    const yearBooks = allBooks.filter(book => {
      if (!book.finishedAt) return false;
      const bookYear = new Date(book.finishedAt).getFullYear();
      return bookYear === year;
    });

    if (yearBooks.length === 0) {
      return {
        totalBooksRead: 0,
        genreDistribution: {},
        likeDislikeRatio: { liked: 0, disliked: 0 },
        monthlyReads: {}
      };
    }

    // 1. Total books read
    const totalBooksRead = yearBooks.length;

    // 2. Genre distribution (percentage per genre)
    const genreCounts = {};
    yearBooks.forEach(book => {
      if (book.genre) {
        genreCounts[book.genre] = (genreCounts[book.genre] || 0) + 1;
      }
    });

    const genreDistribution = {};
    Object.entries(genreCounts).forEach(([genre, count]) => {
      genreDistribution[genre] = Math.round((count / totalBooksRead) * 100);
    });

    // 3. Like vs Dislike ratio
    const liked = yearBooks.filter(book => book.liked === true).length;
    const disliked = yearBooks.filter(book => book.liked === false).length;
    const likeDislikeRatio = { liked, disliked };

    // 4. Monthly reading count
    const monthlyReads = {};
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Initialize all months to 0
    monthNames.forEach(month => {
      monthlyReads[month] = 0;
    });

    // Count books per month
    yearBooks.forEach(book => {
      if (book.finishedAt) {
        const monthIndex = new Date(book.finishedAt).getMonth();
        const monthName = monthNames[monthIndex];
        monthlyReads[monthName]++;
      }
    });

    // 5. Type breakdown
    const typeBreakdown = {};
    yearBooks.forEach(book => {
      const t = book.type || 'fiction';
      typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
    });

    // 6. Educational completed count
    const educationalCompleted = yearBooks.filter(b => b.type === 'educational').length;

    return {
      totalBooksRead,
      genreDistribution,
      likeDislikeRatio,
      monthlyReads,
      educationalCompleted,
      typeBreakdown
    };
  }

  function handleUserSettingChange(key, value) {
    const userId = auth?.user?.id || 'guest';
    setUserSettings((prev) => updateSetting(userId, key, value, prev));
  }

  function handleQuickThemeToggle(nextTheme) {
    handleUserSettingChange('theme', nextTheme);
  }

  function handleDownloadReadingData() {
    if (!auth?.user?.id) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      username: auth?.user?.username || auth?.user?.email || '',
      settings: userSettings,
      currentlyReading,
      educationalBooks,
      previousReads,
      reviews,
      reviewInsights,
      userPreferenceModel,
      personalityProfile,
      annualWrapped,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `smartshelf-reading-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  }

  function handleResetRecommendationModel() {
    const resetAt = new Date().toISOString();
    setUserFeedback(DEFAULT_USER_FEEDBACK);
    setUserPreferenceModel({});
    setReviewInsights(DEFAULT_REVIEW_INSIGHTS);
    setRecommendations([]);
    handleUserSettingChange('lastRecommendationResetAt', resetAt);
  }

  function handleClearReadingHistory() {
    setPreviousReads([]);
    setReviews([]);
    setAnnualWrapped(null);
    setPersonalityProfile(null);
    setUserFeedback(DEFAULT_USER_FEEDBACK);
    setUserPreferenceModel({});
    setReviewInsights(DEFAULT_REVIEW_INSIGHTS);
    setRecommendations([]);
    setEducationalBooks((prev) => prev.filter((book) => book.eduStatus !== 'completed'));
  }

  // ============================================
  // END ANALYTICS FUNCTIONS
  // ============================================

  // Recompute analytics whenever previousReads or educationalBooks change
  useEffect(() => {
    const hasCompletedEdu = educationalBooks.some(b => b.eduStatus === 'completed');
    if (previousReads.length > 0 || hasCompletedEdu) {
      setPersonalityProfile(computePersonalityProfile());
      setAnnualWrapped(computeAnnualWrapped());
    }
  }, [previousReads, educationalBooks]);

  // Helper: Calculate a feedback score for a book based on user preferences
  // Returns a score modifier: positive for liked genres/tags, negative for disliked
  function calculateFeedbackScore(book) {
    let score = 0;
    const { likedGenres, dislikedGenres, likedTags, dislikedTags } = userFeedback;
    const normalizedGenre = String(book.genre || '').toLowerCase();
    const preferredGenres = (userSettings.preferredGenres || []).map((genre) => genre.toLowerCase());
    const avoidedGenres = (userSettings.avoidedGenres || []).map((genre) => genre.toLowerCase());
    const recommendationStyle = userSettings.recommendationStyle || 'balanced';

    // Check genre
    if (book.genre) {
      const likedCount = likedGenres.get(book.genre) || 0;
      const dislikedCount = dislikedGenres.get(book.genre) || 0;
      score += likedCount * 0.3; // Boost for liked genre
      score -= dislikedCount * 0.5; // Penalty for disliked genre
    }

    if (preferredGenres.includes(normalizedGenre)) {
      score += recommendationStyle === 'safe' ? 1.15 : recommendationStyle === 'balanced' ? 0.7 : 0.35;
    } else if (recommendationStyle === 'discovery' && normalizedGenre && !avoidedGenres.includes(normalizedGenre)) {
      score += 0.3;
    } else if (recommendationStyle === 'safe' && normalizedGenre) {
      score -= 0.15;
    }

    if (avoidedGenres.includes(normalizedGenre)) {
      score -= 1.5;
    }

    // Check tags (emotion_tags or tags array)
    const bookTags = book.emotion_tags || book.tags || [];
    bookTags.forEach(tag => {
      const likedCount = likedTags.get(tag) || 0;
      const dislikedCount = dislikedTags.get(tag) || 0;
      score += likedCount * 0.1; // Small boost per liked tag
      score -= dislikedCount * 0.2; // Penalty per disliked tag
    });

    return score;
  }

  // Helper: Filter and sort recommendations based on user feedback
  function applyFeedbackFiltering(recommendations) {
    // Filter out books that are already in previousReads or were explicitly disliked
    const previousTitles = new Set(previousReads.map(b => `${b.title}-${b.author}`));
    const dislikedBooks = previousReads.filter(b => b.liked === false);
    const dislikedTitles = new Set(dislikedBooks.map(b => `${b.title}-${b.author}`));

    const filtered = recommendations.filter(book => {
      const bookKey = `${book.title}-${book.author}`;
      
      // Never recommend books already read or explicitly disliked
      if (previousTitles.has(bookKey) || dislikedTitles.has(bookKey)) {
        return false;
      }
      
      // Filter out books with strongly disliked genres/tags
      const feedbackScore = calculateFeedbackScore(book);
      return feedbackScore > -1; // Allow if not heavily penalized
    });

    // Sort by feedback-adjusted score
    return filtered
      .map(book => ({
        ...book,
        feedbackScore: calculateFeedbackScore(book),
        adjustedScore: (book.matchScore ?? book.score ?? 0) + calculateFeedbackScore(book)
      }))
      .sort((a, b) => b.adjustedScore - a.adjustedScore);
  }

  function applyReviewIntelligence(recommendations) {
    if (!userSettings.reviewIntelligence) {
      return recommendations.map((book) => ({
        ...book,
        recommendation_explanation:
          book.reason || 'Recommended based on your reading shelves and explicit preference controls.',
      }))
    }

    const hasReviewSignals = Object.keys(userPreferenceModel?.userPreferenceModel || {}).length > 0
      || Object.keys(userPreferenceModel?.genrePreferenceScores || {}).length > 0

    const driftMultiplier = {
      slow: 0.7,
      moderate: 1,
      aggressive: 1.35,
    }[userSettings.tasteDriftSensitivity || 'moderate']

    if (!hasReviewSignals) {
      return recommendations.map((book) => ({
        ...book,
        recommendation_explanation:
          book.reason || 'Recommended based on your reading shelves and genre preferences.',
      }))
    }

    return recommendations
      .map((book) => {
        const signal = scoreRecommendationSignals(book, userPreferenceModel)
        const baseScore = Number(book.adjustedScore ?? book.matchScore ?? book.score ?? 0)
        const finalScore = baseScore + (signal.weightedScore * driftMultiplier)
        return {
          ...book,
          reviewSignalScore: signal.weightedScore * driftMultiplier,
          adjustedScore: finalScore,
          recommendation_explanation: generateRecommendationExplanation(book, userPreferenceModel),
        }
      })
      .sort((a, b) => b.adjustedScore - a.adjustedScore)
  }

  async function handlePromptSubmit(prompt) {
    setLoading(true);
    setError('');
    try {
      // Ensure backend is ready (caches warmed) before requesting recommendations
      const readyResp = await fetch(`${API_BASE}/ready`);
      if (!readyResp.ok) throw new Error('Backend not reachable');
      const readyJson = await readyResp.json();
      if (!readyJson.ready) {
        setError('Backend warming up models — please wait a moment and try again.');
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_BASE}/api/v1/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: prompt })
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Server returned ${res.status}: ${txt}`);
      }
      const data = await res.json();
      
      // Apply feedback filtering to recommendations
      const rawRecommendations = data.recommendations || [];
      const filteredRecommendations = applyFeedbackFiltering(rawRecommendations);

      const reviewAwareRecommendations = applyReviewIntelligence(filteredRecommendations)
      setRecommendations(reviewAwareRecommendations);
    } catch (e) {
        console.error('Error details:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Poll backend readiness on mount so UI shows a friendly message while server warms up
  useEffect(() => {
    let mounted = true;
    async function pollReady() {
      try {
        const r = await fetch(`${API_BASE}/ready`);
        if (!r.ok) throw new Error('ready endpoint unreachable');
        const j = await r.json();
        if (!mounted) return;
        if (!j.ready) {
          setLoading(true);
          setError('Backend warming up models — recommendations will be available shortly.');
          setTimeout(pollReady, 2000);
        } else {
          setLoading(false);
          setError('');
        }
      } catch (e) {
        if (!mounted) return;
        setError('Unable to contact backend. Is the server running?');
        setLoading(false);
      }
    }
    pollReady();
    return () => { mounted = false };
  }, []);

  if (!auth) {
    return (
      <>
        <ThemeToggle theme={theme} setTheme={handleQuickThemeToggle} />
        <CursorParticleCanvas theme={theme} />
        <SpaceBackground active={theme === 'dark'} />
        <div className="w-full h-screen overflow-hidden">
          <Auth onSuccess={handleAuthSuccess} googleAuthEnabled={clerkEnabled && isClerkLoaded} />
        </div>
      </>
    );
  }

  return (
    <>
      <ThemeToggle theme={theme} setTheme={handleQuickThemeToggle} />
      <CursorParticleCanvas theme={theme} />
      <SpaceBackground active={theme === 'dark'} />
    <div 
      className={`app-layout w-full h-screen overflow-hidden font-sans transition-all duration-300 ${theme === 'dark' ? 'text-white' : 'text-slate-800'} ${isLoggingOut ? 'opacity-0' : 'opacity-100'}`}
    >
      {auth && (
        <HamburgerMenu 
          isOpen={menuOpen} 
          setIsOpen={setMenuOpen} 
          theme={theme}
          activeSection={activeSection} 
          setActiveSection={setActiveSection}
        />
      )}
      
      <main className="main-content flex-1 min-w-0 h-screen px-3 sm:px-6 md:px-8 py-4 sm:py-8 md:py-12 transition-all duration-300 ease-in-out overflow-y-auto">
        <div className="w-full max-w-6xl mx-auto">
        <HeaderSection theme={theme} />
        
        {/* Introduction Section - Full-screen dedicated intro view */}
        {auth && activeSection === 'introduction' && (
          <div className="mt-12">
            <IntroSection />
          </div>
        )}
        
        {/* Recommendations Section */}
        {auth && activeSection === 'home' && (
          <div className="space-y-8 sm:space-y-10 md:space-y-12 mt-8 sm:mt-10 md:mt-12">
            <BookPromptInput onSubmit={handlePromptSubmit} />
            
            <section className="w-full">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-6 sm:mb-8 text-cool-blue dark:text-cool-blue">🎯 Your Recommendations</h2>
              
              {/* Q Lexi Assistant with dynamic message */}
              <QLexiAssistant 
                message={recommendations.length === 0 ? "What's your mood? Tell me what you feel like reading!" : "Here are your quantum recommendations! I analyzed your preferences with quantum thinking ⚛️"}
                section="recommendations"
              />
              
              {loading && <SkeletonLoader count={6} />}
              {error && <div className="text-center text-red-500 py-4 text-sm sm:text-base">{error}</div>}
              {!loading && !error && (
                <Recommendations 
                  recommendations={recommendations} 
                  onAddToCurrentlyReading={handleAddToCurrentlyReading}
                  currentUsername={auth?.user?.username}
                />
              )}
            </section>
          </div>
        )}

        {/* Currently Reading Section */}
        {auth && activeSection === 'reading' && (
          <section className="w-full space-y-6 sm:space-y-8 page-fade-in">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary dark:text-primary">📖 Currently Reading</h2>
            
            {/* Q Lexi Assistant */}
            <QLexiAssistant 
              message="You can do this! Finish them all! 💪 I'm cheering for you!"
              section="reading"
            />
            
            <CurrentlyReading 
              books={currentlyReading} 
              onUpdateStatus={handleUpdateBookStatus}
              onLike={handleLikeBook}
              onDislike={handleDislikeBook}
              onSubmitReview={handleSubmitFinishedReview}
              userId={auth?.user?.id}
            />
          </section>
        )}

        {/* Educational Reads Section */}
        {auth && activeSection === 'educational_reads' && (
          <section className="w-full space-y-6 sm:space-y-8 page-fade-in">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary dark:text-primary">📚 Educational Reads</h2>
            
            <QLexiAssistant 
              message="Keep learning! Knowledge is the best investment you can make 🎓📖"
              section="educational_reads"
            />
            
            <EducationalReads 
              books={educationalBooks}
              onUpdateEduStatus={handleUpdateEduStatus}
              userId={auth?.user?.id}
            />
          </section>
        )}
        
        {/* Previous Reads Section */}
        {auth && activeSection === 'previous' && (
          <section className="w-full space-y-6 sm:space-y-8 page-fade-in">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary dark:text-primary">✅ Previous Reads</h2>
            
            {/* Q Lexi Assistant */}
            <QLexiAssistant 
              message="These are the books you have read! Each one helped me learn your preferences better 📚"
              section="previous"
            />
            
            {previousReads.length === 0 ? (
              <p className="text-center text-on-light text-sm sm:text-base">
                No books finished yet. Complete books in "Currently Reading" to see them here!
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {previousReads.map((book, idx) => (
                  <CategoryStyledBookCard
                    key={book.id}
                    book={book}
                    index={idx}
                    statusBadge={
                      <span className={`text-white text-xs font-bold px-2 py-1 rounded-full shadow-sm ${
                        book.liked === true ? 'bg-green-600' : book.liked === false ? 'bg-red-500' : 'bg-slate-500'
                      }`}>
                        {book.liked === true ? '👍 Liked' : book.liked === false ? '👎 Disliked' : '⭐ Rated'}
                      </span>
                    }
                  >
                    {book.genre && (
                      <span className="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 inline-block w-fit">
                        {book.genre}
                      </span>
                    )}
                  </CategoryStyledBookCard>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Your Education Dashboard Section */}
        {auth && activeSection === 'your_education' && (
          <section className="w-full space-y-6 sm:space-y-8 page-fade-in">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary dark:text-primary">🎓 Your Education</h2>
            
            <QLexiAssistant 
              message="Here's your learning journey! Every book completed makes you wiser 📊🧠"
              section="your_education"
            />
            
            <YourEducation educationalBooks={educationalBooks} />
          </section>
        )}

        {/* Your Personality Story Section */}
        {auth && activeSection === 'personality_story' && (
          <PersonalityStoryScreen previousReads={previousReads} />
        )}
        
        {/* Annual Wrapped Section */}
        {auth && activeSection === 'wrapped' && (
          <section className="w-full space-y-6 sm:space-y-8 page-fade-in">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary dark:text-primary">📈 Annual Wrapped</h2>
            
            {/* Q Lexi Assistant */}
            <QLexiAssistant 
              message="This is what you have read all this year! Let's celebrate your reading journey 🎉📊"
              section="wrapped"
            />
            
            <Dashboard 
              personalityProfile={personalityProfile}
              annualWrapped={annualWrapped}
              previousReads={previousReads}
              educationalBooks={educationalBooks}
              reviewInsights={reviewInsights}
            />
          </section>
        )}

        {/* Author Dashboard Section */}
        {auth && activeSection === 'author_dashboard' && (
          <AuthorDashboard
            previousReads={previousReads}
            currentlyReading={currentlyReading}
            educationalBooks={educationalBooks}
            wantToRead={recommendations}
          />
        )}

        {/* Settings Section */}
        {auth && activeSection === 'settings' && (
          <section className="w-full space-y-6 sm:space-y-8 page-fade-in">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary dark:text-primary">⚙️ Settings</h2>
            <Settings 
              theme={theme}
              userSettings={userSettings}
              onUpdateSetting={handleUserSettingChange}
              onLogout={handleLogout}
              onDeleteAccount={handleDeleteAccount}
              onDownloadReadingData={handleDownloadReadingData}
              onResetRecommendationModel={handleResetRecommendationModel}
              onClearReadingHistory={handleClearReadingHistory}
              userEmail={auth?.user?.email}
              username={auth?.user?.username}
              reviews={reviews}
              previousReads={previousReads}
              onUpdateReview={handleUpdateReview}
              onDeleteReview={handleDeleteReview}
            />
          </section>
        )}
        </div>
      </main>
    </div>
    </>
  );
}
