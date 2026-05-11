import { NextResponse } from 'next/server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { NextRequest } from 'next/server'
import { fetchAllGameRecords } from '@/lib/happyview'

const PENTARACT_URL = 'https://gamesgamesgamesgames.games'
const PENTARACT_KEY = process.env.GAMES_CLIENT_KEY!

type GameEntry = {
  igdbId: number
  title: string
  coverUrl?: string
  count: number
  lastActivity: string
  ratingSum: number
  ratingCount: number
}

let _cache: { data: unknown; expiresAt: number } | null = null
let _inFlight: Promise<unknown> | null = null

async function buildTrending(): Promise<unknown> {
  const gameRecords = await fetchAllGameRecords()

  const gameMap = new Map<number, GameEntry>()

  for (const r of gameRecords) {
    const { igdbId, title, coverUrl } = r.game
    const existing = gameMap.get(igdbId)
    if (existing) {
      existing.count++
      if (r.createdAt > existing.lastActivity) existing.lastActivity = r.createdAt
      if (r.rating) { existing.ratingSum += r.rating; existing.ratingCount++ }
    } else {
      gameMap.set(igdbId, {
        igdbId, title, coverUrl, count: 1, lastActivity: r.createdAt,
        ratingSum: r.rating ?? 0, ratingCount: r.rating ? 1 : 0,
      })
    }
  }

  const allGames = [...gameMap.values()]

  const missingCoverGames = allGames.filter(g => !g.coverUrl)
  if (missingCoverGames.length > 0) {
    await Promise.all(missingCoverGames.map(async g => {
      try {
        const res = await fetch(
          `${PENTARACT_URL}/xrpc/games.gamesgamesgamesgames.getGame?igdbId=${g.igdbId}`,
          { headers: { 'X-Client-Key': PENTARACT_KEY }, next: { revalidate: 604800 } }
        )
        if (!res.ok) return
        const { game } = await res.json()
        const cover = game?.media?.find((m: { mediaType: string }) => m.mediaType === 'cover')
        if (cover?.igdbImageId) {
          g.coverUrl = `https://images.igdb.com/igdb/image/upload/t_cover_big/${cover.igdbImageId}.jpg`
        }
      } catch {}
    }))
  }

  const trending = [...allGames]
    .sort((a, b) => b.count - a.count || b.lastActivity.localeCompare(a.lastActivity))
    .slice(0, 48)

  const topRated = allGames
    .filter(g => g.ratingCount >= 2)
    .map(g => ({ ...g, avgRating: g.ratingSum / g.ratingCount }))
    .filter(g => g.avgRating >= 7)
    .sort((a, b) => b.avgRating - a.avgRating || b.ratingCount - a.ratingCount)
    .slice(0, 48)

  return { trending, topRated }
}

export async function GET(req: NextRequest) {
  if (!rateLimit(`appview-trending:${getClientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  if (_cache && Date.now() < _cache.expiresAt) {
    return NextResponse.json(_cache.data, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    })
  }

  try {
    if (!_inFlight) _inFlight = buildTrending().finally(() => { _inFlight = null })
    const data = await _inFlight
    _cache = { data, expiresAt: Date.now() + 3600 * 1000 }
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    })
  } catch (err) {
    console.error('AppView trending error:', err)
    return NextResponse.json({ error: 'Failed to fetch trending games' }, { status: 500 })
  }
}
