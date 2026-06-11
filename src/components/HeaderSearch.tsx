'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatIgdbGame, abbreviatePlatform } from '@/lib/igdb'
import { IgdbGame } from '@/types'

type FormattedGame = IgdbGame & { coverUrl?: string }

interface Props {
  open?: boolean
  onOpen?: () => void
  onClose?: () => void
}

export default function HeaderSearch({ open: controlledOpen, onOpen, onClose }: Props = {}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FormattedGame[]>([])
  const [internalOpen, setInternalOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  function setOpen(val: boolean) {
    if (isControlled) { val ? onOpen?.() : onClose?.() }
    else setInternalOpen(val)
  }
  
  const inputRef = useRef<HTMLInputElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus input when modal opens, and toggle body scroll lock
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      document.body.style.overflow = 'hidden'
    } else {
      setQuery('')
      setResults([])
      setLoading(false)
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // Key listener for ESC
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // Search fetching
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (query.trim().length < 3) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    timeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/igdb/search?q=${encodeURIComponent(query.trim())}`)
        if (res.ok) {
          const data = await res.json()
          setResults((data.games ?? []).map(formatIgdbGame))
        }
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [query])

  function selectGame(id: number) {
    setOpen(false)
    router.push(`/games/${id}`)
  }

  return (
    <>
      {/* Trigger Button — hidden when open state is controlled externally */}
      {!isControlled && <div className="sidebar-search-trigger" onClick={() => { setOpen(true); inputRef.current?.focus() }}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="search-modal-icon"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span>Search games…</span>
      </div>}

      {/* Modal Overlay */}
      {open && (
        <div className="search-modal-overlay" onClick={() => setOpen(false)}>
          <div className="search-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="search-modal-header">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="search-modal-icon"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              
              <input
                ref={inputRef}
                className="search-modal-input"
                type="text"
                placeholder="Search games…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </div>
            
            {query.trim().length >= 3 && (
              <>
                <div className="search-modal-divider" />
                
                <div className="search-modal-body">
                  {loading ? (
                    <div className="search-modal-info">
                      Searching…
                    </div>
                  ) : results.length === 0 ? (
                    <div className="search-modal-info">
                      No games found matching "{query}"
                    </div>
                  ) : (
                    <div className="search-modal-results">
                      {results.map((game) => {
                        const year = game.first_release_date
                          ? new Date(game.first_release_date * 1000).getFullYear()
                          : null
                        const platforms = game.platforms?.map((p) => abbreviatePlatform(p.name)).join(', ')
                        return (
                          <div
                            key={game.id}
                            className="search-modal-item"
                            onClick={() => selectGame(game.id)}
                          >
                            <img
                              className="search-modal-cover"
                              src={game.coverUrl ?? '/no-cover.png'}
                              alt={game.name}
                            />
                            <div className="search-modal-item-info">
                              <div className="search-modal-item-title">{game.name}</div>
                              <div className="search-modal-item-meta">
                                {[year ?? 'Unknown year', platforms].filter(Boolean).join(' • ')}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
