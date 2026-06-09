'use client'

import { useEffect, useState, useRef } from 'react'
import { restoreSession, signIn } from '@/lib/atproto'
import { bskyAvatar } from '@/lib/appview-fetch'
import Tooltip from '@/components/Tooltip'

export default function Home() {
  const [handle, setHandle] = useState('')
  const [loginError, setLoginError] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [checking, setChecking] = useState(true)
  const [suggestions, setSuggestions] = useState<Array<{ did: string; handle: string; displayName?: string; avatar?: string }>>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestionIndex, setSuggestionIndex] = useState(-1)
  const typeaheadRef = useRef<HTMLDivElement>(null)
  const skipNextSearch = useRef(false)

  useEffect(() => {
    const timeout = setTimeout(() => setChecking(false), 3000)
    restoreSession()
      .then((s) => { clearTimeout(timeout); if (s) { window.location.href = '/home'; return } setChecking(false) })
      .catch(() => { clearTimeout(timeout); setChecking(false) })
  }, [])

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false
      return
    }
    const q = handle.trim().replace(/^@/, '')
    if (q.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?q=${encodeURIComponent(q)}&limit=6`
        )
        const data = await res.json()
        setSuggestions(data.actors ?? [])
        setShowSuggestions(true)
        setSuggestionIndex(-1)
      } catch {
        setSuggestions([])
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [handle])

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (typeaheadRef.current && !typeaheadRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  function selectSuggestion(selectedHandle: string) {
    skipNextSearch.current = true
    setHandle(selectedHandle)
    setShowSuggestions(false)
    setSuggestions([])
  }

  function handleHandleKeyDown(e: React.KeyboardEvent) {
    if (!showSuggestions || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSuggestionIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSuggestionIndex((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && suggestionIndex >= 0) {
      e.preventDefault()
      selectSuggestion(suggestions[suggestionIndex].handle)
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (!handle.trim()) return
    setSigningIn(true)
    setLoginError('')
    try {
      await signIn(handle.trim().replace(/^@/, ''))
    } catch (e) {
      console.error('[sign-in error]', e)
      setLoginError('There was a problem signing in. Check your handle and try again.')
      setSigningIn(false)
    }
  }

  if (checking) return null

  return (
    <div className="login-page">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <img src="/logo.svg" alt="postgame" style={{ height: 24, marginBottom: 1 }} />
          <h1>postgame</h1>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Track and manage your gaming backlog</p>
      </div>
      <div className="login-box">
        <h2>Sign in</h2>
        <p>Enter your <Tooltip text="Use your handle from Bluesky, Blacksky, Eurosky, or your own PDS.">Atmosphere account</Tooltip> to get started</p>
        <form onSubmit={handleSignIn}>
          <div ref={typeaheadRef} className="handle-typeahead" style={{ marginBottom: 10 }}>
              <input
                className="input"
                type="text"
                placeholder="you.bsky.social, yourdomain.com"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                onKeyDown={handleHandleKeyDown}
                autoFocus
                autoComplete="off"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="handle-suggestions">
                  {suggestions.map((actor, i) => (
                    <div
                      key={actor.did}
                      className={`handle-suggestion${i === suggestionIndex ? ' active' : ''}`}
                      onMouseDown={(e) => { e.preventDefault(); selectSuggestion(actor.handle) }}
                    >
                      {actor.avatar
                        ? <img src={bskyAvatar(actor.avatar)} alt="" className="handle-suggestion-avatar" />
                        : <div className="handle-suggestion-avatar handle-suggestion-avatar-placeholder" />
                      }
                      <div>
                        {actor.displayName && <div className="handle-suggestion-name">{actor.displayName}</div>}
                        <div className="handle-suggestion-handle">@{actor.handle}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
          <button className="btn btn-primary" type="submit" disabled={signingIn} style={{ width: '100%', justifyContent: 'center' }}>
            {signingIn ? '...' : 'Continue →'}
          </button>
          {loginError && <p className="error-msg">{loginError}</p>}
        </form>
      </div>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <a href="/faq">FAQ</a>
        <span>•</span>
        <a href="https://bsky.app/profile/postgame.at" target="_blank" rel="noopener noreferrer">Bluesky</a>
        <span>•</span>
        <a href="https://github.com/assemblezero/postgame" target="_blank" rel="noopener noreferrer">GitHub</a>
      </p>
    </div>
  )
}
