import React, { useState } from 'react'
import { useSignIn, useSignUp } from '@clerk/clerk-react'

function GoogleIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7.1 0-.7-.1-1.4-.2-2.1H12z" />
      <path fill="#34A853" d="M12 22c2.6 0 4.8-.9 6.4-2.5l-3.1-2.4c-.9.6-2 .9-3.3.9-2.6 0-4.8-1.8-5.6-4.1l-3.2 2.5C4.8 19.7 8.1 22 12 22z" />
      <path fill="#4A90E2" d="M6.4 13.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9L3.2 7.6C2.4 9 2 10.5 2 12s.4 3 1.2 4.4l3.2-2.5z" />
      <path fill="#FBBC05" d="M12 6.1c1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.8 3.1 14.6 2 12 2 8.1 2 4.8 4.3 3.2 7.6l3.2 2.5c.8-2.3 3-4 5.6-4z" />
    </svg>
  )
}

export default function GoogleAuthButtons({ enabled = true, mode = 'login', className = '', buttonText = 'Continue with Google' }) {
  if (!enabled) {
    return (
      <div className="space-y-3 w-full">
        <div className="rounded-2xl border border-[#D0E8FF8F] bg-[#DCEEFF54] px-3 py-2 text-xs text-[#2A6FB2] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_10px_24px_rgba(26,80,137,0.12)]">
          Google auth is visible but disabled until Clerk publishable key is configured.
        </div>
        <button
          type="button"
          disabled
          title={buttonText}
          className={className || "inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-2xl border border-[#D0E8FF8F] bg-[#DCEEFF4D] px-4 py-2 text-[15px] font-semibold text-[#2A6FB2] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_10px_24px_rgba(26,80,137,0.12)] transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-70"}
        >
          <GoogleIcon size={20} />
          {buttonText}
        </button>
      </div>
    )
  }

  return <GoogleAuthButtonsClerk mode={mode} className={className} buttonText={buttonText} />
}

function GoogleAuthButtonsClerk({ mode = 'login', className = '', buttonText = 'Continue with Google' }) {
  const { signIn, isLoaded: isSignInLoaded } = useSignIn()
  const { signUp, isLoaded: isSignUpLoaded } = useSignUp()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const callbackUrl = `${window.location.origin}/sso-callback`
  const completeUrl = window.location.origin

  async function startGoogleAuth() {
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

  const disabled = !isSignInLoaded || !isSignUpLoaded || loading

  return (
    <div className="space-y-3 w-full">
      <button
        type="button"
        onClick={startGoogleAuth}
        disabled={disabled}
        title={buttonText}
        className={className || "inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-2xl border border-[#D0E8FF8F] bg-[#DCEEFF4D] px-4 py-2 text-[15px] font-semibold text-[#2A6FB2] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_10px_24px_rgba(26,80,137,0.12)] transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:border-[#A8D4FF] hover:shadow-[0_14px_28px_rgba(30,144,255,0.25)] disabled:cursor-not-allowed disabled:opacity-70"}
      >
        <GoogleIcon size={20} />
        {loading ? 'Redirecting...' : buttonText}
      </button>
      {error && <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-2 text-xs text-[#9F1239]">{error}</div>}
    </div>
  )
}
