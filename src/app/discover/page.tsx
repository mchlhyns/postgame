'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Agent } from '@atproto/api'
import { restoreSession, COLLECTION } from '@/lib/atproto'
import { IgdbGame, GameRecordView } from '@/types'
import { formatIgdbGame, normalizeStatus, inferPlayedStatus } from '@/lib/igdb'
import { CalendarDays, Star, Sparkles } from 'lucide-react'
import { Stars } from '@/components/Stars'

type FormattedGame = IgdbGame & { coverUrl?: string }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function BrowseCard({ game, existingRecord, showRating, showReleaseDate }: {
  game: FormattedGame
  existingRecord?: GameRecordView
  showRating?: boolean
  showReleaseDate?: boolean
}) {
  const releaseDateMeta = showReleaseDate && game.first_release_date
    ? new Date(game.first_release_date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  const gameHref = `/games/${game.id}`
  return (
    <div className="game-card-grid">
      <div className="game-card-grid-cover-wrap">
        <a href={gameHref} style={{ display: 'block', lineHeight: 0 }}>
          <img className="game-card-grid-cover" src={game.coverUrl ?? '/no-cover.png'} alt={game.name} />
        </a>
      </div>
      <a className="game-card-grid-info" href={gameHref}>
        <div className="game-card-grid-title">
          {game.name}
        </div>
        {showRating && game.rating != null && (
          <div className="browse-card-meta"><Stars rating={game.rating / 20} /></div>
        )}
        {releaseDateMeta && <div className="browse-card-meta">{releaseDateMeta}</div>}
      </a>
    </div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const [session, setSession] = useState<{ agent: Agent; did: string } | null>(null)
  const [upcoming, setUpcoming] = useState<FormattedGame[]>([])
  const [recentlyReleased, setRecentlyReleased] = useState<FormattedGame[]>([])
  const [highlyRated, setHighlyRated] = useState<FormattedGame[]>([])
  const [loading, setLoading] = useState(true)
  const [gamesLoading, setGamesLoading] = useState(true)

  const [artworkUrls, setArtworkUrls] = useState<string[]>([])
  const [bgImage, setBgImage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FormattedGame[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [myGamesMap, setMyGamesMap] = useState<Map<number, GameRecordView>>(new Map())
  const [editTarget, setEditTarget] = useState<GameRecordView | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nowPlayingBgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    restoreSession()
      .then((s) => {
        if (!s) { window.location.href = '/'; return }
        setSession(s)
        setLoading(false)
        ;(async () => {
          try {
            const map = new Map<number, GameRecordView>()
            let cursor: string | undefined
            do {
              const res = await s.agent.com.atproto.repo.listRecords({ repo: s.did, collection: COLLECTION, limit: 100, cursor })
              for (const r of res.data.records as unknown as GameRecordView[]) {
                const id = r.value.game.igdbId
                if (!map.has(id) || r.value.createdAt > map.get(id)!.value.createdAt) map.set(id, r)
              }
              cursor = res.data.cursor
            } while (cursor)
            setMyGamesMap(map)
          } catch {}
        })()
      })
      .catch(() => { window.location.href = '/' })
  }, [])

  useEffect(() => {
    fetch('/api/igdb/trending')
      .then((r) => r.json())
      .then(({ upcoming, recentlyReleased, highlyRated, artworkUrls }) => {
        setUpcoming(shuffle((upcoming ?? []).map(formatIgdbGame)))
        setRecentlyReleased(shuffle((recentlyReleased ?? []).map(formatIgdbGame)))
        setHighlyRated(shuffle((highlyRated ?? []).map(formatIgdbGame)))
        const urls = artworkUrls ?? []
        setArtworkUrls(urls)
        if (urls.length > 0) setBgImage(urls[Math.floor(Math.random() * urls.length)])
      })
      .catch(() => {})
      .finally(() => setGamesLoading(false))
  }, [])

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (searchQuery.length < 2) { setSearchResults([]); setSearchOpen(false); return }
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/igdb/search?q=${encodeURIComponent(searchQuery)}`)
        const data = await res.json()
        setSearchResults((data.games ?? []).map(formatIgdbGame))
        setSearchOpen(true)
      } catch { setSearchResults([]) }
    }, 400)
  }, [searchQuery])

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  useEffect(() => {
    function onScroll() {
      if (nowPlayingBgRef.current) {
        nowPlayingBgRef.current.style.transform = `translateY(${window.scrollY * 0.3}px)`
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (loading) return <main style={{ flex: 1 }} />

  return (
    <>
      <main>
        <section className="now-playing-block">
          {bgImage && (
            <div
              ref={nowPlayingBgRef}
              className="now-playing-bg"
              aria-hidden
              style={{ backgroundImage: `url(${bgImage})` }}
            />
          )}
          <div className="container">
            <div className="now-playing-content">
            <h2 className="now-playing-title">What are you playing?</h2>
            <div className="search-wrapper" ref={searchRef}>
              <input
                className="input now-playing-input"
                type="text"
                placeholder="Search for a game"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                autoComplete="off"
              />
              {searchOpen && searchResults.length > 0 && (
                <div className="search-results">
                  {searchResults.map((game) => {
                    const year = game.first_release_date
                      ? new Date(game.first_release_date * 1000).getFullYear()
                      : null
                    const platforms = game.platforms?.map((p) => p.name).join(', ')
                    return (
                      <div
                        key={game.id}
                        className="search-result-item"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setSearchQuery('')
                          setSearchOpen(false)
                          setSearchResults([])
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
            </div>
          </div>
        </section>

        <div className="container">
          {gamesLoading ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          ) : (
            <>
              <section id="recent" className="browse-section">
                <h2 className="browse-section-title"><CalendarDays size={16} />New releases</h2>
                {recentlyReleased.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Nothing to show right now.</p>
                ) : (
                  <div className="browse-grid">
                    {recentlyReleased.map((game) => (
                      <BrowseCard key={game.id} game={game} showReleaseDate existingRecord={myGamesMap.get(game.id)} />
                    ))}
                  </div>
                )}
              </section>

              <section id="rated" className="browse-section">
                <h2 className="browse-section-title"><Star size={16} />Top rated</h2>
                {highlyRated.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Nothing to show right now.</p>
                ) : (
                  <div className="browse-grid">
                    {highlyRated.map((game) => (
                      <BrowseCard key={game.id} game={game} showRating existingRecord={myGamesMap.get(game.id)} />
                    ))}
                  </div>
                )}
              </section>

              <section id="upcoming" className="browse-section">
                <h2 className="browse-section-title"><Sparkles size={16} />Coming soon</h2>
                {upcoming.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Nothing to show right now.</p>
                ) : (
                  <div className="browse-grid">
                    {upcoming.map((game) => (
                      <BrowseCard key={game.id} game={game} showReleaseDate existingRecord={myGamesMap.get(game.id)} />
                    ))}
                  </div>
                )}
              </section>


            </>
          )}
        </div>
      </main>

    </>
  )
}
