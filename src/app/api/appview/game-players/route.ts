import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { fetchAllGameRecords, didFromUri, HVGameRecord } from '@/lib/happyview'
import { fetchBskyProfiles, fetchCtaProfile } from '@/lib/appview-fetch'

export async function GET(req: NextRequest) {
  if (!rateLimit(`game-players:${getClientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const igdbId = Number(req.nextUrl.searchParams.get('igdbId'))
  if (!igdbId) return NextResponse.json({ error: 'igdbId required' }, { status: 400 })

  try {
    const all = await fetchAllGameRecords()

    const byDid = new Map<string, HVGameRecord>()
    for (const r of all) {
      if (r.game.igdbId !== igdbId) continue
      const did = didFromUri(r.uri)
      if (!did) continue
      const existing = byDid.get(did)
      if (!existing || r.createdAt > existing.createdAt) byDid.set(did, r)
    }

    if (byDid.size === 0) return NextResponse.json({ players: [] })

    const dids = [...byDid.keys()]

    const [bskyProfiles, ctaProfiles] = await Promise.all([
      fetchBskyProfiles(dids),
      Promise.all(dids.map(did => fetchCtaProfile(did).then(p => ({ did, avatarUrl: p.avatarUrl ?? null })))),
    ])

    const ctaAvatarMap = new Map(ctaProfiles.map(({ did, avatarUrl }) => [did, avatarUrl]))

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
