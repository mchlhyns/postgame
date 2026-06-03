export const LIST_COLLECTION = 'com.crashthearcade.list'
export const SETTINGS_COLLECTION = 'com.crashthearcade.settings'
export const COLLECTION = 'com.crashthearcade.game'

export async function resolveHandleToPds(handle: string): Promise<{ did: string; pdsUrl: string }> {
  const cleanHandle = handle.replace(/^@/, '')
  const resolveRes = await fetch(
    `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(cleanHandle)}`,
    { next: { revalidate: 3600 } }
  )
  if (!resolveRes.ok) throw new Error('Handle not found')
  const { did } = await resolveRes.json()

  let pdsUrl = 'https://bsky.social'
  try {
    let didDocUrl: string
    if (did.startsWith('did:web:')) {
      const host = did.slice('did:web:'.length).split(':')[0]
      if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|\[::1\]|fe80:|fc00:|fd)/.test(host)) {
        throw new Error('Blocked did:web host')
      }
      didDocUrl = `https://${host}/.well-known/did.json`
    } else {
      didDocUrl = `https://plc.directory/${did}`
    }
    const didRes = await fetch(didDocUrl, { next: { revalidate: 3600 } })
    if (didRes.ok) {
      const didDoc = await didRes.json()
      const pdsService = didDoc.service?.find(
        (s: { id: string; serviceEndpoint: string }) => s.id === '#atproto_pds'
      )
      if (pdsService?.serviceEndpoint) {
        const endpoint = new URL(pdsService.serviceEndpoint)
        if (endpoint.protocol === 'https:') pdsUrl = pdsService.serviceEndpoint
      }
    }
  } catch { /* fall back to bsky.social */ }

  return { did, pdsUrl }
}
