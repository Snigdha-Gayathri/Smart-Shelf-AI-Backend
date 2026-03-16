import React, { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FiEye, FiEyeOff, FiUserPlus, FiLogIn, FiCheckCircle, FiXCircle } from 'react-icons/fi'
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

export default function Auth({ onSuccess, googleAuthEnabled = false }) {
  /* Sparkle Particle Generator */
  const [sparkles, setSparkles] = useState([])
  useEffect(() => {
    const chars = ['✦', '✧', '·', '⋆']
    const generated = Array.from({ length: 30 }).map((_, i) => ({
      id: i,
      char: chars[Math.floor(Math.random() * chars.length)],
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 4}s`,
      fontSize: `${Math.floor(Math.random() * 5) + 8}px`,
      opacity: Math.random() * 0.6 + 0.3
    }))
    setSparkles(generated)
  }, [])

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

    if (!regName.trim()) { setRegError('Name is required.'); return }
    if (!regUsername.trim()) { setRegError('Username is required.'); return }
    if (!allPasswordRulesPass(regPassword)) {
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

  return (
    <div className="auth-new-shell">
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

      <motion.div
        className="auth-col-left"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
      >
        <p className="auth-brand-kicker">Futuristic Library<br/>Intelligent Reading</p>
        <h1 className="auth-brand-title">SmartShelf AI</h1>
        <div className="auth-glow-line" />

        <div className="auth-mascot-card">
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
        <div className="auth-card">
          <h2 className="auth-card-title">Login</h2>
          <p className="auth-card-subtitle">Step into your book world</p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="auth-input-prefix-wrapper">
              <span className="auth-input-prefix">/</span>
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

            <button type="submit" disabled={loginLoading || !!loginSuccess} className="auth-btn-primary">
              <span style={{ fontSize: '18px', fontWeight: 'bold' }}>&#8594;</span> Login
            </button>
            <GoogleAuthButtons enabled={googleAuthEnabled} mode="login" className="auth-btn-google" buttonText="Continue with Google" />
          </form>
        </div>
      </motion.div>

      <motion.div
        className="auth-col-right"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <div className="auth-card">
          <h2 className="auth-card-title">Register</h2>
          <p className="auth-card-subtitle">Create your book world</p>

          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <p className="auth-pw-helper">Password verification checks</p>
              <PasswordRulesIndicator password={regPassword} />
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

            <button type="submit" disabled={regLoading || !!regSuccess} className="auth-btn-primary">
              <FiUserPlus size={18} /> &nbsp;Register
            </button>
            <GoogleAuthButtons enabled={googleAuthEnabled} mode="register" className="auth-btn-google" buttonText="Continue with Google" />
          </form>
        </div>
      </motion.div>
    </div>
  )
}
