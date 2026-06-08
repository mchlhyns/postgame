import { BrowserOAuthClient } from '@atproto/oauth-client-browser'
import { Agent } from '@atproto/api'

export const HANDLE_RESOLVER = 'https://api.bsky.app'
export const COLLECTION = 'at.postgame.game'
export const SETTINGS_COLLECTION = 'at.postgame.settings'
export const LIST_COLLECTION = 'at.postgame.list'
export const FOLLOW_COLLECTION = 'at.postgame.follow'

let _client: BrowserOAuthClient | null = null
let _sessionPromise: Promise<{ agent: Agent; did: string } | null> | null = null

export async function getOAuthClient(): Promise<BrowserOAuthClient> {
  if (_client) return _client
  const origin = window.location.origin
  _client = new BrowserOAuthClient({
    handleResolver: HANDLE_RESOLVER,
    clientMetadata: {
      client_id: `${origin}/oauth-client-metadata.json`,
      client_name: 'postgame',
      client_uri: origin,
      redirect_uris: [`${origin}/oauth/callback`],
      scope: 'atproto blob:image/* repo:at.postgame.game?action=create repo:at.postgame.game?action=update repo:at.postgame.game?action=delete repo:at.postgame.list?action=create repo:at.postgame.list?action=update repo:at.postgame.list?action=delete repo:at.postgame.follow?action=create repo:at.postgame.follow?action=update repo:at.postgame.follow?action=delete repo:at.postgame.settings?action=create repo:at.postgame.settings?action=update repo:at.postgame.settings?action=delete',
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
      .then(async (result) => {
        if (!result) return null
        const agent = new Agent(result.session)
        const did = result.session.did
        await migrateUserData(agent, did)
        return { agent, did }
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

export async function fetchBlockedDids(agent: Agent): Promise<Set<string>> {
  const blocked = new Set<string>()
  try {
    let cursor: string | undefined
    do {
      const res = await agent.app.bsky.graph.getBlocks({ limit: 100, cursor })
      for (const block of res.data.blocks) blocked.add(block.did)
      cursor = res.data.cursor
    } while (cursor)
  } catch {}
  return blocked
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
      // Block localhost, private IPv4 ranges, and IPv6 loopback/link-local/private
      if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|\[::1\]|fe80:|fc00:|fd)/.test(host)) {
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

async function migrateUserData(agent: Agent, did: string): Promise<void> {
  const key = `pg_migrated_v1_${did}`
  if (typeof localStorage !== 'undefined' && localStorage.getItem(key)) return

  const OLD_COLLECTIONS = {
    game: 'com.crashthearcade.game',
    list: 'com.crashthearcade.list',
    follow: 'com.crashthearcade.follow',
    settings: 'com.crashthearcade.settings',
  } as const

  let migrationOk = true

  // Migrate paginated collections (game, list, follow)
  for (const [collKey, oldColl] of [
    ['game', OLD_COLLECTIONS.game],
    ['list', OLD_COLLECTIONS.list],
    ['follow', OLD_COLLECTIONS.follow],
  ] as const) {
    const newColl = collKey === 'game' ? COLLECTION : collKey === 'list' ? LIST_COLLECTION : FOLLOW_COLLECTION
    let cursor: string | undefined
    do {
      let res
      try {
        res = await agent.com.atproto.repo.listRecords({ repo: did, collection: oldColl, limit: 100, cursor })
      } catch { break }
      if (!res.success || res.data.records.length === 0) break
      for (const rec of res.data.records) {
        const rkey = rec.uri.split('/').pop()!
        try {
          await agent.com.atproto.repo.putRecord({ repo: did, collection: newColl, rkey, record: { ...(rec.value as object), $type: newColl } })
          await agent.com.atproto.repo.deleteRecord({ repo: did, collection: oldColl, rkey })
        } catch (e) {
          console.error('[postgame] migration record failed:', e)
          migrationOk = false
        }
      }
      cursor = res.data.records.length === 100 ? res.data.cursor : undefined
    } while (cursor)
  }

  // Migrate settings (single record keyed by literal:self)
  try {
    const res = await agent.com.atproto.repo.getRecord({ repo: did, collection: OLD_COLLECTIONS.settings, rkey: 'self' })
    if (res.success) {
      await agent.com.atproto.repo.putRecord({ repo: did, collection: SETTINGS_COLLECTION, rkey: 'self', record: { ...(res.data.value as object), $type: SETTINGS_COLLECTION } })
      await agent.com.atproto.repo.deleteRecord({ repo: did, collection: OLD_COLLECTIONS.settings, rkey: 'self' })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Missing settings record is normal; anything else is a real failure
    if (!msg.includes('RecordNotFound') && !msg.includes('not found')) {
      console.error('[postgame] settings migration failed:', e)
      migrationOk = false
    }
  }

  if (migrationOk && typeof localStorage !== 'undefined') localStorage.setItem(key, '1')
}
