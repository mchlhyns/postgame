import { ImageResponse } from 'next/og'
import { NextRequest, NextResponse } from 'next/server'
import { resolveHandleToPds, LIST_COLLECTION } from '@/lib/atproto-server'
import { getOgFonts, fetchImageAsDataUrl, getLogoDataUrl } from '@/lib/og-fonts'
import { ListRecord } from '@/types'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

export const runtime = 'nodejs'


const W = 1200
const H = 630
const COVER_W = 186
const COVER_H = 248
const MAX_COVERS = 5

export async function GET(req: NextRequest, { params }: { params: Promise<{ handle: string; rkey: string }> }) {
  if (!rateLimit(`og-list:${getClientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  const { handle, rkey } = await params
  const clean = handle.replace(/^@/, '')

  let listName = 'A list'
  let attribution = `@${clean}`
  let covers: (string | null)[] = []

  try {
    const { did, pdsUrl } = await resolveHandleToPds(clean)
    const [listRes, descRes] = await Promise.all([
      fetch(`${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${LIST_COLLECTION}&rkey=${encodeURIComponent(rkey)}`, { next: { revalidate: 3600 } }),
      fetch(`${pdsUrl}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`, { next: { revalidate: 3600 } }),
    ])
    if (listRes.ok) {
      const data = await listRes.json()
      const value = data.value as ListRecord
      listName = value.name
      const count = (value.items ?? []).length
      const resolvedHandle = descRes.ok ? ((await descRes.json()).handle ?? clean) : clean
      attribution = `@${resolvedHandle} · ${count} game${count !== 1 ? 's' : ''}`
      const rawCovers = (value.items ?? []).slice(0, MAX_COVERS).map((item) => item.coverUrl ?? null)
      covers = await Promise.all(rawCovers.map((url) => url ? fetchImageAsDataUrl(url).then((d) => d ?? null) : Promise.resolve(null)))
    }
  } catch { /* use defaults */ }

  const placeholders = MAX_COVERS - covers.length

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: W,
          height: H,
          background: '#0f1319',
          fontFamily: 'Fustat',
          justifyContent: 'space-between',
        }}
      >
        {/* Logo top left */}
        <div style={{ display: 'flex', padding: '52px 60px 0' }}>
          <img src={getLogoDataUrl()} width={40} height={40} style={{ objectFit: 'contain', objectPosition: 'left' }} />
        </div>

        {/* Bottom: title + covers + attribution */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0 60px 44px', gap: 20 }}>
          <div
            style={{
              color: '#ffffff',
              fontFamily: 'Fustat',
              fontSize: listName.length > 36 ? 56 : listName.length > 24 ? 64 : 76,
              fontWeight: 800,
              lineHeight: 1.2,
              display: 'flex',
              flexWrap: 'wrap',
              maxHeight: 190,
              overflow: 'hidden',
            }}
          >
            {listName}
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            {covers.map((src, i) =>
              src ? (
                <img
                  key={i}
                  src={src}
                  width={COVER_W}
                  height={COVER_H}
                  style={{ objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                />
              ) : (
                <div
                  key={i}
                  style={{ width: COVER_W, height: COVER_H, background: '#151C27', borderRadius: 4, flexShrink: 0, display: 'flex' }}
                />
              )
            )}
            {Array.from({ length: placeholders }).map((_, i) => (
              <div
                key={`ph-${i}`}
                style={{ width: COVER_W, height: COVER_H, background: '#151C27', borderRadius: 4, flexShrink: 0, display: 'flex' }}
              />
            ))}
          </div>

          <div style={{ color: '#aaacae', fontSize: 32, display: 'flex' }}>{attribution}</div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: getOgFonts(),
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    }
  )
}
