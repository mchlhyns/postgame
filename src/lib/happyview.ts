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
  /** Populated from inline items; will be empty once list.item records are the source of truth. Requires happyview server update to re-populate from at.postgame.list.item. */
  items?: Array<{
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

/**
 * Fetch the newest 100 records for each DID using happyview's server-side
 * `did` filter — much cheaper than scanning the whole network. Results are
 * cached per-DID in the Next data cache (5 min), shared across instances.
 */
export async function fetchGameRecordsForDids(dids: string[]): Promise<Map<string, HVGameRecord[]>> {
  const out = new Map<string, HVGameRecord[]>()
  const CONCURRENCY = 10
  for (let i = 0; i < dids.length; i += CONCURRENCY) {
    const batch = dids.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(async (did): Promise<[string, HVGameRecord[]]> => {
      try {
        const url = new URL(`${HAPPYVIEW_URL}/xrpc/at.postgame.getGames`)
        url.searchParams.set('did', did)
        url.searchParams.set('limit', '100')
        const res = await fetch(url.toString(), {
          headers: { 'X-Client-Key': HAPPYVIEW_KEY },
          next: { revalidate: 300 },
        })
        if (!res.ok) return [did, []]
        const data = await res.json()
        return [did, (data.records ?? []) as HVGameRecord[]]
      } catch {
        return [did, []]
      }
    }))
    for (const [did, records] of results) out.set(did, records)
  }
  return out
}

/** Fetch every record for one game using happyview's server-side igdbId filter. */
export async function fetchGameRecordsByIgdbId(igdbId: number): Promise<HVGameRecord[]> {
  const records: HVGameRecord[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    const url = new URL(`${HAPPYVIEW_URL}/xrpc/at.postgame.getGames`)
    url.searchParams.set('igdbId', String(igdbId))
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
  } while (cursor && pages < 20)
  return records
}

let _recentCache: { records: HVGameRecord[]; expiresAt: number } | null = null
let _recentInFlight: Promise<HVGameRecord[]> | null = null

/**
 * Fetch only the newest records (happyview returns newest-first), capped at
 * maxRecords — enough for recency feeds without scanning the whole network.
 */
export async function fetchRecentGameRecords(maxRecords = 1000): Promise<HVGameRecord[]> {
  if (_recentCache && Date.now() < _recentCache.expiresAt) return _recentCache.records
  if (_recentInFlight) return _recentInFlight

  _recentInFlight = (async () => {
    const records: HVGameRecord[] = []
    let cursor: string | undefined
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
    } while (cursor && records.length < maxRecords)
    _recentCache = { records, expiresAt: Date.now() + 5 * 60 * 1000 }
    _recentInFlight = null
    return records
  })()

  return _recentInFlight
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
