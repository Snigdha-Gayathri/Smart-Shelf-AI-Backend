import React, { useState } from 'react'
import { useSignIn, useSignUp } from '@clerk/clerk-react'

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
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" style={{ width: 20, height: 20 }} />
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
        <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" style={{ width: 20, height: 20 }} />
        {loading ? 'Redirecting...' : buttonText}
      </button>
      {error && <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-2 text-xs text-[#9F1239]">{error}</div>}
    </div>
  )
}
