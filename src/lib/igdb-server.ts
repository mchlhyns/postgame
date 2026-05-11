let _cachedToken: { access_token: string; expires_at: number } | null = null

export async function getIgdbToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.expires_at) {
    return _cachedToken.access_token
  }
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${process.env.IGDB_CLIENT_ID}&client_secret=${process.env.IGDB_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: 'POST' }
  )
  if (!res.ok) throw new Error('Failed to get IGDB token')
  const data = await res.json()
  _cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  }
  return _cachedToken.access_token
}

export async function igdbQuery(token: string, endpoint: string, body: string): Promise<unknown> {
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': process.env.IGDB_CLIENT_ID!,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body,
    next: { revalidate: 3600 },
  })
  if (!res.ok) throw new Error(`IGDB ${endpoint} error: ${res.status}`)
  return res.json()
}
