import { NextRequest, NextResponse } from 'next/server'
import { getIgdbToken } from '@/lib/igdb-server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  if (!rateLimit(`igdb-release-dates:${getClientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({}, { status: 429 })
  }

  const raw = req.nextUrl.searchParams.get('ids') ?? ''
  const ids = raw.split(',').slice(0, 50).map(Number).filter((n) => Number.isFinite(n) && n > 0)
  if (ids.length === 0) return NextResponse.json({})

  try {
    const token = await getIgdbToken()
    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': process.env.IGDB_CLIENT_ID!,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body: `fields id,first_release_date; where id = (${ids.join(',')}); limit ${ids.length};`,
    })

    if (!res.ok) return NextResponse.json({}, { status: 500 })
    const games: { id: number; first_release_date?: number }[] = await res.json()

    const result: Record<number, number> = {}
    for (const g of games) {
      if (g.first_release_date != null) result[g.id] = g.first_release_date
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    })
  } catch (err) {
    console.error('IGDB release-dates error:', err)
    return NextResponse.json({}, { status: 500 })
  }
}
