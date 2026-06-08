'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Agent } from '@atproto/api'
import { restoreSession, COLLECTION, LIST_COLLECTION } from '@/lib/atproto'
import { GameRecordView, IgdbGame, ListItem, ListRecord, ListRecordView } from '@/types'
import { formatIgdbGame, abbreviatePlatform } from '@/lib/igdb'
import ListShareModal from '@/components/ListShareModal'

type SearchResult = { igdbId: number; title: string; coverUrl?: string; year?: number; platforms?: string }

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
  const [games, setGames] = useState<GameRecordView[]>([])
  const [name, setName] = useState('')
  const [items, setItems] = useState<ListItem[]>([])
  const [query, setQuery] = useState('')
  const [igdbResults, setIgdbResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
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
  const [linkCopied, setLinkCopied] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const awardPickerRef = useRef<HTMLDivElement>(null)
  const overflowRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!overflowOpen) return
    function handleMouseDown(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false)
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
    function handleMouseDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  useEffect(() => {
    restoreSession()
      .then(async (s) => {
        if (!s) { window.location.href = '/'; return }
        setSession(s)
        s.agent.com.atproto.repo.describeRepo({ repo: s.did })
          .then((res) => setUserHandle(res.data.handle))
          .catch(() => {})

        try {
          const [listRes, gamesRes] = await Promise.all([
            s.agent.com.atproto.repo.getRecord({ repo: s.did, collection: LIST_COLLECTION, rkey }),
            s.agent.com.atproto.repo.listRecords({ repo: s.did, collection: COLLECTION, limit: 100 }),
          ])
          const listRecord = { uri: listRes.data.uri, cid: listRes.data.cid, value: listRes.data.value } as unknown as ListRecordView
          setList(listRecord)
          setName(listRecord.value.name)
          setItems(listRecord.value.items ?? [])
          setShowNumbers(listRecord.value.numbered !== false)
          setGames(gamesRes.data.records as unknown as GameRecordView[])
        } catch {
          window.location.href = '/lists'
          return
        }

        setLoading(false)
      })
      .catch(() => { window.location.href = '/' })
  }, [rkey])

  // Debounced IGDB search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (query.length < 2) { setIgdbResults([]); setSearchOpen(false); return }
    setSearchOpen(true)
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/igdb/search?q=${encodeURIComponent(query)}`)
        if (!res.ok) return
        const data = await res.json()
        const formatted = (data.games ?? []).map(formatIgdbGame) as (IgdbGame & { coverUrl?: string })[]
        setIgdbResults(formatted.map((g) => ({
          igdbId: g.id,
          title: g.name,
          coverUrl: g.coverUrl,
          year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : undefined,
          platforms: g.platforms?.map((p) => abbreviatePlatform(p.name)).join(', '),
        })))
      } catch { /* ignore */ } finally {
        setSearching(false)
      }
    }, 400)
  }, [query])

  // Deduped collection sorted by title
  const collectionMap = Object.values(
    games.reduce<Record<number, GameRecordView>>((acc, r) => {
      const id = r.value.game.igdbId
      if (!acc[id] || r.value.createdAt > acc[id].value.createdAt) acc[id] = r
      return acc
    }, {})
  ).sort((a, b) => a.value.game.title.localeCompare(b.value.game.title))

  const collectionResults = collectionMap
    .filter((g) => query.trim() === '' || g.value.game.title.toLowerCase().includes(query.toLowerCase()))
  const collectionIgdbIds = new Set(collectionMap.map((g) => g.value.game.igdbId))
  const filteredIgdbResults = igdbResults.filter((g) => !collectionIgdbIds.has(g.igdbId))

  function addItem(result: SearchResult) {
    setItems((prev) => [...prev, { igdbId: result.igdbId, title: result.title, coverUrl: result.coverUrl, position: prev.length + 1 }])
    setQuery('')
    setIgdbResults([])
    setSearchOpen(false)
    setSaved(false)
  }

  function addFromCollection(record: GameRecordView) {
    const g = record.value.game
    addItem({ igdbId: g.igdbId, title: g.title, coverUrl: g.coverUrl })
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
      const itemsWithPositions = items.map((item, i) => ({ ...item, position: i + 1 }))
      const now = new Date().toISOString()
      const url = userHandle ? `${window.location.origin}/${userHandle}/lists/${rkey}` : list.value.url
      const record: ListRecord = { ...list.value, name: name.trim(), items: itemsWithPositions, numbered: effectiveNumbered, url, updatedAt: now }
      await session.agent.com.atproto.repo.putRecord({ repo: session.did, collection: LIST_COLLECTION, rkey, record: record as any })
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
      const record: ListRecord = {
        ...list.value,
        name: `${list.value.name} (copy)`,
        createdAt: now,
        updatedAt: now,
        url: undefined,
      }
      const res = await session.agent.com.atproto.repo.createRecord({ repo: session.did, collection: LIST_COLLECTION, record: record as any })
      const newRkey = res.data.uri.split('/').pop()!
      if (userHandle) {
        const url = `${window.location.origin}/${userHandle}/lists/${newRkey}`
        await session.agent.com.atproto.repo.putRecord({ repo: session.did, collection: LIST_COLLECTION, rkey: newRkey, record: { ...record, url } as any })
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
      await session.agent.com.atproto.repo.deleteRecord({ repo: session.did, collection: LIST_COLLECTION, rkey })
      window.location.href = '/lists'
    } catch (err: any) {
      setError(err?.message ?? 'Failed to delete.')
      setDeleting(false)
    }
  }

  const showCollectionSection = collectionResults.length > 0
  const showIgdbSection = query.length >= 2 && (searching || filteredIgdbResults.length > 0)
  const showNoResults = query.length >= 2 && !searching && collectionResults.length === 0 && filteredIgdbResults.length === 0

  if (loading) return <main style={{ flex: 1 }} />

  const currentList: ListRecordView = list
    ? { ...list, value: { ...list.value, name: name.trim() || list.value.name, items } }
    : list!

  return (
    <>
      <main>
        <div className="container">
          <div className="list-edit-header">
            <a href="/lists" className="list-edit-back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </a>
            <input
              ref={nameInputRef}
              className="list-edit-name-input"
              value={name}
              onChange={(e) => { setName(e.target.value); setSaved(false) }}
              placeholder="List name"
              maxLength={100}
            />
            <div ref={searchRef} className="list-edit-search-wrap">
              <input
                className="input list-edit-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => (showCollectionSection || showIgdbSection || showNoResults) && setSearchOpen(true)}
                placeholder="Add games to list"
                autoComplete="off"
              />
              {searchOpen && (showCollectionSection || showIgdbSection || showNoResults) && (
                <div className="search-results list-edit-search-results">
                  {showCollectionSection && (
                    <>
                      {query.trim() !== '' && <div className="list-modal-results-label" style={{ padding: '4px 12px 2px' }}>Your collection</div>}
                      {collectionResults.slice(0, 20).map((record) => {
                        const g = record.value.game
                        return (
                          <div key={g.igdbId} className="list-modal-add-item search-result-item" onMouseDown={(e) => { e.preventDefault(); addFromCollection(record) }}>
                            <img src={g.coverUrl ?? '/no-cover.png'} alt="" className="list-modal-add-item-cover" />
                            <div className="list-modal-add-item-info">
                              <span className="list-modal-add-item-title">{g.title}</span>
                              {record.value.platform && <span className="list-modal-add-item-platforms">{record.value.platform}</span>}
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )}
                  {showIgdbSection && (
                    <>
                      <div className="list-modal-results-label" style={{ padding: '4px 12px 2px', marginTop: showCollectionSection ? 4 : 0 }}>
                        {searching ? 'Searching…' : 'From IGDB'}
                      </div>
                      {filteredIgdbResults.slice(0, 10).map((g) => (
                        <div key={g.igdbId} className="list-modal-add-item search-result-item" onMouseDown={(e) => { e.preventDefault(); addItem(g) }}>
                          <img src={g.coverUrl ?? '/no-cover.png'} alt="" className="list-modal-add-item-cover" />
                          <div className="list-modal-add-item-info">
                            <span className="list-modal-add-item-title">{g.title}</span>
                            {(g.year || g.platforms) && (
                              <span className="list-modal-add-item-platforms">{[g.year, g.platforms].filter(Boolean).join(' · ')}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {showNoResults && (
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', padding: '8px 12px' }}>No results found.</div>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {saved && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--accent)' }}>Saved</span>}
              {error && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)' }}>{error}</span>}
              <div className="list-overflow-wrap" ref={overflowRef}>
                <button
                  className="btn btn-ghost list-overflow-btn"
                  onClick={() => setOverflowOpen((o) => !o)}
                  title="More options"
                >⋯</button>
                {overflowOpen && (
                  <div className="list-overflow-menu">
                    <button
                      className="list-overflow-option"
                      onMouseDown={(e) => { e.preventDefault(); const next = !showNumbers; setShowNumbers(next); setOverflowOpen(false); handleSave(next) }}
                    >
                      Numbered list
                      <span>{showNumbers ? '✓' : ''}</span>
                    </button>
                    {userHandle && (
                      <button
                        className="list-overflow-option"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          const url = `${window.location.origin}/${userHandle}/lists/${rkey}`
                          navigator.clipboard.writeText(url).then(() => {
                            setLinkCopied(true)
                            setTimeout(() => setLinkCopied(false), 2000)
                          })
                          setOverflowOpen(false)
                        }}
                      >
                        {linkCopied ? 'Copied!' : 'Copy link'}
                      </button>
                    )}
                    <button
                      className="list-overflow-option"
                      onMouseDown={(e) => { e.preventDefault(); handleDuplicate() }}
                      disabled={duplicating}
                    >
                      {duplicating ? 'Duplicating…' : 'Duplicate list'}
                    </button>
                    <button
                      className="list-overflow-option"
                      onMouseDown={(e) => { e.preventDefault(); setOverflowOpen(false); setTimeout(() => nameInputRef.current?.focus(), 0) }}
                    >
                      Rename
                    </button>
                    <button
                      className="list-overflow-option"
                      onMouseDown={(e) => { e.preventDefault(); setOverflowOpen(false); if (items.length > 0) setSharingList(currentList) }}
                      disabled={items.length === 0}
                    >
                      Share
                    </button>
                    <div className="list-overflow-divider" />
                    <button
                      className="list-overflow-option list-overflow-option-danger"
                      onMouseDown={(e) => { e.preventDefault(); setConfirmDelete(true); setOverflowOpen(false) }}
                    >
                      Delete list
                    </button>
                  </div>
                )}
              </div>
              <button className="btn btn-primary" onClick={() => handleSave()} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          <div className="list-edit-body">
            {items.length === 0 ? (
              <div className="list-modal-empty">Search for games using the bar above to add them</div>
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
                      <img src={item.coverUrl ?? '/no-cover.png'} alt="" className="list-modal-item-cover" />
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

        </div>
      </main>

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
