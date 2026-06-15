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
  onSelect?: (game: { igdbId: number; title: string; coverUrl?: string }) => void
}

export default function HeaderSearch({ open: controlledOpen, onOpen, onClose, onSelect }: Props = {}) {
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
  const cardRef = useRef<HTMLDivElement>(null)
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([])
  const prevFocusRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus input when modal opens, toggle body scroll lock, and restore focus
  // to whatever opened the modal when it closes
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      prevFocusRef.current = document.activeElement as HTMLElement | null
      setTimeout(() => inputRef.current?.focus(), 50)
      document.body.style.overflow = 'hidden'
    } else {
      setQuery('')
      setResults([])
      setLoading(false)
      document.body.style.overflow = ''
      if (wasOpenRef.current) {
        wasOpenRef.current = false
        prevFocusRef.current?.focus()
      }
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

  function selectGame(game: FormattedGame) {
    setOpen(false)
    if (onSelect) {
      onSelect({ igdbId: game.id, title: game.name, coverUrl: game.coverUrl })
    } else {
      router.push(`/games/${game.id}`)
    }
  }

  // Keep keyboard focus inside the dialog while it is open
  function trapFocus(e: React.KeyboardEvent) {
    if (e.key !== 'Tab' || !cardRef.current) return
    const focusable = cardRef.current.querySelectorAll<HTMLElement>('button, input')
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault()
      resultRefs.current[0]?.focus()
    }
  }

  function handleResultKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      resultRefs.current[Math.min(index + 1, results.length - 1)]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (index === 0) inputRef.current?.focus()
      else resultRefs.current[index - 1]?.focus()
    }
  }

  const statusMessage = query.trim().length < 3
    ? ''
    : loading
    ? 'Searching…'
    : results.length === 0
    ? 'No games found'
    : `${results.length} result${results.length === 1 ? '' : 's'}`

  return (
    <>
      {/* Trigger Button — hidden when open state is controlled externally */}
      {!isControlled && <button type="button" className="sidebar-search-trigger" onClick={() => { setOpen(true); inputRef.current?.focus() }} aria-haspopup="dialog">
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
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span>Search games…</span>
      </button>}

      {/* Modal Overlay */}
      {open && (
        <div className="search-modal-overlay" onClick={() => setOpen(false)}>
          <div
            ref={cardRef}
            className="search-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Search games"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={trapFocus}
          >
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
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>

              <input
                ref={inputRef}
                className="search-modal-input"
                type="text"
                aria-label="Search games"
                placeholder="Search games…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                autoComplete="off"
                autoFocus
              />
            </div>

            <div className="sr-only" role="status">{statusMessage}</div>

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
                      {results.map((game, index) => {
                        const year = game.first_release_date
                          ? new Date(game.first_release_date * 1000).getFullYear()
                          : null
                        const platforms = game.platforms?.map((p) => abbreviatePlatform(p.name)).join(', ')
                        return (
                          <button
                            type="button"
                            key={game.id}
                            ref={(el) => { resultRefs.current[index] = el }}
                            className="search-modal-item"
                            onClick={() => selectGame(game)}
                            onKeyDown={(e) => handleResultKeyDown(e, index)}
                          >
                            <img
                              className="search-modal-cover"
                              src={game.coverUrl ?? '/no-cover.png'}
                              alt=""
                            />
                            <div className="search-modal-item-info">
                              <div className="search-modal-item-title">{game.name}</div>
                              <div className="search-modal-item-meta">
                                {[year ?? 'Unknown year', platforms].filter(Boolean).join(' • ')}
                              </div>
                            </div>
                          </button>
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
