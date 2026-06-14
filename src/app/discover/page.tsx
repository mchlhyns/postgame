'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { restoreSession, COLLECTION } from '@/lib/atproto'
import { IgdbGame, GameRecordView } from '@/types'
import { formatIgdbGame, summarizePlatforms } from '@/lib/igdb'
import { CalendarDays, Sparkles, TrendingUp } from 'lucide-react'

type FormattedGame = IgdbGame & { coverUrl?: string }

type AppviewGame = {
  igdbId: number
  title: string
  coverUrl?: string
  count: number
  avgRating?: number
  platforms?: string[]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function BrowseCard({ game, existingRecord, showReleaseDate, showPlatforms }: {
  game: FormattedGame
  existingRecord?: GameRecordView
  showReleaseDate?: boolean
  showPlatforms?: boolean
}) {
  const releaseDateMeta = showReleaseDate && game.first_release_date
    ? new Date(game.first_release_date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : null

  const platformsMeta = showPlatforms ? summarizePlatforms(game.platforms?.map((p) => p.name)) : null

  const gameHref = `/games/${game.id}`
  return (
    <div className="game-card-grid">
      <div className="game-card-grid-cover-wrap">
        <a href={gameHref} style={{ display: 'block', lineHeight: 0 }}>
          <img loading="lazy" decoding="async" className="game-card-grid-cover" src={game.coverUrl ?? '/no-cover.png'} alt={game.name} />
        </a>
      </div>
      <a className="game-card-grid-info" href={gameHref}>
        {platformsMeta && <div className="game-card-platform">{platformsMeta}</div>}
        <div className="game-card-grid-title">
          {game.name}
        </div>
        {releaseDateMeta && <div className="browse-card-meta">{releaseDateMeta}</div>}
      </a>
    </div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const [upcoming, setUpcoming] = useState<FormattedGame[]>([])
  const [recentlyReleased, setRecentlyReleased] = useState<FormattedGame[]>([])
  const [trending, setTrending] = useState<AppviewGame[]>([])
  const [igdbLoading, setIgdbLoading] = useState(true)
  const [appviewLoading, setAppviewLoading] = useState(true)
  const [myGamesMap, setMyGamesMap] = useState<Map<number, GameRecordView>>(new Map())
  const [tab, setTab] = useState<'trending' | 'recent' | 'upcoming'>('trending')

  useEffect(() => {
    restoreSession()
      .then((s) => {
        if (!s) return
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
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/igdb/trending')
      .then(r => r.json())
      .then(igdb => {
        setUpcoming(shuffle((igdb.upcoming ?? []).map(formatIgdbGame)))
        setRecentlyReleased(shuffle((igdb.recentlyReleased ?? []).map(formatIgdbGame)))
      })
      .catch(() => {})
      .finally(() => setIgdbLoading(false))

    fetch('/api/appview/trending')
      .then(r => r.json())
      .then(appview => {
        setTrending(shuffle(appview.trending ?? []))
      })
      .catch(() => {})
      .finally(() => setAppviewLoading(false))
  }, [])

  return (
    <>
      <main>
        <div className="container page-top">
          <h1 className="browse-section-title">Discover</h1>
          
          <div className="filter-tabs" style={{ margin: '0 0 24px 0' }}>
            <button
              className={`filter-tab${tab === 'trending' ? ' active' : ''}`}
              onClick={() => setTab('trending')}
            >
              <TrendingUp size={14} />
              Trending now
            </button>
            <button
              className={`filter-tab${tab === 'recent' ? ' active' : ''}`}
              onClick={() => setTab('recent')}
            >
              <Sparkles size={14} />
              New releases
            </button>
            <button
              className={`filter-tab${tab === 'upcoming' ? ' active' : ''}`}
              onClick={() => setTab('upcoming')}
            >
              <CalendarDays size={14} />
              Coming soon
            </button>
          </div>

          {(igdbLoading || appviewLoading) ? (
            <div style={{ padding: '48px 0', color: 'var(--text-muted)', textAlign: 'center' }}>Loading…</div>
          ) : (
            <>
              {tab === 'trending' && (
                <section id="trending" className="browse-section">
                  {trending.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Nothing to show right now.</p>
                  ) : (
                    <div className="browse-grid">
                      {trending.slice(0, 48).map((game) => (
                        <div key={game.igdbId} className="game-card-grid">
                          <div className="game-card-grid-cover-wrap">
                            <a href={`/games/${game.igdbId}`} style={{ display: 'block', lineHeight: 0 }}>
                              <img loading="lazy" decoding="async" className="game-card-grid-cover" src={game.coverUrl ?? '/no-cover.png'} alt={game.title} />
                            </a>
                          </div>
                          <a className="game-card-grid-info" href={`/games/${game.igdbId}`}>
                            {(() => {
                              const platforms = summarizePlatforms(game.platforms)
                              return platforms ? <div className="game-card-platform">{platforms}</div> : null
                            })()}
                            <div className="game-card-grid-title">{game.title}</div>
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {tab === 'recent' && (
                <section id="recent" className="browse-section">
                  {recentlyReleased.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Nothing to show right now.</p>
                  ) : (
                    <div className="browse-grid">
                      {recentlyReleased.slice(0, 48).map((game) => (
                        <BrowseCard key={game.id} game={game} showPlatforms existingRecord={myGamesMap.get(game.id)} />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {tab === 'upcoming' && (
                <section id="upcoming" className="browse-section">
                  {upcoming.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Nothing to show right now.</p>
                  ) : (
                    <div className="browse-grid">
                      {upcoming.slice(0, 48).map((game) => (
                        <BrowseCard key={game.id} game={game} showPlatforms showReleaseDate existingRecord={myGamesMap.get(game.id)} />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </>
  )
}
