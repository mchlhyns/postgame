import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { fetchAllGameRecords, didFromUri, HVGameRecord } from '@/lib/happyview'

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

function extractCid(ref: unknown): string | null {
  if (!ref) return null
  if (typeof (ref as any)['$link'] === 'string') return (ref as any)['$link']
  if (typeof (ref as any)['/'] === 'string') return (ref as any)['/']
  const s = (ref as any).toString?.()
  if (typeof s === 'string' && s !== '[object Object]') return s
  return null
}

async function fetchCtaAvatars(dids: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  await Promise.all(dids.map(async (did) => {
    try {
      let pdsUrl = 'https://bsky.social'
      let didDocUrl: string
      if (did.startsWith('did:web:')) {
        const host = did.slice('did:web:'.length).split(':')[0]
        if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
          map.set(did, null); return
        }
        didDocUrl = `https://${host}/.well-known/did.json`
      } else {
        didDocUrl = `https://plc.directory/${did}`
      }

      const didRes = await fetch(didDocUrl)
      if (didRes.ok) {
        const didDoc = await didRes.json()
        const pdsService = didDoc.service?.find(
          (s: { id: string; serviceEndpoint: string }) => s.id === '#atproto_pds'
        )
        if (pdsService?.serviceEndpoint) {
          const endpoint = new URL(pdsService.serviceEndpoint)
          if (endpoint.protocol === 'https:') pdsUrl = pdsService.serviceEndpoint
        }
      }

      const settingsRes = await fetch(
        `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=com.crashthearcade.settings&rkey=self`
      )
      if (!settingsRes.ok) { map.set(did, null); return }

      const settings = await settingsRes.json()
      const blob = settings.value?.avatarBlob
      const cid = extractCid(blob?.ref)
      map.set(did, cid ? `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}` : null)
    } catch {
      map.set(did, null)
    }
  }))
  return map
}

export async function GET(req: NextRequest) {
  if (!rateLimit(`appview-network:${getClientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const allRecords = await fetchAllGameRecords()

    // Group by DID, deduplicate by igdbId (most recent per user per game), cap at 5 per user
    const byDid = new Map<string, HVGameRecord[]>()
    for (const r of allRecords) {
      const did = didFromUri(r.uri)
      if (!did) continue
      const existing = byDid.get(did) ?? []
      existing.push(r)
      byDid.set(did, existing)
    }

    const feedRecords: Array<HVGameRecord & { did: string }> = []
    for (const [did, records] of byDid) {
      const deduped = new Map<number, HVGameRecord>()
      for (const r of records) {
        const existing = deduped.get(r.game.igdbId)
        if (!existing || r.createdAt > existing.createdAt) deduped.set(r.game.igdbId, r)
      }
      const top = [...deduped.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5)
      for (const r of top) feedRecords.push({ ...r, did })
    }

    feedRecords.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const topFeed = feedRecords.slice(0, 50)

    const uniqueDids = [...new Set(topFeed.map(r => r.did))]
    const [profiles, ctaAvatars] = await Promise.all([
      fetchBskyProfiles(uniqueDids),
      fetchCtaAvatars(uniqueDids),
    ])

    const feed = topFeed.map(r => {
      const p = profiles.get(r.did)
      return {
        did: r.did,
        handle: p?.handle ?? '',
        displayName: p?.displayName ?? null,
        avatar: ctaAvatars.get(r.did) ?? p?.avatar ?? null,
        gameTitle: r.game.title,
        gameCoverUrl: r.game.coverUrl ?? null,
        igdbId: r.game.igdbId,
        status: r.status,
        rating: r.rating,
        createdAt: r.createdAt,
      }
    }).filter(r => r.handle)

    return NextResponse.json({ feed })
  } catch (err) {
    console.error('Network feed error:', err)
    return NextResponse.json({ error: 'Failed to fetch network feed' }, { status: 500 })
  }
}
