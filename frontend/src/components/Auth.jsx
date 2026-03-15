import React, { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FiEye, FiEyeOff, FiUserPlus, FiLogIn, FiCheckCircle, FiXCircle } from 'react-icons/fi'
import GoogleAuthButtons from './GoogleAuthButtons'
import qLexiIntroImage from '../assets/qlexi-intro-removebg-preview-removebg-preview.png'

const API_BASE = (import.meta.env.VITE_BACKEND_URL || '').trim() || (import.meta.env.PROD ? window.location.origin : '')

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

function PasswordRulesIndicator({ password }) {
  if (!password) return null
  return (
    <div className="auth-pw-rules">
      {PASSWORD_RULES.map((rule) => {
        const pass = rule.test(password)
        return (
          <div key={rule.id} className={`auth-pw-rule ${pass ? 'pass' : 'fail'}`}>
            {pass ? <FiCheckCircle size={12} /> : <FiXCircle size={12} />}
            <span>{rule.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function FloatingInput({ id, type = 'text', value, onChange, label, error, autoComplete, showToggle, showPassword, onToggle }) {
  return (
    <div className={`auth-field group ${error ? 'animate-auth-shake' : ''}`}>
      <input
        id={id}
        type={showToggle ? (showPassword ? 'text' : 'password') : type}
        value={value}
        onChange={onChange}
        placeholder=" "
        autoComplete={autoComplete}
        className={`peer auth-input ${error ? 'auth-input-error' : ''}`}
        required
      />
      <label htmlFor={id} className="auth-float-label">{label}</label>
      {showToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="auth-pw-toggle"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
        </button>
      )}
      <span className="auth-field-line" />
    </div>
  )
}

export default function Auth({ onSuccess, googleAuthEnabled = false }) {
  const [activePanel, setActivePanel] = useState('login') // 'login' | 'register'

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
  const [regNameError, setRegNameError] = useState(false)
  const [regUsernameError, setRegUsernameError] = useState(false)
  const [regPasswordShake, setRegPasswordShake] = useState(false)

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
        setLoginError(data.error || data.message || 'Invalid username or password.')
        return
      }

      const authPayload = { user: data.user, token: data.token || null, authMethod: 'local' }
      localStorage.setItem('auth', JSON.stringify(authPayload))
      setLoginSuccess('✓ Logged in! Loading your library...')
      setLoginLoading(false)
      window.setTimeout(() => window.location.reload(), 900)
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
    setRegNameError(false)
    setRegUsernameError(false)

    if (!regName.trim()) { setRegNameError(true); setRegError('Name is required.'); return }
    if (!regUsername.trim()) { setRegUsernameError(true); setRegError('Username is required.'); return }
    if (!allPasswordRulesPass(regPassword)) {
      setRegPasswordShake(true)
      window.setTimeout(() => setRegPasswordShake(false), 420)
      setRegError('Password does not meet all requirements.')
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
          setRegUsernameError(true)
          setRegError('Username already exists. Please choose another.')
        } else {
          setRegError(message)
        }
        return
      }

      setRegSuccess('✓ Account created! Switching to login...')
      setRegLoading(false)

      // Auto-switch to login panel after registration
      window.setTimeout(() => {
        setLoginUsername(regUsername.trim().toLowerCase())
        setLoginPassword('')
        setActivePanel('login')
        // Clear register form
        setRegName('')
        setRegUsername('')
        setRegPassword('')
        setRegSuccess('')
      }, 1200)
    } catch (err) {
      setRegError(err?.message || 'Registration failed')
    } finally {
      setRegLoading(false)
    }
  }

  return (
    <div className="auth-shell relative h-screen w-full overflow-hidden text-white">
      <div className={`auth-glow-shift ${activePanel}`} />
      <div className="auth-aurora auth-aurora-one" />
      <div className="auth-aurora auth-aurora-two" />
      <div className="auth-grid-overlay" />
      <div className="auth-library-layer" aria-hidden="true">
        <span className="floating-book b1" />
        <span className="floating-book b2" />
        <span className="floating-book b3" />
        <span className="floating-page p1" />
        <span className="floating-page p2" />
        <span className="floating-page p3" />
      </div>

      <div className="auth-viewport relative z-10">
        <div className="auth-layout">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="auth-left-panel"
          >
            <div className="auth-left-inner">
              <div className="auth-left-copy">
                <p className="auth-left-kicker">
                  Futuristic Library
                  <br />
                  Intelligent Reading
                </p>
                <h1 className="auth-left-title">SmartShelf AI</h1>
              </div>

              <div className="auth-qlexi-section">
                <div className="auth-qlexi-wrap">
                  <img src={qLexiIntroImage} alt="Q Lexi" className="auth-qlexi-image" />
                </div>
                <div className="auth-qlexi-label">Q Lexi</div>
              </div>
            </div>
          </motion.div>

          <div className="auth-right-area">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
              className="auth-panel auth-panel-form auth-glass-box"
              onMouseDown={() => { if (activePanel !== 'login') setActivePanel('login') }}
            >
              <div className="auth-panel-inner">
                <div className="auth-panel-header">
                  <h2 className="auth-panel-title">Login</h2>
                  <p className="auth-panel-subtitle">Step into your book world</p>
                </div>

                <form onSubmit={handleLogin} className="auth-form" onMouseDown={(e) => e.stopPropagation()}>
                  <FloatingInput
                    id="login-username"
                    value={loginUsername}
                    onChange={(e) => { setLoginUsername(e.target.value); setLoginError('') }}
                    label="Username"
                    autoComplete="username"
                  />
                  <FloatingInput
                    id="login-password"
                    type="password"
                    value={loginPassword}
                    onChange={(e) => { setLoginPassword(e.target.value); setLoginError('') }}
                    label="Password"
                    autoComplete="current-password"
                    showToggle
                    showPassword={loginShowPw}
                    onToggle={() => setLoginShowPw((p) => !p)}
                  />

                  <AnimatePresence>
                    {loginSuccess && (
                      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="auth-msg auth-msg-success" role="status">
                        {loginSuccess}
                      </motion.div>
                    )}
                    {!loginSuccess && loginError && (
                      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="auth-msg auth-msg-error" role="alert">
                        {loginError}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button type="submit" disabled={loginLoading || !!loginSuccess} className="auth-submit-btn">
                    {loginSuccess ? (
                      <span className="auth-btn-loading"><span className="auth-spinner" />Loading...</span>
                    ) : loginLoading ? (
                      <span className="auth-btn-loading"><span className="auth-spinner" />Logging in...</span>
                    ) : (
                      <>
                        <FiLogIn size={16} />
                        Login
                      </>
                    )}
                  </button>

                  <div className="auth-divider" />
                  <GoogleAuthButtons enabled={googleAuthEnabled} mode="login" />
                </form>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
              className="auth-panel auth-panel-form auth-glass-box"
              onMouseDown={() => { if (activePanel !== 'register') setActivePanel('register') }}
            >
              <div className="auth-panel-inner">
                <div className="auth-panel-header">
                  <h2 className="auth-panel-title">Register</h2>
                  <p className="auth-panel-subtitle">Create your book world</p>
                </div>

                <form onSubmit={handleRegister} className="auth-form" onMouseDown={(e) => e.stopPropagation()}>
                  <FloatingInput
                    id="reg-name"
                    value={regName}
                    onChange={(e) => { setRegName(e.target.value); setRegNameError(false); setRegError('') }}
                    label="Name"
                    error={regNameError}
                    autoComplete="name"
                  />
                  <FloatingInput
                    id="reg-username"
                    value={regUsername}
                    onChange={(e) => { setRegUsername(e.target.value); setRegUsernameError(false); setRegError('') }}
                    label="Username"
                    error={regUsernameError}
                    autoComplete="username"
                  />
                  <FloatingInput
                    id="reg-password"
                    type="password"
                    value={regPassword}
                    onChange={(e) => { setRegPassword(e.target.value); setRegError('') }}
                    label="Password"
                    error={regPasswordShake}
                    autoComplete="new-password"
                    showToggle
                    showPassword={regShowPw}
                    onToggle={() => setRegShowPw((p) => !p)}
                  />

                  <p className="auth-pw-check-label">Password verification checks</p>
                  <PasswordRulesIndicator password={regPassword} />

                  <AnimatePresence>
                    {regSuccess && (
                      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="auth-msg auth-msg-success" role="status">
                        {regSuccess}
                      </motion.div>
                    )}
                    {!regSuccess && regError && (
                      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="auth-msg auth-msg-error" role="alert">
                        {regError}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button type="submit" disabled={regLoading || !!regSuccess} className="auth-submit-btn">
                    {regSuccess ? (
                      <span className="auth-btn-loading"><span className="auth-spinner" />Switching...</span>
                    ) : regLoading ? (
                      <span className="auth-btn-loading"><span className="auth-spinner" />Creating account...</span>
                    ) : (
                      <>
                        <FiUserPlus size={16} />
                        Register
                      </>
                    )}
                  </button>

                  <div className="auth-divider" />
                  <GoogleAuthButtons enabled={googleAuthEnabled} mode="register" />
                </form>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
