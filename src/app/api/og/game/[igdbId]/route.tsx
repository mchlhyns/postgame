import { ImageResponse } from 'next/og'
import { NextRequest, NextResponse } from 'next/server'
import { getGame } from '@/lib/igdb-game'
import { normalizeCoverUrl } from '@/lib/igdb'
import { getOgFonts, fetchImageAsDataUrl, getLogoDataUrl } from '@/lib/og-fonts'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

export const runtime = 'nodejs'


const W = 1200
const H = 630
const COVER_W = 460

export async function GET(req: NextRequest, { params }: { params: Promise<{ igdbId: string }> }) {
  if (!rateLimit(`og-game:${getClientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  const { igdbId } = await params
  const id = Number(igdbId)

  let name = 'Unknown Game'
  let coverUrl: string | undefined
  let year: string | undefined

  if (Number.isFinite(id) && id > 0) {
    try {
      const game = await getGame(id)
      if (game) {
        name = game.name
        if (game.cover?.url) coverUrl = await fetchImageAsDataUrl(normalizeCoverUrl(game.cover.url))
        if (game.first_release_date) year = new Date(game.first_release_date * 1000).getFullYear().toString()
      }
    } catch { /* use defaults */ }
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: W,
          height: H,
          background: '#08121D',
          fontFamily: 'SpaceMono',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Cover art */}
        {coverUrl ? (
          <img
            src={coverUrl}
            width={COVER_W}
            height={H}
            style={{ objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <div style={{ width: COVER_W, height: H, background: '#151C27', flexShrink: 0, display: 'flex' }} />
        )}

        {/* Gradient fade from cover to bg */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: COVER_W - 160,
            width: 200,
            height: H,
            background: 'linear-gradient(to right, transparent, #08121D)',
            display: 'flex',
          }}
        />

        {/* Right content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: '52px 56px',
          }}
        >
          {/* Logo at top */}
          <img src={getLogoDataUrl()} width={56} height={28} style={{ objectFit: 'contain', objectPosition: 'left' }} />

          {/* Title centered in remaining space */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 16 }}>
            <div
              style={{
                color: '#ffffff',
                fontFamily: 'SpaceGrotesk',
                fontSize: name.length > 40 ? 38 : name.length > 24 ? 46 : 54,
                fontWeight: 700,
                lineHeight: 1.15,
                display: 'flex',
                flexWrap: 'wrap',
              }}
            >
              {name}
            </div>
            {year && (
              <div style={{ color: '#8D9197', fontSize: '1.25rem', display: 'flex' }}>{year}</div>
            )}
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: getOgFonts(),
      headers: { 'Cache-Control': 'public, max-age=604800, stale-while-revalidate=2592000' },
    }
  )
}
