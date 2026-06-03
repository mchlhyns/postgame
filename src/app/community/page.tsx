'use client'

import { useEffect, useRef, useState } from 'react'
import { Agent } from '@atproto/api'
import { restoreSession, FOLLOW_COLLECTION, fetchBlockedDids } from '@/lib/atproto'
import { Stars } from '@/components/Stars'
import AddGameModal from '@/components/AddGameModal'
import { relativeTime, feedActionText } from '@/lib/feed'

interface SearchActor {
  did: string
  handle: string
  displayName?: string
  avatar?: string
}

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

function FeedList({ items, loading, emptyTitle, emptyBody }: {
  items: FeedItem[]
  loading: boolean
  emptyTitle: string
  emptyBody: string
}) {
  const [modalGame, setModalGame] = useState<FeedItem | null>(null)
  const [session, setSession] = useState<{ agent: Agent; did: string } | null>(null)

  useEffect(() => {
    restoreSession().then(s => { if (s) setSession(s) }).catch(() => {})
  }, [])

  if (loading) return <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
  if (items.length === 0) return (
    <div className="empty-state">
      <h3>{emptyTitle}</h3>
      <p style={{ fontSize: 'var(--text-sm)' }}>{emptyBody}</p>
    </div>
  )
  return (
    <>
      <div className="browse-grid">
        {items.map((item, i) => (
          <div key={i} className="game-card-grid social-grid-card">
            <div className="social-grid-user-top" onClick={() => window.location.href = `/${item.handle}`}>
              <a href={`/${item.handle}`} className="social-grid-avatar-link" onClick={(e) => e.stopPropagation()}>
                {item.avatar ? (
                  <img src={item.avatar} alt="" className="social-grid-avatar" />
                ) : (
                  <div className="social-grid-avatar social-grid-avatar-placeholder" />
                )}
              </a>
              <div className="social-grid-user-text" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flex: 1 }}>
                <a href={`/${item.handle}`} className="social-grid-username" onClick={(e) => e.stopPropagation()} style={{ fontSize: 'var(--text-base)', lineHeight: 1.2 }}>
                  {item.displayName || `@${item.handle}`}
                </a>
                <span className="social-grid-time" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', flexShrink: 0 }}>
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
                />
              </a>
            </div>
            
            <a className="game-card-grid-info" href={`/games/${item.igdbId}`}>
              <div className="game-card-grid-title">
                {item.gameTitle}
              </div>
              {(() => {
                const parts: string[] = []
                if (item.platform) {
                  parts.push(item.platform.replace(/\s*\(Microsoft Windows\)/gi, ''))
                }
                const action = feedActionText(item.status, item.playedStatus)
                if (action) {
                  parts.push(action.charAt(0).toUpperCase() + action.slice(1))
                }
                return parts.length > 0 ? (
                  <div className="game-card-meta" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {parts.join(' • ')}
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
      {modalGame && session && (
        <AddGameModal
          agent={session.agent}
          did={session.did}
          initialGame={{ id: modalGame.igdbId, name: modalGame.gameTitle, coverUrl: modalGame.gameCoverUrl ?? undefined }}
          onClose={() => setModalGame(null)}
          onAdded={() => setModalGame(null)}
        />
      )}
    </>
  )
}

export default function SocialPage() {
  const [session, setSession] = useState<{ agent: Agent; did: string } | null>(null)
  const [networkItems, setNetworkItems] = useState<FeedItem[]>([])
  const [networkLoading, setNetworkLoading] = useState(false)
  const [networkLoaded, setNetworkLoaded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchActor[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const followedDids = useRef<Map<string, string>>(new Map())
  const blockedDids = useRef<Set<string>>(new Set())
  const [followStates, setFollowStates] = useState<Record<string, { following: boolean; followUri?: string }>>({})
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({})
  const searchRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<{ agent: Agent; did: string } | null>(null)

  useEffect(() => {
    restoreSession()
      .then((s) => {
        if (!s) { window.location.href = '/'; return }
        setSession(s)
        sessionRef.current = s
        loadFollowState(s.agent, s.did)
        fetchBlockedDids(s.agent).then(dids => { blockedDids.current = dids })
      })
      .catch(() => { window.location.href = '/' })
  }, [])

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setSearchOpen(false); return }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?q=${encodeURIComponent(searchQuery)}&limit=10`)
        if (!res.ok) return
        const data = await res.json()
        const actors: SearchActor[] = (data.actors ?? [])
          .filter((a: { did: string }) => !blockedDids.current.has(a.did))
          .map((a: { did: string; handle: string; displayName?: string; avatar?: string }) => ({
            did: a.did, handle: a.handle, displayName: a.displayName, avatar: a.avatar,
          }))
        const states: Record<string, { following: boolean; followUri?: string }> = {}
        for (const actor of actors) {
          const uri = followedDids.current.get(actor.did)
          states[actor.did] = { following: !!uri, followUri: uri }
        }
        setFollowStates((prev) => ({ ...prev, ...states }))
        setSearchResults(actors)
        setSearchOpen(actors.length > 0)
      } catch {}
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  useEffect(() => {
    if (networkLoaded) return
    setNetworkLoading(true)
    fetch('/api/appview/network')
      .then(r => r.json())
      .then(data => setNetworkItems((data.feed ?? []).filter((item: FeedItem) => !blockedDids.current.has(item.did))))
      .catch(() => {})
      .finally(() => { setNetworkLoading(false); setNetworkLoaded(true) })
  }, [])

  async function loadFollowState(agent: Agent, did: string) {
    try {
      const followsRes = await agent.com.atproto.repo.listRecords({ repo: did, collection: FOLLOW_COLLECTION, limit: 100 })
      const rawFollows = followsRes.data.records as unknown as { uri: string; value: { subject: string; createdAt: string } }[]
      const map = new Map<string, string>()
      for (const r of rawFollows) map.set(r.value.subject, r.uri)
      followedDids.current = map
      const states: Record<string, { following: boolean; followUri?: string }> = {}
      for (const [did, uri] of map) states[did] = { following: true, followUri: uri }
      setFollowStates(states)
    } catch {}
  }

  async function handleFollow(actor: SearchActor) {
    const s = sessionRef.current
    if (!s || followLoading[actor.did]) return
    const state = followStates[actor.did]

    setFollowLoading((prev) => ({ ...prev, [actor.did]: true }))
    try {
      if (state?.following && state.followUri) {
        const rkey = state.followUri.split('/').pop()!
        await s.agent.com.atproto.repo.deleteRecord({ repo: s.did, collection: FOLLOW_COLLECTION, rkey })
        followedDids.current.delete(actor.did)
        setFollowStates((prev) => ({ ...prev, [actor.did]: { following: false } }))
      } else {
        const res = await s.agent.com.atproto.repo.createRecord({
          repo: s.did,
          collection: FOLLOW_COLLECTION,
          record: { $type: FOLLOW_COLLECTION, subject: actor.did, createdAt: new Date().toISOString() },
        })
        const followUri = res.data.uri
        followedDids.current.set(actor.did, followUri)
        setFollowStates((prev) => ({ ...prev, [actor.did]: { following: true, followUri } }))
      }
    } catch (err) {
      console.error('Failed to update follow:', err)
    } finally {
      setFollowLoading((prev) => ({ ...prev, [actor.did]: false }))
    }
  }

  return (
    <main>
      <div className="container page-top">
        <h1 className="browse-section-title">Community</h1>
        <div className="page-header community-page-header" style={{ marginTop: 0 }}>
          <div className="filter-tabs" style={{ margin: 0 }}>
            <button className="filter-tab active">All Users</button>
          </div>
          <div ref={searchRef} className="search-wrapper community-search">
            <input
              className="input header-search-input"
              type="text"
              placeholder="Search users"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
              autoComplete="off"
            />
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="header-search-icon"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {searchOpen && searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((actor) => {
                  const state = followStates[actor.did]
                  const isFollowing = state?.following ?? false
                  return (
                    <div key={actor.did} className="search-result-item social-search-result">
                      <a href={`/${actor.handle}`} className="social-search-actor" onClick={() => { setSearchOpen(false); setSearchQuery('') }}>
                        {actor.avatar
                          ? <img src={actor.avatar} alt="" className="social-search-avatar" />
                          : <div className="social-search-avatar social-search-avatar-placeholder" />
                        }
                        <div style={{ overflow: 'hidden' }}>
                          {actor.displayName && <div style={{ fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{actor.displayName}</div>}
                          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{actor.handle}</div>
                        </div>
                      </a>
                      <button
                        className={`btn btn-sm ${isFollowing ? 'btn-basic' : 'btn-ghost'}`}
                        onClick={(e) => { e.preventDefault(); handleFollow(actor) }}
                        disabled={followLoading[actor.did]}
                      >
                        {followLoading[actor.did] ? '...' : (isFollowing ? 'Following' : 'Follow')}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <FeedList
          items={networkItems}
          loading={networkLoading}
          emptyTitle="Nothing here yet"
          emptyBody="No recent activity across the network"
        />
      </div>
    </main>
  )
}
