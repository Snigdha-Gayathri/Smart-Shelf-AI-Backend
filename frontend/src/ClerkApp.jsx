import React from 'react'
import { useUser, useClerk } from '@clerk/clerk-react'
import App from './App'

export default function ClerkApp() {
  const { isLoaded, isSignedIn, user } = useUser()
  const { signOut } = useClerk()

  return (
    <App
      clerk={{
        enabled: true,
        isLoaded,
        isSignedIn,
        user,
        signOut,
      }}
    />
  )
}
