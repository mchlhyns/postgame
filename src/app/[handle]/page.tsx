'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { UserCheck, UserMinus, UserPlus } from 'lucide-react'
import { Agent } from '@atproto/api'
import { COLLECTION, SETTINGS_COLLECTION, LIST_COLLECTION, FOLLOW_COLLECTION, restoreSession, resolveHandleToPds } from '@/lib/atproto'
import { GameRecordView, GameRef, GameStatus, ListRecordView } from '@/types'
import { statusLabel, matchesStatus, PRIMARY_STATUSES } from '@/lib/igdb'
import GameCard from '@/components/GameCard'

const ALL_STATUSES = PRIMARY_STATUSES

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

async function fetchPublicGames(handle: string, screenshotCache: Record<number, string> = {}): Promise<{ did: string; resolvedHandle: string; records: GameRecordView[]; lists: ListRecordView[]; displayName?: string; bskyDisplayName?: string; avatar?: string; ctaAvatarUrl?: string; bannerUrl?: string; favouriteGame?: GameRef; newScreenshots: Record<number, string> }> {
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

  return { did, resolvedHandle, records: patched, lists, displayName, bskyDisplayName, avatar, ctaAvatarUrl, bannerUrl, favouriteGame, newScreenshots }
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
  const [filterStatus, setFilterStatus] = useState<GameStatus | 'all'>('all')
  const [section, setSection] = useState<'games' | 'lists'>('games')
  const [selectedList, setSelectedList] = useState<ListRecordView | null>(null)
  const [sectionDropdownOpen, setSectionDropdownOpen] = useState(false)
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const [authSession, setAuthSession] = useState<{ agent: Agent; did: string } | null>(null)
  const [profileDid, setProfileDid] = useState<string | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followUri, setFollowUri] = useState<string | null>(null)
  const [followLoading, setFollowLoading] = useState(false)
  const [followBtnHover, setFollowBtnHover] = useState(false)
  const bannerBgRef = useRef<HTMLDivElement>(null)
  const sectionDropdownRef = useRef<HTMLDivElement>(null)
  const statusDropdownRef = useRef<HTMLDivElement>(null)

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
    function handleMouseDown(e: MouseEvent) {
      if (sectionDropdownRef.current && !sectionDropdownRef.current.contains(e.target as Node)) {
        setSectionDropdownOpen(false)
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

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

    fetchPublicGames(handle, screenshotCache)
      .then(({ did, resolvedHandle, records, lists: fetchedLists, displayName, bskyDisplayName, avatar, ctaAvatarUrl, bannerUrl, favouriteGame, newScreenshots }) => {
        if (cancelled) return
        setProfileDid(did)
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

  const filteredGames = (filterStatus === 'all' ? deduped : deduped.filter((g) => matchesStatus(g.value.status, filterStatus)))
    .sort((a, b) => {
      const aDate = a.value.updatedAt ?? a.value.finishedAt ?? a.value.createdAt
      const bDate = b.value.updatedAt ?? b.value.finishedAt ?? b.value.createdAt
      return bDate.localeCompare(aDate)
    })

  const countFor = (s: string) => deduped.filter((g) => matchesStatus(g.value.status, s)).length

  return (
    <>
      <main>
        {!loading && !error && (
          <div className="profile-banner-block">
            {bannerUrl && <div ref={bannerBgRef} className="profile-banner-bg" style={{ backgroundImage: `url(${bannerUrl})` }} />}
            <div className="container profile-banner-content">
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
            </div>
          </div>
        )}
        <div className="container" style={{ position: 'relative', zIndex: 1, paddingTop: 100 }}>
          {loading ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          ) : error ? (
            <div className="empty-state">
              <h3>Not found</h3>
              <p>Could not load games for @{handle}. Make sure the handle is correct.</p>
            </div>
          ) : (
            <>
              <div className="profile-content-layout">
                {/* Sidebar */}
                <div className="profile-sidebar">
                  {/* Section dropdown */}
                  <div ref={sectionDropdownRef} style={{ position: 'relative' }} className="profile-sidebar-item">
                    <button
                      className="filter-tab active"
                      style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                      onClick={() => setSectionDropdownOpen((v) => !v)}
                    >
                      {section === 'games' ? 'Games' : 'Lists'}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: sectionDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {sectionDropdownOpen && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                        {(['games', 'lists'] as const).map((s) => (
                          <button
                            key={s}
                            className={`filter-tab${section === s ? ' active' : ''}`}
                            style={{ width: '100%', borderRadius: 0, border: 'none', textAlign: 'left' }}
                            onClick={() => { setSection(s); setSelectedList(null); setSectionDropdownOpen(false) }}
                          >
                            {s === 'games' ? 'Games' : 'Lists'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Status pills — desktop only */}
                  {section === 'games' && (
                    <div className="profile-status-pills">
                      <button
                        className={`filter-tab${filterStatus === 'all' ? ' active' : ''}`}
                        style={{ textAlign: 'left' }}
                        onClick={() => setFilterStatus('all')}
                      >
                        All ({deduped.length})
                      </button>
                      {ALL_STATUSES.filter((s) => countFor(s) > 0).map((s) => (
                        <button
                          key={s}
                          className={`filter-tab${filterStatus === s ? ' active' : ''}`}
                          style={{ textAlign: 'left' }}
                          onClick={() => setFilterStatus(s)}
                        >
                          {statusLabel(s)} ({countFor(s)})
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Status dropdown — mobile only */}
                  {section === 'games' && (
                    <div ref={statusDropdownRef} style={{ position: 'relative' }} className="profile-status-dropdown profile-sidebar-item">
                      <button
                        className="filter-tab active"
                        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                        onClick={() => setStatusDropdownOpen((v) => !v)}
                      >
                        {filterStatus === 'all' ? `All (${deduped.length})` : `${statusLabel(filterStatus as GameStatus)} (${countFor(filterStatus as GameStatus)})`}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: statusDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {statusDropdownOpen && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                          <button
                            className={`filter-tab${filterStatus === 'all' ? ' active' : ''}`}
                            style={{ width: '100%', borderRadius: 0, border: 'none', textAlign: 'left' }}
                            onClick={() => { setFilterStatus('all'); setStatusDropdownOpen(false) }}
                          >
                            All ({deduped.length})
                          </button>
                          {ALL_STATUSES.filter((s) => countFor(s) > 0).map((s) => (
                            <button
                              key={s}
                              className={`filter-tab${filterStatus === s ? ' active' : ''}`}
                              style={{ width: '100%', borderRadius: 0, border: 'none', textAlign: 'left' }}
                              onClick={() => { setFilterStatus(s); setStatusDropdownOpen(false) }}
                            >
                              {statusLabel(s)} ({countFor(s)})
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Back button when viewing a list */}
                  {section === 'lists' && selectedList && (
                    <button
                      className="filter-tab active"
                      onClick={() => setSelectedList(null)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                      All lists
                    </button>
                  )}
                </div>

                {/* Right content */}
                <div className="profile-content">
              {section === 'lists' ? (
                selectedList ? (
                  /* Inline list view */
                  selectedList.value.items.length === 0 ? (
                    <div className="empty-state">
                      <h3>No games yet</h3>
                      <p>This list is empty.</p>
                    </div>
                  ) : (
                    <>
                      <div className="game-list-divider profile-lists">
                        {selectedList.value.name}
                        <span className="game-list-divider-count">{selectedList.value.items.length}</span>
                      </div>
                      <div className="public-list-items">
                      {selectedList.value.items.map((item, i) => (
                        <div key={item.igdbId} className="public-list-item">
                          <a href={`/games/${item.igdbId}`} style={{ display: 'block', lineHeight: 0, flexShrink: 0 }}>
                            {item.coverUrl
                              ? <img src={item.coverUrl} alt={item.title} className="public-list-cover" />
                              : <div className="public-list-cover" />
                            }
                          </a>
                          <div className="public-list-meta">
                            {selectedList.value.numbered !== false && <span className="public-list-rank">#{i + 1}</span>}
                            <a href={`/games/${item.igdbId}`} className="public-list-title">{item.title}</a>
                            {item.award && <div className="public-list-award">{item.award}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                    </>
                  )
                ) : lists.length === 0 ? (
                  <div className="empty-state">
                    <h3>No lists yet</h3>
                    <p>This user hasn't made any lists.</p>
                  </div>
                ) : (
                  <div className="lists-grid">
                    {[...lists].sort((a, b) => b.value.createdAt.localeCompare(a.value.createdAt)).map((list) => (
                      <div
                        key={list.uri}
                        className="list-card"
                        onClick={() => setSelectedList(list)}
                        style={{ cursor: 'pointer' }}
                      >
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
                          <div className="list-card-count">
                            {list.value.items.length} game{list.value.items.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                filteredGames.length === 0 ? (
                  <div className="empty-state">
                    <h3>{filterStatus === 'all' ? 'No games yet' : `No ${filterStatus} games`}</h3>
                    <p>{filterStatus === 'all' ? 'Nothing here yet.' : 'Try a different filter.'}</p>
                  </div>
                ) : (
                  <div className="game-grid">
                    {filterStatus === 'all' ? ALL_STATUSES.flatMap((status) => {
                      const group = filteredGames.filter((g) => matchesStatus(g.value.status, status))
                      if (group.length === 0) return []
                      return [
                        <div key={`divider-${status}`} className="game-list-divider">
                          {statusLabel(status)}
                          <span className="game-list-divider-count">{group.length}</span>
                        </div>,
                        ...group.map((record) => (
                          <GameCard key={record.uri} record={record} view={status === 'playing' ? 'started' : 'grid'} readonly />
                        )),
                      ]
                    }) : (
                      <>
                        <div className="game-list-divider">
                          {statusLabel(filterStatus as GameStatus)}
                          <span className="game-list-divider-count">{filteredGames.length}</span>
                        </div>
                        {filteredGames.map((record) => (
                          <GameCard key={record.uri} record={record} view={filterStatus === 'playing' ? 'started' : 'grid'} readonly />
                        ))}
                      </>
                    )}
                  </div>
                )
              )}
                </div>{/* end profile-content */}
              </div>{/* end profile-content-layout */}
            </>
          )}
        </div>
      </main>
    </>
  )
}
