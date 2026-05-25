'use client'

import { useEffect, useState } from 'react'
import { restoreSession } from '@/lib/atproto'

export default function OAuthCallback() {
  const [error, setError] = useState('')

  useEffect(() => {
    async function handleCallback() {
      try {
        const session = await restoreSession()
        if (!session) {
          window.location.href = '/'
          return
        }

        window.location.href = '/discover'
      } catch (err) {
        console.error('OAuth callback error:', err)
        setError('Sign in failed. Please try again.')
      }
    }
    handleCallback()
  }, [])

  if (error) {
    return (
      <div className="login-page">
        <div className="login-box">
          <p className="error-msg">{error}</p>
          <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => { window.location.href = '/' }}>
            Go back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <p style={{ color: 'var(--text-muted)' }}>Signing in…</p>
    </div>
  )
}
