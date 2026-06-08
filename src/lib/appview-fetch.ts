const SETTINGS_COLLECTION = 'at.postgame.settings'

export async function resolvePds(did: string): Promise<string> {
  try {
    let docUrl: string
    if (did.startsWith('did:web:')) {
      const host = did.slice('did:web:'.length).split(':')[0]
      if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|\[::1\]|fe80:|fc00:|fd)/.test(host)) {
        throw new Error('Blocked did:web host')
      }
      docUrl = `https://${host}/.well-known/did.json`
    } else {
      docUrl = `https://plc.directory/${did}`
    }
    const res = await fetch(docUrl, { next: { revalidate: 3600 } })
    if (!res.ok) return 'https://bsky.social'
    const doc = await res.json()
    const svc = doc.service?.find((s: { id: string; serviceEndpoint: string }) => s.id === '#atproto_pds')
    const url = svc?.serviceEndpoint
    return url?.startsWith('https://') ? url : 'https://bsky.social'
  } catch {
    return 'https://bsky.social'
  }
}

export function bskyAvatar(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (url.startsWith('https://cdn.bsky.app/') && !url.includes('@')) return `${url}@jpeg`
  return url
}

export function extractCid(ref: unknown): string | null {
  if (!ref) return null
  if (typeof (ref as Record<string, unknown>)['$link'] === 'string') return (ref as Record<string, unknown>)['$link'] as string
  if (typeof (ref as Record<string, unknown>)['/'] === 'string') return (ref as Record<string, unknown>)['/'] as string
  const s = (ref as { toString?: () => string }).toString?.()
  if (typeof s === 'string' && s !== '[object Object]') return s
  return null
}

export function blobUrl(pdsUrl: string, did: string, blob: unknown): string | null {
  const cid = extractCid((blob as { ref?: unknown })?.ref)
  if (!cid) return null
  return `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
}

export async function fetchCtaProfile(did: string): Promise<{ displayName?: string; avatarUrl?: string }> {
  try {
    const pdsUrl = await resolvePds(did)
    const res = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${SETTINGS_COLLECTION}&rkey=self`,
      { next: { revalidate: 300 } }
    )
    if (!res.ok) return {}
    const { value } = await res.json()
    return {
      displayName: value?.displayName,
      avatarUrl: value?.avatarBlob ? blobUrl(pdsUrl, did, value.avatarBlob) ?? undefined : undefined,
    }
  } catch {
    return {}
  }
}

export async function fetchBskyProfiles(
  dids: string[]
): Promise<Map<string, { handle: string; displayName?: string; avatar?: string }>> {
  const map = new Map<string, { handle: string; displayName?: string; avatar?: string }>()
  for (let i = 0; i < dids.length; i += 25) {
    const batch = dids.slice(i, i + 25)
    const params = batch.map(d => `actors=${encodeURIComponent(d)}`).join('&')
    try {
      const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?${params}`, { next: { revalidate: 300 } })
      if (res.ok) {
        const data = await res.json()
        for (const p of data.profiles ?? []) {
          map.set(p.did, { handle: p.handle, displayName: p.displayName, avatar: p.avatar })
        }
      } else {
        await Promise.all(batch.map(async (did) => {
          try {
            const r = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`, { next: { revalidate: 300 } })
            if (r.ok) {
              const p = await r.json()
              map.set(p.did, { handle: p.handle, displayName: p.displayName, avatar: p.avatar })
            }
          } catch {}
        }))
      }
    } catch {
      await Promise.all(batch.map(async (did) => {
        try {
          const r = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`, { next: { revalidate: 300 } })
          if (r.ok) {
            const p = await r.json()
            map.set(p.did, { handle: p.handle, displayName: p.displayName, avatar: p.avatar })
          }
        } catch {}
      }))
    }
  }
  return map
}
