import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const ALLOWED_HOSTS = ['images.igdb.com']

export async function GET(req: NextRequest) {
  if (!rateLimit(`proxy:${getClientIp(req)}`, 120, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  if (parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only https URLs allowed' }, { status: 403 })
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 })
  }

  // Don't follow redirects — an allowed host redirecting elsewhere would bypass the allowlist
  const res = await fetch(url, { redirect: 'error' }).catch(() => null)
  if (!res || !res.ok) return NextResponse.json({ error: 'Upstream error' }, { status: res?.status ?? 502 })

  const contentType = res.headers.get('Content-Type') ?? 'image/jpeg'
  if (!contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'Not an image' }, { status: 415 })
  }

  const MAX_BYTES = 10 * 1024 * 1024
  const declaredLength = Number(res.headers.get('Content-Length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
    return NextResponse.json({ error: 'Image too large' }, { status: 413 })
  }

  const buffer = await res.arrayBuffer()
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'Image too large' }, { status: 413 })
  }

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  })
}
