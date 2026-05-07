import { ImageResponse } from 'next/og'
import { NextRequest, NextResponse } from 'next/server'
import { resolveHandleToPds, SETTINGS_COLLECTION } from '@/lib/atproto-server'
import { getOgFonts } from '@/lib/og-fonts'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const W = 1200
const H = 630

function extractBlobCid(blob: unknown): string | null {
  if (!blob) return null
  if (typeof (blob as any)['$link'] === 'string') return (blob as any)['$link']
  if (typeof (blob as any)['/'] === 'string') return (blob as any)['/']
  return null
}


export async function GET(req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  if (!rateLimit(`og-profile:${getClientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  const { handle } = await params
  const clean = handle.replace(/^@/, '')

  let displayName: string | undefined
  let resolvedHandle = clean
  let avatarUrl: string | undefined

  try {
    const { did, pdsUrl } = await resolveHandleToPds(clean)

    const [descRes, settingsRes, profileRes] = await Promise.all([
      fetch(`${pdsUrl}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`, { next: { revalidate: 3600 } }),
      fetch(`${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${SETTINGS_COLLECTION}&rkey=self`, { next: { revalidate: 3600 } }),
      fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`, { next: { revalidate: 3600 } }),
    ])

    if (descRes.ok) {
      const desc = await descRes.json()
      resolvedHandle = desc.handle ?? clean
    }

    let ctaDisplayName: string | undefined
    let ctaAvatarUrl: string | undefined
    if (settingsRes.ok) {
      const settings = await settingsRes.json()
      ctaDisplayName = settings.value?.displayName
      const cid = extractBlobCid(settings.value?.avatarBlob?.ref)
      if (cid) ctaAvatarUrl = `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
    }

    let bskyDisplayName: string | undefined
    let bskyAvatar: string | undefined
    if (profileRes.ok) {
      const profile = await profileRes.json()
      bskyDisplayName = profile.displayName
      bskyAvatar = profile.avatar
    }

    displayName = ctaDisplayName ?? bskyDisplayName
    // Bluesky CDN serves WebP by default; append @jpeg to force a format Satori supports.
    if (bskyAvatar) avatarUrl = bskyAvatar.includes('@') ? bskyAvatar : bskyAvatar + '@jpeg'
  } catch { /* use defaults */ }

  const nameLabel = displayName ?? `@${resolvedHandle}`
  const showHandle = !!displayName

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: W,
          height: H,
          background: '#08121D',
          fontFamily: 'SpaceMono',
          padding: '52px 72px',
          justifyContent: 'center',
        }}
      >
        {/* Center: avatar + identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              width={160}
              height={160}
              style={{ borderRadius: 80, objectFit: 'cover', flexShrink: 0, border: '3px solid #363c46' }}
            />
          ) : (
            <div
              style={{
                width: 160,
                height: 160,
                borderRadius: 80,
                background: '#151C27',
                border: '3px solid #363c46',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ color: '#363c46', fontSize: '4rem', fontWeight: 700, display: 'flex' }}>?</div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                color: '#ffffff',
                fontFamily: 'SpaceGrotesk',
                fontSize: nameLabel.length > 24 ? 44 : nameLabel.length > 16 ? 52 : 60,
                fontWeight: 700,
                lineHeight: 1.1,
                display: 'flex',
                flexWrap: 'wrap',
              }}
            >
              {nameLabel}
            </div>
            {showHandle && (
              <div style={{ color: '#8D9197', fontSize: '1.375rem', display: 'flex' }}>@{resolvedHandle}</div>
            )}
          </div>
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
