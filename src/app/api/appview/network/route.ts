import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { fetchAllGameRecords, didFromUri, HVGameRecord } from '@/lib/happyview'
import { fetchBskyProfiles, fetchCtaProfile } from '@/lib/appview-fetch'

async function fetchCtaAvatars(dids: string[]): Promise<Map<string, string | null>> {
  const results = await Promise.all(dids.map(async (did) => {
    const profile = await fetchCtaProfile(did)
    return [did, profile.avatarUrl ?? null] as const
  }))
  return new Map(results)
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

    const feedRecords: Array<HVGameRecord & { did: string; sortAt: string }> = []
    for (const [did, records] of byDid) {
      const deduped = new Map<number, HVGameRecord & { sortAt: string }>()
      for (const r of records) {
        const existing = deduped.get(r.game.igdbId)
        if (!existing) {
          deduped.set(r.game.igdbId, { ...r, sortAt: r.createdAt })
        } else if (r.createdAt > existing.createdAt) {
          deduped.set(r.game.igdbId, { ...r, sortAt: existing.sortAt })
        }
      }
      const top = [...deduped.values()]
        .sort((a, b) => b.sortAt.localeCompare(a.sortAt))
        .slice(0, 5)
      for (const r of top) feedRecords.push({ ...r, did })
    }

    feedRecords.sort((a, b) => b.sortAt.localeCompare(a.sortAt))
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
        platform: r.platform ?? null,
        createdAt: r.createdAt,
      }
    }).filter(r => r.handle && r.handle !== 'handle.invalid' && !r.handle.endsWith('.invalid'))

    return NextResponse.json({ feed }, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    })
  } catch (err) {
    console.error('Network feed error:', err)
    return NextResponse.json({ error: 'Failed to fetch network feed' }, { status: 500 })
  }
}
