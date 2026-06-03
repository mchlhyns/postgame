'use client'

import { useEffect, useState, useCallback } from 'react'
import { Agent } from '@atproto/api'
import { TID } from '@atproto/common-web'
import { restoreSession, LIST_COLLECTION } from '@/lib/atproto'
import { ListRecord, ListRecordView } from '@/types'
import ListShareModal from '@/components/ListShareModal'

export interface CommunityList {
  uri: string
  cid: string
  value: ListRecord
  user: {
    did: string
    handle: string
    displayName: string | null
    avatar: string | null
  }
}

export default function MyListsPage() {
  const [session, setSession] = useState<{ agent: Agent; did: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [userHandle, setUserHandle] = useState<string | null>(null)
  const [lists, setLists] = useState<ListRecordView[]>([])
  const [sharingList, setSharingList] = useState<ListRecordView | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // New tab and community list state
  const [tab, setTab] = useState<'my' | 'community'>('my')
  const [communityLists, setCommunityLists] = useState<CommunityList[]>([])
  const [communityLoading, setCommunityLoading] = useState(false)

  useEffect(() => {
    restoreSession()
      .then((s) => {
        if (!s) { window.location.href = '/'; return }
        setSession(s)
        setLoading(false)
        s.agent.com.atproto.repo.describeRepo({ repo: s.did })
          .then((res) => setUserHandle(res.data.handle))
          .catch(() => {})
      })
      .catch(() => { window.location.href = '/' })
  }, [])

  const fetchLists = useCallback(async (agent: Agent, did: string) => {
    try {
      const res = await agent.com.atproto.repo.listRecords({ repo: did, collection: LIST_COLLECTION, limit: 100 })
      setLists(res.data.records as unknown as ListRecordView[])
    } catch { /* collection may not exist yet */ }
  }, [])

  useEffect(() => {
    if (!session) return
    fetchLists(session.agent, session.did)
  }, [session, fetchLists])



  // Fetch all lists from the community when the Community tab is active
  useEffect(() => {
    if (tab !== 'community') return
    setCommunityLoading(true)
    fetch('/api/appview/all-lists')
      .then((r) => r.json())
      .then((data) => {
        setCommunityLists(data.lists ?? [])
      })
      .catch(() => {})
      .finally(() => {
        setCommunityLoading(false)
      })
  }, [tab])

  async function handleCreateList(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !newName.trim()) { setCreateError('Please enter a name.'); return }
    setCreating(true)
    setCreateError('')
    try {
      const rkey = TID.nextStr()
      const now = new Date().toISOString()
      const url = userHandle ? `${window.location.origin}/${userHandle}/lists/${rkey}` : undefined
      const record: ListRecord = {
        $type: 'com.crashthearcade.list',
        name: newName.trim(),
        items: [],
        ...(url ? { url } : {}),
        createdAt: now,
        updatedAt: now,
      }
      await session.agent.com.atproto.repo.putRecord({
        repo: session.did,
        collection: LIST_COLLECTION,
        rkey,
        record: record as any,
      })
      window.location.href = `/lists/${rkey}`
    } catch (err: any) {
      setCreateError(err?.message ?? 'Failed to create.')
      setCreating(false)
    }
  }

  const sortedLists = [...lists].sort((a, b) => b.value.createdAt.localeCompare(a.value.createdAt))

  if (loading) return <main style={{ flex: 1 }} />

  return (
    <>
      <main>
        <div className="container page-top">
          <h1 className="browse-section-title">Lists</h1>

          <div className="page-header" style={{ marginTop: 0 }}>
            <div className="filter-tabs" style={{ margin: 0 }}>
              <button
                className={`filter-tab${tab === 'my' ? ' active' : ''}`}
                onClick={() => setTab('my')}
              >
                Your lists
              </button>
              <button
                className={`filter-tab${tab === 'community' ? ' active' : ''}`}
                onClick={() => setTab('community')}
              >
                Lists by others
              </button>
            </div>
            {tab === 'my' && (
              <button className="btn btn-primary" onClick={() => { setShowNewModal(true); setNewName(''); setCreateError('') }}>+ New list</button>
            )}
          </div>

          {tab === 'my' && (
            sortedLists.length === 0 ? (
              <div className="empty-state">
                <h3>No lists yet</h3>
                <p>Create a list to organize and rank your games.</p>
              </div>
            ) : (
              <div className="lists-community-grid">
                {sortedLists.map((list) => {
                  const rkey = list.uri.split('/').pop()!
                  return (
                    <div
                      key={list.uri}
                      className="game-card-grid"
                      onClick={() => window.location.href = `/lists/${rkey}`}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Covers Wrap (Middle with background color divider) */}
                      <div
                        className="game-card-grid-cover-wrap"
                        style={{
                          background: 'var(--tertiary)',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          padding: '24px',
                          aspectRatio: 'unset'
                        }}
                      >
                        <div className="list-card-covers">
                          {list.value.items.slice(0, 5).map((item) => (
                            <img key={item.igdbId} src={item.coverUrl || '/no-cover.png'} alt={item.title} className="list-card-cover" />
                          ))}
                          {Array.from({ length: Math.max(0, 3 - list.value.items.length) }).map((_, i) => (
                            <div key={`empty-${i}`} className="list-card-cover" />
                          ))}
                        </div>
                      </div>

                      {/* Info Footer (Bottom, identical spacing/style to community cards) */}
                      <div className="game-card-grid-info" style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div className="game-card-grid-title" style={{ fontSize: 'var(--text-base)', fontWeight: 900 }}>
                          {list.value.name}
                        </div>
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontFamily: 'Fustat, system-ui, -apple-system, sans-serif', flexGrow: 1 }}>
                          {list.value.items.length} game{list.value.items.length !== 1 ? 's' : ''}
                        </div>
                        <div style={{ marginTop: '12px' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            className="btn btn-basic"
                            style={{ width: '100%' }}
                            onClick={() => window.location.href = `/lists/${rkey}`}
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}



          {tab === 'community' && (
            communityLoading ? (
              <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Loading lists…</div>
            ) : communityLists.length === 0 ? (
              <div className="empty-state">
                <h3>No lists yet</h3>
                <p>Lists created by users across the network will appear here.</p>
              </div>
            ) : (
              <div className="lists-community-grid">
                {communityLists.map((list) => {
                  const rkey = list.uri.split('/').pop()!
                  const isOwnList = session && list.user.did === session.did
                  const viewUrl = isOwnList ? `/lists/${rkey}` : `/${list.user.handle}/lists/${rkey}`
                  return (
                    <div key={list.uri} className="game-card-grid" onClick={() => window.location.href = viewUrl} style={{ cursor: 'pointer' }}>
                      {/* Covers Wrap (Top with background color divider) */}
                      <div
                        className="game-card-grid-cover-wrap"
                        style={{
                          background: 'var(--tertiary)',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          padding: '24px',
                          aspectRatio: 'unset'
                        }}
                      >
                        <div className="list-card-covers">
                          {list.value.items.slice(0, 5).map((item) => (
                            <img key={item.igdbId} src={item.coverUrl || '/no-cover.png'} alt={item.title} className="list-card-cover" />
                          ))}
                          {Array.from({ length: Math.max(0, 3 - list.value.items.length) }).map((_, i) => (
                            <div key={`empty-${i}`} className="list-card-cover" />
                          ))}
                        </div>
                      </div>

                      {/* Info Footer (Bottom, identical spacing/style to My Lists cards) */}
                      <div className="game-card-grid-info" style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div className="game-card-grid-title" style={{ fontSize: 'var(--text-base)', fontWeight: 900 }}>
                          {list.value.name}
                        </div>
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontFamily: 'Fustat, system-ui, -apple-system, sans-serif', flexGrow: 1 }}>
                          {list.value.items.length} game{list.value.items.length !== 1 ? 's' : ''}
                        </div>

                        {/* Creator Badge (Pill/Badge style, compact and below the game count) */}
                        <div
                          style={{
                            alignSelf: 'flex-start',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'var(--tertiary)',
                            padding: '4px 8px',
                            borderRadius: 'var(--radius)',
                            cursor: 'pointer',
                            marginTop: '5px'
                          }}
                          onClick={(e) => { e.stopPropagation(); window.location.href = `/${list.user.handle}` }}
                        >
                          {list.user.avatar ? (
                            <img src={list.user.avatar} alt="" style={{ width: '16px', height: '16px', borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'var(--tertiary)' }} />
                          )}
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text)', fontWeight: 700 }}>
                            {list.user.displayName || `@${list.user.handle}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>
      </main>

      {/* New list modal */}
      {showNewModal && (
        <div className="modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h2>New list</h2>
            <form onSubmit={handleCreateList}>
              <div className="form-field">
                <label>Name</label>
                <input
                  className="input"
                  style={{ width: '100%' }}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. All-time favorites"
                  maxLength={100}
                  autoFocus
                />
              </div>
              {createError && <p className="error-msg">{createError}</p>}
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowNewModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating…' : 'Create list'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sharingList && (
        <ListShareModal
          list={sharingList}
          showNumbers={sharingList.value.numbered ?? true}
          onClose={() => setSharingList(null)}
        />
      )}
    </>
  )
}
