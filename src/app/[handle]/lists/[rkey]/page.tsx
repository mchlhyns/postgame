'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Trophy } from 'lucide-react'
import { LIST_COLLECTION, resolveHandleToPds } from '@/lib/atproto'
import { ListRecordView } from '@/types'

export default function PublicListPage() {
  const { handle, rkey } = useParams<{ handle: string; rkey: string }>()
  const [list, setList] = useState<ListRecordView | null>(null)
  const [resolvedHandle, setResolvedHandle] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!handle || !rkey) return
    const cleanHandle = (handle as string).replace(/^@/, '')

    resolveHandleToPds(cleanHandle)
      .then(async ({ did, pdsUrl }) => {
        const [descRes, listRes] = await Promise.all([
          fetch(`${pdsUrl}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`),
          fetch(`${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${LIST_COLLECTION}&rkey=${encodeURIComponent(rkey)}`),
        ])
        if (!listRes.ok) throw new Error('List not found')
        const [descData, listData] = await Promise.all([descRes.json(), listRes.json()])
        setResolvedHandle(descRes.ok ? (descData.handle ?? cleanHandle) : cleanHandle)
        setList({ uri: listData.uri, cid: listData.cid, value: listData.value } as ListRecordView)
      })
      .catch((err) => setError(err.message ?? 'Something went wrong'))
      .finally(() => setLoading(false))
  }, [handle, rkey])

  const cleanHandle = (handle as string)?.replace(/^@/, '') ?? ''
  const profileHref = `/${resolvedHandle ?? cleanHandle}`

  return (
    <>
      <main>
        <div className="container page-top">
          {loading ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          ) : error || !list ? (
            <div className="empty-state">
              <h3>List not found</h3>
              <p>This list may have been deleted or doesn't exist.</p>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 24 }}>
                <h1 className="browse-section-title">{list.value.name}</h1>
                <div style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', marginTop: -24, marginBottom: 32 }}>
                  <a href={profileHref} style={{ color: 'inherit', textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>@{resolvedHandle ?? cleanHandle}</a> · {list.value.items.length} game{list.value.items.length !== 1 ? 's' : ''}
                </div>
              </div>

              {list.value.items.length === 0 ? (
                <div className="empty-state">
                  <h3>No games yet</h3>
                  <p>This list is empty.</p>
                </div>
              ) : (
                <div className="public-list-items">
                  {list.value.items.map((item, i) => (
                    <div key={item.igdbId} className="game-card-grid">
                      <a href={`/games/${item.igdbId}`} style={{ display: 'block', lineHeight: 0 }}>
                        <img src={item.coverUrl || '/no-cover.png'} alt={item.title} className="game-card-grid-cover" />
                      </a>
                      <div className="game-card-grid-info">
                        {list.value.numbered !== false && <span className="public-list-rank">#{i + 1}</span>}
                        <div className="game-card-grid-title">
                          <a href={`/games/${item.igdbId}`}>{item.title}</a>
                        </div>
                        {item.award && (
                          <div className="public-list-award">
                            <Trophy size={12} />
                            {item.award}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  )
}
