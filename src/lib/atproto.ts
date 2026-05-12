import { BrowserOAuthClient } from '@atproto/oauth-client-browser'
import { Agent } from '@atproto/api'

export const HANDLE_RESOLVER = 'https://api.bsky.app'
export const COLLECTION = 'com.crashthearcade.game'
export const SETTINGS_COLLECTION = 'com.crashthearcade.settings'
export const LIST_COLLECTION = 'com.crashthearcade.list'
export const FOLLOW_COLLECTION = 'com.crashthearcade.follow'

let _client: BrowserOAuthClient | null = null
let _sessionPromise: Promise<{ agent: Agent; did: string } | null> | null = null

export async function getOAuthClient(): Promise<BrowserOAuthClient> {
  if (_client) return _client
  const origin = window.location.origin
  _client = new BrowserOAuthClient({
    handleResolver: HANDLE_RESOLVER,
    clientMetadata: {
      client_id: `${origin}/oauth-client-metadata.json`,
      client_name: 'CRASH THE ARCADE',
      client_uri: origin,
      redirect_uris: [`${origin}/oauth/callback`],
      scope: 'atproto repo:com.crashthearcade.game repo:com.crashthearcade.settings repo:com.crashthearcade.list repo:com.crashthearcade.follow blob:image/*',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      dpop_bound_access_tokens: true,
    },
  })
  return _client
}

export async function restoreSession(): Promise<{ agent: Agent; did: string } | null> {
  if (!_sessionPromise) {
    _sessionPromise = getOAuthClient()
      .then((client) => client.init())
      .then((result) => {
        if (!result) return null
        return { agent: new Agent(result.session), did: result.session.did }
      })
      .catch(() => null)
  }
  return _sessionPromise
}

export async function signIn(handle: string): Promise<void> {
  const client = await getOAuthClient()
  await client.signInRedirect(handle)
  // Browser will redirect to PDS authorization page
}

export async function signOut(did: string): Promise<void> {
  _sessionPromise = null
  const client = await getOAuthClient()
  await client.revoke(did)
}

export async function resolveHandleToPds(handle: string): Promise<{ did: string; pdsUrl: string }> {
  const cleanHandle = handle.replace(/^@/, '')
  const resolveRes = await fetch(
    `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(cleanHandle)}`
  )
  if (!resolveRes.ok) throw new Error('Handle not found')
  const { did } = await resolveRes.json()

  let pdsUrl = 'https://bsky.social'
  try {
    let didDocUrl: string
    if (did.startsWith('did:web:')) {
      const host = did.slice('did:web:'.length).split(':')[0] // strip any path segments
      // Block localhost and private ranges masquerading as did:web hosts
      if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
        throw new Error('Blocked did:web host')
      }
      didDocUrl = `https://${host}/.well-known/did.json`
    } else {
      didDocUrl = `https://plc.directory/${did}`
    }
    const didRes = await fetch(didDocUrl)
    if (didRes.ok) {
      const didDoc = await didRes.json()
      const pdsService = didDoc.service?.find(
        (s: { id: string; serviceEndpoint: string }) => s.id === '#atproto_pds'
      )
      if (pdsService?.serviceEndpoint) {
        // Only accept https:// PDS endpoints
        const endpoint = new URL(pdsService.serviceEndpoint)
        if (endpoint.protocol === 'https:') pdsUrl = pdsService.serviceEndpoint
      }
    }
  } catch { /* fall back to bsky.social */ }

  return { did, pdsUrl }
}
