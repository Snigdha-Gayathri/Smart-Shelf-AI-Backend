import React, { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FiEye, FiEyeOff } from 'react-icons/fi'
import GoogleAuthButtons from './GoogleAuthButtons'
import qLexiIntroImage from '../assets/qlexi-intro-removebg-preview-removebg-preview.png'

const API_BASE = (import.meta.env.VITE_BACKEND_URL || '').trim() || (import.meta.env.PROD ? window.location.origin : 'http://127.0.0.1:8000')

const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default function Auth({ onSuccess, googleAuthEnabled = false }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [validationPulse, setValidationPulse] = useState(false)

  const heading = useMemo(() => (mode === 'login' ? 'Welcome Back' : 'Create Your Account'), [mode])
  const subheading = useMemo(
    () => (mode === 'login' ? 'Sign in to continue your intelligent reading journey.' : 'Start your personalized AI reading experience in seconds.'),
    [mode]
  )

  function validate() {
    if (!emailRegex.test(email)) return 'Enter a valid email address'
    if (password.length < 8) return 'Password must be at least 8 characters'
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must include letters and numbers'
    return ''
  }

  function triggerValidationPulse(message) {
    setValidationPulse(true)
    setError(message)
    window.setTimeout(() => setValidationPulse(false), 360)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const normalizedEmail = email.trim().toLowerCase()
    const v = validate()
    if (v) {
      triggerValidationPulse(v)
      return
    }

    setLoading(true)
    try {
      const path = mode === 'register' ? '/auth/register' : '/auth/login'
      const apiUrl = `${API_BASE}${path}`
      
      console.log(`[Auth] Attempting ${mode === 'register' ? 'registration' : 'login'} at ${apiUrl}`)
      
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password })
      })
      
      console.log(`[Auth] Response status: ${res.status} ${res.statusText}`)
      
      const data = await res.json()
      console.log(`[Auth] Response data:`, data)
      
      if (!res.ok || data.status !== 'ok') {
        const errorMsg = data.error || data.message || 'Authentication failed'
        console.error(`[Auth] ${mode === 'register' ? 'Registration' : 'Login'} failed:`, errorMsg)
        throw new Error(errorMsg)
      }
      
      console.log(`[Auth] ${mode === 'register' ? 'Registration' : 'Login'} successful`)
      const auth = { user: data.user, token: data.token || null }
      localStorage.setItem('auth', JSON.stringify(auth))
      if (typeof onSuccess === 'function') onSuccess(auth)
    } catch (e) {
      // Handle network errors specifically
      if (e instanceof TypeError && e.message === 'Failed to fetch') {
        console.error(`[Auth] Network error - backend unreachable. Verify server is running on ${API_BASE}`)
        triggerValidationPulse(`Cannot connect to server. Is the backend running on ${API_BASE}?`)
      } else if (e instanceof SyntaxError) {
        console.error('[Auth] JSON parsing error:', e.message)
        triggerValidationPulse('Invalid response from server. Check backend logs.')
      } else {
        console.error(`[Auth] ${mode === 'register' ? 'Registration' : 'Login'} error:`, e.message)
        triggerValidationPulse(e.message || `${mode === 'register' ? 'Registration' : 'Login'} failed`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell relative min-h-screen w-full overflow-hidden bg-slate-950 text-white">
      <div className="auth-aurora auth-aurora-one" />
      <div className="auth-aurora auth-aurora-two" />
      <div className="auth-grid-overlay" />

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 items-stretch px-4 py-8 sm:px-6 lg:grid-cols-2 lg:px-10 lg:py-10">
        <motion.section
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="hidden lg:flex flex-col justify-between rounded-[2rem] border border-white/10 bg-white/[0.03] p-10 backdrop-blur-xl"
        >
          <div>
            <div className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold tracking-[0.2em] text-blue-200/90">
              SMARTSHELF AI
            </div>
            <h1 className="mt-6 text-5xl font-extrabold leading-tight tracking-tight">
              <span className="auth-gradient-text">Read Smarter.</span>
              <br />
              Feel Deeper.
            </h1>
            <p className="mt-5 max-w-md text-base text-blue-100/80">
              Your Intelligent Reading Companion for personalized recommendations, emotional insight, and growth-driven discovery.
            </p>
          </div>

          <div className="mt-8 space-y-4">
            <div className="relative h-64 w-full overflow-hidden rounded-3xl border border-white/10 bg-slate-900/40">
              <img
                src={qLexiIntroImage}
                alt="Q Lexi"
                className="h-full w-full object-contain p-3"
              />
            </div>
            <div className="inline-flex items-center rounded-full border border-blue-300/25 bg-blue-400/10 px-4 py-1.5 text-sm font-semibold tracking-wide text-blue-100/90 shadow-[0_0_20px_rgba(96,165,250,0.25)]">
              Q Lexi
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeInOut' }}
          className="flex items-center justify-center py-2 lg:py-8"
        >
          <div className={`w-full max-w-md rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-[0_30px_80px_rgba(15,23,42,0.55)] backdrop-blur-2xl transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:shadow-[0_40px_90px_rgba(76,29,149,0.35)] sm:p-7 ${validationPulse ? 'animate-auth-shake' : ''}`}>
            <div className="mb-6">
              <div className="relative mx-auto flex h-12 w-full max-w-[320px] items-center rounded-2xl border border-white/10 bg-slate-900/60 p-1">
                <motion.div
                  layout
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className={`absolute top-1 h-10 w-[calc(50%-0.25rem)] rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 shadow-[0_0_20px_rgba(99,102,241,0.55)] ${mode === 'login' ? 'left-1' : 'left-[calc(50%+0.125rem)]'}`}
                />
                <button
                  type="button"
                  onClick={() => {
                    setMode('login')
                    setError('')
                  }}
                  className={`relative z-10 flex-1 rounded-xl py-2 text-sm font-semibold transition duration-300 ease-in-out hover:scale-[1.02] ${mode === 'login' ? 'text-white' : 'text-blue-100/75'}`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register')
                    setError('')
                  }}
                  className={`relative z-10 flex-1 rounded-xl py-2 text-sm font-semibold transition duration-300 ease-in-out hover:scale-[1.02] ${mode === 'register' ? 'text-white' : 'text-blue-100/75'}`}
                >
                  Register
                </button>
              </div>

              <h2 className="mt-6 text-2xl font-bold text-white sm:text-3xl">{heading}</h2>
              <p className="mt-2 text-sm text-blue-100/70">{subheading}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="auth-field group">
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder=" "
                  autoComplete="email"
                  className="peer w-full rounded-2xl border border-white/15 bg-slate-900/45 px-4 pb-3 pt-6 text-sm text-white shadow-inner shadow-black/20 outline-none transition-all duration-300 ease-in-out placeholder:text-transparent focus:border-blue-400/70 focus:ring-2 focus:ring-blue-500/30"
                  required
                />
                <label htmlFor="auth-email" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-blue-100/70 transition-all duration-300 peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-sm peer-focus:top-3 peer-focus:text-xs peer-focus:text-blue-300 peer-[:not(:placeholder-shown)]:top-3 peer-[:not(:placeholder-shown)]:text-xs">
                  Email
                </label>
                <span className="auth-field-line" />
              </div>

              <div className="auth-field group">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder=" "
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="peer w-full rounded-2xl border border-white/15 bg-slate-900/45 px-4 pb-3 pt-6 pr-12 text-sm text-white shadow-inner shadow-black/20 outline-none transition-all duration-300 ease-in-out placeholder:text-transparent focus:border-blue-400/70 focus:ring-2 focus:ring-blue-500/30"
                  required
                />
                <label htmlFor="auth-password" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-blue-100/70 transition-all duration-300 peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-sm peer-focus:top-3 peer-focus:text-xs peer-focus:text-blue-300 peer-[:not(:placeholder-shown)]:top-3 peer-[:not(:placeholder-shown)]:text-xs">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-blue-100/75 transition duration-300 hover:bg-white/10 hover:text-white"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                </button>
                <span className="auth-field-line" />
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.24, ease: 'easeInOut' }}
                    className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100"
                    role="alert"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={loading}
                className="group relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-3 text-sm font-semibold text-white transition-all duration-300 ease-in-out hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(99,102,241,0.6)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    {mode === 'login' ? 'Logging in...' : 'Creating account...'}
                  </span>
                ) : (
                  mode === 'login' ? 'Login' : 'Create account'
                )}
              </button>
            </form>

            <div className="my-5 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            <GoogleAuthButtons enabled={googleAuthEnabled} mode={mode} />
          </div>
        </motion.section>
      </div>
    </div>
  )
}
