import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const HAPPYVIEW_URL = process.env.HAPPYVIEW_URL!
const HAPPYVIEW_KEY = process.env.HAPPYVIEW_CLIENT_KEY!
const SETTINGS_COLLECTION = 'com.crashthearcade.settings'

type HVRecord = {
  uri: string
  game: { igdbId: number; title: string; coverUrl?: string }
  status: string
  rating?: number
  createdAt: string
}

function didFromUri(uri: string): string | null {
  return uri.match(/^at:\/\/(did:[^/]+)\//)?.[1] ?? null
}

async function fetchAllHVRecords(): Promise<HVRecord[]> {
  const records: HVRecord[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    const url = new URL(`${HAPPYVIEW_URL}/xrpc/com.crashthearcade.getGames`)
    url.searchParams.set('limit', '100')
    if (cursor) url.searchParams.set('cursor', cursor)
    const res = await fetch(url.toString(), {
      headers: { 'X-Client-Key': HAPPYVIEW_KEY },
      next: { revalidate: 300 },
    })
    if (!res.ok) break
    const data = await res.json()
    records.push(...(data.records ?? []))
    cursor = data.cursor && data.records?.length === 100 ? data.cursor : undefined
    pages++
  } while (cursor && pages < 200)
  return records
}

async function fetchBskyProfiles(dids: string[]) {
  const map = new Map<string, { handle: string; displayName?: string; avatar?: string }>()
  for (let i = 0; i < dids.length; i += 25) {
    const batch = dids.slice(i, i + 25)
    const params = batch.map(d => `actors=${encodeURIComponent(d)}`).join('&')
    try {
      const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?${params}`)
      if (!res.ok) continue
      const data = await res.json()
      for (const p of data.profiles ?? []) {
        map.set(p.did, { handle: p.handle, displayName: p.displayName, avatar: p.avatar })
      }
    } catch {}
  }
  return map
}

async function resolvePds(did: string): Promise<string> {
  try {
    const docUrl = did.startsWith('did:web:')
      ? `https://${did.slice('did:web:'.length)}/.well-known/did.json`
      : `https://plc.directory/${did}`
    const res = await fetch(docUrl, { next: { revalidate: 3600 } })
    if (!res.ok) return 'https://bsky.social'
    const doc = await res.json()
    const svc = doc.service?.find((s: { id: string; serviceEndpoint: string }) => s.id === '#atproto_pds')
    const url = svc?.serviceEndpoint
    return url?.startsWith('https://') ? url : 'https://bsky.social'
  } catch {
    return 'https://bsky.social'
  }
}

function blobUrl(pdsUrl: string, did: string, blob: unknown): string | null {
  const cid = (blob as { ref?: { $link?: string }; cid?: string })?.ref?.$link ?? (blob as { cid?: string })?.cid
  if (!cid) return null
  return `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
}

async function fetchCtaProfile(did: string): Promise<{ displayName?: string; avatarUrl?: string }> {
  try {
    const pdsUrl = await resolvePds(did)
    const res = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${SETTINGS_COLLECTION}&rkey=self`,
      { next: { revalidate: 300 } }
    )
    if (!res.ok) return {}
    const { value } = await res.json()
    return {
      displayName: value?.displayName,
      avatarUrl: value?.avatarBlob ? blobUrl(pdsUrl, did, value.avatarBlob) ?? undefined : undefined,
    }
  } catch {
    return {}
  }
}

export async function GET(req: NextRequest) {
  if (!rateLimit(`appview-feed:${getClientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const dids = req.nextUrl.searchParams.getAll('dids')
  if (!dids.length) return NextResponse.json({ feed: [], profiles: [] })
  if (dids.length > 100) return NextResponse.json({ error: 'Too many DIDs' }, { status: 400 })

  try {
    const didSet = new Set(dids)

    const [allRecords, bskyProfiles, ctaResults] = await Promise.all([
      fetchAllHVRecords(),
      fetchBskyProfiles(dids),
      Promise.all(dids.map(did => fetchCtaProfile(did).then(p => ({ did, ...p })))),
    ])

    const ctaMap = new Map(ctaResults.map(p => [p.did, p]))

    // Group records by DID, filter to requested DIDs
    const byDid = new Map<string, HVRecord[]>()
    for (const r of allRecords) {
      const did = didFromUri(r.uri)
      if (!did || !didSet.has(did)) continue
      const existing = byDid.get(did) ?? []
      existing.push(r)
      byDid.set(did, existing)
    }

    // Deduplicate by igdbId per user (most recent), take top 10 per user
    const feedRecords: Array<HVRecord & { did: string }> = []
    for (const [did, records] of byDid) {
      const deduped = new Map<number, HVRecord>()
      for (const r of records) {
        const existing = deduped.get(r.game.igdbId)
        if (!existing || r.createdAt > existing.createdAt) deduped.set(r.game.igdbId, r)
      }
      const top = [...deduped.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 10)
      for (const r of top) feedRecords.push({ ...r, did })
    }

    feedRecords.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const topFeed = feedRecords.slice(0, 50)

    // Build profiles for all requested DIDs (not just those with records)
    const profiles = dids.map(did => {
      const bsky = bskyProfiles.get(did)
      if (!bsky) return null
      const cta = ctaMap.get(did)
      return {
        did,
        handle: bsky.handle,
        displayName: cta?.displayName ?? bsky.displayName ?? null,
        avatar: cta?.avatarUrl ?? bsky.avatar ?? null,
      }
    }).filter(Boolean)

    const profileMap = new Map(profiles.map(p => [p!.did, p!]))

    const feed = topFeed.map(r => {
      const profile = profileMap.get(r.did)
      return {
        did: r.did,
        handle: profile?.handle ?? '',
        displayName: profile?.displayName ?? null,
        avatar: profile?.avatar ?? null,
        gameTitle: r.game.title,
        gameCoverUrl: r.game.coverUrl ?? null,
        igdbId: r.game.igdbId,
        status: r.status,
        rating: r.rating,
        createdAt: r.createdAt,
      }
    })

    return NextResponse.json({ feed, profiles })
  } catch (err) {
    console.error('Feed error:', err)
    return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 })
  }
}
