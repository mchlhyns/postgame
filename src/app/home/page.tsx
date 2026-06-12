'use client'

import { useEffect, useRef, useState } from 'react'
import { Agent } from '@atproto/api'
import { restoreSession, COLLECTION, SETTINGS_COLLECTION, FOLLOW_COLLECTION, fetchBlockedDids } from '@/lib/atproto'
import { GameRecordView, GameRecord } from '@/types'
import { matchesStatus, abbreviatePlatform } from '@/lib/igdb'
import GameCard from '@/components/GameCard'
import { Stars } from '@/components/Stars'
import { Sparkles, Trophy } from 'lucide-react'
import { extractCid, bskyAvatar } from '@/lib/appview-fetch'
import { relativeTime, feedActionText } from '@/lib/feed'

interface FeedItem {
  did: string
  handle: string
  displayName: string | null
  avatar: string | null
  gameTitle: string
  gameCoverUrl: string | null
  igdbId: number
  status: string
  playedStatus?: string
  rating?: number
  platform?: string | null
  createdAt: string
}

export default function HomePage() {
  const [session, setSession] = useState<{ agent: Agent; did: string } | null>(null)
  const [userHandle, setUserHandle] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [games, setGames] = useState<GameRecordView[]>([])
  
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [feedLoading, setFeedLoading] = useState(false)

  useEffect(() => {
    restoreSession().then(async (s) => {
      if (!s) { window.location.href = '/'; return }
      setSession(s)
      
      try {
        const repoRes = await s.agent.com.atproto.repo.describeRepo({ repo: s.did })
        const handle = repoRes.data.handle
        setUserHandle(handle)

        // Fire all initial fetches in parallel — follows doesn't need the handle
        const recordsFetch = s.agent.com.atproto.repo.listRecords({
          repo: s.did,
          collection: COLLECTION,
          limit: 100
        })
        const profileFetch = fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(s.did)}`)
        const settingsFetch = s.agent.com.atproto.repo.getRecord({
          repo: s.did,
          collection: SETTINGS_COLLECTION,
          rkey: 'self'
        }).catch(() => null)
        const followsFetch = s.agent.com.atproto.repo.listRecords({
          repo: s.did,
          collection: FOLLOW_COLLECTION,
          limit: 100
        }).catch(() => null)
        const blocksFetch = fetchBlockedDids(s.agent)

        const [recordsRes, profileRes, settingsRes, blockedDids] = await Promise.all([
          recordsFetch, profileFetch, settingsFetch, blocksFetch
        ])

        let rawRecords = (recordsRes.data.records ?? []) as unknown as GameRecordView[]
        
        let bskyName: string | undefined
        let bskyAvatar: string | undefined
        if (profileRes.ok) {
          const profile = await profileRes.json()
          bskyName = profile.displayName
          bskyAvatar = profile.avatar
        }

        let customName: string | undefined
        let customAvatarBlob: any
        if (settingsRes && 'data' in settingsRes && settingsRes.data?.value) {
          const val = settingsRes.data.value as any
          customName = val.displayName
          customAvatarBlob = val.avatarBlob
        }

        setDisplayName(customName || bskyName || handle)

        let customAvatarUrl = bskyAvatar ?? null
        if (customAvatarBlob) {
          let pdsUrl = 'https://bsky.social'
          try {
            const docUrl = s.did.startsWith('did:web:')
              ? `https://${s.did.slice('did:web:'.length).split(':')[0]}/.well-known/did.json`
              : `https://plc.directory/${s.did}`
            const didRes = await fetch(docUrl)
            if (didRes.ok) {
              const didDoc = await didRes.json()
              const pdsService = didDoc.service?.find((serv: any) => serv.id === '#atproto_pds')
              if (pdsService?.serviceEndpoint) {
                const endpoint = new URL(pdsService.serviceEndpoint)
                if (endpoint.protocol === 'https:') pdsUrl = pdsService.serviceEndpoint
              }
            }
          } catch {}

          const cid = extractCid(customAvatarBlob.ref) ?? extractCid(customAvatarBlob)
          if (cid) {
            customAvatarUrl = `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(s.did)}&cid=${encodeURIComponent(cid)}`
          }
        }
        setAvatar(customAvatarUrl)

        // Screenshot resolving and caching
        let screenshotCache: Record<number, string> = {}
        try { screenshotCache = JSON.parse(sessionStorage.getItem('cta_screenshots') ?? '{}') } catch {}

        // Apply cache to records, identify what's still missing
        let patched = rawRecords.map((r) => {
          if (!matchesStatus(r.value.status, 'playing')) return r
          const url = r.value.game.screenshotUrl ?? screenshotCache[r.value.game.igdbId]
          if (!url) return r
          return { ...r, value: { ...r.value, game: { ...r.value.game, screenshotUrl: url } } }
        })

        setGames(patched)

        const releaseDateIds = patched
          .filter((r) => matchesStatus(r.value.status, 'wishlisted'))
          .map((r) => r.value.game.igdbId)
        if (releaseDateIds.length > 0) {
          fetch(`/api/igdb/release-dates?ids=${releaseDateIds.join(',')}`)
            .then(async (res) => {
              if (!res.ok) return
              const fresh: Record<number, number | null> = await res.json()
              setGames((prev) => prev.map((r) => {
                const id = r.value.game.igdbId
                if (!(id in fresh)) return r
                const updated = fresh[id]
                if (updated === r.value.game.releaseDate) return r
                return { ...r, value: { ...r.value, game: { ...r.value.game, releaseDate: updated ?? undefined } } }
              }))

              // Persist changed dates back to the stored records so other
              // surfaces (profile, lists, feeds) stay accurate too. Skip null
              // (a temporarily missing IGDB date shouldn't erase a stored one).
              const changed = patched.filter((r) => {
                if (!matchesStatus(r.value.status, 'wishlisted')) return false
                const freshDate = fresh[r.value.game.igdbId]
                return freshDate != null && freshDate !== r.value.game.releaseDate
              })
              for (const r of changed) {
                const freshDate = fresh[r.value.game.igdbId]!
                const rkey = r.uri.split('/').pop()
                if (!rkey) continue
                try {
                  await s.agent.com.atproto.repo.putRecord({
                    repo: s.did,
                    collection: COLLECTION,
                    rkey,
                    record: {
                      ...r.value,
                      game: {
                        ...r.value.game,
                        releaseDate: freshDate,
                        releaseYear: new Date(freshDate * 1000).getUTCFullYear(),
                      },
                    },
                  })
                } catch {}
              }
            })
            .catch(() => {})
        }

        const missingIds = patched
          .filter((r) => matchesStatus(r.value.status, 'playing') && !r.value.game.screenshotUrl)
          .map((r) => r.value.game.igdbId)

        if (missingIds.length > 0) {
          fetch(`/api/igdb/screenshots?ids=${missingIds.join(',')}`)
            .then(async (res) => {
              if (res.ok) {
                const newScreenshots = await res.json()
                setGames((prev) =>
                  prev.map((r) => {
                    const url = newScreenshots[r.value.game.igdbId]
                    if (!url) return r
                    return { ...r, value: { ...r.value, game: { ...r.value.game, screenshotUrl: url } } }
                  })
                )
                try {
                  sessionStorage.setItem('cta_screenshots', JSON.stringify({ ...screenshotCache, ...newScreenshots }))
                } catch {}
              }
            })
            .catch(() => {})
        }

        // Feed resolves independently — doesn't block the main loading state
        setFeedLoading(true)
        followsFetch
          .then(async (followsRes) => {
            if (!followsRes) return
            const rawFollows = followsRes.data.records as unknown as { uri: string; value: { subject: string; createdAt: string } }[]
            if (rawFollows.length === 0) return
            const allDids = rawFollows.map(r => r.value.subject)
            const params = allDids.map(d => `dids=${encodeURIComponent(d)}`).join('&')
            const res = await fetch(`/api/appview/feed?${params}`)
            if (res.ok) {
              const data = await res.json()
              setFeedItems((data.feed ?? []).filter((item: FeedItem) => !blockedDids.has(item.did)))
            }
          })
          .catch((err) => console.error('Failed to load social feed:', err))
          .finally(() => setFeedLoading(false))

      } catch (err) {
        console.error('Failed to initialize home page:', err)
      } finally {
        setLoading(false)
      }
    }).catch(() => { window.location.href = '/' })
  }, [])

  function handleUpdated(uri: string, value: GameRecord) {
    setGames((prev) => prev.map((g) => (g.uri === uri ? { ...g, value } : g)))
  }

  function handleDeleted(uri: string) {
    setGames((prev) => prev.filter((g) => g.uri !== uri))
  }

  // Deduplicate user games to calculate stats correctly
  const dedupedGames = Object.values(
    games.reduce<Record<number, GameRecordView>>((acc, record) => {
      const id = record.value.game.igdbId
      if (!acc[id] || record.value.createdAt > acc[id].value.createdAt) {
        acc[id] = record
      }
      return acc
    }, {})
  )

  const playingGames = dedupedGames
    .filter((g) => matchesStatus(g.value.status, 'playing'))
    .sort((a, b) => {
      const aDate = a.value.updatedAt ?? a.value.createdAt ?? ''
      const bDate = b.value.updatedAt ?? b.value.createdAt ?? ''
      return bDate.localeCompare(aDate)
    })

  const nowTs = Math.floor(Date.now() / 1000)
  const currentYear = new Date().getFullYear()
  const upcomingUserGames = [...dedupedGames]
    .filter((g) => {
      if (!matchesStatus(g.value.status, 'wishlisted')) return false
      const { releaseDate, releaseYear } = g.value.game
      if (releaseDate != null) return releaseDate > nowTs
      if (releaseYear != null) return releaseYear >= currentYear
      // No date info at all — include it; IGDB refresh may populate it
      return true
    })
    .sort((a, b) => {
      const toTs = (g: typeof a) => {
        if (g.value.game.releaseDate != null) return g.value.game.releaseDate
        if (g.value.game.releaseYear != null) return new Date(g.value.game.releaseYear, 6, 1).getTime() / 1000
        return Infinity
      }
      return toTs(a) - toTs(b)
    })

  const countFor = (status: string) => {
    return dedupedGames.filter((g) => matchesStatus(g.value.status, status)).length
  }

  if (loading) {
    return (
      <main style={{ flex: 1 }} />
    )
  }

  return (
    <main>
      <div className="container page-top">
        <div className="home-dashboard">
          
          <header className="home-dashboard-header">
            <h1 className="browse-section-title" style={{ margin: 0 }}>Welcome back, {displayName}</h1>
          </header>

          <section className="home-section">
            <div className="home-horizontal-stats">
              {[
                { label: 'Ongoing', status: 'playing', count: countFor('playing') },
                { label: 'Backlogged', status: 'backlogged', count: countFor('backlogged') },
                { label: 'Wishlisted', status: 'wishlisted', count: countFor('wishlisted') },
                { label: 'Played', status: 'played', count: countFor('played') },
              ].map(({ label, status, count }) => (
                <a href={`/library?status=${status}`} key={status} className="home-stat-card">
                  <div className="stat-value">{count}</div>
                  <div className="stat-label">{label}</div>
                </a>
              ))}
            </div>
          </section>

          {upcomingUserGames.length > 0 && (
            <section className="home-section">
              <h2 className="home-section-title">Upcoming</h2>
              <div className="browse-grid">
                {upcomingUserGames.slice(0, 8).map((record, i) => {
                  const game = record.value.game
                  const releaseDateStr = game.releaseDate
                    ? new Date(game.releaseDate * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
                    : null
                  const hideClass = i >= 6 ? ' upcoming-hide-at-1080' : i >= 4 ? ' upcoming-hide-below-768' : ''
                  return (
                    <div key={game.igdbId} className={`game-card-grid${hideClass}`}>
                      <div className="game-card-grid-cover-wrap">
                        <a href={`/games/${game.igdbId}`} style={{ display: 'block', lineHeight: 0 }}>
                          <img loading="lazy" decoding="async" className="game-card-grid-cover" src={game.coverUrl ?? '/no-cover.png'} alt={game.title} />
                        </a>
                      </div>
                      <a className="game-card-grid-info" href={`/games/${game.igdbId}`}>
                        {record.value.platform && (
                          <div className="game-card-platform">{abbreviatePlatform(record.value.platform)}</div>
                        )}
                        <div className="game-card-grid-title">{game.title}</div>
                        {releaseDateStr && <div className="browse-card-meta">{releaseDateStr}</div>}
                      </a>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <section className="home-section">
            <h2 className="home-section-title">Activity</h2>
            {feedLoading ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading updates…
              </div>
            ) : feedItems.length > 0 ? (
              <div className="browse-grid">
                {feedItems.slice(0, 15).map((item, i) => (
                  <div key={i} className="game-card-grid social-grid-card">
                    {/* Creator Header (Top) */}
                    <div
                      className="social-grid-user-top"
                      onClick={() => window.location.href = `/${item.handle}`}
                    >
                      <a href={`/${item.handle}`} className="social-grid-avatar-link" onClick={(e) => e.stopPropagation()}>
                        {item.avatar ? (
                          <img loading="lazy" decoding="async" src={bskyAvatar(item.avatar)} alt="" className="social-grid-avatar" />
                        ) : (
                          <div className="social-grid-avatar social-grid-avatar-placeholder" />
                        )}
                      </a>
                      <div className="social-grid-user-text">
                        <a href={`/${item.handle}`} className="social-grid-username" onClick={(e) => e.stopPropagation()}>
                          {item.displayName || `@${item.handle}`}
                        </a>
                        <span className="social-grid-time">
                          {relativeTime(item.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="game-card-grid-cover-wrap">
                      <a href={`/games/${item.igdbId}`} style={{ display: 'block', lineHeight: 0 }}>
                        <img
                          className="game-card-grid-cover"
                          src={item.gameCoverUrl || '/no-cover.png'}
                          alt={item.gameTitle}
                          loading="lazy"
                          decoding="async"
                        />
                      </a>
                    </div>
                    
                    <a className="game-card-grid-info" href={`/games/${item.igdbId}`}>
                      {item.platform && (
                        <div className="game-card-platform">{abbreviatePlatform(item.platform)}</div>
                      )}
                      <div className="game-card-grid-title">
                        {item.gameTitle}
                      </div>
                      {(() => {
                        const action = feedActionText(item.status, item.playedStatus)
                        return action ? (
                          <div className="game-card-meta" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {action.charAt(0).toUpperCase() + action.slice(1)}
                          </div>
                        ) : null
                      })()}
                      {item.rating && (
                        <div style={{ marginTop: 0 }}>
                          <Stars rating={item.rating / 2} />
                        </div>
                      )}
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="home-empty-feed">
                <p>No recent updates from the people you follow.</p>
                <a href="/community" className="btn btn-ghost" style={{ display: 'inline-flex', marginTop: 16 }}>
                  Find people to follow
                </a>
              </div>
            )}
          </section>

        </div>
      </div>
    </main>
  )
}
