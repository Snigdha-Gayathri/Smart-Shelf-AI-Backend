import React, { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FiEye, FiEyeOff, FiUserPlus } from 'react-icons/fi'
import GoogleAuthButtons from './GoogleAuthButtons'
import qLexiIntroImage from '../assets/qlexi-intro-removebg-preview-removebg-preview.png'
import { getApiBase } from '../utils/apiBase'

const API_BASE = getApiBase()

/* Password rules */
const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'lower', label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { id: 'digit', label: 'One number', test: (pw) => /\d/.test(pw) },
  { id: 'special', label: 'One special character', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
]

function allPasswordRulesPass(pw) {
  return PASSWORD_RULES.every((r) => r.test(pw))
}

function mapLoginError(data, responseStatus) {
  const code = String(data?.error_code || '').toLowerCase()
  const backendMessage = String(data?.error || data?.message || '').trim()

  const codeMap = {
    username_deleted: 'This username was deleted. Please register again to restore access.',
    username_not_found: 'No account exists with this username.',
    password_incorrect: 'Incorrect password. Please try again.',
    username_format_invalid: 'Username must be 3-32 characters and can include letters, numbers, ., _, and -.',
    missing_password_hash: 'This account has no password set. Use social login or reset your password.',
    password_verify_error: 'Password verification failed. Please reset your password and try again.',
    login_internal_error: 'Login failed due to a server issue. Please try again shortly.',
  }

  if (codeMap[code]) return codeMap[code]
  if (responseStatus === 429) return 'Too many login attempts. Please wait a moment and try again.'
  if (responseStatus >= 500) return 'Server error while logging in. Please try again shortly.'
  if (backendMessage) return backendMessage
  return 'Unable to login right now. Please try again.'
}

export default function Auth({ onSuccess, googleAuthEnabled = false, theme = 'light' }) {
  /* Sparkle Particle Generator */
  const [sparkles, setSparkles] = useState([])
  const [snowflakes, setSnowflakes] = useState([])

  useEffect(() => {
    const chars = ['✦', '✧', '·', '⋆', '·', '✧']
    const generated = Array.from({ length: 45 }).map((_, i) => ({
      id: i,
      char: chars[Math.floor(Math.random() * chars.length)],
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 5}s`,
      fontSize: `${Math.floor(Math.random() * 6) + 6}px`,
      opacity: Math.random() * 0.7 + 0.2
    }))
    setSparkles(generated)
  }, [])

  useEffect(() => {
    const cleanup = window.setInterval(() => {
      setSnowflakes((prev) => prev.filter((flake) => Date.now() - flake.createdAt < 1700))
    }, 250)

    return () => window.clearInterval(cleanup)
  }, [])

  function handleShellMouseMove(e) {
    const flake = {
      id: `${Date.now()}-${Math.random()}`,
      x: e.clientX,
      y: e.clientY,
      createdAt: Date.now(),
      size: 8 + Math.random() * 8,
      drift: (Math.random() - 0.5) * 18,
      duration: 1.2 + Math.random() * 0.8,
      opacity: 0.55 + Math.random() * 0.3,
    }

    setSnowflakes((prev) => {
      const next = [...prev, flake]
      return next.length > 45 ? next.slice(next.length - 45) : next
    })
  }

  /* Login state */
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginShowPw, setLoginShowPw] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loginSuccess, setLoginSuccess] = useState('')

  /* Register state */
  const [regName, setRegName] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regShowPw, setRegShowPw] = useState(false)
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError] = useState('')
  const [regSuccess, setRegSuccess] = useState('')

  /* Forgot password state */
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotUsername, setForgotUsername] = useState('')
  const [forgotNewPass, setForgotNewPass] = useState('')
  const [forgotConfirmPass, setForgotConfirmPass] = useState('')
  const [forgotError, setForgotError] = useState('')
  const [forgotInfo, setForgotInfo] = useState('')
  const [forgotUpdateLoading, setForgotUpdateLoading] = useState(false)

  /* Login handler */
  async function handleLogin(e) {
    e.preventDefault()
    setLoginError('')
    setLoginSuccess('')

    if (!loginUsername.trim()) { setLoginError('Username is required.'); return }
    if (!loginPassword) { setLoginError('Password is required.'); return }

    setLoginLoading(true)
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.trim().toLowerCase(), password: loginPassword }),
      })

      let data
      try { data = await res.json() } catch { data = { status: 'error', error: 'Server unavailable. Is the backend running?' } }

      if (!res.ok || data.status !== 'ok') {
        setLoginError(mapLoginError(data, res.status))
        return
      }

      const authPayload = { user: data.user, token: data.token || null, authMethod: 'local' }
      localStorage.setItem('auth', JSON.stringify(authPayload))
      setLoginSuccess('✓ Logged in! Loading your library...')
      setLoginLoading(false)
      window.setTimeout(() => {
        onSuccess?.(authPayload)
      }, 350)
    } catch (err) {
      setLoginError(err?.message || 'Server unavailable. Please check the backend.')
    } finally {
      setLoginLoading(false)
    }
  }

  /* Register handler */
  async function handleRegister(e) {
    e.preventDefault()
    setRegError('')
    setRegSuccess('')

    if (!regName.trim()) { setRegError('Name is required.'); return }
    if (!regUsername.trim()) { setRegError('Username is required.'); return }
    if (!allPasswordRulesPass(regPassword)) {
      const failed = PASSWORD_RULES.find((r) => !r.test(regPassword))
      const msgs = {
        length: 'Password must be at least 8 characters long.',
        upper: 'Password must contain at least one uppercase letter.',
        lower: 'Password must contain at least one lowercase letter.',
        digit: 'Password must contain at least one number.',
        special: 'Password must contain at least one special character.',
      }
      setRegError(failed ? (msgs[failed.id] || failed.label) : 'Password does not meet all requirements.')
      return
    }

    setRegLoading(true)
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: regName.trim(), username: regUsername.trim().toLowerCase(), password: regPassword }),
      })

      let data
      try { data = await res.json() } catch { data = { status: 'error', error: 'Server unavailable. Is the backend running?' } }

      if (!res.ok || data.status !== 'ok') {
        const message = data.error || data.message || 'Registration failed'
        if (message.includes('already registered') || message.includes('already exists')) {
          setRegError('Username already exists. Please choose another.')
        } else {
          setRegError(message)
        }
        return
      }

      setRegSuccess('✓ Account created! You can now login.')
      setRegLoading(false)

      window.setTimeout(() => {
        setLoginUsername(regUsername.trim().toLowerCase())
        setLoginPassword('')
        setRegName('')
        setRegUsername('')
        setRegPassword('')
        setRegSuccess('')
      }, 1500)
    } catch (err) {
      setRegError(err?.message || 'Registration failed')
    } finally {
      setRegLoading(false)
    }
  }

  function resetForgotFlow() {
    setForgotNewPass('')
    setForgotConfirmPass('')
    setForgotError('')
    setForgotInfo('')
    setForgotUpdateLoading(false)
  }

  function openForgotModal() {
    resetForgotFlow()
    setForgotUsername(loginUsername.trim().toLowerCase())
    setShowForgotModal(true)
  }

  function isForgotPasswordStrong(pw) {
    return allPasswordRulesPass(pw)
  }

  async function forgotSubmitNewPassword() {
    setForgotError('')
    setForgotInfo('')
    if (!forgotUsername.trim()) {
      setForgotError('Username is required.')
      return
    }
    if (!isForgotPasswordStrong(forgotNewPass)) {
      const failed = PASSWORD_RULES.find((r) => !r.test(forgotNewPass))
      setForgotError(failed ? failed.label : 'Password does not meet all requirements.')
      return
    }
    if (forgotNewPass !== forgotConfirmPass) { setForgotError('Passwords do not match.'); return }
    setForgotUpdateLoading(true)
    try {
      const res = await fetch(`${API_BASE}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: forgotUsername.trim().toLowerCase(), new_password: forgotNewPass })
      })
      const data = await res.json()
      if (data.status === 'ok') {
        setLoginUsername(forgotUsername.trim().toLowerCase())
        setLoginPassword('')
        setLoginSuccess(data.message || 'Password updated successfully')
        setShowForgotModal(false)
        resetForgotFlow()
      } else {
        setForgotError(data.error || 'Failed to change password.')
      }
    } catch {
      setForgotError('Network error. Please try again.')
    } finally {
      setForgotUpdateLoading(false)
    }
  }

  return (
    <div className="auth-new-shell" data-theme={theme} onMouseMove={handleShellMouseMove}>
      {/* Decorative Sparkles */}
      <div className="auth-sparkles">
        {sparkles.map(s => (
          <span
            key={s.id}
            className="auth-sparkle"
            style={{
              top: s.top,
              left: s.left,
              animationDelay: s.animationDelay,
              fontSize: s.fontSize,
              opacity: s.opacity
            }}
          >
            {s.char}
          </span>
        ))}
      </div>

      <div className="auth-cursor-snow-layer" aria-hidden="true">
        {snowflakes.map((flake) => (
          <span
            key={flake.id}
            className="auth-cursor-snowflake"
            style={{
              left: `${flake.x}px`,
              top: `${flake.y}px`,
              fontSize: `${flake.size}px`,
              opacity: flake.opacity,
              ['--snow-drift']: `${flake.drift}px`,
              ['--snow-duration']: `${flake.duration}s`,
            }}
          >
            {theme === 'dark' ? '✦' : '❄'}
          </span>
        ))}
      </div>

      <div className="auth-main-grid">
      <motion.div
        className="auth-col-left"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
      >
        <p className="auth-brand-kicker">Futuristic Library<br/>Intelligent Reading</p>
        <h1 className="auth-brand-title">SmartShelf AI</h1>
        <div className="auth-glow-line" />

        <div className="auth-mascot-floating" aria-label="Q Lexi mascot">
          <img src={qLexiIntroImage} alt="Q Lexi" className="auth-mascot-img" />
          <h2 className="auth-mascot-name">Q Lexi</h2>
        </div>
      </motion.div>

      <motion.div
        className="auth-col-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        <div className="auth-card auth-card-login">
          <div className="auth-card-header">
            <h2 className="auth-card-title">Login</h2>
            <p className="auth-card-subtitle">Step into your book world</p>
          </div>

          <form onSubmit={handleLogin} className="auth-form">
            <div className="auth-form-fields">
              <div className="auth-input-wrapper">
                <input
                  type="text"
                  placeholder="Username"
                  value={loginUsername}
                  onChange={(e) => { setLoginUsername(e.target.value); setLoginError('') }}
                  className="auth-input-new"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="auth-input-wrapper">
                <input
                  type={loginShowPw ? 'text' : 'password'}
                  placeholder="Password"
                  value={loginPassword}
                  onChange={(e) => { setLoginPassword(e.target.value); setLoginError('') }}
                  className="auth-input-new"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="auth-input-icon-right"
                  onClick={() => setLoginShowPw(!loginShowPw)}
                  aria-label={loginShowPw ? 'Hide password' : 'Show password'}
                >
                  {loginShowPw ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                </button>
              </div>

              <button type="button" className="auth-forgot-link" onClick={openForgotModal}>
                Forgot password?
              </button>

              <AnimatePresence>
                {loginSuccess && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <div className="auth-msg-new auth-msg-success">{loginSuccess}</div>
                  </motion.div>
                )}
                {loginError && !loginSuccess && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <div className="auth-msg-new auth-msg-error">{loginError}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="auth-form-actions">
              <button
                type="submit"
                disabled={loginLoading || !!loginSuccess}
                className={`auth-btn-primary ${loginLoading ? 'auth-btn-primary-loading' : ''}`}
                aria-busy={loginLoading}
              >
                {loginLoading ? 'Logging in...' : <><span style={{ fontSize: '18px', fontWeight: 'bold' }}>&#8594;</span> Login</>}
              </button>
              <GoogleAuthButtons enabled={googleAuthEnabled} mode="login" className="auth-btn-google" buttonText="Continue with Google" />
            </div>
          </form>
        </div>
      </motion.div>

      <motion.div
        className="auth-col-right"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <div className="auth-card auth-card-register">
          <div className="auth-card-header">
            <h2 className="auth-card-title">Register</h2>
            <p className="auth-card-subtitle">Create your book world</p>
          </div>

          <form onSubmit={handleRegister} className="auth-form">
            <div className="auth-form-fields">
              <div className="auth-input-wrapper">
                <input
                  type="text"
                  placeholder="Name"
                  value={regName}
                  onChange={(e) => { setRegName(e.target.value); setRegError('') }}
                  className="auth-input-new"
                  autoComplete="name"
                  required
                />
              </div>

              <div className="auth-input-wrapper">
                <input
                  type="text"
                  placeholder="Username"
                  value={regUsername}
                  onChange={(e) => { setRegUsername(e.target.value); setRegError('') }}
                  className="auth-input-new"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="auth-input-wrapper">
                <input
                  type={regShowPw ? "text" : "password"}
                  placeholder="Password"
                  value={regPassword}
                  onChange={(e) => { setRegPassword(e.target.value); setRegError('') }}
                  className="auth-input-new"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="auth-input-icon-right"
                  onClick={() => setRegShowPw(!regShowPw)}
                  aria-label={regShowPw ? 'Hide password' : 'Show password'}
                >
                  {regShowPw ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                </button>
              </div>

              <AnimatePresence>
                {regSuccess && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <div className="auth-msg-new auth-msg-success">{regSuccess}</div>
                  </motion.div>
                )}
                {regError && !regSuccess && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <div className="auth-msg-new auth-msg-error">{regError}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="auth-form-actions">
              <button
                type="submit"
                disabled={regLoading || !!regSuccess}
                className={`auth-btn-primary ${regLoading ? 'auth-btn-primary-loading' : ''}`}
                aria-busy={regLoading}
              >
                {regLoading ? 'Registering...' : <><FiUserPlus size={18} /> &nbsp;Register</>}
              </button>
              <GoogleAuthButtons enabled={googleAuthEnabled} mode="register" className="auth-btn-google" buttonText="Continue with Google" />
            </div>
          </form>
        </div>
      </motion.div>
      </div>
      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="auth-forgot-overlay" onClick={() => { setShowForgotModal(false); resetForgotFlow() }}>
          <motion.div
            className="auth-forgot-modal"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="auth-card-title" style={{ fontSize: '22px', marginBottom: '16px' }}>Reset Password</h3>

            <div className="auth-forgot-step">
              <label className="auth-forgot-label">Username</label>
              <div className="auth-input-wrapper">
                <input
                  type="text"
                  value={forgotUsername}
                  onChange={(e) => setForgotUsername(e.target.value)}
                  className="auth-input-new"
                  placeholder="Your username"
                />
              </div>
              <label className="auth-forgot-label">New Password</label>
              <div className="auth-input-wrapper">
                <input type="password" value={forgotNewPass} onChange={(e) => setForgotNewPass(e.target.value)} className="auth-input-new" placeholder="Enter new password" />
              </div>
              <label className="auth-forgot-label">Confirm New Password</label>
              <div className="auth-input-wrapper">
                <input type="password" value={forgotConfirmPass} onChange={(e) => setForgotConfirmPass(e.target.value)} className="auth-input-new" placeholder="Confirm new password" />
              </div>
              {forgotInfo && <p className="auth-forgot-info">{forgotInfo}</p>}
              {forgotError && <p className="auth-forgot-error">{forgotError}</p>}
              <div className="auth-forgot-actions">
                <button type="button" className="auth-forgot-cancel-btn" onClick={() => { setShowForgotModal(false); resetForgotFlow() }}>Cancel</button>
                <button
                  type="button"
                  className={`auth-btn-primary auth-forgot-confirm-btn ${forgotUpdateLoading ? 'auth-btn-primary-loading' : ''}`}
                  disabled={forgotUpdateLoading || !forgotUsername.trim() || !forgotNewPass || forgotNewPass !== forgotConfirmPass || !isForgotPasswordStrong(forgotNewPass)}
                  onClick={forgotSubmitNewPassword}
                >
                  {forgotUpdateLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
