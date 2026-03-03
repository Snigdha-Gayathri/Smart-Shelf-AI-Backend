import React from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider, AuthenticateWithRedirectCallback } from '@clerk/clerk-react'
import App from './App'
import ClerkApp from './ClerkApp'
import './index.css'

const rawClerkKey = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '').trim()
const isPlaceholder = /your_|placeholder/i.test(rawClerkKey)
const isLikelyClerkKey = rawClerkKey.startsWith('pk_test_') || rawClerkKey.startsWith('pk_live_')
const clerkPublishableKey = isLikelyClerkKey && !isPlaceholder ? rawClerkKey : ''
const isCallbackRoute = window.location.pathname === '/sso-callback'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {clerkPublishableKey ? (
      <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
        {isCallbackRoute ? <AuthenticateWithRedirectCallback /> : <ClerkApp />}
      </ClerkProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>
)
