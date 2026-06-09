import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const forwardedHost = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const host = forwardedHost || req.headers.get('host') || new URL(req.url).host
  const proto = forwardedProto || new URL(req.url).protocol.replace(':', '')
  const origin = `${proto}://${host}`

  return NextResponse.json({
    client_id: `${origin}/oauth-client-metadata.json`,
    client_name: 'postgame',
    client_uri: origin,
    redirect_uris: [`${origin}/oauth/callback`],
    scope: 'atproto blob:image/* repo:at.postgame.game?action=create repo:at.postgame.game?action=update repo:at.postgame.game?action=delete repo:at.postgame.list?action=create repo:at.postgame.list?action=update repo:at.postgame.list?action=delete repo:at.postgame.follow?action=create repo:at.postgame.follow?action=update repo:at.postgame.follow?action=delete repo:at.postgame.settings?action=create repo:at.postgame.settings?action=update repo:at.postgame.settings?action=delete repo:com.crashthearcade.game?action=read repo:com.crashthearcade.game?action=delete repo:com.crashthearcade.list?action=read repo:com.crashthearcade.list?action=delete repo:com.crashthearcade.follow?action=read repo:com.crashthearcade.follow?action=delete repo:com.crashthearcade.settings?action=read repo:com.crashthearcade.settings?action=delete',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    dpop_bound_access_tokens: true,
  })
}
