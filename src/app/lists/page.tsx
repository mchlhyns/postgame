'use client'

import { useEffect, useState, useCallback } from 'react'
import { Agent } from '@atproto/api'
import { TID } from '@atproto/common-web'
import { restoreSession, LIST_COLLECTION } from '@/lib/atproto'
import { ListRecord, ListRecordView } from '@/types'
import ListShareModal from '@/components/ListShareModal'

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
        <div className="container">
          <div className="page-header">
            <h1 className="lists-page-header">Lists</h1>
            <button className="btn btn-primary" onClick={() => { setShowNewModal(true); setNewName(''); setCreateError('') }}>+ New list</button>
          </div>

          {sortedLists.length === 0 ? (
            <div className="empty-state">
              <h3>No lists yet</h3>
              <p>Create a list to organize and rank your games.</p>
            </div>
          ) : (
            <div className="lists-grid">
              {sortedLists.map((list) => {
                const rkey = list.uri.split('/').pop()!
                return (
                  <div key={list.uri} className="list-card" onClick={() => window.location.href = `/lists/${rkey}`}>
                    <div className="list-card-covers">
                      {list.value.items.slice(0, 3).map((item) => (
                        item.coverUrl
                          ? <img key={item.igdbId} src={item.coverUrl} alt={item.title} className="list-card-cover" />
                          : <div key={item.igdbId} className="list-card-cover" />
                      ))}
                      {Array.from({ length: Math.max(0, 3 - list.value.items.length) }).map((_, i) => (
                        <div key={`empty-${i}`} className="list-card-cover" />
                      ))}
                    </div>
                    <div className="list-card-info">
                      <div className="list-card-name">{list.value.name}</div>
                      <div className="list-card-count">
                        {list.value.items.length} game{list.value.items.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="list-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn btn-ghost"
                        onClick={() => setSharingList(list)}
                        disabled={list.value.items.length === 0}
                      >
                        Share
                      </button>
                      <button className="btn btn-basic" onClick={() => window.location.href = `/lists/${rkey}`}>Edit</button>
                    </div>
                  </div>
                )
              })}
            </div>
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
