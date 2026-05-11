import { NextResponse } from 'next/server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { NextRequest } from 'next/server'
const PENTARACT_URL = 'https://gamesgamesgamesgames.games'
const PENTARACT_KEY = process.env.GAMES_CLIENT_KEY_LOCAL!

const HAPPYVIEW_URL = process.env.HAPPYVIEW_URL!
const HAPPYVIEW_KEY = process.env.HAPPYVIEW_CLIENT_KEY!
type GameRecord = {
  game: { igdbId: number; title: string; coverUrl?: string }
  status: string
  rating?: number
  createdAt: string
}

type ReviewRecord = {
  title?: string
  rating?: number
  identifiers?: { igdbId?: string }
  backdropUrl?: string
  creativeWorkType?: string
  createdAt: string
}

async function fetchPaginated<T>(xrpc: string, maxPages = 200): Promise<T[]> {
  const records: T[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    const url = new URL(xrpc)
    url.searchParams.set('limit', '100')
    if (cursor) url.searchParams.set('cursor', cursor)
    const res = await fetch(url.toString(), {
      headers: { 'X-Client-Key': HAPPYVIEW_KEY },
      next: { revalidate: 3600 },
    })
    if (!res.ok) break
    const data = await res.json()
    records.push(...(data.records ?? []))
    cursor = data.cursor && data.records?.length === 100 ? data.cursor : undefined
    pages++
  } while (cursor && pages < maxPages)
  return records
}

export async function GET(req: NextRequest) {
  if (!rateLimit(`appview-trending:${getClientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const [gameRecords, reviewRecords] = await Promise.all([
      fetchPaginated<GameRecord>(`${HAPPYVIEW_URL}/xrpc/com.crashthearcade.getGames`),
      fetchPaginated<ReviewRecord>(`${HAPPYVIEW_URL}/xrpc/com.crashthearcade.getReviews`, 150),
    ])

    type GameEntry = {
      igdbId: number
      title: string
      coverUrl?: string
      count: number
      lastActivity: string
      ratingSum: number
      ratingCount: number
    }

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

    for (const r of reviewRecords) {
      if (!r.rating || !r.identifiers?.igdbId || r.creativeWorkType !== 'video_game') continue
      const igdbId = parseInt(r.identifiers.igdbId, 10)
      if (!igdbId) continue
      const existing = gameMap.get(igdbId)
      if (existing) {
        existing.ratingSum += r.rating
        existing.ratingCount++
        if (r.createdAt > existing.lastActivity) existing.lastActivity = r.createdAt
      } else {
        gameMap.set(igdbId, {
          igdbId, title: r.title ?? '', coverUrl: undefined,
          count: 0, lastActivity: r.createdAt,
          ratingSum: r.rating, ratingCount: 1,
        })
      }
    }

    const allGames = [...gameMap.values()]

    // Fetch covers from Pentaract for games missing one
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

    return NextResponse.json({ trending, topRated }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    })
  } catch (err) {
    console.error('AppView trending error:', err)
    return NextResponse.json({ error: 'Failed to fetch trending games' }, { status: 500 })
  }
}
