'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { ChevronLeft, Trophy, UserCheck, UserMinus, UserPlus } from 'lucide-react'
import { Agent } from '@atproto/api'
import { COLLECTION, SETTINGS_COLLECTION, LIST_COLLECTION, FOLLOW_COLLECTION, restoreSession, resolveHandleToPds } from '@/lib/atproto'
import { GameRecordView, GameRef, ListRecordView } from '@/types'
import { statusLabel, matchesStatus, PRIMARY_STATUSES } from '@/lib/igdb'
import GameCard from '@/components/GameCard'
import { Stars } from '@/components/Stars'

const ALL_STATUSES = PRIMARY_STATUSES

async function pdsFromDid(did: string): Promise<string> {
  try {
    const url = did.startsWith('did:web:')
      ? `https://${did.slice('did:web:'.length).split(':')[0]}/.well-known/did.json`
      : `https://plc.directory/${did}`
    const res = await fetch(url)
    if (res.ok) {
      const doc = await res.json()
      const svc = doc.service?.find((s: { id: string; serviceEndpoint: string }) => s.id === '#atproto_pds')
      if (svc?.serviceEndpoint) return svc.serviceEndpoint
    }
  } catch {}
  return 'https://bsky.social'
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

async function fetchPublicGames(handle: string, screenshotCache: Record<number, string> = {}): Promise<{ did: string; pdsUrl: string; resolvedHandle: string; records: GameRecordView[]; lists: ListRecordView[]; displayName?: string; bskyDisplayName?: string; avatar?: string; ctaAvatarUrl?: string; bannerUrl?: string; favouriteGame?: GameRef; newScreenshots: Record<number, string> }> {
  const cleanHandle = handle.replace(/^@/, '')
  const { did, pdsUrl } = await resolveHandleToPds(cleanHandle)

  // Start all fetches simultaneously
  const recordsFetch = fetch(`${pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${COLLECTION}&limit=100`)
  const listsFetch = fetch(`${pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${LIST_COLLECTION}&limit=100`)
  const descFetch = fetch(`${pdsUrl}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`)
  const settingsFetch = fetch(`${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${SETTINGS_COLLECTION}&rkey=self`)
  const profileFetch = fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`)

  // Process records as soon as they arrive, then immediately start screenshot fetch
  const recordsRes = await recordsFetch
  if (!recordsRes.ok) throw new Error('Failed to fetch games')
  const firstRecordsPage = await recordsRes.json()
  let rawRecords = (firstRecordsPage.records ?? []) as GameRecordView[]
  let recordsCursor: string | undefined = firstRecordsPage.cursor
  while (recordsCursor) {
    const nextRes = await fetch(`${pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${COLLECTION}&limit=100&cursor=${encodeURIComponent(recordsCursor)}`)
    if (!nextRes.ok) break
    const nextPage = await nextRes.json()
    rawRecords = [...rawRecords, ...(nextPage.records ?? [])]
    recordsCursor = nextPage.cursor
  }

  // Apply cache to records, identify what's still missing
  let patched = rawRecords.map((r) => {
    if (!matchesStatus(r.value.status, 'playing')) return r
    const url = r.value.game.screenshotUrl ?? screenshotCache[r.value.game.igdbId]
    if (!url) return r
    return { ...r, value: { ...r.value, game: { ...r.value.game, screenshotUrl: url } } }
  })
  const missingIds = patched
    .filter((r) => matchesStatus(r.value.status, 'playing') && !r.value.game.screenshotUrl)
    .map((r) => r.value.game.igdbId)
  const screenshotFetch = missingIds.length > 0
    ? fetch(`/api/igdb/screenshots?ids=${missingIds.join(',')}`)
    : Promise.resolve(null)

  // Wait for all remaining fetches (screenshots now runs in parallel with lists/desc/settings/profile)
  const [listsRes, descRes, settingsRes, profileRes, screenshotRes] = await Promise.all([
    listsFetch, descFetch, settingsFetch, profileFetch, screenshotFetch,
  ])

  let newScreenshots: Record<number, string> = {}
  if (screenshotRes?.ok) {
    newScreenshots = await screenshotRes.json()
    patched = patched.map((r) => {
      const url = newScreenshots[r.value.game.igdbId]
      if (!url) return r
      return { ...r, value: { ...r.value, game: { ...r.value.game, screenshotUrl: url } } }
    })
  }

  let lists: ListRecordView[] = []
  if (listsRes.ok) {
    const firstListsPage = await listsRes.json()
    lists = firstListsPage.records ?? []
    let listsCursor: string | undefined = firstListsPage.cursor
    while (listsCursor) {
      const nextRes = await fetch(`${pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${LIST_COLLECTION}&limit=100&cursor=${encodeURIComponent(listsCursor)}`)
      if (!nextRes.ok) break
      const nextPage = await nextRes.json()
      lists = [...lists, ...(nextPage.records ?? [])]
      listsCursor = nextPage.cursor
    }
  }
  const resolvedHandle = descRes.ok ? ((await descRes.json()).handle ?? cleanHandle) : cleanHandle

  let displayName: string | undefined
  let ctaAvatarUrl: string | undefined
  let bannerUrl: string | undefined
  let favouriteGame: GameRef | undefined
  if (settingsRes.ok) {
    const settings = await settingsRes.json()
    displayName = settings.value?.displayName
    if (settings.value?.avatarBlob) ctaAvatarUrl = blobUrl(pdsUrl, did, settings.value.avatarBlob) ?? undefined
    if (settings.value?.bannerBlob) bannerUrl = blobUrl(pdsUrl, did, settings.value.bannerBlob) ?? undefined
    if (settings.value?.favouriteGame) favouriteGame = settings.value.favouriteGame
  }

  let bskyDisplayName: string | undefined
  let avatar: string | undefined
  if (profileRes.ok) {
    const profile = await profileRes.json()
    bskyDisplayName = profile.displayName
    avatar = profile.avatar
  }

  return { did, pdsUrl, resolvedHandle, records: patched, lists, displayName, bskyDisplayName, avatar, ctaAvatarUrl, bannerUrl, favouriteGame, newScreenshots }
}

export default function ProfilePage() {
  const params = useParams()
  const handle = typeof params.handle === 'string' ? params.handle : ''

  const [resolvedHandle, setResolvedHandle] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [games, setGames] = useState<GameRecordView[]>([])
  const [lists, setLists] = useState<ListRecordView[]>([])
  const [favouriteGame, setFavouriteGame] = useState<GameRef | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [section, setSection] = useState<'games' | 'lists' | 'activity' | 'following'>('games')
  const [activityLimit, setActivityLimit] = useState(20)
  const [profilePdsUrl, setProfilePdsUrl] = useState<string | null>(null)
  const [follows, setFollows] = useState<Array<{ did: string; handle: string; displayName?: string; avatar?: string }> | null>(null)
  const [followsLoading, setFollowsLoading] = useState(false)
  const [selectedList, setSelectedList] = useState<ListRecordView | null>(null)
  const [authSession, setAuthSession] = useState<{ agent: Agent; did: string } | null>(null)
  const [profileDid, setProfileDid] = useState<string | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followUri, setFollowUri] = useState<string | null>(null)
  const [followLoading, setFollowLoading] = useState(false)
  const [followBtnHover, setFollowBtnHover] = useState(false)
  const bannerBgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    restoreSession()
      .then((s) => {
        if (!s) return
        setAuthSession(s)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!authSession || !profileDid || authSession.did === profileDid) return
    authSession.agent.com.atproto.repo.listRecords({ repo: authSession.did, collection: FOLLOW_COLLECTION, limit: 100 })
      .then((res) => {
        const match = res.data.records.find((r) => (r.value as any).subject === profileDid)
        if (match) { setIsFollowing(true); setFollowUri(match.uri) }
        else { setIsFollowing(false); setFollowUri(null) }
      })
      .catch(() => {})
  }, [authSession, profileDid])

  async function handleFollow() {
    if (!authSession || !profileDid || followLoading) return
    setFollowLoading(true)
    try {
      if (isFollowing && followUri) {
        const rkey = followUri.split('/').pop()!
        await authSession.agent.com.atproto.repo.deleteRecord({ repo: authSession.did, collection: FOLLOW_COLLECTION, rkey })
        setIsFollowing(false)
        setFollowUri(null)
      } else {
        const res = await authSession.agent.com.atproto.repo.createRecord({
          repo: authSession.did,
          collection: FOLLOW_COLLECTION,
          record: { $type: FOLLOW_COLLECTION, subject: profileDid, createdAt: new Date().toISOString() },
        })
        setIsFollowing(true)
        setFollowUri(res.data.uri)
      }
    } catch (err) {
      console.error('Follow/unfollow error:', err)
    } finally {
      setFollowLoading(false)
    }
  }


  useEffect(() => {
    function onScroll() {
      if (bannerBgRef.current) {
        bannerBgRef.current.style.transform = `translateY(${window.scrollY * 0.3}px)`
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!handle) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setProfileDid(null)
    setIsFollowing(false)
    setFollowUri(null)

    let screenshotCache: Record<number, string> = {}
    try { screenshotCache = JSON.parse(sessionStorage.getItem('cta_screenshots') ?? '{}') } catch {}

    setFollows(null)
    fetchPublicGames(handle, screenshotCache)
      .then(({ did, pdsUrl, resolvedHandle, records, lists: fetchedLists, displayName, bskyDisplayName, avatar, ctaAvatarUrl, bannerUrl, favouriteGame, newScreenshots }) => {
        if (cancelled) return
        setProfileDid(did)
        setProfilePdsUrl(pdsUrl)
        setResolvedHandle(resolvedHandle)
        setDisplayName(displayName ?? bskyDisplayName ?? null)
        setAvatar(ctaAvatarUrl ?? avatar ?? null)
        setBannerUrl(bannerUrl ?? null)
        setLists(fetchedLists)
        setFavouriteGame(favouriteGame ?? null)
        if (Object.keys(newScreenshots).length > 0) {
          try { sessionStorage.setItem('cta_screenshots', JSON.stringify({ ...screenshotCache, ...newScreenshots })) } catch {}
        }
        setGames(records)
      })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'Something went wrong') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [handle])

  useEffect(() => {
    if (section !== 'following' || follows !== null || !profileDid || !profilePdsUrl) return
    setFollowsLoading(true)
    ;(async () => {
      try {
        const res = await fetch(`${profilePdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(profileDid)}&collection=${encodeURIComponent(FOLLOW_COLLECTION)}&limit=100`)
        if (!res.ok) { setFollows([]); return }
        const data = await res.json()
        const subjectDids: string[] = (data.records ?? []).map((r: { value: { subject: string } }) => r.value.subject)
        if (subjectDids.length === 0) { setFollows([]); return }

        const chunks: string[][] = []
        for (let i = 0; i < subjectDids.length; i += 25) chunks.push(subjectDids.slice(i, i + 25))
        const bskyMap = new Map<string, { handle: string; displayName?: string; avatar?: string }>()
        await Promise.allSettled(chunks.map(async (chunk) => {
          const params = chunk.map(d => `actors=${encodeURIComponent(d)}`).join('&')
          const r = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?${params}`)
          if (!r.ok) return
          for (const p of (await r.json()).profiles ?? []) {
            bskyMap.set(p.did, { handle: p.handle, displayName: p.displayName, avatar: p.avatar })
          }
        }))

        // Fetch CTA settings for each followed user to get custom display name / avatar
        const ctaMap = new Map<string, { displayName?: string; avatarUrl?: string }>()
        await Promise.allSettled(subjectDids.map(async (did) => {
          try {
            const pds = await pdsFromDid(did)
            const r = await fetch(`${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(SETTINGS_COLLECTION)}&rkey=self`)
            if (!r.ok) return
            const { value } = await r.json()
            const ctaEntry: { displayName?: string; avatarUrl?: string } = {}
            if (value?.displayName) ctaEntry.displayName = value.displayName
            if (value?.avatarBlob) ctaEntry.avatarUrl = blobUrl(pds, did, value.avatarBlob) ?? undefined
            if (ctaEntry.displayName || ctaEntry.avatarUrl) ctaMap.set(did, ctaEntry)
          } catch {}
        }))

        const profiles = subjectDids.flatMap((did) => {
          const bsky = bskyMap.get(did)
          if (!bsky) return []
          const cta = ctaMap.get(did)
          return [{ did, handle: bsky.handle, displayName: cta?.displayName ?? bsky.displayName, avatar: cta?.avatarUrl ?? bsky.avatar }]
        })
        setFollows(profiles.sort((a, b) => (a.displayName ?? a.handle).localeCompare(b.displayName ?? b.handle)))
      } catch {
        setFollows([])
      } finally {
        setFollowsLoading(false)
      }
    })()
  }, [section, follows, profileDid, profilePdsUrl])

  // Deduplicate by igdbId, keeping the most recent record per game
  const deduped = Object.values(
    games.reduce<Record<number, GameRecordView>>((acc, record) => {
      const id = record.value.game.igdbId
      if (!acc[id] || record.value.createdAt > acc[id].value.createdAt) {
        acc[id] = record
      }
      return acc
    }, {})
  )

  const sortedGames = [...deduped].sort((a, b) => {
    const aDate = a.value.updatedAt ?? a.value.finishedAt ?? a.value.createdAt
    const bDate = b.value.updatedAt ?? b.value.finishedAt ?? b.value.createdAt
    return bDate.localeCompare(aDate)
  })

  return (
    <>
      <main>
        {!loading && !error && (
          <div className="profile-banner-block">
            {bannerUrl && <div ref={bannerBgRef} className="profile-banner-bg" style={{ backgroundImage: `url(${bannerUrl})` }} />}
            <div className="container profile-banner-content" style={{ alignItems: 'flex-end' }}>
              <div style={{ position: 'relative', height: 80, flexShrink: 0 }}>
                {avatar && <img src={avatar} alt="" className="profile-banner-avatar" />}
                {authSession && profileDid && authSession.did !== profileDid && (
                  <button
                    className={`profile-follow-btn${isFollowing ? ' profile-follow-btn--following' : ''}`}
                    onClick={handleFollow}
                    disabled={followLoading}
                    title={isFollowing ? 'Unfollow' : 'Follow'}
                    onMouseEnter={() => setFollowBtnHover(true)}
                    onMouseLeave={() => setFollowBtnHover(false)}
                  >
                    {isFollowing
                      ? (followBtnHover ? <UserMinus size={14} /> : <UserCheck size={14} />)
                      : <UserPlus size={14} />
                    }
                  </button>
                )}
              </div>
              <div>
                <h1 style={{ fontSize: '2rem', lineHeight: 1.2, fontWeight: 700, margin: '0' }}>{displayName ?? `@${resolvedHandle ?? handle}`}</h1>
                {displayName && <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>@{resolvedHandle ?? handle}</p>}
              </div>
              <div className="profile-stats" style={{ marginLeft: 'auto', gap: 32, flexShrink: 0 }}>
                {([
                  { label: 'Backlogged', status: 'backlogged' },
                  { label: 'Wishlisted', status: 'wishlisted' },
                  { label: 'Played', status: 'played' },
                ] as const).map(({ label, status }) => (
                  <button
                    key={status}
                    style={{ textAlign: 'right', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
                    onClick={() => {
                      setSection('games')
                      setSelectedList(null)
                      setTimeout(() => document.getElementById(status)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
                    }}
                  >
                    <div style={{ fontSize: '2rem', lineHeight: 1.2, fontWeight: 700 }}>
                      {deduped.filter(g => matchesStatus(g.value.status, status)).length}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>{label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="container" style={{ position: 'relative', zIndex: 1, paddingTop: 90 }}>
          {loading ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          ) : error ? (
            <div className="empty-state">
              <h3>Not found</h3>
              <p>Could not load games for @{handle}. Make sure the handle is correct.</p>
            </div>
          ) : (
            <>
              {/* Games / Lists / Activity tabs */}
              <div className="filter-tabs">
                {(['games', 'lists', 'activity', 'following'] as const).map((s) => (
                  <button
                    key={s}
                    className={`filter-tab${section === s ? ' active' : ''}`}
                    onClick={() => { setSection(s); setSelectedList(null); setActivityLimit(20) }}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>

              {section === 'lists' ? (
                selectedList ? (
                  <>
                    <div className="game-list-divider profile-lists">
                      <button
                        onClick={() => setSelectedList(null)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexShrink: 0 }}
                      >
                        <ChevronLeft size={22} style={{ color: 'var(--accent)' }} />
                      </button>
                      {selectedList.value.name}
                      <span className="game-list-divider-count">{selectedList.value.items.length}</span>
                    </div>
                    {selectedList.value.items.length === 0 ? (
                      <div className="empty-state">
                        <h3>No games yet</h3>
                        <p>This list is empty.</p>
                      </div>
                    ) : (
                      <div className="public-list-items">
                        {selectedList.value.items.map((item, i) => (
                          <div key={item.igdbId} className="game-card-grid">
                            <a href={`/games/${item.igdbId}`} style={{ display: 'block', lineHeight: 0 }}>
                              {item.coverUrl
                                ? <img src={item.coverUrl} alt={item.title} className="game-card-grid-cover" />
                                : <div className="game-card-grid-cover" />
                              }
                            </a>
                            <div className="game-card-grid-info">
                              {selectedList.value.numbered !== false && <span className="public-list-rank">#{i + 1}</span>}
                              <div className="game-card-grid-title">
                                <a href={`/games/${item.igdbId}`}>{item.title}</a>
                              </div>
                              {item.award && (
                                <div className="public-list-award">
                                  <Trophy size={12} />
                                  {item.award}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : lists.length === 0 ? (
                  <div className="empty-state">
                    <h3>No lists yet</h3>
                    <p>This user hasn't made any lists.</p>
                  </div>
                ) : (
                  <div className="lists-grid">
                    {[...lists].sort((a, b) => b.value.createdAt.localeCompare(a.value.createdAt)).map((list) => (
                      <div key={list.uri} className="list-card" onClick={() => setSelectedList(list)} style={{ cursor: 'pointer' }}>
                        <div className="list-card-covers">
                          {list.value.items.slice(0, 3).map((item) => (
                            item.coverUrl
                              ? <img key={item.igdbId} src={item.coverUrl} alt={item.title} className="list-card-cover" />
                              : <div key={item.igdbId} className="list-card-cover" />
                          ))}
                          {Array.from({ length: Math.max(0, 3 - list.value.items.length) }).map((_, i) => (
                            <div key={`empty-${i}`} className="list-card-cover" />
                          ))}
                        </div>
                        <div className="list-card-info">
                          <div className="list-card-name">{list.value.name}</div>
                          <div className="list-card-count">{list.value.items.length} game{list.value.items.length !== 1 ? 's' : ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : section === 'following' ? (
                followsLoading ? (
                  <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
                ) : !follows || follows.length === 0 ? (
                  <div className="empty-state">
                    <h3>Not following anyone</h3>
                    <p>This user isn't following anyone yet.</p>
                  </div>
                ) : (
                  <div className="game-grid">
                    {follows.map((f) => (
                      <div key={f.did} className="game-card-grid" style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
                        <a href={`/${f.handle}`} style={{ display: 'block', flexShrink: 0 }}>
                          {f.avatar
                            ? <img src={f.avatar} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
                            : <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--tertiary)' }} />
                          }
                        </a>
                        <div style={{ minWidth: 0, width: '100%' }}>
                          <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <a href={`/${f.handle}`}>{f.displayName ?? `@${f.handle}`}</a>
                          </div>
                          {f.displayName && (
                            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              @{f.handle}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : section === 'activity' ? (
                (() => {
                  type ActivityItem =
                    | { kind: 'game'; date: string; record: GameRecordView }
                    | { kind: 'list'; date: string; record: ListRecordView }
                  const activityItems: ActivityItem[] = [
                    ...games.map((r) => ({ kind: 'game' as const, date: r.value.updatedAt ?? r.value.createdAt, record: r })),
                    ...lists.map((r) => ({ kind: 'list' as const, date: r.value.createdAt, record: r })),
                  ].sort((a, b) => b.date.localeCompare(a.date))

                  return activityItems.length === 0 ? (
                    <div className="empty-state">
                      <h3>No activity yet</h3>
                      <p>Nothing here yet.</p>
                    </div>
                  ) : (
                    <>
                      <div className="social-feed">
                        {activityItems.slice(0, activityLimit).map((item, i) => (
                          <div key={i} className="feed-item" style={{ minHeight: 56 }}>
                            {item.kind === 'list' ? (
                              <>
                                <div className="feed-text">
                                  <span style={{ color: 'var(--text-muted)' }}>Created list</span>
                                  {' '}
                                  <a href={`/${resolvedHandle ?? handle}/lists/${item.record.uri.split('/').pop()}`} className="feed-game-title">{item.record.value.name}</a>
                                </div>
                                <span style={{ fontSize: '0.875rem', marginLeft: 'auto', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {relativeTime(item.date)}
                                </span>
                              </>
                            ) : (
                              <>
                                <div className="feed-text">
                                  <span style={{ color: 'var(--text-muted)' }}>
                                    {(() => { const t = feedActionText(item.record.value.status, item.record.value.playedStatus); return t.charAt(0).toUpperCase() + t.slice(1) })()}
                                  </span>
                                  {' '}
                                  <a href={`/games/${item.record.value.game.igdbId}`} className="feed-game-title">{item.record.value.game.title}</a>
                                </div>
                                <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {item.record.value.rating && <Stars rating={item.record.value.rating / 2} />}
                                  <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                    {relativeTime(item.date)}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                      {activityItems.length > activityLimit && (
                        <button className="btn btn-ghost activity-show-more" style={{ marginTop: 16, width: '100%', justifyContent: 'center' }} onClick={() => setActivityLimit(n => n + 20)}>
                          Show more
                        </button>
                      )}
                    </>
                  )
                })()
              ) : sortedGames.length === 0 ? (
                <div className="empty-state">
                  <h3>No games yet</h3>
                  <p>Nothing here yet.</p>
                </div>
              ) : (
                <div className="game-grid">
                  {ALL_STATUSES.flatMap((status) => {
                    const group = sortedGames.filter((g) => matchesStatus(g.value.status, status))
                    if (group.length === 0) return []
                    return [
                      <div key={`divider-${status}`} id={status} className="game-list-divider" style={{ scrollMarginTop: 80 }}>
                        {statusLabel(status)}
                        <span className="game-list-divider-count">{group.length}</span>
                      </div>,
                      ...group.map((record) => (
                        <GameCard key={record.uri} record={record} view={status === 'playing' ? 'started' : 'grid'} readonly />
                      )),
                    ]
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  )
}
