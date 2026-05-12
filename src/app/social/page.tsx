'use client'

import { useEffect, useRef, useState } from 'react'
import { Agent } from '@atproto/api'
import { restoreSession, FOLLOW_COLLECTION } from '@/lib/atproto'
import { Stars } from '@/components/Stars'
import AddGameModal from '@/components/AddGameModal'
import Select from '@/components/Select'

interface FollowProfile {
  did: string
  handle: string
  displayName?: string
  avatar?: string
  followUri: string
}

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
  rating?: number
  createdAt: string
}

interface Profile {
  did: string
  handle: string
  displayName: string | null
  avatar: string | null
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function feedActionText(status: string): string {
  switch (status) {
    case 'playing':
    case 'started': return 'started playing'
    case 'backlogged': return 'backlogged'
    case 'wishlisted':
    case 'wishlist': return 'wishlisted'
    case 'played':
    case 'finished': return 'played'
    case 'completed': return 'completed'
    case 'shelved': return 'shelved'
    case 'abandoned': return 'abandoned'
    case 'retired': return 'retired'
    default: return status
  }
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
      <p style={{ fontSize: '14px' }}>{emptyBody}</p>
    </div>
  )
  return (
    <>
      <div className="social-feed">
        {items.map((item, i) => (
          <div key={i} className="feed-item">
            <a href={`/${item.handle}`} className="feed-avatar-link">
              {item.avatar
                ? <img src={item.avatar} alt="" className="feed-avatar" />
                : <div className="feed-avatar feed-avatar-placeholder" />
              }
            </a>
            <div className="feed-text">
              <a href={`/${item.handle}`} className="feed-username">
                {item.displayName ?? `@${item.handle}`}
              </a>
              {' '}{feedActionText(item.status)}{' '}
              <a href={`/games/${item.igdbId}`} className="feed-game-title">{item.gameTitle}</a>
            </div>
            <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              {item.rating && <Stars rating={item.rating / 2} />}
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: 50, textAlign: 'right', display: 'inline-block' }}>{relativeTime(item.createdAt)}</span>
            </div>
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
  const [tab, setTab] = useState<'following' | 'network'>('following')
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [networkItems, setNetworkItems] = useState<FeedItem[]>([])
  const [networkLoading, setNetworkLoading] = useState(false)
  const [networkLoaded, setNetworkLoaded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchActor[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const followedDids = useRef<Map<string, string>>(new Map())
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
        loadActivityFeed(s.agent, s.did)
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
        const actors: SearchActor[] = (data.actors ?? []).map((a: { did: string; handle: string; displayName?: string; avatar?: string }) => ({
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
    if (tab === 'network' && !networkLoaded) {
      setNetworkLoading(true)
      fetch('/api/appview/network')
        .then(r => r.json())
        .then(data => setNetworkItems(data.feed ?? []))
        .catch(() => {})
        .finally(() => { setNetworkLoading(false); setNetworkLoaded(true) })
    }
  }, [tab, networkLoaded])

  async function loadActivityFeed(agent: Agent, did: string) {
    setFeedLoading(true)
    try {
      const followsRes = await agent.com.atproto.repo.listRecords({ repo: did, collection: FOLLOW_COLLECTION, limit: 100 })
      const rawFollows = followsRes.data.records as unknown as { uri: string; value: { subject: string; createdAt: string } }[]

      const map = new Map<string, string>()
      for (const r of rawFollows) map.set(r.value.subject, r.uri)
      followedDids.current = map

      if (!map.size) { setFeedItems([]); return }

      const allDids = [...map.keys()]
      const params = allDids.map(d => `dids=${encodeURIComponent(d)}`).join('&')
      const res = await fetch(`/api/appview/feed?${params}`)
      const data = await res.json()

      const profileMap = new Map<string, Profile>((data.profiles ?? []).map((p: Profile) => [p.did, p]))
      const states: Record<string, { following: boolean; followUri?: string }> = {}
      for (const [did, uri] of map) states[did] = { following: true, followUri: uri }
      setFollowStates(states)

      setFeedItems(data.feed ?? [])
      void profileMap
    } catch (err) {
      console.error('Failed to load activity feed:', err)
    } finally {
      setFeedLoading(false)
    }
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
        setFeedItems((prev) => prev.filter((f) => f.did !== actor.did))
      } else {
        const res = await s.agent.com.atproto.repo.createRecord({
          repo: s.did,
          collection: FOLLOW_COLLECTION,
          record: { $type: FOLLOW_COLLECTION, subject: actor.did, createdAt: new Date().toISOString() },
        })
        const followUri = res.data.uri
        followedDids.current.set(actor.did, followUri)
        setFollowStates((prev) => ({ ...prev, [actor.did]: { following: true, followUri } }))

        const newRes = await fetch(`/api/appview/feed?dids=${encodeURIComponent(actor.did)}`)
        const newData = await newRes.json()
        if (newData.feed?.length) {
          setFeedItems((prev) =>
            [...prev, ...newData.feed].sort((a: FeedItem, b: FeedItem) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50)
          )
        }
      }
    } catch (err) {
      console.error('Failed to update follow:', err)
    } finally {
      setFollowLoading((prev) => ({ ...prev, [actor.did]: false }))
    }
  }

  return (
    <main>
      <div className="container">
        <div className="page-header">
          <Select
            variant="filter"
            value={tab}
            onChange={(v) => setTab(v as 'following' | 'network')}
            options={[
              { value: 'following', label: 'Following' },
              { value: 'network', label: 'Network' },
            ]}
          />
          <div ref={searchRef} className="search-wrapper" style={{ maxWidth: 320 }}>
            <input
              className="input"
              type="text"
              placeholder="Search for a user"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
              autoComplete="off"
            />
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
                          {actor.displayName && <div style={{ fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{actor.displayName}</div>}
                          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{actor.handle}</div>
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

        {tab === 'following' && (
          <FeedList
            items={feedItems}
            loading={feedLoading}
            emptyTitle="No activity yet"
            emptyBody="Follow people to see what they're playing"
          />
        )}
        {tab === 'network' && (
          <FeedList
            items={networkItems}
            loading={networkLoading}
            emptyTitle="Nothing here yet"
            emptyBody="No recent activity across the network"
          />
        )}
      </div>
    </main>
  )
}
