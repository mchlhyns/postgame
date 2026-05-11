import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const HAPPYVIEW_URL = process.env.HAPPYVIEW_URL!
const HAPPYVIEW_KEY = process.env.HAPPYVIEW_CLIENT_KEY!
const BSKY_API = 'https://public.api.bsky.app/xrpc'
const SETTINGS_COLLECTION = 'com.crashthearcade.settings'

type HappyViewRecord = {
  uri: string
  game: { igdbId: number }
  status: string
  createdAt: string
}

function didFromUri(uri: string): string | null {
  return uri.match(/^at:\/\/(did:[^/]+)\//)?.[1] ?? null
}

async function fetchAllRecords(): Promise<HappyViewRecord[]> {
  const records: HappyViewRecord[] = []
  let cursor: string | undefined
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
  } while (cursor)
  return records
}

async function resolvePds(did: string): Promise<string> {
  try {
    const docUrl = did.startsWith('did:web:')
      ? `https://${did.slice('did:web:'.length)}/.well-known/did.json`
      : `https://plc.directory/${did}`
    const res = await fetch(docUrl)
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

async function fetchCtaAvatar(did: string): Promise<string | null> {
  try {
    const pdsUrl = await resolvePds(did)
    const res = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${SETTINGS_COLLECTION}&rkey=self`
    )
    if (!res.ok) return null
    const { value } = await res.json()
    return value?.avatarBlob ? blobUrl(pdsUrl, did, value.avatarBlob) : null
  } catch {
    return null
  }
}

async function fetchBskyProfiles(dids: string[]): Promise<Map<string, { handle: string; displayName?: string; avatar?: string }>> {
  const map = new Map<string, { handle: string; displayName?: string; avatar?: string }>()
  for (let i = 0; i < dids.length; i += 25) {
    const batch = dids.slice(i, i + 25)
    const params = batch.map(d => `actors[]=${encodeURIComponent(d)}`).join('&')
    try {
      const res = await fetch(`${BSKY_API}/app.bsky.actor.getProfiles?${params}`)
      if (!res.ok) continue
      const data = await res.json()
      for (const p of data.profiles ?? []) {
        map.set(p.did, { handle: p.handle, displayName: p.displayName, avatar: p.avatar })
      }
    } catch {}
  }
  return map
}

export async function GET(req: NextRequest) {
  if (!rateLimit(`game-players:${getClientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const igdbId = Number(req.nextUrl.searchParams.get('igdbId'))
  if (!igdbId) return NextResponse.json({ error: 'igdbId required' }, { status: 400 })

  try {
    const all = await fetchAllRecords()

    const byDid = new Map<string, HappyViewRecord>()
    for (const r of all) {
      if (r.game.igdbId !== igdbId) continue
      const did = didFromUri(r.uri)
      if (!did) continue
      const existing = byDid.get(did)
      if (!existing || r.createdAt > existing.createdAt) byDid.set(did, r)
    }

    if (byDid.size === 0) return NextResponse.json({ players: [] })

    const dids = [...byDid.keys()]

    const [bskyProfiles, ctaAvatars] = await Promise.all([
      fetchBskyProfiles(dids),
      Promise.all(dids.map(did => fetchCtaAvatar(did).then(url => ({ did, url })))),
    ])

    const ctaAvatarMap = new Map(ctaAvatars.map(({ did, url }) => [did, url]))

    const players = dids
      .map(did => {
        const bsky = bskyProfiles.get(did)
        if (!bsky) return null
        return {
          did,
          handle: bsky.handle,
          displayName: bsky.displayName,
          avatar: ctaAvatarMap.get(did) ?? bsky.avatar ?? null,
          status: byDid.get(did)?.status,
        }
      })
      .filter(Boolean)

    return NextResponse.json({ players }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  } catch (err) {
    console.error('game-players error:', err)
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 })
  }
}
