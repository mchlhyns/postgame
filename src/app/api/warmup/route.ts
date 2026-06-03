import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const base = new URL(req.url).origin

  const [igdb, appview] = await Promise.allSettled([
    fetch(`${base}/api/igdb/trending`),
    fetch(`${base}/api/appview/trending`),
  ])

  return NextResponse.json({
    igdb: igdb.status,
    appview: appview.status,
  })
}
