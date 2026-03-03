import React, { useState } from 'react'
import { useSignIn, useSignUp } from '@clerk/clerk-react'
import { FcGoogle } from 'react-icons/fc'

export default function GoogleAuthButtons({ enabled = true, mode = 'login' }) {
  const { signIn, isLoaded: isSignInLoaded } = useSignIn()
  const { signUp, isLoaded: isSignUpLoaded } = useSignUp()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const callbackUrl = `${window.location.origin}/sso-callback`
  const completeUrl = window.location.origin

  async function startGoogleAuth() {
    if (!enabled) {
      setError('Google auth is not configured. Add VITE_CLERK_PUBLISHABLE_KEY in frontend/.env and restart frontend.')
      return
    }

    const isRegister = mode === 'register'
    setError('')
    setLoading(true)
    try {
      if (isRegister) {
        if (!isSignUpLoaded || !signUp) return
        await signUp.authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl: callbackUrl,
          redirectUrlComplete: completeUrl,
        })
      } else {
        if (!isSignInLoaded || !signIn) return
        await signIn.authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl: callbackUrl,
          redirectUrlComplete: completeUrl,
        })
      }
    } catch (e) {
      setError(e?.errors?.[0]?.message || e?.message || `Google ${isRegister ? 'sign up' : 'sign in'} failed`)
      setLoading(false)
    }
  }

  const disabled = !enabled || !isSignInLoaded || !isSignUpLoaded || loading

  return (
    <div className="space-y-3">
      {!enabled && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-2 text-xs text-amber-100">
          Google auth is visible but disabled until Clerk publishable key is configured.
        </div>
      )}
      <button
        type="button"
        onClick={startGoogleAuth}
        disabled={disabled}
        title="Continue with Google"
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_8px_25px_rgba(15,23,42,0.2)] transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(56,189,248,0.25)] disabled:cursor-not-allowed disabled:opacity-70"
      >
        <FcGoogle className="text-lg" />
        {loading ? 'Redirecting...' : 'Continue with Google'}
      </button>
      {error && <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-2 text-xs text-rose-100">{error}</div>}
    </div>
  )
}
