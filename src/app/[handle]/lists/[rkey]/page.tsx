'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
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
        <div className="container">
          {loading ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          ) : error || !list ? (
            <div className="empty-state">
              <h3>List not found</h3>
              <p>This list may have been deleted or doesn't exist.</p>
            </div>
          ) : (
            <>
              <div className="list-edit-header" style={{ marginBottom: 24 }}>
                <a href={profileHref} className="list-edit-back">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </a>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flex: 1, gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '1.375rem', fontWeight: 700 }}>{list.value.name}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                    <a href={profileHref} style={{ color: 'inherit', textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>@{resolvedHandle ?? cleanHandle}</a> · {list.value.items.length} game{list.value.items.length !== 1 ? 's' : ''}
                  </div>
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
                    <div key={item.igdbId} className="public-list-item">
                      <a href={`/games/${item.igdbId}`} style={{ display: 'block', lineHeight: 0, flexShrink: 0 }}>
                        {item.coverUrl
                          ? <img src={item.coverUrl} alt={item.title} className="public-list-cover" />
                          : <div className="public-list-cover" />
                        }
                      </a>
                      <div className="public-list-meta">
                        {list.value.numbered !== false && <span className="public-list-rank">#{i + 1}</span>}
                        <a href={`/games/${item.igdbId}`} className="public-list-title">{item.title}</a>
                        {item.award && <div className="public-list-award">{item.award}</div>}
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
