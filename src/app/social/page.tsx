'use client'

import { useEffect, useRef, useState } from 'react'
import { Agent } from '@atproto/api'
import { restoreSession, COLLECTION, FOLLOW_COLLECTION, SETTINGS_COLLECTION } from '@/lib/atproto'
import { GameRecordView, GameStatus } from '@/types'
import { Stars } from '@/components/Stars'
import AddGameModal from '@/components/AddGameModal'

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
  userHandle: string
  displayName: string | null
  avatar: string | null
  gameTitle: string
  gameCoverUrl: string | null
  igdbId: number
  igdbUrl?: string
  status: GameStatus
  playedStatus?: string
  rating?: number
  createdAt: string
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

function feedActionText(status: string, playedStatus?: string): string {
  switch (status) {
    case 'playing':
    case 'started': return 'started playing'
    case 'backlogged': return 'backlogged'
    case 'wishlisted':
    case 'wishlist': return 'wishlisted'
    case 'played': {
      switch (playedStatus) {
        case 'completed': return 'completed'
        case 'retired': return 'retired'
        case 'shelved': return 'shelved'
        case 'abandoned': return 'abandoned'
        default: return 'played'
      }
    }
    case 'finished': return 'completed'
    case 'shelved': return 'shelved'
    case 'abandoned': return 'abandoned'
    default: return status
  }
}

async function getPdsFromDid(did: string): Promise<string> {
  try {
    if (did.startsWith('did:web:')) {
      const host = did.slice('did:web:'.length).split(':')[0]
      return `https://${host}`
    }
    const doc = await fetch(`https://plc.directory/${encodeURIComponent(did)}`)
    if (!doc.ok) return 'https://bsky.social'
    const { service } = await doc.json()
    const pds = (service ?? []).find((s: { id: string; serviceEndpoint: string }) => s.id === '#atproto_pds')
    if (pds?.serviceEndpoint && new URL(pds.serviceEndpoint).protocol === 'https:') return pds.serviceEndpoint
  } catch {}
  return 'https://bsky.social'
}

async function resolveHandleToDid(handle: string): Promise<string | null> {
  try {
    const res = await fetch(`https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`)
    if (!res.ok) return null
    return (await res.json()).did ?? null
  } catch { return null }
}

const PDS_CACHE_KEY = 'cta_pds_cache'

function loadPdsCache(): Record<string, string> {
  try { return JSON.parse(sessionStorage.getItem(PDS_CACHE_KEY) ?? '{}') } catch { return {} }
}

function savePdsCache(cache: Record<string, string>) {
  try { sessionStorage.setItem(PDS_CACHE_KEY, JSON.stringify(cache)) } catch {}
}

function extractCid(ref: unknown): string | null {
  if (!ref) return null
  if (typeof (ref as any)['$link'] === 'string') return (ref as any)['$link']
  if (typeof (ref as any)['/'] === 'string') return (ref as any)['/']
  const s = (ref as any).toString?.()
  if (typeof s === 'string' && s !== '[object Object]') return s
  return null
}

function blobUrl(pdsUrl: string, did: string, blob: unknown): string | null {
  const cid = extractCid((blob as any)?.ref)
  if (!cid) return null
  return `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
}

async function getPdsFromDidCached(did: string, cache: Record<string, string>): Promise<string> {
  if (cache[did]) return cache[did]
  const pds = await getPdsFromDid(did)
  cache[did] = pds
  return pds
}

async function fetchBskyProfiles(dids: string[]): Promise<Map<string, { handle: string; displayName?: string; avatar?: string }>> {
  const map = new Map<string, { handle: string; displayName?: string; avatar?: string }>()
  const chunks: string[][] = []
  for (let i = 0; i < dids.length; i += 25) chunks.push(dids.slice(i, i + 25))
  await Promise.allSettled(chunks.map(async (chunk) => {
    try {
      const params = chunk.map((d) => `actors=${encodeURIComponent(d)}`).join('&')
      const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?${params}`)
      if (!res.ok) return
      for (const p of (await res.json()).profiles ?? []) {
        map.set(p.did, { handle: p.handle, displayName: p.displayName, avatar: p.avatar })
      }
    } catch {}
  }))
  return map
}

function buildFeedItems(records: GameRecordView[], userHandle: string, displayName: string | undefined, avatar: string | undefined): FeedItem[] {
  const deduped = Object.values(
    records.reduce<Record<number, GameRecordView>>((acc, r) => {
      const id = r.value.game.igdbId
      if (!acc[id] || r.value.createdAt > acc[id].value.createdAt) acc[id] = r
      return acc
    }, {})
  )
  return deduped.map((r) => ({
    userHandle,
    displayName: displayName ?? null,
    avatar: avatar ?? null,
    gameTitle: r.value.game.title,
    gameCoverUrl: r.value.game.coverUrl ?? null,
    igdbId: r.value.game.igdbId,
    igdbUrl: r.value.game.igdbUrl,
    status: r.value.status,
    playedStatus: r.value.playedStatus,
    rating: r.value.rating,
    createdAt: r.value.createdAt,
  }))
}

export default function SocialPage() {
  const [session, setSession] = useState<{ agent: Agent; did: string } | null>(null)
  const [userHandle, setUserHandle] = useState<string | null>(null)
  const [ctaFollows, setCtaFollows] = useState<FollowProfile[]>([])
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchActor[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  // DID → follow record URI for quick lookup
  const followedDids = useRef<Map<string, string>>(new Map())
  // DID → { following, followUri } for search result UI
  const [followStates, setFollowStates] = useState<Record<string, { following: boolean; followUri?: string }>>({})
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({})
  const [modalGame, setModalGame] = useState<FeedItem | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<{ agent: Agent; did: string } | null>(null)

  useEffect(() => {
    restoreSession()
      .then((s) => {
        if (!s) { window.location.href = '/'; return }
        setSession(s)
        sessionRef.current = s
        s.agent.com.atproto.repo.describeRepo({ repo: s.did })
          .then((res) => setUserHandle(res.data.handle))
          .catch(() => {})
        loadSocialData(s.agent, s.did)
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
          did: a.did,
          handle: a.handle,
          displayName: a.displayName,
          avatar: a.avatar,
        }))

        // Set initial follow state from known follows
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
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  async function loadSocialData(agent: Agent, did: string) {
    setFeedLoading(true)
    try {
      const followsRes = await agent.com.atproto.repo.listRecords({ repo: did, collection: FOLLOW_COLLECTION, limit: 100 })
      const rawFollows = followsRes.data.records as unknown as { uri: string; value: { subject: string } }[]

      const map = new Map<string, string>()
      for (const r of rawFollows) map.set(r.value.subject, r.uri)
      followedDids.current = map

      const followedDidsArray = Array.from(map.entries())
      if (followedDidsArray.length === 0) {
        setFeedItems([])
        setCtaFollows([])
        return
      }

      const allDids = followedDidsArray.map(([d]) => d)
      const pdsCache = loadPdsCache()

      // Resolve all PDS URLs and batch-fetch Bsky profiles in parallel
      const [pdsUrls, bskyProfiles] = await Promise.all([
        Promise.all(allDids.map((d) => getPdsFromDidCached(d, pdsCache))),
        fetchBskyProfiles(allDids),
      ])
      savePdsCache(pdsCache)

      // Fetch game records for all follows in parallel
      const recordsResults = await Promise.allSettled(
        followedDidsArray.map(async ([subjectDid, followUri], i) => {
          const pdsUrl = pdsUrls[i]
          const res = await fetch(`${pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(subjectDid)}&collection=${encodeURIComponent(COLLECTION)}&limit=10`)
          const records: GameRecordView[] = res.ok ? ((await res.json()).records ?? []) : []
          return { subjectDid, records, followUri }
        })
      )

      // Fetch CTA settings for each followed user (custom avatar / display name)
      const ctaMap = new Map<string, { displayName?: string; avatarUrl?: string }>()
      await Promise.allSettled(followedDidsArray.map(async ([subjectDid], i) => {
        try {
          const pds = pdsUrls[i]
          const r = await fetch(`${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(subjectDid)}&collection=${encodeURIComponent(SETTINGS_COLLECTION)}&rkey=self`)
          if (!r.ok) return
          const { value } = await r.json()
          const entry: { displayName?: string; avatarUrl?: string } = {}
          if (value?.displayName) entry.displayName = value.displayName
          if (value?.avatarBlob) entry.avatarUrl = blobUrl(pds, subjectDid, value.avatarBlob) ?? undefined
          if (entry.displayName || entry.avatarUrl) ctaMap.set(subjectDid, entry)
        } catch {}
      }))

      const follows: FollowProfile[] = []
      const items: FeedItem[] = []

      for (const result of recordsResults) {
        if (result.status !== 'fulfilled') continue
        const { subjectDid, records, followUri } = result.value
        const profile = bskyProfiles.get(subjectDid)
        if (!profile) continue

        const cta = ctaMap.get(subjectDid)
        const displayName = cta?.displayName ?? profile.displayName
        const avatar = cta?.avatarUrl ?? profile.avatar

        follows.push({ did: subjectDid, handle: profile.handle, displayName, avatar, followUri })
        for (const item of buildFeedItems(records, profile.handle, displayName, avatar)) {
          items.push(item)
        }
      }

      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setFeedItems(items.slice(0, 20))
      setCtaFollows(follows)
    } catch (err) {
      console.error('Failed to load social data:', err)
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
        await s.agent.com.atproto.repo.deleteRecord({
          repo: s.did,
          collection: FOLLOW_COLLECTION,
          rkey,
        })
        followedDids.current.delete(actor.did)
        setFollowStates((prev) => ({ ...prev, [actor.did]: { following: false } }))
        setCtaFollows((prev) => prev.filter((f) => f.did !== actor.did))
        setFeedItems((prev) => prev.filter((f) => f.userHandle !== actor.handle))
      } else {
        const res = await s.agent.com.atproto.repo.createRecord({
          repo: s.did,
          collection: FOLLOW_COLLECTION,
          record: {
            $type: FOLLOW_COLLECTION,
            subject: actor.did,
            createdAt: new Date().toISOString(),
          },
        })
        const followUri = res.data.uri
        followedDids.current.set(actor.did, followUri)
        setFollowStates((prev) => ({ ...prev, [actor.did]: { following: true, followUri } }))

        // Fetch the new follow's profile and games to update state directly
        const pdsCache = loadPdsCache()
        const pdsUrl = await getPdsFromDidCached(actor.did, pdsCache)
        savePdsCache(pdsCache)
        const [bskyProfiles, recordsRes] = await Promise.all([
          fetchBskyProfiles([actor.did]),
          fetch(`${pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(actor.did)}&collection=${encodeURIComponent(COLLECTION)}&limit=10`),
        ])
        const records: GameRecordView[] = recordsRes.ok ? ((await recordsRes.json()).records ?? []) : []
        const profile = bskyProfiles.get(actor.did)

        const newFollow: FollowProfile = {
          did: actor.did,
          handle: profile?.handle ?? actor.handle,
          displayName: profile?.displayName ?? actor.displayName,
          avatar: profile?.avatar ?? actor.avatar,
          followUri,
        }
        setCtaFollows((prev) => [...prev, newFollow])

        const newItems = buildFeedItems(records, newFollow.handle, newFollow.displayName ?? undefined, newFollow.avatar ?? undefined)
        if (newItems.length > 0) {
          setFeedItems((prev) =>
            [...prev, ...newItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20)
          )
        }
      }
    } catch (err) {
      console.error('Failed to update follow:', err)
    } finally {
      setFollowLoading((prev) => ({ ...prev, [actor.did]: false }))
    }
  }

  async function handleUnfollow(follow: FollowProfile) {
    const s = sessionRef.current
    if (!s || followLoading[follow.did]) return
    setFollowLoading((prev) => ({ ...prev, [follow.did]: true }))
    try {
      const rkey = follow.followUri.split('/').pop()!
      await s.agent.com.atproto.repo.deleteRecord({ repo: s.did, collection: FOLLOW_COLLECTION, rkey })
      followedDids.current.delete(follow.did)
      setFollowStates((prev) => ({ ...prev, [follow.did]: { following: false } }))
      setCtaFollows((prev) => prev.filter((f) => f.did !== follow.did))
      setFeedItems((prev) => prev.filter((f) => f.userHandle !== follow.handle))
    } catch (err) {
      console.error('Failed to unfollow:', err)
    } finally {
      setFollowLoading((prev) => ({ ...prev, [follow.did]: false }))
    }
  }

  return (
    <>
      <main>
        <div className="container">
          <div className="page-header social">
            <h1>Social</h1>
            <div ref={searchRef} className="search-wrapper">
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
                          <div>
                            {actor.displayName && <div style={{ fontSize: '0.875rem' }}>{actor.displayName}</div>}
                            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>@{actor.handle}</div>
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

          {/* Following cards */}
          {ctaFollows.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h2 className="social-section-title" style={{ marginBottom: 18 }}>Following ({ctaFollows.length})</h2>
              <div className="game-grid">
                {ctaFollows.map((follow) => (
                  <div key={follow.did} className="game-card-grid" style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
                    <a href={`/${follow.handle}`} style={{ display: 'block', flexShrink: 0 }}>
                      {follow.avatar
                        ? <img src={follow.avatar} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
                        : <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--tertiary)' }} />
                      }
                    </a>
                    <div style={{ minWidth: 0, width: '100%' }}>
                      <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <a href={`/${follow.handle}`}>{follow.displayName ?? `@${follow.handle}`}</a>
                      </div>
                      {follow.displayName && (
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          @{follow.handle}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Feed */}
          <h2 className="social-section-title" style={{ marginBottom: 18 }}>Activity</h2>
          {feedLoading ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          ) : feedItems.length === 0 ? (
            <div className="empty-state">
              <h3>No activity yet</h3>
              <p style={{ fontSize: '14px' }}>Find and follow people to see what they're playing</p>
            </div>
          ) : (
            <div className="social-feed">
              {feedItems.map((item, i) => (
                <div key={i} className="feed-item">
                  <a href={`/${item.userHandle}`} className="feed-avatar-link">
                    {item.avatar
                      ? <img src={item.avatar} alt="" className="feed-avatar" />
                      : <div className="feed-avatar feed-avatar-placeholder" />
                    }
                  </a>
                  <div className="feed-text">
                    <a href={`/${item.userHandle}`} className="feed-username">
                      {item.displayName ?? `@${item.userHandle}`}
                    </a>
                    {' '}{feedActionText(item.status, item.playedStatus)}{' '}
                    <a href={`/games/${item.igdbId}`} className="feed-game-title">{item.gameTitle}</a>
                  </div>
                  <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {item.rating && <Stars rating={item.rating / 2} />}
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{relativeTime(item.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

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
