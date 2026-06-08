import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

interface AirglowPayload {
  did: string
  collection: string
  rkey: string
  record: Record<string, unknown>
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`airglow:${getClientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  let payload: AirglowPayload

  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { did, collection, rkey, record } = payload

  if (!did || !collection || !rkey || !record) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supported = [
    'at.postgame.game',
    'at.postgame.list',
    'at.postgame.follow',
    'at.postgame.settings',
  ]

  if (!supported.includes(collection)) {
    return NextResponse.json({ error: 'Unsupported lexicon' }, { status: 400 })
  }

  // Handle each lexicon type
  switch (collection) {
    case 'at.postgame.game':
      // e.g. trigger notifications, update leaderboards, sync external services
      break
    case 'at.postgame.list':
      break
    case 'at.postgame.follow':
      break
    case 'at.postgame.settings':
      break
  }

  return NextResponse.json({ ok: true })
}
