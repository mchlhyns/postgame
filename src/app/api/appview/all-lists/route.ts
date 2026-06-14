import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { fetchAllListRecords, didFromUri } from '@/lib/happyview'
import { fetchBskyProfiles, fetchCtaProfile } from '@/lib/appview-fetch'

export async function GET(req: NextRequest) {
  if (!rateLimit(`appview-all-lists:${getClientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const allListRecords = await fetchAllListRecords()
    const uniqueDids = [...new Set(allListRecords.map(r => didFromUri(r.uri)).filter(Boolean))] as string[]

    const [bskyProfiles, ctaResults] = await Promise.all([
      fetchBskyProfiles(uniqueDids),
      Promise.all(uniqueDids.map(did => fetchCtaProfile(did).then(p => ({ did, ...p })))),
    ])

    const ctaMap = new Map(ctaResults.map(p => [p.did, p]))
    
    // Build profiles map
    const profiles = uniqueDids.map(did => {
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

    // Map list records and sort
    const lists = allListRecords.map(list => {
      const did = didFromUri(list.uri)
      const profile = did ? profileMap.get(did) : null
      if (!profile) return null

      return {
        uri: list.uri,
        value: {
          name: list.name,
          items: list.items ?? [],
          numbered: list.numbered,
          url: list.url,
          createdAt: list.createdAt,
          updatedAt: list.updatedAt,
        },
        user: {
          did,
          handle: profile.handle,
          displayName: profile.displayName,
          avatar: profile.avatar,
        }
      }
    }).filter(Boolean)

    // Sort by createdAt descending
    lists.sort((a: any, b: any) => {
      const aTime = a.value?.createdAt || ''
      const bTime = b.value?.createdAt || ''
      return bTime.localeCompare(aTime)
    })

    return NextResponse.json({ lists }, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    })
  } catch (err) {
    console.error('All lists feed error:', err)
    return NextResponse.json({ error: 'Failed to fetch community lists' }, { status: 500 })
  }
}
