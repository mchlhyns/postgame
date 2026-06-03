import { NextRequest, NextResponse } from 'next/server'
import { getIgdbToken } from '@/lib/igdb-server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  if (!rateLimit(`search:${getClientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const raw = req.nextUrl.searchParams.get('q') ?? ''
  const query = raw.trim().slice(0, 100)
  if (query.length < 2) return NextResponse.json({ games: [] })

  try {
    const token = await getIgdbToken()
    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': process.env.IGDB_CLIENT_ID!,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body: `fields name,url,cover.url,screenshots.url,first_release_date,platforms.name; search "${query.replace(/[^a-zA-Z0-9 ]/g, '')}"; limit 25;`,
    })

    if (res.status === 429) return NextResponse.json({ error: 'Rate limited', games: [] }, { status: 429 })
    if (!res.ok) throw new Error(`IGDB request failed: ${res.status}`)

    const games = await res.json()
    return NextResponse.json({ games }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  } catch (err) {
    console.error('IGDB search error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
