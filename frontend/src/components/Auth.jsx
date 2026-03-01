import React, { useState } from 'react'

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default function Auth({ onSuccess }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function validate() {
    if (!emailRegex.test(email)) return 'Enter a valid email address'
    if (password.length < 8) return 'Password must be at least 8 characters'
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must include letters and numbers'
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const v = validate()
    if (v) { setError(v); return }

    setLoading(true)
    try {
      const path = mode === 'register' ? '/auth/register' : '/auth/login'
      const apiUrl = `${API_BASE}${path}`
      
      console.log(`[Auth] Attempting ${mode === 'register' ? 'registration' : 'login'} at ${apiUrl}`)
      
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
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
        setError(`Cannot connect to server. Is the backend running on ${API_BASE}?`)
      } else if (e instanceof SyntaxError) {
        console.error('[Auth] JSON parsing error:', e.message)
        setError('Invalid response from server. Check backend logs.')
      } else {
        console.error(`[Auth] ${mode === 'register' ? 'Registration' : 'Login'} error:`, e.message)
        setError(e.message || `${mode === 'register' ? 'Registration' : 'Login'} failed`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full h-full flex items-center justify-center p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-sm rounded-2xl shadow-xl p-6 sm:p-8 glass-strong">
        <div className="flex flex-col sm:flex-row justify-center mb-6 gap-2 sm:gap-0">
          <button
            className={`flex-1 px-3 sm:px-4 py-2.5 rounded-l-md text-sm sm:text-base font-medium transition-colors ${mode==='login' ? 'bg-blue-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}
            onClick={() => { setMode('login'); setError('') }}
          >Login</button>
          <button
            className={`flex-1 px-3 sm:px-4 py-2.5 rounded-r-md text-sm sm:text-base font-medium transition-colors ${mode==='register' ? 'bg-blue-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}
            onClick={() => { setMode('register'); setError('') }}
          >Register</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          <div>
            <label className="block text-xs sm:text-sm font-medium mb-1.5 text-slate-700 dark:text-slate-300">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg border border-white/20 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium mb-1.5 text-slate-700 dark:text-slate-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg border border-white/20 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
              placeholder="At least 8 chars, letters + numbers"
              required
            />
          </div>
          {error && <div className="text-red-500 text-xs sm:text-sm p-2 bg-red-50 dark:bg-red-900/20 rounded">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center rounded-md bg-blue-500 hover:bg-blue-600 text-white px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >{loading ? (mode==='login' ? 'Logging in...' : 'Registering...') : (mode==='login' ? 'Login' : 'Create account')}</button>
        </form>

      </div>
    </div>
  )
}
