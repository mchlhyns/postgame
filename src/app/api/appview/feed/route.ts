import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { fetchAllGameRecords, didFromUri, HVGameRecord } from '@/lib/happyview'
import { fetchBskyProfiles, fetchCtaProfile } from '@/lib/appview-fetch'

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
      fetchAllGameRecords(),
      fetchBskyProfiles(dids),
      Promise.all(dids.map(did => fetchCtaProfile(did).then(p => ({ did, ...p })))),
    ])

    const ctaMap = new Map(ctaResults.map(p => [p.did, p]))

    // Group records by DID, filter to requested DIDs
    const byDid = new Map<string, HVGameRecord[]>()
    for (const r of allRecords) {
      const did = didFromUri(r.uri)
      if (!did || !didSet.has(did)) continue
      const existing = byDid.get(did) ?? []
      existing.push(r)
      byDid.set(did, existing)
    }

    // Deduplicate by igdbId per user: keep newest record data but sort by the
    // oldest createdAt seen for that game so edits never re-surface it in the feed.
    const feedRecords: Array<HVGameRecord & { did: string; sortAt: string }> = []
    for (const [did, records] of byDid) {
      const deduped = new Map<number, HVGameRecord & { sortAt: string }>()
      for (const r of records) {
        const existing = deduped.get(r.game.igdbId)
        if (!existing) {
          deduped.set(r.game.igdbId, { ...r, sortAt: r.createdAt })
        } else if (r.createdAt > existing.createdAt) {
          // Newer data (current status/cover) but preserve the original sort date
          deduped.set(r.game.igdbId, { ...r, sortAt: existing.sortAt })
        }
      }
      const top = [...deduped.values()]
        .sort((a, b) => b.sortAt.localeCompare(a.sortAt))
        .slice(0, 10)
      for (const r of top) feedRecords.push({ ...r, did })
    }

    feedRecords.sort((a, b) => b.sortAt.localeCompare(a.sortAt))
    const topFeed = feedRecords.slice(0, 50)

    // Build profiles for all requested DIDs (not just those with records)
    const profiles = dids.map(did => {
      const bsky = bskyProfiles.get(did)
      if (!bsky) return null
      const cta = ctaMap.get(did)
      return {
        did,
        handle: bsky.handle,
        displayName: cta?.displayName || bsky.displayName || null,
        avatar: cta?.avatarUrl || bsky.avatar || null,
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
        playedStatus: r.playedStatus ?? null,
        rating: r.rating,
        platform: r.platform ?? null,
        createdAt: r.createdAt,
      }
    }).filter(r => r.handle && r.handle !== 'handle.invalid' && !r.handle.endsWith('.invalid'))

    return NextResponse.json({ feed, profiles })
  } catch (err) {
    console.error('Feed error:', err)
    return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 })
  }
}
