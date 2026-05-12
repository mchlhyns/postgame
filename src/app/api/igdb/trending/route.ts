import { NextRequest, NextResponse } from 'next/server'
import { getIgdbToken, igdbQuery } from '@/lib/igdb-server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

let _cache: { data: unknown; expiresAt: number } | null = null

export async function GET(req: NextRequest) {
  if (!rateLimit(`trending:${getClientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  if (_cache && Date.now() < _cache.expiresAt) {
    return NextResponse.json(_cache.data, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    })
  }

  try {
    const token = await getIgdbToken()
    const todayUtc = new Date()
    todayUtc.setUTCHours(0, 0, 0, 0)
    const startOfToday = Math.floor(todayUtc.getTime() / 1000)
    const startOfTomorrow = startOfToday + 86400
    const oneMonthAgo = startOfToday - 60 * 60 * 24 * 30
    const sixMonthsAhead = startOfToday + 60 * 60 * 24 * 180

    const [upcoming, recentlyReleased, highlyRated, popularPrimitives] = await Promise.all([
      igdbQuery(token, 'games',
        `fields name,url,cover.url,first_release_date,platforms.name,hypes; where first_release_date >= ${startOfTomorrow} & first_release_date < ${sixMonthsAhead} & hypes > 10; sort first_release_date asc; limit 48;`
      ),
      igdbQuery(token, 'games',
        `fields name,url,cover.url,first_release_date,platforms.name,total_rating_count,aggregated_rating_count,hypes; where first_release_date > ${oneMonthAgo} & first_release_date < ${startOfTomorrow} & hypes > 5 & (aggregated_rating_count >= 1 | total_rating_count >= 5); sort first_release_date desc; limit 48;`
      ),
      igdbQuery(token, 'games',
        `fields name,url,cover.url,first_release_date,platforms.name,rating,rating_count,aggregated_rating,aggregated_rating_count; where first_release_date > ${oneMonthAgo} & first_release_date < ${startOfTomorrow} & rating_count > 1 & rating >= 80 & aggregated_rating_count >= 1; sort rating desc; limit 12;`
      ),
      igdbQuery(token, 'popularity_primitives',
        `fields game_id,value,popularity_type; where popularity_type = 1; sort value desc; limit 40;`
      ),
    ])

    const popularIds = (popularPrimitives as { game_id: number }[]).map((p) => p.game_id)
    const [popularGames, artworkData] = await Promise.all([
      popularIds.length > 0
        ? igdbQuery(token, 'games',
            `fields name,url,cover.url,first_release_date,platforms.name; where id = (${popularIds.join(',')}); limit 12;`
          )
        : Promise.resolve([]),
      igdbQuery(token, 'screenshots',
        `fields image_id; where game.rating > 85 & game.rating_count > 200 & game.version_parent = null; sort game.rating_count desc; limit 100;`
      ),
    ])
    const popularOrdered = popularIds
      .map((id) => (popularGames as { id: number }[]).find((g) => g.id === id))
      .filter(Boolean)

    const artworkUrls: string[] = ((artworkData as { image_id: string }[]) ?? [])
      .map((a) => `https://images.igdb.com/igdb/image/upload/t_screenshot_big/${a.image_id}.jpg`)
      .sort(() => Math.random() - 0.5)

    const payload = { upcoming, recentlyReleased, highlyRated, popular: popularOrdered, artworkUrls }
    _cache = { data: payload, expiresAt: Date.now() + 3600 * 1000 }
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    })
  } catch (err) {
    console.error('IGDB trending error:', err)
    return NextResponse.json({ error: 'Failed to fetch trending games' }, { status: 500 })
  }
}
