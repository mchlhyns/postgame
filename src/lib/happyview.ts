const HAPPYVIEW_URL = process.env.HAPPYVIEW_URL!
const HAPPYVIEW_KEY = process.env.HAPPYVIEW_CLIENT_KEY!

export type HVGameRecord = {
  uri: string
  game: { igdbId: number; title: string; coverUrl?: string }
  status: string
  playedStatus?: string
  rating?: number
  platform?: string
  createdAt: string
}

export type HVListRecord = {
  uri: string
  name: string
  items: Array<{
    igdbId: number
    title: string
    coverUrl?: string
    position: number
    award?: string
  }>
  numbered?: boolean
  url?: string
  createdAt: string
  updatedAt: string
}

let _recordsCache: { records: HVGameRecord[]; expiresAt: number } | null = null
let _inFlight: Promise<HVGameRecord[]> | null = null

let _listsCache: { records: HVListRecord[]; expiresAt: number } | null = null
let _listsInFlight: Promise<HVListRecord[]> | null = null

export async function fetchAllGameRecords(): Promise<HVGameRecord[]> {
  if (_recordsCache && Date.now() < _recordsCache.expiresAt) return _recordsCache.records

  // Deduplicate concurrent fetches
  if (_inFlight) return _inFlight

  _inFlight = (async () => {
    const records: HVGameRecord[] = []
    let cursor: string | undefined
    let pages = 0
    do {
      const url = new URL(`${HAPPYVIEW_URL}/xrpc/at.postgame.getGames`)
      url.searchParams.set('limit', '100')
      if (cursor) url.searchParams.set('cursor', cursor)
      const res = await fetch(url.toString(), {
        headers: { 'X-Client-Key': HAPPYVIEW_KEY },
        next: { revalidate: 300 },
      })
      if (!res.ok) break
      const data = await res.json()
      records.push(...(data.records ?? []))
      cursor = data.cursor && data.records?.length === 100 ? data.cursor : undefined
      pages++
    } while (cursor && pages < 200)
    _recordsCache = { records, expiresAt: Date.now() + 5 * 60 * 1000 }
    _inFlight = null
    return records
  })()

  return _inFlight
}

export async function fetchAllListRecords(): Promise<HVListRecord[]> {
  if (_listsCache && Date.now() < _listsCache.expiresAt) return _listsCache.records

  // Deduplicate concurrent fetches
  if (_listsInFlight) return _listsInFlight

  _listsInFlight = (async () => {
    const records: HVListRecord[] = []
    let cursor: string | undefined
    let pages = 0
    do {
      const url = new URL(`${HAPPYVIEW_URL}/xrpc/at.postgame.getLists`)
      url.searchParams.set('limit', '100')
      if (cursor) url.searchParams.set('cursor', cursor)
      const res = await fetch(url.toString(), {
        headers: { 'X-Client-Key': HAPPYVIEW_KEY },
        next: { revalidate: 300 },
      })
      if (!res.ok) break
      const data = await res.json()
      records.push(...(data.records ?? []))
      cursor = data.cursor && data.records?.length === 100 ? data.cursor : undefined
      pages++
    } while (cursor && pages < 200)
    _listsCache = { records, expiresAt: Date.now() + 60 * 1000 }
    _listsInFlight = null
    return records
  })()

  return _listsInFlight
}

export function didFromUri(uri: string): string | null {
  return uri.match(/^at:\/\/(did:[^/]+)\//)?.[1] ?? null
}
