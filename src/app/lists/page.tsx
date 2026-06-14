'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Agent } from '@atproto/api'
import { TID } from '@atproto/common-web'
import { restoreSession, LIST_COLLECTION, LIST_ITEM_COLLECTION } from '@/lib/atproto'
import { ListItem, ListItemRecord, ListRecord, ListRecordView } from '@/types'
import { bskyAvatar } from '@/lib/appview-fetch'
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

  const [openMenuRkey, setOpenMenuRkey] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const menuDropdownRef = useRef<HTMLDivElement | null>(null)

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
      const itemsByList = new Map<string, ListItem[]>()
      let cursor: string | undefined
      do {
        const itemsRes = await agent.com.atproto.repo.listRecords({ repo: did, collection: LIST_ITEM_COLLECTION, limit: 100, cursor })
        if (!itemsRes.success || itemsRes.data.records.length === 0) break
        for (const rec of itemsRes.data.records) {
          const val = rec.value as unknown as ListItemRecord
          if (!val.listUri) continue
          if (!itemsByList.has(val.listUri)) itemsByList.set(val.listUri, [])
          itemsByList.get(val.listUri)!.push({
            igdbId: val.game.igdbId, title: val.game.title, coverUrl: val.game.coverUrl,
            position: val.position ?? 0, award: val.award,
          })
        }
        cursor = itemsRes.data.records.length === 100 ? itemsRes.data.cursor : undefined
      } while (cursor)
      for (const items of itemsByList.values()) items.sort((a, b) => a.position - b.position)

      const listsRes = await agent.com.atproto.repo.listRecords({ repo: did, collection: LIST_COLLECTION, limit: 100 })
      setLists((listsRes.data.records as unknown as ListRecordView[]).map(rec => {
        const items = itemsByList.get(rec.uri) ?? rec.value.items ?? []
        return { ...rec, value: { ...rec.value, items } }
      }))
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

  useEffect(() => {
    if (!openMenuRkey) return
    function handleOutside(e: MouseEvent) {
      const triggerEl = menuRefs.current[openMenuRkey!]
      const dropdownEl = menuDropdownRef.current
      if (triggerEl?.contains(e.target as Node) || dropdownEl?.contains(e.target as Node)) return
      setOpenMenuRkey(null)
      setMenuPos(null)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [openMenuRkey])

  async function handleDeleteList(rkey: string) {
    if (!session) return
    if (!confirm('Delete this list? This cannot be undone.')) return
    try {
      const listView = lists.find(l => l.uri.split('/').pop() === rkey)
      if (listView) {
        const itemsRes = await session.agent.com.atproto.repo.listRecords({ repo: session.did, collection: LIST_ITEM_COLLECTION, limit: 100 })
        const itemRkeys = itemsRes.data.records
          .filter(rec => (rec.value as unknown as ListItemRecord).listUri === listView.uri)
          .map(rec => rec.uri.split('/').pop()!)
        if (itemRkeys.length > 0) {
          await session.agent.com.atproto.repo.applyWrites({
            repo: session.did,
            writes: itemRkeys.map(itemRkey => ({ $type: 'com.atproto.repo.applyWrites#delete', collection: LIST_ITEM_COLLECTION, rkey: itemRkey })) as any,
          })
        }
      }
      await session.agent.com.atproto.repo.deleteRecord({ repo: session.did, collection: LIST_COLLECTION, rkey })
      setLists((prev) => prev.filter((l) => l.uri.split('/').pop() !== rkey))
    } catch (err: any) {
      alert(err?.message ?? 'Failed to delete list.')
    }
  }

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
        $type: 'at.postgame.list',
        name: newName.trim(),
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

  const sortedLists = [...lists].filter(l => (l.value.items ?? []).length > 0).sort((a, b) => b.value.createdAt.localeCompare(a.value.createdAt))

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
                      onClick={() => { if (userHandle) window.location.href = `/${userHandle}/lists/${rkey}` }}
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
                          {(() => {
                              const r = (list.value.items ?? []).slice(0, 5)
                              return [r[1], r[2], r[0], r[3], r[4]].map((item, i) =>
                                item
                                  ? <img loading="lazy" decoding="async" key={item.igdbId} src={item.coverUrl || '/no-cover.png'} alt={item.title} className="list-card-cover" />
                                  : <div key={`empty-${i}`} className="list-card-cover" />
                              )
                            })()}
                        </div>
                      </div>

                      {/* Info Footer (Bottom, identical spacing/style to community cards) */}
                      <div className="game-card-grid-info" style={{ padding: '16px', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                          <div className="game-card-grid-title">{list.value.name}</div>
                          <div className="browse-card-meta">
                            {(list.value.items ?? []).length} game{(list.value.items ?? []).length !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <div
                          ref={(el) => { menuRefs.current[rkey] = el }}
                          className="list-overflow-wrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="btn btn-ghost list-overflow-btn"
                            onClick={(e) => {
                              if (openMenuRkey === rkey) { setOpenMenuRkey(null); setMenuPos(null); return }
                              const rect = e.currentTarget.getBoundingClientRect()
                              setMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
                              setOpenMenuRkey(rkey)
                            }}
                            aria-label="List options"
                          >⋯</button>
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
                {communityLists.filter(list => !session || list.user.did !== session.did).map((list) => {
                  const rkey = list.uri.split('/').pop()!
                  const viewUrl = `/${list.user.handle}/lists/${rkey}`
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
                          {(() => {
                              const r = (list.value.items ?? []).slice(0, 5)
                              return [r[1], r[2], r[0], r[3], r[4]].map((item, i) =>
                                item
                                  ? <img loading="lazy" decoding="async" key={item.igdbId} src={item.coverUrl || '/no-cover.png'} alt={item.title} className="list-card-cover" />
                                  : <div key={`empty-${i}`} className="list-card-cover" />
                              )
                            })()}
                        </div>
                      </div>

                      {/* Info Footer (Bottom, identical spacing/style to My Lists cards) */}
                      <div className="game-card-grid-info" style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div className="game-card-grid-title">{list.value.name}</div>
                        <div className="browse-card-meta" style={{ flexGrow: 1 }}>
                          {(list.value.items ?? []).length} game{(list.value.items ?? []).length !== 1 ? 's' : ''}
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
                            <img loading="lazy" decoding="async" src={bskyAvatar(list.user.avatar)} alt="" style={{ width: '16px', height: '16px', borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'var(--tertiary)' }} />
                          )}
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text)', fontWeight: 800 }}>
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

      {/* Card overflow menu — rendered outside the card to escape overflow:hidden */}
      {openMenuRkey && menuPos && (
        <div
          ref={menuDropdownRef}
          className="list-overflow-menu"
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 1000 }}
        >
          <button className="list-overflow-option" onClick={() => { setOpenMenuRkey(null); window.location.href = `/lists/${openMenuRkey}` }}>
            Edit
          </button>
          <div className="list-overflow-divider" />
          <button className="list-overflow-option list-overflow-option-danger" onClick={() => { const rkey = openMenuRkey; setOpenMenuRkey(null); handleDeleteList(rkey) }}>
            Delete
          </button>
        </div>
      )}

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
