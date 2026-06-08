import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const forwardedHost = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto') ?? 'https'
  const origin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : new URL(req.url).origin

  return NextResponse.json({
    client_id: `${origin}/oauth-client-metadata.json`,
    client_name: 'postgame',
    client_uri: origin,
    redirect_uris: [`${origin}/oauth/callback`],
    scope: 'atproto repo:at.postgame.game repo:at.postgame.settings repo:at.postgame.list repo:at.postgame.follow blob:image/*',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    dpop_bound_access_tokens: true,
  })
}
