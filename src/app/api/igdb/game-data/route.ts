import { NextRequest, NextResponse } from 'next/server'
import { getIgdbToken, igdbQuery } from '@/lib/igdb-server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  if (!rateLimit(`igdb-game-data:${getClientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({}, { status: 429 })
  }

  const raw = req.nextUrl.searchParams.get('ids') ?? ''
  const ids = raw.split(',').slice(0, 50).map(Number).filter((n) => Number.isFinite(n) && n > 0)
  if (ids.length === 0) return NextResponse.json({})

  try {
    const token = await getIgdbToken()
    const games = await igdbQuery(token, 'games',
      `fields id,cover.url,first_release_date; where id = (${ids.join(',')}); limit ${ids.length};`
    ) as { id: number; cover?: { url: string }; first_release_date?: number }[]

    const result: Record<number, { coverUrl?: string; releaseDate?: number }> = {}
    for (const g of games) {
      const coverUrl = g.cover?.url
        ? g.cover.url.replace(/^\/\//, 'https://').replace('/t_thumb/', '/t_cover_big/')
        : undefined
      result[g.id] = { coverUrl, releaseDate: g.first_release_date }
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    })
  } catch (err) {
    console.error('IGDB game-data error:', err)
    return NextResponse.json({}, { status: 500 })
  }
}
