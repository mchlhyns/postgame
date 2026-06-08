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
      body: `fields name,url,cover.url,screenshots.url,first_release_date,platforms.name; search "${query.replace(/[^a-zA-Z0-9 ]/g, '')}"; limit 50;`,
    })

    if (res.status === 429) return NextResponse.json({ error: 'Rate limited', games: [] }, { status: 429 })
    if (!res.ok) throw new Error(`IGDB request failed: ${res.status}`)

    const games: any[] = await res.json()

    // Re-rank by title relevance — IGDB's default order favours popularity over match quality
    const q = query.toLowerCase()
    const qWords = q.split(/\s+/).filter(Boolean)
    const scored = games.map((g, i) => {
      const t = (g.name ?? '').toLowerCase()
      let score = 0
      if (t === q) score = 1000
      else if (t.startsWith(q + ' ') || t === q) score = 900
      else if (t.startsWith(q)) score = 800
      else if (t.includes(q)) score = 600
      else if (qWords.length > 1 && qWords.every((w) => t.includes(w))) score = 400
      else score = qWords.filter((w) => t.includes(w)).length * 50
      return { g, score, i }
    })
    scored.sort((a, b) => b.score - a.score || a.i - b.i)

    return NextResponse.json({ games: scored.map((s) => s.g) }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  } catch (err) {
    console.error('IGDB search error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
