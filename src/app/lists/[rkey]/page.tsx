'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Agent } from '@atproto/api'
import { restoreSession, LIST_COLLECTION, LIST_ITEM_COLLECTION } from '@/lib/atproto'
import { ListItem, ListItemRecord, ListRecord, ListRecordView } from '@/types'
import ListShareModal from '@/components/ListShareModal'
import HeaderSearch from '@/components/HeaderSearch'


const AWARDS = [
  'Personal Impact',
  'Favorite Story',
  'Childhood Nostalgia',
  'Not Usually My Thing',
  'Best Combat',
  'Favorite Art Style',
  'Best Soundtrack',
  'Best Multiplayer',
  'Underrated',
  'Overhated',
  'Criminally Overlooked',
  'Needs a Remake',
]

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style={{ display: 'block' }}>
      <circle cx="4" cy="3" r="1.2" /><circle cx="10" cy="3" r="1.2" />
      <circle cx="4" cy="7" r="1.2" /><circle cx="10" cy="7" r="1.2" />
      <circle cx="4" cy="11" r="1.2" /><circle cx="10" cy="11" r="1.2" />
    </svg>
  )
}

export default function ListEditPage() {
  const { rkey } = useParams<{ rkey: string }>()
  const [session, setSession] = useState<{ agent: Agent; did: string } | null>(null)
  const [userHandle, setUserHandle] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<ListRecordView | null>(null)
const [name, setName] = useState('')
  const [items, setItems] = useState<ListItem[]>([])
  const [addGameOpen, setAddGameOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const [sharingList, setSharingList] = useState<ListRecordView | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [awardPickerFor, setAwardPickerFor] = useState<number | null>(null)
  const [awardPickerUp, setAwardPickerUp] = useState(false)
  const [customAward, setCustomAward] = useState('')
  const [showNumbers, setShowNumbers] = useState(true) // initialized from record after load
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [overflowPos, setOverflowPos] = useState<{ top: number; right: number } | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [isNew, setIsNew] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const existingItemRkeys = useRef<string[]>([])
  const awardPickerRef = useRef<HTMLDivElement>(null)
  const overflowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!overflowOpen) return
    function handleMouseDown(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false)
        setOverflowPos(null)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [overflowOpen])

  useEffect(() => {
    if (awardPickerFor === null) return
    function handleMouseDown(e: MouseEvent) {
      if (awardPickerRef.current && !awardPickerRef.current.contains(e.target as Node)) {
        setAwardPickerFor(null)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [awardPickerFor])


  useEffect(() => {
    restoreSession()
      .then(async (s) => {
        if (!s) { window.location.href = '/'; return }
        setSession(s)
        s.agent.com.atproto.repo.describeRepo({ repo: s.did })
          .then((res) => setUserHandle(res.data.handle))
          .catch(() => {})

        try {
          const listRes = await s.agent.com.atproto.repo.getRecord({ repo: s.did, collection: LIST_COLLECTION, rkey })
          const listRecord = { uri: listRes.data.uri, cid: listRes.data.cid, value: listRes.data.value } as unknown as ListRecordView
          setList(listRecord)
          setName(listRecord.value.name)
          setShowNumbers(listRecord.value.numbered !== false)

          // Load items from list.item records; fall back to inline items during migration window
          const itemEntries: { item: ListItem; rkey: string }[] = []
          let cursor: string | undefined
          do {
            const itemsRes = await s.agent.com.atproto.repo.listRecords({ repo: s.did, collection: LIST_ITEM_COLLECTION, limit: 100, cursor })
            if (!itemsRes.success || itemsRes.data.records.length === 0) break
            for (const rec of itemsRes.data.records) {
              const val = rec.value as unknown as ListItemRecord
              if (val.listUri !== listRecord.uri) continue
              itemEntries.push({
                rkey: rec.uri.split('/').pop()!,
                item: { igdbId: val.game.igdbId, title: val.game.title, coverUrl: val.game.coverUrl, position: val.position ?? itemEntries.length + 1, award: val.award },
              })
            }
            cursor = itemsRes.data.records.length === 100 ? itemsRes.data.cursor : undefined
          } while (cursor)

          if (itemEntries.length > 0) {
            itemEntries.sort((a, b) => a.item.position - b.item.position)
            existingItemRkeys.current = itemEntries.map(e => e.rkey)
            setItems(itemEntries.map(e => e.item))
          } else {
            const inlineItems = listRecord.value.items ?? []
            setIsNew(inlineItems.length === 0)
            setItems(inlineItems)
          }
        } catch {
          window.location.href = '/lists'
          return
        }

        setLoading(false)
      })
      .catch(() => { window.location.href = '/' })
  }, [rkey])

  function addItem(game: { igdbId: number; title: string; coverUrl?: string }) {
    setItems((prev) => [...prev, { igdbId: game.igdbId, title: game.title, coverUrl: game.coverUrl, position: prev.length + 1 }])
    setSaved(false)
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
    setSaved(false)
  }

  function setAward(index: number, award: string | undefined) {
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, award } : item))
    setAwardPickerFor(null)
    setSaved(false)
  }

  // Drag handlers
  function handleDragStart(index: number) {
    setDragIndex(index)
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    setDragOverIndex(index)
  }

  function handleDrop(index: number) {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }
    setItems((prev) => {
      const next = [...prev]
      const [removed] = next.splice(dragIndex, 1)
      next.splice(index, 0, removed)
      return next
    })
    setDragIndex(null)
    setDragOverIndex(null)
    setSaved(false)
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  async function handleSave(numberedOverride?: boolean) {
    if (!session || !list) return
    if (!name.trim()) { setError('Please enter a list name.'); return }
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const effectiveNumbered = numberedOverride !== undefined ? numberedOverride : showNumbers
      const now = new Date().toISOString()
      const url = userHandle ? `${window.location.origin}/${userHandle}/lists/${rkey}` : list.value.url

      const writes: object[] = [
        ...existingItemRkeys.current.map(itemRkey => ({
          $type: 'com.atproto.repo.applyWrites#delete',
          collection: LIST_ITEM_COLLECTION,
          rkey: itemRkey,
        })),
        ...items.map((item, i) => ({
          $type: 'com.atproto.repo.applyWrites#create',
          collection: LIST_ITEM_COLLECTION,
          value: {
            $type: LIST_ITEM_COLLECTION,
            listUri: list!.uri,
            game: { igdbId: item.igdbId, title: item.title, ...(item.coverUrl ? { coverUrl: item.coverUrl } : {}) },
            position: i + 1,
            ...(item.award ? { award: item.award } : {}),
            addedAt: now,
          },
        })),
        {
          $type: 'com.atproto.repo.applyWrites#update',
          collection: LIST_COLLECTION,
          rkey,
          value: { $type: LIST_COLLECTION, name: name.trim(), numbered: effectiveNumbered, url, createdAt: list.value.createdAt, updatedAt: now },
        },
      ]

      await session.agent.com.atproto.repo.applyWrites({ repo: session.did, writes: writes as any })
      window.location.href = '/lists'
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDuplicate() {
    if (!session || !list) return
    setDuplicating(true)
    setOverflowOpen(false)
    try {
      const now = new Date().toISOString()
      const { items: _items, ...listWithoutItems } = list.value
      const record: ListRecord = { ...listWithoutItems, name: `${list.value.name} (copy)`, createdAt: now, updatedAt: now, url: undefined }
      const res = await session.agent.com.atproto.repo.createRecord({ repo: session.did, collection: LIST_COLLECTION, record: record as any })
      const newRkey = res.data.uri.split('/').pop()!
      const newListUri = res.data.uri

      if (userHandle) {
        const url = `${window.location.origin}/${userHandle}/lists/${newRkey}`
        await session.agent.com.atproto.repo.putRecord({ repo: session.did, collection: LIST_COLLECTION, rkey: newRkey, record: { ...record, url } as any })
      }

      if (items.length > 0) {
        const itemWrites = items.map((item, i) => ({
          $type: 'com.atproto.repo.applyWrites#create',
          collection: LIST_ITEM_COLLECTION,
          value: {
            $type: LIST_ITEM_COLLECTION,
            listUri: newListUri,
            game: { igdbId: item.igdbId, title: item.title, ...(item.coverUrl ? { coverUrl: item.coverUrl } : {}) },
            position: i + 1,
            ...(item.award ? { award: item.award } : {}),
            addedAt: now,
          },
        }))
        await session.agent.com.atproto.repo.applyWrites({ repo: session.did, writes: itemWrites as any })
      }

      window.location.href = `/lists/${newRkey}`
    } catch (err: any) {
      setError(err?.message ?? 'Failed to duplicate.')
      setDuplicating(false)
    }
  }

  async function handleDelete() {
    if (!session || !list) return
    setDeleting(true)
    try {
      if (existingItemRkeys.current.length > 0) {
        const itemWrites = existingItemRkeys.current.map(itemRkey => ({
          $type: 'com.atproto.repo.applyWrites#delete',
          collection: LIST_ITEM_COLLECTION,
          rkey: itemRkey,
        }))
        await session.agent.com.atproto.repo.applyWrites({ repo: session.did, writes: itemWrites as any })
      }
      await session.agent.com.atproto.repo.deleteRecord({ repo: session.did, collection: LIST_COLLECTION, rkey })
      window.location.href = '/lists'
    } catch (err: any) {
      setError(err?.message ?? 'Failed to delete.')
      setDeleting(false)
    }
  }

  if (loading) return <main style={{ flex: 1 }} />

  const currentList: ListRecordView = list
    ? { ...list, value: { ...list.value, name: name.trim() || list.value.name, items } }
    : list!

  return (
    <>
      <main>
        <div className="container page-top">
          <h1 className="browse-section-title">{isNew ? 'New list' : 'Edit list'}</h1>

          <div className="list-edit-header">
            <input
              ref={nameInputRef}
              className="input list-edit-name-input"
              value={name}
              onChange={(e) => { setName(e.target.value); setSaved(false) }}
              placeholder={isNew ? 'New list' : 'List name'}
              maxLength={100}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setAddGameOpen(true)}>Add game to list</button>
              <div className="list-overflow-wrap" ref={overflowRef}>
                <button
                  className="btn btn-ghost list-overflow-btn"
                  onClick={(e) => {
                    if (overflowOpen) { setOverflowOpen(false); setOverflowPos(null); return }
                    const rect = e.currentTarget.getBoundingClientRect()
                    setOverflowPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
                    setOverflowOpen(true)
                  }}
                  title="More options"
                >⋯</button>
              </div>
            </div>
          </div>

          <div className="list-edit-body">
            {items.length === 0 ? (
              <div className="list-modal-empty">No games yet — click "Add game" to get started</div>
            ) : (
              <div className="list-edit-items">
                  {items.map((item, i) => (
                    <div
                      key={i}
                      className={`list-edit-item${dragOverIndex === i && dragIndex !== i ? ' list-edit-item-over' : ''}`}
                      draggable
                      onDragStart={() => handleDragStart(i)}
                      onDragOver={(e) => handleDragOver(e, i)}
                      onDrop={() => handleDrop(i)}
                      onDragEnd={handleDragEnd}
                    >
                      <span className="list-edit-drag-handle" title="Drag to reorder"><GripIcon /></span>
                      {showNumbers && <span className="list-modal-item-rank">{i + 1}</span>}
                      <img loading="lazy" decoding="async" src={item.coverUrl ?? '/no-cover.png'} alt="" className="list-modal-item-cover" />
                      <span className="list-modal-item-title">{item.title}</span>
                      <div className="list-award-wrap" ref={awardPickerFor === i ? awardPickerRef : null}>
                        <button
                          className={`list-award-btn${item.award ? ' list-award-btn-set' : ''}`}
                          onClick={(e) => {
                            if (awardPickerFor === i) { setAwardPickerFor(null); return }
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                            setAwardPickerUp(rect.bottom + 320 > window.innerHeight)
                            setAwardPickerFor(i)
                            setCustomAward('')
                          }}
                          title={item.award ?? 'Add award'}
                        >
                          {item.award ?? '＋ Award'}
                        </button>
                        {awardPickerFor === i && (
                          <div className="list-award-picker" style={awardPickerUp ? { bottom: 'calc(100% + 6px)', top: 'auto' } : undefined}>
                            {AWARDS.map((a) => (
                              <button
                                key={a}
                                className={`list-award-option${item.award === a ? ' selected' : ''}`}
                                onMouseDown={(e) => { e.preventDefault(); setAward(i, item.award === a ? undefined : a) }}
                              >
                                {a}
                              </button>
                            ))}
                            <div className="list-award-custom" style={{ gridColumn: '1 / -1' }}>
                              <input
                                className="input"
                                style={{ flex: 1, fontSize: 'var(--text-xs)', padding: '7px 8px' }}
                                placeholder="Custom award…"
                                value={customAward}
                                onChange={(e) => setCustomAward(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && customAward.trim()) {
                                    setAward(i, customAward.trim())
                                    setCustomAward('')
                                  }
                                }}
                                maxLength={40}
                              />
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={!customAward.trim()}
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  if (customAward.trim()) {
                                    setAward(i, customAward.trim())
                                    setCustomAward('')
                                  }
                                }}
                              >
                                Set
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}
                                disabled={!item.award}
                                onMouseDown={(e) => { e.preventDefault(); setAward(i, undefined) }}
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <button
                        className="list-modal-item-btn list-modal-item-btn-remove"
                        onClick={() => removeItem(i)}
                        title="Remove"
                      >✕</button>
                    </div>
                  ))}
                </div>
            )}
          </div>

          <div className="list-edit-footer">
            {saved && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--accent)' }}>Saved</span>}
            {error && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)' }}>{error}</span>}
            <a href="/lists" className="btn btn-ghost">Cancel</a>
            <button className="btn btn-primary" onClick={() => handleSave()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

        </div>
      </main>

      {overflowOpen && overflowPos && (
        <div
          ref={overflowRef}
          className="list-overflow-menu"
          style={{ position: 'fixed', top: overflowPos.top, right: overflowPos.right, zIndex: 1000 }}
        >
          <button
            className="list-overflow-option"
            onMouseDown={(e) => { e.preventDefault(); const next = !showNumbers; setShowNumbers(next); setOverflowOpen(false); setOverflowPos(null); handleSave(next) }}
          >
            Ranked list
            <span>{showNumbers ? '✓' : ''}</span>
          </button>
          <button
            className="list-overflow-option"
            onMouseDown={(e) => { e.preventDefault(); handleDuplicate() }}
            disabled={duplicating}
          >
            {duplicating ? 'Duplicating…' : 'Duplicate list'}
          </button>
          <button
            className="list-overflow-option"
            onMouseDown={(e) => { e.preventDefault(); setOverflowOpen(false); setOverflowPos(null); setSharingList(currentList) }}
          >
            Share
          </button>
          <button
            className="list-overflow-option list-overflow-option-danger"
            onMouseDown={(e) => { e.preventDefault(); setConfirmDelete(true); setOverflowOpen(false); setOverflowPos(null) }}
          >
            Delete list
          </button>
        </div>
      )}

      <HeaderSearch
        open={addGameOpen}
        onOpen={() => setAddGameOpen(true)}
        onClose={() => setAddGameOpen(false)}
        onSelect={(game) => { addItem(game); setAddGameOpen(false) }}
      />

      {sharingList && (
        <ListShareModal
          list={sharingList}
          showNumbers={showNumbers}
          onClose={() => setSharingList(null)}
        />
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <h2>Delete list?</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: '8px 0 20px' }}>
              This will permanently delete "{list?.value.name}". This cannot be undone.
            </p>
            <div className="form-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button
                className="btn btn-ghost"
                style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
