'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ChevronLeft, Trophy, UserCheck, UserMinus, UserPlus } from 'lucide-react'
import { Agent } from '@atproto/api'
import { COLLECTION, SETTINGS_COLLECTION, LIST_COLLECTION, FOLLOW_COLLECTION, restoreSession, resolveHandleToPds } from '@/lib/atproto'
import { GameRecordView, GameRef, ListRecordView } from '@/types'
import { statusLabel, matchesStatus, PRIMARY_STATUSES } from '@/lib/igdb'
import GameCard from '@/components/GameCard'
import ParallaxBannerImg from '@/components/ParallaxBannerImg'
import { Stars } from '@/components/Stars'
import { extractCid, blobUrl, resolvePds, bskyAvatar } from '@/lib/appview-fetch'
import { relativeTime } from '@/lib/feed'

const ALL_STATUSES = PRIMARY_STATUSES


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
        case 'mastered': return 'mastered'
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

function getBlogPostUrl(docValue: any, publicationValue: any): string {
  const path = docValue.path || ''
  const domain = publicationValue?.domain || publicationValue?.url || ''
  if (!domain) return 'https://bsky.app'
  const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `https://${cleanDomain}${cleanPath}`
}

async function fetchPublicGames(handle: string, screenshotCache: Record<number, string> = {}): Promise<{ did: string; pdsUrl: string; resolvedHandle: string; records: GameRecordView[]; lists: ListRecordView[]; displayName?: string; bskyDisplayName?: string; avatar?: string; ctaAvatarUrl?: string; bannerUrl?: string; favouriteGame?: GameRef; pronouns?: string; blogPublicationUri?: string; blogTag?: string; newScreenshots: Record<number, string> }> {
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
  let pronouns: string | undefined
  let blogPublicationUri: string | undefined
  let blogTag: string | undefined
  if (settingsRes.ok) {
    const settings = await settingsRes.json()
    displayName = settings.value?.displayName
    if (settings.value?.avatarBlob) ctaAvatarUrl = blobUrl(pdsUrl, did, settings.value.avatarBlob) ?? undefined
    if (settings.value?.bannerBlob) bannerUrl = blobUrl(pdsUrl, did, settings.value.bannerBlob) ?? undefined
    if (settings.value?.favouriteGame) favouriteGame = settings.value.favouriteGame
    if (settings.value?.pronouns) pronouns = settings.value.pronouns
    blogPublicationUri = settings.value?.blogPublicationUri
    blogTag = settings.value?.blogTag
  }

  let bskyDisplayName: string | undefined
  let avatar: string | undefined
  let bskyBannerUrl: string | undefined
  if (profileRes.ok) {
    const profile = await profileRes.json()
    bskyDisplayName = profile.displayName
    avatar = profile.avatar
    bskyBannerUrl = profile.banner
  }

  return { did, pdsUrl, resolvedHandle, records: patched, lists, displayName, bskyDisplayName, avatar, ctaAvatarUrl, bannerUrl: bannerUrl ?? bskyBannerUrl, favouriteGame, pronouns, blogPublicationUri, blogTag, newScreenshots }
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
  const [pronouns, setPronouns] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [section, setSection] = useState<'overview' | 'games' | 'lists' | 'activity' | 'following' | 'blog'>('overview')
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
  
  const [blogPublicationUri, setBlogPublicationUri] = useState<string | null>(null)
  const [blogTag, setBlogTag] = useState<string | null>(null)
  const [blogPosts, setBlogPosts] = useState<any[]>([])
  const [blogLoading, setBlogLoading] = useState(false)
  const [publicationValue, setPublicationValue] = useState<any>(null)
  const [favScreenshotUrl, setFavScreenshotUrl] = useState<string | null>(null)

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
      .then(({ did, pdsUrl, resolvedHandle, records, lists: fetchedLists, displayName, bskyDisplayName, avatar, ctaAvatarUrl, bannerUrl, favouriteGame, pronouns, blogPublicationUri, blogTag, newScreenshots }) => {
        if (cancelled) return
        setProfileDid(did)
        setProfilePdsUrl(pdsUrl)
        setResolvedHandle(resolvedHandle)
        setDisplayName(displayName || bskyDisplayName || null)
        setAvatar(ctaAvatarUrl || avatar || null)
        setBannerUrl(bannerUrl ?? null)
        setLists(fetchedLists)
        setFavouriteGame(favouriteGame ?? null)
        setFavScreenshotUrl(null)
        if (favouriteGame?.igdbId) {
          const cached = newScreenshots[favouriteGame.igdbId] ?? screenshotCache[favouriteGame.igdbId]
          if (cached) {
            if (!cancelled) setFavScreenshotUrl(cached)
          } else {
            fetch(`/api/igdb/screenshots?ids=${favouriteGame.igdbId}`)
              .then(r => r.ok ? r.json() : null)
              .then(data => { if (!cancelled && data?.[favouriteGame.igdbId]) setFavScreenshotUrl(data[favouriteGame.igdbId]) })
              .catch(() => {})
          }
        }
        setPronouns(pronouns ?? null)
        setBlogPublicationUri(blogPublicationUri ?? null)
        setBlogTag(blogTag ?? null)
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
    if (!profileDid || !profilePdsUrl || !blogPublicationUri) {
      setBlogPosts([])
      setPublicationValue(null)
      return
    }

    let cancelled = false
    setBlogLoading(true)

    async function loadBlog() {
      try {
        // 1. Fetch publication record
        const pubRkey = blogPublicationUri!.split('/').pop()!
        const pubRes = await fetch(
          `${profilePdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(profileDid!)}&collection=site.standard.publication&rkey=${encodeURIComponent(pubRkey)}`
        )
        let pubVal = null
        if (pubRes.ok) {
          const pubData = await pubRes.json()
          if (!cancelled) {
            pubVal = pubData.value
            setPublicationValue(pubVal)
          }
        }

        // 2. Fetch documents (cap at 20 pages / ~2000 posts)
        let posts: any[] = []
        let cursor: string | undefined
        let page = 0
        do {
          const url = `${profilePdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(profileDid!)}&collection=site.standard.document&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
          const res = await fetch(url)
          if (!res.ok) break
          const data = await res.json()
          posts = [...posts, ...(data.records ?? [])]
          cursor = data.cursor
          page++
        } while (cursor && page < 20)

        if (cancelled) return

        // Filter posts
        const filtered = posts.filter((post: any) => {
          const val = post.value
          if (!val) return false
          if (val.site !== blogPublicationUri) return false
          if (blogTag) {
            const tags: string[] = val.tags || []
            const matchTag = blogTag.trim().toLowerCase()
            const hasTag = tags.some((t: string) => t.toLowerCase() === matchTag)
            if (!hasTag) return false
          }
          return true
        })

        // Sort posts descending by publishedAt, updatedAt, or createdAt
        filtered.sort((a: any, b: any) => {
          const aDate = a.value?.publishedAt || a.value?.updatedAt || a.value?.createdAt || ''
          const bDate = b.value?.publishedAt || b.value?.updatedAt || b.value?.createdAt || ''
          return bDate.localeCompare(aDate)
        })

        if (!cancelled) {
          setBlogPosts(filtered)
        }
      } catch (err) {
        console.error('Failed to load blog:', err)
      } finally {
        if (!cancelled) {
          setBlogLoading(false)
        }
      }
    }

    loadBlog()

    return () => {
      cancelled = true
    }
  }, [profileDid, profilePdsUrl, blogPublicationUri, blogTag])

  useEffect(() => {
    if (section !== 'following' || follows !== null || !profileDid || !profilePdsUrl) return
    setFollowsLoading(true)
    ;(async () => {
      try {
        const res = await fetch(`${profilePdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(profileDid)}&collection=${encodeURIComponent(FOLLOW_COLLECTION)}&limit=100`)
        if (!res.ok) { setFollows([]); return }
        const data = await res.json()
        const rawRecords: { value: { subject: string; createdAt: string } }[] = data.records ?? []
        const followedAt = new Map(rawRecords.map(r => [r.value.subject, r.value.createdAt]))
        const subjectDids: string[] = rawRecords.map(r => r.value.subject)
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
            const pds = await resolvePds(did)
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
          return [{ did, handle: bsky.handle, displayName: cta?.displayName || bsky.displayName, avatar: cta?.avatarUrl || bsky.avatar }]
        })
        setFollows(profiles.sort((a, b) => (followedAt.get(b.did) ?? '').localeCompare(followedAt.get(a.did) ?? '')))
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

  type ActivityItem =
    | { kind: 'game'; date: string; record: GameRecordView }
    | { kind: 'list'; date: string; record: ListRecordView }
  const activityItems: ActivityItem[] = [
    ...games.map((r) => ({ kind: 'game' as const, date: r.value.updatedAt ?? r.value.createdAt, record: r })),
    ...lists.map((r) => ({ kind: 'list' as const, date: r.value.createdAt, record: r })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  const playingGames = sortedGames.filter((g) => matchesStatus(g.value.status, 'playing'))
  const newestBlogPost = blogPosts[0] ?? null

  return (
    <>
      <main>
        {!loading && !error && (
          <div className="profile-banner-block" style={{ position: 'relative' }}>
            <ParallaxBannerImg className="profile-banner-img" url={bannerUrl} />
            <img src="/logo.svg" alt="postgame" className="mobile-banner-logo" />
            <div className="container profile-banner-content">
              <div style={{ position: 'relative', height: 72, flexShrink: 0 }}>
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
                <h1 style={{ fontSize: 'var(--text-2xl)', lineHeight: 1.2, fontWeight: 900, margin: '0' }}>{displayName ? (displayName.length > 30 ? displayName.slice(0, 30) + '…' : displayName) : `@${resolvedHandle ?? handle}`}</h1>
                {(displayName || pronouns) && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base)' }}>
                    {displayName && `@${resolvedHandle ?? handle}`}
                    {displayName && pronouns && ' • '}
                    {pronouns}
                  </p>
                )}
              </div>
              <div className="profile-stats" style={{ marginLeft: 'auto', gap: 32, flexShrink: 0 }}>
                {([
                  { label: 'Playing', status: 'playing' },
                  { label: 'Backlogged', status: 'backlogged' },
                  { label: 'Wishlisted', status: 'wishlisted' },
                  { label: 'Played', status: 'played' },
                ] as const).flatMap(({ label, status }) => {
                  const count = deduped.filter(g => matchesStatus(g.value.status, status)).length
                  if (count === 0) return []
                  return [(
                    <button
                      key={status}
                      style={{ textAlign: 'right', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
                      onClick={() => {
                        setSection('games')
                        setSelectedList(null)
                        setTimeout(() => document.getElementById(status)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
                      }}
                    >
                      <div className="profile-stat-count">{count}</div>
                      <div className="profile-stat-label">{label}</div>
                    </button>
                  )]
                })}
              </div>
            </div>
          </div>
        )}
        <div className="container" style={{ paddingTop: 32 }}>
          {loading ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          ) : error ? (
            <div className="empty-state">
              <h3>Not found</h3>
              <p>Could not load games for @{handle}. Make sure the handle is correct.</p>
            </div>
          ) : (
            <>
              {/* Overview / Games / Lists / Activity / Following / Posts tabs */}
              <div className="filter-tabs">
                {(blogPublicationUri
                  ? ['overview', 'games', 'lists', 'blog', 'activity', 'following'] as const
                  : ['overview', 'games', 'lists', 'activity', 'following'] as const
                ).map((s) => (
                  <button
                    key={s}
                    className={`filter-tab${section === s ? ' active' : ''}`}
                    onClick={() => { setSection(s as any); setSelectedList(null); setActivityLimit(20) }}
                  >
                    {s === 'blog' ? 'Posts' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>

              {section === 'overview' ? (
                <div className="profile-overview">
                  {/* Standard site: playing now + latest post side by side */}
                  {blogPublicationUri && playingGames.length > 0 && (
                    <section className="profile-overview-section">
                      {newestBlogPost ? (
                        <div className="profile-overview-highlight-row">
                          <div className="profile-overview-playing">
                            <h2 className="home-section-title">Playing now</h2>
                            <GameCard record={playingGames[0]} view="started" readonly />
                          </div>
                          {(() => {
                            const postUrl = getBlogPostUrl(newestBlogPost.value, publicationValue)
                            const pubDate = newestBlogPost.value.publishedAt
                              ? new Date(newestBlogPost.value.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
                              : null
                            const coverUrl = newestBlogPost.value.coverImage && profilePdsUrl && profileDid
                              ? blobUrl(profilePdsUrl, profileDid, newestBlogPost.value.coverImage)
                              : null
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <h2 className="home-section-title">Latest post</h2>
                                <div className="blog-post-card" style={{ flex: 1 }}>
                                  <div className="blog-post-card-body">
                                    <div className="blog-post-card-header">
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <h3 style={{ margin: 0 }}>
                                          <a href={postUrl} target="_blank" rel="noopener noreferrer" className="blog-post-title-link">
                                            {newestBlogPost.value.title}
                                          </a>
                                        </h3>
                                        {pubDate && <div className="blog-post-date">{pubDate}</div>}
                                      </div>
                                      {coverUrl && <img src={coverUrl} alt="" className="blog-post-thumbnail" />}
                                    </div>
                                  </div>
                                  <div className="blog-post-card-footer">
                                    <a href={postUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ display: 'inline-flex', width: '100%', justifyContent: 'center' }}>
                                      Read post
                                    </a>
                                  </div>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      ) : (
                        <div className="profile-overview-playing">
                          <h2 className="home-section-title">Playing now</h2>
                          <GameCard record={playingGames[0]} view="started" readonly />
                        </div>
                      )}
                    </section>
                  )}

                  {/* No Standard site: up to 3 playing games in 2fr 1fr 1fr grid */}
                  {!blogPublicationUri && playingGames.length > 0 && (
                    <section className="profile-overview-section">
                      <h2 className="home-section-title">Playing now</h2>
                      {playingGames.length === 1 ? (
                        <div className="profile-overview-playing">
                          <GameCard record={playingGames[0]} view="started" readonly />
                        </div>
                      ) : (
                        <div className="profile-overview-playing-grid">
                          <div className="profile-overview-playing">
                            <GameCard record={playingGames[0]} view="started" readonly />
                          </div>
                          {playingGames[1] && <GameCard record={playingGames[1]} view="grid" readonly />}
                          {playingGames[2] && <GameCard record={playingGames[2]} view="grid" readonly />}
                        </div>
                      )}
                    </section>
                  )}

                  {activityItems.length > 0 && (
                    <section className="profile-overview-section">
                      <h2 className="home-section-title">Recent activity</h2>
                      <div className="social-feed">
                        {activityItems.slice(0, 10).map((item, i) => (
                          <div key={i} className="feed-item">
                            {item.kind === 'list' ? (
                              <>
                                <div className="feed-main">
                                  <span className="feed-status">Created list</span>
                                  <a href={`/${resolvedHandle ?? handle}/lists/${item.record.uri.split('/').pop()}`} className="feed-game-title">{item.record.value.name}</a>
                                </div>
                                <span className="feed-item-time">{relativeTime(item.date)}</span>
                              </>
                            ) : (
                              <>
                                <div className="feed-main">
                                  <span className="feed-status">
                                    {(() => { const t = feedActionText(item.record.value.status, item.record.value.playedStatus); return t.charAt(0).toUpperCase() + t.slice(1) })()}
                                  </span>
                                  <a href={`/games/${item.record.value.game.igdbId}`} className="feed-game-title">{item.record.value.game.title}</a>
                                  {item.record.value.rating && <Stars rating={item.record.value.rating / 2} />}
                                </div>
                                <span className="feed-item-time">{relativeTime(item.date)}</span>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {playingGames.length === 0 && activityItems.length === 0 && (
                    <div className="empty-state">
                      <h3>Nothing here yet</h3>
                      <p>This user hasn't added any games.</p>
                    </div>
                  )}
                </div>
              ) : section === 'blog' ? (
                blogLoading ? (
                  <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
                ) : blogPosts.length === 0 ? (
                  <div className="empty-state">
                    <h3>No posts yet</h3>
                    <p>This blog doesn't have any posts yet.</p>
                  </div>
                ) : (
                  <div className="blog-posts-grid">
                    {blogPosts.map((post) => {
                      const postUrl = getBlogPostUrl(post.value, publicationValue)
                      const pubDate = post.value.publishedAt
                        ? new Date(post.value.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
                        : null
                      const coverUrl = post.value.coverImage && profilePdsUrl && profileDid
                        ? blobUrl(profilePdsUrl, profileDid, post.value.coverImage)
                        : null
                      return (
                        <div key={post.uri} className="blog-post-card">
                          <div className="blog-post-card-body">
                            <div className="blog-post-card-header">
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <h3 style={{ margin: 0 }}>
                                  <a href={postUrl} target="_blank" rel="noopener noreferrer" className="blog-post-title-link">
                                    {post.value.title}
                                  </a>
                                </h3>
                                {pubDate && <div className="blog-post-date">{pubDate}</div>}
                              </div>
                              {coverUrl && <img src={coverUrl} alt="" className="blog-post-thumbnail" />}
                            </div>
                          </div>
                          <div className="blog-post-card-footer">
                            <a href={postUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ display: 'inline-flex', width: '100%', justifyContent: 'center' }}>
                              Read post
                            </a>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              ) : section === 'lists' ? (
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
                  <div className="lists-community-grid">
                    {[...lists].sort((a, b) => b.value.createdAt.localeCompare(a.value.createdAt)).map((list) => (
                      <div key={list.uri} className="game-card-grid" onClick={() => setSelectedList(list)} style={{ cursor: 'pointer' }}>
                        <div
                          className="game-card-grid-cover-wrap"
                          style={{
                            background: 'var(--tertiary)',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            padding: '24px',
                            aspectRatio: 'unset',
                          }}
                        >
                          <div className="list-card-covers">
                            {list.value.items.slice(0, 5).map((item) => (
                              <img key={item.igdbId} src={item.coverUrl || '/no-cover.png'} alt={item.title} className="list-card-cover" />
                            ))}
                            {Array.from({ length: Math.max(0, 3 - list.value.items.length) }).map((_, i) => (
                              <div key={`empty-${i}`} className="list-card-cover" />
                            ))}
                          </div>
                        </div>
                        <div className="game-card-grid-info" style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
                          <div className="game-card-grid-title" style={{ fontSize: 'var(--text-base)', fontWeight: 900 }}>
                            {list.value.name}
                          </div>
                          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontFamily: 'Fustat, system-ui, -apple-system, sans-serif' }}>
                            {list.value.items.length} game{list.value.items.length !== 1 ? 's' : ''}
                          </div>
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
                            ? <img src={bskyAvatar(f.avatar)} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', display: 'block', border: '2px solid var(--border)' }} />
                            : <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--tertiary)', border: '2px solid var(--border)' }} />
                          }
                        </a>
                        <div style={{ minWidth: 0, width: '100%' }}>
                          <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <a href={`/${f.handle}`}>{f.displayName || `@${f.handle}`}</a>
                          </div>
                          {f.displayName && (
                            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                  return activityItems.length === 0 ? (
                    <div className="empty-state">
                      <h3>No activity yet</h3>
                      <p>Nothing here yet.</p>
                    </div>
                  ) : (
                    <>
                      <div className="social-feed">
                        {activityItems.slice(0, activityLimit).map((item, i) => (
                          <div key={i} className="feed-item">
                            {item.kind === 'list' ? (
                              <>
                                <div className="feed-main">
                                  <span className="feed-status">Created list</span>
                                  <a href={`/${resolvedHandle ?? handle}/lists/${item.record.uri.split('/').pop()}`} className="feed-game-title">{item.record.value.name}</a>
                                </div>
                                <span className="feed-item-time">{relativeTime(item.date)}</span>
                              </>
                            ) : (
                              <>
                                <div className="feed-main">
                                  <span className="feed-status">
                                    {(() => { const t = feedActionText(item.record.value.status, item.record.value.playedStatus); return t.charAt(0).toUpperCase() + t.slice(1) })()}
                                  </span>
                                  <a href={`/games/${item.record.value.game.igdbId}`} className="feed-game-title">{item.record.value.game.title}</a>
                                  {item.record.value.rating && <Stars rating={item.record.value.rating / 2} />}
                                </div>
                                <span className="feed-item-time">{relativeTime(item.date)}</span>
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
                <div className="game-grid profile-game-grid">
                  {ALL_STATUSES.flatMap((status) => {
                    const group = sortedGames.filter((g) => matchesStatus(g.value.status, status))
                    if (group.length === 0) return []
                    return [
                      <div key={`divider-${status}`} id={status} className="game-list-divider" style={{ scrollMarginTop: 80 }}>
                        {statusLabel(status)}
                      </div>,
                      ...group.map((record) => (
                        <GameCard key={record.uri} record={record} view="grid" readonly />
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
