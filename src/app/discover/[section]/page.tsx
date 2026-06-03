'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { restoreSession } from '@/lib/atproto'
import { IgdbGame } from '@/types'
import { formatIgdbGame } from '@/lib/igdb'
import { Stars } from '@/components/Stars'

type AppviewGame = {
  igdbId: number
  title: string
  coverUrl?: string
  count: number
  avgRating?: number
}

type FormattedGame = IgdbGame & { coverUrl?: string }

const SECTION_META: Record<string, { title: string }> = {
  trending:       { title: 'Trending' },
  'top-rated':    { title: 'Top rated' },
  'new-releases': { title: 'New releases' },
  'coming-soon':  { title: 'Coming soon' },
}

export default function SectionPage() {
  const { section } = useParams<{ section: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [games, setGames] = useState<(AppviewGame | FormattedGame)[]>([])

  const meta = SECTION_META[section]

  useEffect(() => {
    restoreSession()
      .then(s => { if (!s) { window.location.href = '/'; return } })
      .catch(() => { window.location.href = '/' })
  }, [])

  useEffect(() => {
    if (!meta) { router.replace('/discover'); return }
  }, [meta, router])

  useEffect(() => {
    if (!meta) return

    if (section === 'trending' || section === 'top-rated') {
      fetch('/api/appview/trending')
        .then(r => r.json())
        .then(data => {
          setGames(section === 'trending' ? (data.trending ?? []) : (data.topRated ?? []))
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    } else {
      fetch('/api/igdb/trending')
        .then(r => r.json())
        .then(data => {
          const key = section === 'new-releases' ? 'recentlyReleased' : 'upcoming'
          setGames((data[key] ?? []).map(formatIgdbGame))
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [section, meta])

  if (!meta) return null

  const isAppview = section === 'trending' || section === 'top-rated'

  return (
    <main>
      <div className="container">
        <div className="list-edit-header" style={{ marginBottom: 24 }}>
          <button className="list-edit-back" onClick={() => router.back()}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 900 }}>
            {meta.title}
          </h1>
        </div>

        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : games.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Nothing to show right now.</p>
        ) : (
          <div className="browse-grid">
            {games.map(game => {
              const igdbId = isAppview ? (game as AppviewGame).igdbId : (game as FormattedGame).id
              const title = isAppview ? (game as AppviewGame).title : (game as FormattedGame).name
              const coverUrl = game.coverUrl ?? '/no-cover.png'
              const appviewGame = isAppview ? (game as AppviewGame) : null
              const igdbGame = !isAppview ? (game as FormattedGame) : null

              return (
                <div key={igdbId} className="game-card-grid">
                  <div className="game-card-grid-cover-wrap">
                    <a href={`/games/${igdbId}`} style={{ display: 'block', lineHeight: 0 }}>
                      <img className="game-card-grid-cover" src={coverUrl} alt={title} />
                    </a>
                  </div>
                  <a className="game-card-grid-info" href={`/games/${igdbId}`}>
                    <div className="game-card-grid-title">{title}</div>
                    {section === 'trending' && appviewGame && (
                      <div className="browse-card-meta" style={{ color: 'var(--accent)' }}>
                        {appviewGame.count} {appviewGame.count === 1 ? 'player' : 'players'}
                      </div>
                    )}
                    {section === 'top-rated' && appviewGame?.avgRating != null && (
                      <div className="browse-card-meta">
                        <Stars rating={appviewGame.avgRating / 2} />
                      </div>
                    )}
                    {(section === 'new-releases' || section === 'coming-soon') && igdbGame?.first_release_date && (
                      <div className="browse-card-meta">
                        {new Date(igdbGame.first_release_date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    )}
                  </a>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
