import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin

  return NextResponse.json({
    client_id: `${origin}/oauth-client-metadata.json`,
    client_name: 'postgame',
    client_uri: origin,
    redirect_uris: [`${origin}/oauth/callback`],
    scope: 'atproto blob:image/*',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    dpop_bound_access_tokens: true,
  })
}
