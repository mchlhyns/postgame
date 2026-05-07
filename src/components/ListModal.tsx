'use client'

import { useState, useEffect, useRef } from 'react'
import { Agent } from '@atproto/api'
import { GameRecordView, IgdbGame, ListItem, ListRecordView, ListRecord } from '@/types'
import { LIST_COLLECTION } from '@/lib/atproto'
import { formatIgdbGame } from '@/lib/igdb'

interface Props {
  agent: Agent
  did: string
  games: GameRecordView[]
  list?: ListRecordView
  onClose: () => void
  onSaved: (list: ListRecordView) => void
  onDeleted?: (uri: string) => void
}

type SearchResult = { igdbId: number; title: string; coverUrl?: string; year?: number }

export default function ListModal({ agent, did, games, list, onClose, onSaved, onDeleted }: Props) {
  const isEdit = !!list
  const [name, setName] = useState(list?.value.name ?? '')
  const [items, setItems] = useState<ListItem[]>(list?.value.items ?? [])
  const [query, setQuery] = useState('')
  const [igdbResults, setIgdbResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  // Debounced IGDB search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (query.length < 2) { setIgdbResults([]); return }
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
        })))
      } catch {
        // ignore
      } finally {
        setSearching(false)
      }
    }, 400)
  }, [query])

  // Deduped collection, sorted by title
  const collectionMap = Object.values(
    games.reduce<Record<number, GameRecordView>>((acc, r) => {
      const id = r.value.game.igdbId
      if (!acc[id] || r.value.createdAt > acc[id].value.createdAt) acc[id] = r
      return acc
    }, {})
  ).sort((a, b) => a.value.game.title.localeCompare(b.value.game.title))

  const inListIds = new Set(items.map((i) => i.igdbId))

  // Collection results: filter by query (instant), exclude already-in-list
  const collectionResults = collectionMap
    .filter((g) => !inListIds.has(g.value.game.igdbId))
    .filter((g) => query.trim() === '' || g.value.game.title.toLowerCase().includes(query.toLowerCase()))

  // IGDB results: exclude games already in list OR already in collection results
  const collectionIgdbIds = new Set(collectionMap.map((g) => g.value.game.igdbId))
  const filteredIgdbResults = igdbResults.filter(
    (g) => !inListIds.has(g.igdbId) && !collectionIgdbIds.has(g.igdbId)
  )

  function addItem(result: SearchResult) {
    setItems((prev) => [...prev, { igdbId: result.igdbId, title: result.title, coverUrl: result.coverUrl, position: prev.length + 1 }])
    setQuery('')
    setIgdbResults([])
  }

  function addFromCollection(record: GameRecordView) {
    const g = record.value.game
    addItem({ igdbId: g.igdbId, title: g.title, coverUrl: g.coverUrl })
  }

  function moveUp(index: number) {
    if (index === 0) return
    setItems((prev) => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }

  function moveDown(index: number) {
    setItems((prev) => {
      if (index === prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
  }

  function removeItem(igdbId: number) {
    setItems((prev) => prev.filter((i) => i.igdbId !== igdbId))
  }

  async function handleSave() {
    if (!name.trim()) { setError('Please enter a list name.'); return }
    setSaving(true)
    setError('')
    try {
      const itemsWithPositions = items.map((item, i) => ({ ...item, position: i + 1 }))
      const now = new Date().toISOString()

      if (isEdit) {
        const rkey = list!.uri.split('/').pop()!
        const record: ListRecord = { ...list!.value, name: name.trim(), items: itemsWithPositions, updatedAt: now }
        await agent.com.atproto.repo.putRecord({ repo: did, collection: LIST_COLLECTION, rkey, record: record as any })
        onSaved({ uri: list!.uri, cid: list!.cid, value: record })
      } else {
        const record: ListRecord = {
          $type: 'com.crashthearcade.list',
          name: name.trim(),
          items: itemsWithPositions,
          createdAt: now,
          updatedAt: now,
        }
        const res = await agent.com.atproto.repo.createRecord({ repo: did, collection: LIST_COLLECTION, record: record as any })
        onSaved({ uri: res.data.uri, cid: res.data.cid, value: record })
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!list) return
    setDeleting(true)
    try {
      const rkey = list.uri.split('/').pop()!
      await agent.com.atproto.repo.deleteRecord({ repo: did, collection: LIST_COLLECTION, rkey })
      onDeleted?.(list.uri)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to delete.')
    } finally {
      setDeleting(false)
    }
  }

  const showCollectionSection = collectionResults.length > 0
  const showIgdbSection = query.length >= 2 && (searching || filteredIgdbResults.length > 0)
  const showNoResults = query.length >= 2 && !searching && collectionResults.length === 0 && filteredIgdbResults.length === 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'Edit list' : 'New list'}</h2>

        <div className="list-modal-body">
          {/* Left: ordered items */}
          <div className="list-modal-left">
            <div className="form-field" style={{ marginBottom: 8 }}>
              <label>Name</label>
              <input
                ref={nameRef}
                className="input"
                style={{ width: '100%' }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. All-time favorites"
                maxLength={100}
              />
            </div>

            <label className="list-modal-section-label">
              Games
              {items.length > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>({items.length})</span>}
            </label>

            {items.length === 0 ? (
              <div className="list-modal-empty">Add games from the right →</div>
            ) : (
              <div className="list-modal-items">
                {items.map((item, i) => (
                  <div key={item.igdbId} className="list-modal-item">
                    <span className="list-modal-item-rank">{i + 1}</span>
                    <img src={item.coverUrl ?? '/no-cover.png'} alt="" className="list-modal-item-cover" />
                    <span className="list-modal-item-title">{item.title}</span>
                    <div className="list-modal-item-actions">
                      <button className="list-modal-item-btn" onClick={() => moveUp(i)} disabled={i === 0} title="Move up">↑</button>
                      <button className="list-modal-item-btn" onClick={() => moveDown(i)} disabled={i === items.length - 1} title="Move down">↓</button>
                      <button className="list-modal-item-btn list-modal-item-btn-remove" onClick={() => removeItem(item.igdbId)} title="Remove">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: search + add */}
          <div className="list-modal-right">
            <label className="list-modal-section-label">Add games</label>
            <input
              className="input"
              style={{ width: '100%', marginBottom: 8 }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your collection or IGDB…"
              autoComplete="off"
            />

            <div className="list-modal-add-results">
              {showCollectionSection && (
                <>
                  {query.trim() !== '' && (
                    <div className="list-modal-results-label">Your collection</div>
                  )}
                  {collectionResults.slice(0, 30).map((record) => {
                    const g = record.value.game
                    return (
                      <div key={g.igdbId} className="list-modal-add-item" onClick={() => addFromCollection(record)}>
                        <img src={g.coverUrl ?? '/no-cover.png'} alt="" className="list-modal-add-item-cover" />
                        <span className="list-modal-add-item-title">{g.title}</span>
                      </div>
                    )
                  })}
                </>
              )}

              {showIgdbSection && (
                <>
                  <div className="list-modal-results-label" style={{ marginTop: showCollectionSection ? 8 : 0 }}>
                    {searching ? 'Searching IGDB…' : 'From IGDB'}
                  </div>
                  {filteredIgdbResults.slice(0, 10).map((g) => (
                    <div key={g.igdbId} className="list-modal-add-item" onClick={() => addItem(g)}>
                      <img src={g.coverUrl ?? '/no-cover.png'} alt="" className="list-modal-add-item-cover" />
                      <span className="list-modal-add-item-title">{g.title}</span>
                      {g.year && <span className="list-modal-add-item-year">{g.year}</span>}
                    </div>
                  ))}
                </>
              )}

              {showNoResults && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', padding: '8px 4px' }}>No results found.</div>
              )}
            </div>
          </div>
        </div>

        {error && <p className="error-msg">{error}</p>}

        <div className="form-actions" style={{ justifyContent: 'space-between', marginTop: 16 }}>
          {isEdit ? (
            <button
              className="btn btn-ghost"
              style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete list'}
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {isEdit && <button className="btn btn-ghost" onClick={onClose}>Cancel</button>}
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Create list'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
