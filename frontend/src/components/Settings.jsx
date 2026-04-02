import React, { useEffect, useMemo, useRef, useState } from 'react'
import { getApiBase } from '../utils/apiBase'

const API_BASE = getApiBase()

const GENRE_OPTIONS = [
  'Romance',
  'Dark Romance',
  'Psychology',
  'Science',
  'History',
  'Fantasy',
  'Mystery',
  'Thriller',
  'Philosophy',
  'Sociology',
  'Literary Fiction',
  'Self-help',
  'Horror',
  'Sports',
]

const THEME_OPTIONS = [
  { value: 'light', label: 'Light Mode', icon: '☀️' },
  { value: 'dark', label: 'Dark Mode', icon: '🌙' },
  { value: 'system', label: 'System Default', icon: '🖥️' },
]

const RECOMMENDATION_STYLE_OPTIONS = [
  { value: 'safe', label: 'Safe Picks', description: 'Prioritize favorite genres and familiar reading patterns.' },
  { value: 'balanced', label: 'Balanced', description: 'Blend core favorites with controlled exploration.' },
  { value: 'discovery', label: 'Discovery Mode', description: 'Push recommendations toward broader genre diversity.' },
]

const TASTE_DRIFT_OPTIONS = [
  { value: 'slow', label: 'Slow' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'aggressive', label: 'Aggressive' },
]

function getSystemThemeLabel() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'Light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'Dark' : 'Light'
}

function SectionCard({ title, subtitle, children, className = '' }) {
  return (
    <section className={`glass rounded-2xl shadow-lg p-4 sm:p-6 border border-white/10 ${className}`}>
      <div className="mb-5">
        <h3 className="text-lg sm:text-xl font-semibold text-primary dark:text-primary">{title}</h3>
        {subtitle && <p className="text-xs sm:text-sm text-on-light mt-1">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function SelectChip({ active, onClick, children, tone = 'blue' }) {
  const activeClass = tone === 'red'
    ? 'bg-red-500 text-white border-red-400'
    : 'bg-cool-blue text-white border-cool-blue'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-medium border transition ${
        active
          ? activeClass
          : 'bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-cool-blue/50'
      }`}
    >
      {children}
    </button>
  )
}

function SegmentedButton({ active, onClick, label, description }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-3 transition ${
        active
          ? 'border-cool-blue bg-cool-blue/10 shadow-[0_0_18px_rgba(30,144,255,0.12)]'
          : 'border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/40 hover:border-cool-blue/40'
      }`}
    >
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
      {description && <p className="text-xs text-on-light mt-1 leading-relaxed">{description}</p>}
    </button>
  )
}

function ToggleRow({ label, description, enabled, onToggle }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/40 p-4">
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
        {description && <p className="text-xs text-on-light mt-1 leading-relaxed max-w-md">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        className={`relative inline-flex h-7 w-14 flex-shrink-0 items-center rounded-full transition ${enabled ? 'bg-cool-blue' : 'bg-slate-300 dark:bg-slate-600'}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${enabled ? 'translate-x-8' : 'translate-x-1'}`}
        />
      </button>
    </div>
  )
}

export default function Settings({
  userId,
  theme,
  userSettings,
  onUpdateSetting,
  onLogout,
  onDeleteAccount,
  onDownloadReadingData,
  onResetRecommendationModel,
  onClearReadingHistory,
  userEmail,
  username,
  reviews = [],
  previousReads = [],
  onUpdateReview,
  onDeleteReview,
}) {
    const profilePictureStorageKey = userId ? `user_${userId}_profilePicture` : 'profilePicture'

  const [profilePicture, setProfilePicture] = useState(null)
  const [uploadMessage, setUploadMessage] = useState('')
  const fileInputRef = useRef(null)

  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordStep, setPasswordStep] = useState('otp')
  const [otpInput, setOtpInput] = useState('')
  const [otpToken, setOtpToken] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwInfo, setPwInfo] = useState('')
  const [otpHelperLoading, setOtpHelperLoading] = useState(false)
  const [demoOtp, setDemoOtp] = useState('')
  const [currentPass, setCurrentPass] = useState('')

  const [editingReviewId, setEditingReviewId] = useState('')
  const [editRating, setEditRating] = useState(5)
  const [editReviewText, setEditReviewText] = useState('')
  const [confirmState, setConfirmState] = useState(null)
  const [confirmText, setConfirmText] = useState('')

  const sortedReviews = useMemo(() => {
    return [...reviews].sort((a, b) => {
      const at = new Date(a.updated_at || a.created_at || 0).getTime()
      const bt = new Date(b.updated_at || b.created_at || 0).getTime()
      return bt - at
    })
  }, [reviews])

  const systemThemeLabel = getSystemThemeLabel()
  const readingGoalProgress = Math.min(100, Math.round((previousReads.length / Math.max(1, Number(userSettings?.readingGoal || 1))) * 100))

  useEffect(() => {
    const saved = localStorage.getItem(profilePictureStorageKey)
    if (saved) setProfilePicture(saved)
    else setProfilePicture(null)
  }, [profilePictureStorageKey])

  const passwordRuleMessage = 'Password must contain: 8-16 characters, letters, numbers, and at least one special character.'

  const updateSettingValue = (key, value) => {
    onUpdateSetting?.(key, value)
  }

  const toggleGenreSelection = (key, genre) => {
    const current = Array.isArray(userSettings?.[key]) ? userSettings[key] : []
    const exists = current.includes(genre)
    const next = exists ? current.filter((item) => item !== genre) : [...current, genre]

    if (key === 'preferredGenres') {
      const avoided = (userSettings?.avoidedGenres || []).filter((item) => item !== genre)
      updateSettingValue('avoidedGenres', avoided)
    }
    if (key === 'avoidedGenres') {
      const preferred = (userSettings?.preferredGenres || []).filter((item) => item !== genre)
      updateSettingValue('preferredGenres', preferred)
    }

    updateSettingValue(key, next)
  }

  const startEditReview = (review) => {
    setEditingReviewId(review.review_id)
    setEditRating(Number(review.rating || 5))
    setEditReviewText(review.review || '')
  }

  const cancelEditReview = () => {
    setEditingReviewId('')
    setEditRating(5)
    setEditReviewText('')
  }

  const submitEditReview = () => {
    if (!editingReviewId) return
    onUpdateReview?.(editingReviewId, Number(editRating), editReviewText.trim())
    cancelEditReview()
  }

  const resetPasswordFlow = () => {
    setPasswordStep('otp')
    setOtpInput('')
    setOtpToken('')
    setNewPass('')
    setConfirmPass('')
    setPwError('')
    setPwInfo('')
    setDemoOtp('')
    setCurrentPass('')
  }

  const isStrongPassword = (pw) => {
    if (!pw || pw.length < 8 || pw.length > 16) return false
    if (!/[A-Za-z]/.test(pw)) return false
    if (!/\d/.test(pw)) return false
    if (!/[^A-Za-z0-9]/.test(pw)) return false
    return true
  }

  const handleProfilePictureUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setUploadMessage('File size must be less than 5MB')
      setTimeout(() => setUploadMessage(''), 3000)
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      setProfilePicture(reader.result)
      localStorage.setItem(profilePictureStorageKey, reader.result)
      setUploadMessage('Profile picture updated!')
      setTimeout(() => setUploadMessage(''), 3000)
    }
    reader.readAsDataURL(file)
  }

  const handleDeleteProfilePicture = () => {
    setProfilePicture(null)
    try {
      localStorage.removeItem(profilePictureStorageKey)
    } catch {}
    setUploadMessage('Profile picture removed')
    setTimeout(() => setUploadMessage(''), 3000)
  }

  const requestOtp = async () => {
    setPwError('')
    setPwInfo('')
    setDemoOtp('')
    if (!username) {
      setPwError('You must be logged in to change password')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim().toLowerCase() })
      })
      const data = await res.json()
      if (data.status === 'ok') {
        if (data.otp) {
          setDemoOtp(data.otp)
          setPwInfo(`Demo OTP: ${data.otp}. Enter this OTP to verify.`)
        } else {
          setPwInfo(data.message || 'OTP generated. Enter it here to continue.')
        }
      } else {
        setPwError(data.error || 'Failed to request OTP')
      }
    } catch {
      setPwError('Network error requesting OTP')
    }
  }

  const verifyOtp = async () => {
    setPwError('')
    setPwInfo('')
    if (!otpInput.trim()) {
      setPwError('OTP is required')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: (username || '').trim().toLowerCase(), otp: otpInput.trim() })
      })
      const data = await res.json()
      if (data.status === 'ok' && data.token) {
        setOtpToken(data.token)
        setPasswordStep('password')
        setPwInfo('OTP verified. Set your new password and confirm it.')
      } else {
        setPwError(data.error || 'Invalid OTP')
      }
    } catch {
      setPwError('Network error verifying OTP')
    }
  }

  const fetchLatestOtp = async () => {
    setPwError('')
    setOtpHelperLoading(true)
    try {
      const res = await fetch(`${API_BASE}/auth/latest-otp`)
      const data = await res.json()

      if (data.status !== 'ok' || !data.has_otp) {
        setPwError('No OTP available yet. Click Generate OTP first.')
        return
      }

      const expected = (username || '').trim().toLowerCase()
      const actual = (data.username || '').trim().toLowerCase()
      if (expected && actual && expected !== actual) {
        setPwError('Latest OTP belongs to another username. Generate OTP again for your account.')
        return
      }

      setOtpInput(data.otp || '')
      setPwInfo(`Latest OTP fetched: ${data.otp}`)
    } catch {
      setPwError('Unable to fetch latest OTP from backend')
    } finally {
      setOtpHelperLoading(false)
    }
  }

  const submitNewPassword = async () => {
    setPwError('')
    setPwInfo('')
    if (!currentPass) {
      setPwError('Current password is required')
      return
    }
    if (!isStrongPassword(newPass)) {
      setPwError(passwordRuleMessage)
      return
    }
    if (newPass !== confirmPass) {
      setPwError('Passwords do not match')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, current_password: currentPass, new_password: newPass, token: otpToken })
      })
      const data = await res.json()
      if (data.status === 'ok') {
        setPasswordStep('success')
        setPwInfo(data.message || 'Password successfully updated.')
      } else {
        setPwError(data.error || 'Failed to change password')
      }
    } catch {
      setPwError('Network error changing password')
    }
  }

  const openConfirmation = (config) => {
    setConfirmText('')
    setConfirmState(config)
  }

  const closeConfirmation = () => {
    setConfirmState(null)
    setConfirmText('')
  }

  const executeConfirmedAction = () => {
    if (!confirmState) return
    if (confirmState.requiredText && confirmText !== confirmState.requiredText) return
    confirmState.onConfirm?.()
    closeConfirmation()
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 sm:space-y-8 pb-8">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SectionCard
          title="Appearance"
          subtitle="Control how SmartShelf looks across the app. Changes apply instantly and persist automatically."
        >
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">Theme Mode</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {THEME_OPTIONS.map((option) => (
                  <SegmentedButton
                    key={option.value}
                    active={userSettings?.theme === option.value}
                    onClick={() => updateSettingValue('theme', option.value)}
                    label={`${option.icon} ${option.label}`}
                    description={option.value === 'system' ? `Currently following ${systemThemeLabel} mode.` : undefined}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/40 p-4">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Live Preview</p>
              <p className="text-xs text-on-light mt-1">SmartShelf is currently rendering in {theme} mode.</p>
              <div className="mt-4 flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full border ${theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`} />
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Premium glass surfaces remain consistent.</p>
                  <p className="text-xs text-on-light">Theme preference is stored automatically in localStorage.</p>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Account"
          subtitle="Profile identity, account access, and secure sign-in controls."
        >
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/40 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-cool-light dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                  {profilePicture ? (
                    <img src={profilePicture} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl">👤</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 break-all">{username || 'Not logged in'}</p>
                  <p className="text-xs text-on-light break-all mt-1">{userEmail || 'No email available'}</p>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleProfilePictureUpload}
                      className="sr-only"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 rounded-lg bg-cool-blue text-white font-medium hover:bg-cool-accent transition text-sm"
                    >
                      {profilePicture ? 'Edit Profile Picture' : 'Choose File'}
                    </button>
                    {profilePicture && (
                      <button
                        type="button"
                        onClick={handleDeleteProfilePicture}
                        className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition text-sm"
                      >
                        Delete Picture
                      </button>
                    )}
                  </div>
                  {uploadMessage && <p className="text-xs text-green-600 dark:text-green-400 mt-2">{uploadMessage}</p>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => { setShowPasswordModal(true); resetPasswordFlow() }}
                className="w-full px-4 py-3 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition text-sm"
              >
                🔒 Change Password
              </button>
              <button
                onClick={onLogout}
                className="w-full px-4 py-3 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition text-sm"
              >
                🚪 Logout
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Reading Preferences"
          subtitle="Influence how SmartShelf prioritizes genres and tracks your annual reading goals."
        >
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Preferred Genres</p>
                  <p className="text-xs text-on-light">Selected genres receive an extra recommendation boost.</p>
                </div>
                <span className="text-xs text-slate-500">{userSettings?.preferredGenres?.length || 0} selected</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {GENRE_OPTIONS.map((genre) => (
                  <SelectChip
                    key={`preferred-${genre}`}
                    active={(userSettings?.preferredGenres || []).includes(genre)}
                    onClick={() => toggleGenreSelection('preferredGenres', genre)}
                  >
                    {genre}
                  </SelectChip>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Avoid Genres</p>
                  <p className="text-xs text-on-light">These genres are penalized during recommendation scoring.</p>
                </div>
                <span className="text-xs text-slate-500">{userSettings?.avoidedGenres?.length || 0} selected</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {GENRE_OPTIONS.map((genre) => (
                  <SelectChip
                    key={`avoid-${genre}`}
                    active={(userSettings?.avoidedGenres || []).includes(genre)}
                    onClick={() => toggleGenreSelection('avoidedGenres', genre)}
                    tone="red"
                  >
                    {genre}
                  </SelectChip>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/40 p-4">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Reading Goal</p>
                  <p className="text-xs text-on-light mt-1">Set a yearly goal in books. Dashboard progress can use this later.</p>
                </div>
                <div className="w-full sm:w-44">
                  <label className="text-xs text-slate-500">Books per year</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={userSettings?.readingGoal || 40}
                    onChange={(e) => updateSettingValue('readingGoal', Math.max(1, Number(e.target.value || 1)))}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cool-blue"
                  />
                </div>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Current progress</span>
                  <span>{previousReads.length}/{userSettings?.readingGoal || 40}</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full rounded-full bg-cool-blue transition-all duration-300" style={{ width: `${readingGoalProgress}%` }} />
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Recommendation AI Controls"
          subtitle="Tune how aggressively SmartShelf learns and how adventurous its suggestions should be."
        >
          <div className="space-y-6">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">Recommendation Style</p>
              <div className="grid grid-cols-1 gap-3">
                {RECOMMENDATION_STYLE_OPTIONS.map((option) => (
                  <SegmentedButton
                    key={option.value}
                    active={userSettings?.recommendationStyle === option.value}
                    onClick={() => updateSettingValue('recommendationStyle', option.value)}
                    label={option.label}
                    description={option.description}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">Taste Drift Sensitivity</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {TASTE_DRIFT_OPTIONS.map((option) => (
                  <SegmentedButton
                    key={option.value}
                    active={userSettings?.tasteDriftSensitivity === option.value}
                    onClick={() => updateSettingValue('tasteDriftSensitivity', option.value)}
                    label={option.label}
                  />
                ))}
              </div>
              <p className="text-xs text-on-light mt-3">Controls how quickly SmartShelf updates your taste profile when your reading habits change.</p>
            </div>

            <ToggleRow
              label="Use my reviews to improve recommendations"
              description="If disabled, reviews are still stored in your library history, but SmartShelf will stop analyzing them for AI recommendation refinement."
              enabled={Boolean(userSettings?.reviewIntelligence)}
              onToggle={() => updateSettingValue('reviewIntelligence', !userSettings?.reviewIntelligence)}
            />
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Data & Privacy"
        subtitle="Manage exports, model resets, and destructive data actions with confirmation safeguards."
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6 items-start">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={onDownloadReadingData}
              className="w-full px-4 py-3 rounded-xl bg-cool-blue text-white font-medium hover:bg-cool-accent transition text-sm"
            >
              Download Reading Data
            </button>
            <button
              onClick={() => openConfirmation({
                title: 'Reset Recommendation Model',
                description: 'This clears SmartShelf’s learned recommendation model while preserving your reading history and saved reviews.',
                confirmLabel: 'Reset Model',
                onConfirm: onResetRecommendationModel,
              })}
              className="w-full px-4 py-3 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 transition text-sm"
            >
              Reset Recommendation Model
            </button>
            <button
              onClick={() => openConfirmation({
                title: 'Clear Reading History',
                description: 'This removes finished-book history, completed educational history, reviews, and derived analytics. Current in-progress reading remains intact.',
                confirmLabel: 'Clear History',
                onConfirm: onClearReadingHistory,
              })}
              className="w-full px-4 py-3 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 transition text-sm"
            >
              Clear Reading History
            </button>
          </div>

          <div className="rounded-xl border border-red-200/50 dark:border-red-800/40 bg-red-50/60 dark:bg-red-900/15 p-4">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">Danger Zone</p>
            <p className="text-xs text-red-700/80 dark:text-red-300/80 mt-1 leading-relaxed">
              Account deletion permanently removes SmartShelf data for this user profile, including personalization settings and saved shelves.
            </p>
            <button
              onClick={() => openConfirmation({
                title: 'Delete Account',
                description: 'This action cannot be undone. All reading data, analytics, and personalization settings will be permanently deleted.',
                confirmLabel: 'Delete Forever',
                requiredText: 'DELETE',
                onConfirm: onDeleteAccount,
              })}
              className="mt-4 px-4 py-2.5 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition text-sm"
            >
              Delete Account
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Review History"
        subtitle="Reviews remain editable even if review intelligence is disabled."
      >
        {!sortedReviews.length ? (
          <p className="text-sm text-on-light">No submitted reviews yet. Finish a book and submit a review to see it here.</p>
        ) : (
          <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
            {sortedReviews.map((review) => {
              const isEditing = editingReviewId === review.review_id
              return (
                <div key={review.review_id} className="rounded-xl border border-slate-200/60 dark:border-slate-700/70 p-4 bg-white/50 dark:bg-slate-800/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100">{review.book}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{review.author || 'Unknown author'}{review.genre ? ` • ${review.genre}` : ''}</p>
                    </div>
                    {!isEditing && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEditReview(review)}
                          className="px-2.5 py-1.5 rounded-md text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDeleteReview && onDeleteReview(review.review_id)}
                          className="px-2.5 py-1.5 rounded-md text-xs bg-red-100 dark:bg-red-900/35 text-red-700 dark:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="mt-3 space-y-3">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setEditRating(star)}
                            className="text-xl leading-none"
                            style={{ color: star <= editRating ? '#FACC15' : '#64748B' }}
                            aria-label={`Rate ${star} star`}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={editReviewText}
                        onChange={(e) => setEditReviewText(e.target.value)}
                        rows={3}
                        className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-cool-blue"
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={cancelEditReview} className="px-3 py-2 rounded-md text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">Cancel</button>
                        <button
                          onClick={submitEditReview}
                          className="px-3 py-2 rounded-md text-xs text-white"
                          style={{ background: '#1E90FF' }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-slate-700 dark:text-slate-300 mt-3">{review.review || 'No written review provided.'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        {'★'.repeat(Number(review.rating || 0))}{'☆'.repeat(5 - Number(review.rating || 0))}
                      </p>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {confirmState && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeConfirmation}>
          <div className="glass-strong rounded-2xl shadow-2xl w-full max-w-md p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-3">{confirmState.title}</h3>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{confirmState.description}</p>
            {confirmState.requiredText && (
              <div className="mt-4">
                <p className="text-xs text-slate-500 mb-2">Type {confirmState.requiredText} to confirm.</p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            )}
            <div className="flex gap-3 flex-col-reverse sm:flex-row mt-5">
              <button
                onClick={closeConfirmation}
                className="flex-1 px-4 py-2.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition text-sm"
              >
                Cancel
              </button>
              <button
                onClick={executeConfirmedAction}
                disabled={Boolean(confirmState.requiredText && confirmText !== confirmState.requiredText)}
                className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition text-sm ${confirmState.requiredText && confirmText !== confirmState.requiredText ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowPasswordModal(false); resetPasswordFlow() }}>
          <div className="glass-strong rounded-2xl shadow-2xl w-full max-w-sm sm:max-w-md p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg sm:text-xl font-bold text-primary dark:text-primary mb-4">Change Password</h3>

            {passwordStep === 'otp' && (
              <div className="space-y-4">
                <label className="block text-xs sm:text-sm text-slate-700 dark:text-slate-300">Username: {username}</label>
                <label className="block text-xs sm:text-sm text-slate-700 dark:text-slate-300">Enter OTP</label>
                <input
                  type="text"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  maxLength={6}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-cool-blue"
                />
                {demoOtp && (
                  <div className="rounded-lg border border-emerald-300/60 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-xs sm:text-sm text-emerald-700 dark:text-emerald-300">
                    Demo OTP: {demoOtp}<br />
                    Enter this OTP to verify.
                  </div>
                )}
                <button
                  onClick={fetchLatestOtp}
                  disabled={otpHelperLoading}
                  className="w-full text-[11px] sm:text-xs text-cool-blue hover:underline disabled:opacity-60"
                >
                  {otpHelperLoading ? 'Fetching latest OTP…' : 'Show OTP from backend (testing helper)'}
                </button>
                {pwInfo && <p className="text-xs sm:text-sm text-green-600 dark:text-green-400">{pwInfo}</p>}
                {pwError && <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">{pwError}</p>}
                <div className="flex gap-3 flex-col-reverse sm:flex-row">
                  <button onClick={() => { setShowPasswordModal(false); resetPasswordFlow() }} className="flex-1 px-4 py-2 sm:py-2.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition text-sm sm:text-base">Cancel</button>
                  <button onClick={requestOtp} className="flex-1 px-4 py-2 sm:py-2.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition text-sm sm:text-base">Generate OTP</button>
                  <button onClick={verifyOtp} className="flex-1 px-4 py-2 sm:py-2.5 rounded-lg bg-cool-blue text-white font-medium hover:bg-cool-accent transition text-sm sm:text-base">Verify OTP</button>
                </div>
              </div>
            )}

            {passwordStep === 'password' && (
              <div className="space-y-4">
                <label className="block text-xs sm:text-sm text-slate-700 dark:text-slate-300">Current Password</label>
                <input
                  type="password"
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-cool-blue"
                />
                <label className="block text-xs sm:text-sm text-slate-700 dark:text-slate-300">Enter New Password</label>
                <input
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border ${newPass && !isStrongPassword(newPass) ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'} bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-cool-blue`}
                />
                {newPass && !isStrongPassword(newPass) && (
                  <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">{passwordRuleMessage}</p>
                )}
                <label className="block text-xs sm:text-sm text-slate-700 dark:text-slate-300">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-cool-blue"
                />
                {pwInfo && <p className="text-xs sm:text-sm text-green-600 dark:text-green-400">{pwInfo}</p>}
                {pwError && <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">{pwError}</p>}
                <div className="flex gap-3 flex-col-reverse sm:flex-row">
                  <button onClick={() => { setShowPasswordModal(false); resetPasswordFlow() }} className="flex-1 px-4 py-2 sm:py-2.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition text-sm sm:text-base">Cancel</button>
                  <button
                    onClick={submitNewPassword}
                    disabled={!currentPass || !newPass || newPass !== confirmPass || !isStrongPassword(newPass)}
                    className={`flex-1 px-4 py-2 sm:py-2.5 rounded-lg font-medium transition text-sm sm:text-base ${(!currentPass || !newPass || newPass !== confirmPass || !isStrongPassword(newPass)) ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-cool-blue text-white hover:bg-cool-accent'}`}
                  >
                    Update Password
                  </button>
                </div>
              </div>
            )}

            {passwordStep === 'success' && (
              <div className="space-y-4 text-center">
                <p className="text-sm sm:text-base text-green-600 dark:text-green-400 font-medium">Your password has been changed successfully.</p>
                {pwInfo && <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">{pwInfo}</p>}
                <button onClick={() => { setShowPasswordModal(false); resetPasswordFlow() }} className="w-full px-4 py-2 sm:py-2.5 rounded-lg bg-cool-blue text-white font-medium hover:bg-cool-accent transition text-sm sm:text-base">Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
