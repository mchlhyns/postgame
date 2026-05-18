'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatIgdbGame, abbreviatePlatform } from '@/lib/igdb'
import { IgdbGame } from '@/types'

type FormattedGame = IgdbGame & { coverUrl?: string }

export default function HeaderSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FormattedGame[]>([])
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (query.length < 2) { setResults([]); setOpen(false); return }
    timeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/igdb/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults((data.games ?? []).map(formatIgdbGame))
        setOpen(true)
      } catch { setResults([]) }
    }, 400)
  }, [query])

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  return (
    <div className="search-wrapper header-search" ref={wrapperRef}>
      <input
        className="input header-search-input"
        type="text"
        placeholder="Search games…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <div className="search-results">
          {results.map((game) => {
            const year = game.first_release_date
              ? new Date(game.first_release_date * 1000).getFullYear()
              : null
            const platforms = game.platforms?.map((p) => abbreviatePlatform(p.name)).join(', ')
            return (
              <div
                key={game.id}
                className="search-result-item"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setQuery('')
                  setOpen(false)
                  setResults([])
                  router.push(`/games/${game.id}`)
                }}
              >
                <img className="search-result-cover" src={game.coverUrl ?? '/no-cover.png'} alt={game.name} />
                <div className="search-result-info">
                  <strong>{game.name}</strong>
                  <span className="search-result-platforms">
                    {[year ?? 'Unknown year', platforms].filter(Boolean).join(' • ')}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
