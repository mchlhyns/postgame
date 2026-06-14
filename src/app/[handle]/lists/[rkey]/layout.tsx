import type { Metadata } from 'next'
import { resolveHandleToPds, LIST_COLLECTION } from '@/lib/atproto-server'
import { ListRecord } from '@/types'

const APP_URL = 'https://postgame.at'

interface Props {
  params: Promise<{ handle: string; rkey: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, rkey } = await params
  const clean = handle.replace(/^@/, '')

  let listName = 'A list'
  let resolvedHandle = clean
  let description = `A game list on postgame`

  try {
    const { did, pdsUrl } = await resolveHandleToPds(clean)
    const [listRes, descRes] = await Promise.all([
      fetch(`${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${LIST_COLLECTION}&rkey=${encodeURIComponent(rkey)}`, { next: { revalidate: 3600 } }),
      fetch(`${pdsUrl}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`, { next: { revalidate: 3600 } }),
    ])
    if (listRes.ok) {
      const data = await listRes.json()
      const value = data.value as ListRecord
      listName = value.name
      if (descRes.ok) resolvedHandle = ((await descRes.json()).handle ?? clean)
      const count = (value.items ?? []).length
      description = `${count} game${count !== 1 ? 's' : ''} · by @${resolvedHandle} on postgame`
    }
  } catch { /* use defaults */ }

  const ogImage = `${APP_URL}/api/og/list/${encodeURIComponent(clean)}/${encodeURIComponent(rkey)}`

  return {
    title: listName,
    description,
    openGraph: {
      title: listName,
      description,
      url: `${APP_URL}/${clean}/lists/${rkey}`,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: listName,
      description,
      images: [ogImage],
    },
  }
}

export default function ListLayout({ children }: { children: React.ReactNode }) {
  return children
}
