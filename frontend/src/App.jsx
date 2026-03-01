

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

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
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
        likedGenres: new Map(),
        dislikedGenres: new Map(),
        likedTags: new Map(),
        dislikedTags: new Map()
      };
    }
    return userStorage.load(auth.user.id, 'userFeedback', {
      likedGenres: new Map(),
      dislikedGenres: new Map(),
      likedTags: new Map(),
      dislikedTags: new Map()
    });
  });
  const [personalityProfile, setPersonalityProfile] = useState(() =>
    auth?.user?.id ? userStorage.load(auth.user.id, 'personalityProfile', null) : null
  );
  const [annualWrapped, setAnnualWrapped] = useState(() =>
    auth?.user?.id ? userStorage.load(auth.user.id, 'annualWrapped', null) : null
  );
  
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('introduction');

  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

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

  // Handle successful authentication - hydrate persisted user data
  function handleAuthSuccess(a){
    setAuth(a);
    if (a?.user) {
      localStorage.setItem('auth', JSON.stringify({ user: a.user }));
    }
    // Load persisted user data from storage after successful login
    if (a?.user?.id) {
      setCurrentlyReading(userStorage.load(a.user.id, 'currentlyReading', []));
      setEducationalBooks(userStorage.load(a.user.id, 'educationalBooks', []));
      setPreviousReads(userStorage.load(a.user.id, 'previousReads', []));
      setUserFeedback(userStorage.load(a.user.id, 'userFeedback', {
        likedGenres: new Map(),
        dislikedGenres: new Map(),
        likedTags: new Map(),
        dislikedTags: new Map()
      }));
      setPersonalityProfile(userStorage.load(a.user.id, 'personalityProfile', null));
      setAnnualWrapped(userStorage.load(a.user.id, 'annualWrapped', null));
    }
  }

  // Handle logout - do NOT delete persisted user data (only clear in-memory state)
  function handleLogout() {
    localStorage.removeItem('auth');
    localStorage.removeItem('profilePicture');
    setAuth(null);
    setActiveSection('home');
    setRecommendations([]);
    // Clear in-memory state but do NOT delete from storage
    // This allows user to log back in without losing their data
    setCurrentlyReading([]);
    setEducationalBooks([]);
    setPreviousReads([]);
    setUserFeedback({
      likedGenres: new Map(),
      dislikedGenres: new Map(),
      likedTags: new Map(),
      dislikedTags: new Map()
    });
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
        body: JSON.stringify({ email: auth.user.email })
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
        genre: book.genre,
        emotion_tags: book.emotion_tags || book.tags || [],
        tags: book.tags || [],
        type: 'educational',
        eduStatus: 'learning',
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
        genre: book.genre,
        emotion_tags: book.emotion_tags || book.tags || [],
        tags: book.tags || [],
        type: book.type,
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

    // Check genre
    if (book.genre) {
      const likedCount = likedGenres.get(book.genre) || 0;
      const dislikedCount = dislikedGenres.get(book.genre) || 0;
      score += likedCount * 0.3; // Boost for liked genre
      score -= dislikedCount * 0.5; // Penalty for disliked genre
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
      
      setRecommendations(filteredRecommendations);
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

  return (
    <div 
      className={`w-full min-h-screen min-h-[100dvh] overflow-x-hidden font-sans transition-colors duration-500 flex flex-row ${theme === 'dark' ? 'bg-black text-white' : 'text-slate-800'}`} 
      style={{ backgroundColor: theme === 'dark' ? '#000000' : '#FAF7F2' }}
    >
      {/* Inline Glass Navigation Sidebar with smooth width transition */}
      <HamburgerMenu 
        isOpen={menuOpen} 
        setIsOpen={setMenuOpen} 
        activeSection={activeSection} 
        setActiveSection={setActiveSection}
        inline={true}
      />
      
      {/* Main Content Area - Shifts and resizes based on navigation state */}
      <main className="flex-1 w-full overflow-y-auto px-3 sm:px-6 md:px-8 py-4 sm:py-8 md:py-12 transition-all duration-300 ease-in-out">
        <div className="w-full max-w-6xl mx-auto">
        <HeaderSection theme={theme} />
        {!auth && (
          <>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 sm:mb-6 text-primary dark:text-primary">Welcome to SmartShelf AI</h2>
            <p className="text-on-light mb-6 text-sm sm:text-base">Please login or create an account to continue.</p>
            <Auth onSuccess={handleAuthSuccess} />
          </>
        )}
        
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
                        book.liked ? 'bg-green-600' : 'bg-red-500'
                      }`}>
                        {book.liked ? '👍 Liked' : '👎 Disliked'}
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
            />
          </section>
        )}

        {/* Settings Section */}
        {auth && activeSection === 'settings' && (
          <section className="w-full space-y-6 sm:space-y-8 page-fade-in">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary dark:text-primary">⚙️ Settings</h2>
            <Settings 
              theme={theme}
              setTheme={setTheme}
              onLogout={handleLogout}
              onDeleteAccount={handleDeleteAccount}
              userEmail={auth?.user?.email}
            />
          </section>
        )}
        </div>
      </main>
    </div>
  );
}
