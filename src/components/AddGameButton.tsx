'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { Agent } from '@atproto/api'
import { IgdbGame, GameStatus, GameRecord, GameRecordView } from '@/types'
import { restoreSession, COLLECTION } from '@/lib/atproto'
import { isoToDateInput, dateInputToISO, COMMON_PLATFORMS, normalizeStatus, inferPlayedStatus, inferBackloggedStatus, formatDate } from '@/lib/igdb'
import AddGameModal, { STATUS_OPTIONS, decodeStatusKey, encodeStatusKey } from '@/components/AddGameModal'
import Select from '@/components/Select'
import { StarRatingInput } from '@/components/Stars'

type GameProp = Pick<IgdbGame, 'id' | 'name' | 'url' | 'first_release_date' | 'platforms'> & {
  coverUrl?: string
  screenshotUrl?: string
}

interface Props {
  game: GameProp
}

function playthroughLabel(record: GameRecordView, index: number): string {
  if (record.value.startedAt) return formatDate(record.value.startedAt)
  return `Playthrough ${index + 1}`
}

export default function AddGameButton({ game }: Props) {
  const [session, setSession] = useState<{ agent: Agent; did: string } | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [records, setRecords] = useState<GameRecordView[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingRecord, setEditingRecord] = useState<GameRecordView | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    restoreSession()
      .then(async (s) => {
        setSession(s)
        setSessionReady(true)
        if (!s) return
        try {
          const found: GameRecordView[] = []
          let cursor: string | undefined
          do {
            const res = await s.agent.com.atproto.repo.listRecords({
              repo: s.did,
              collection: COLLECTION,
              limit: 100,
              cursor,
            })
            for (const r of res.data.records as unknown as GameRecordView[]) {
              if (r.value.game.igdbId === game.id) found.push(r)
            }
            cursor = res.data.cursor
          } while (cursor)
          setRecords(found)
        } catch {}
      })
      .catch(() => setSessionReady(true))
  }, [game.id])

  useEffect(() => {
    if (!dropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

  function handleRecordUpdated(updated: GameRecordView) {
    setRecords(rs => rs.map(r => r.uri === updated.uri ? updated : r))
    setEditingRecord(null)
  }

  function handleRecordDeleted(uri: string) {
    setRecords(rs => rs.filter(r => r.uri !== uri))
    setEditingRecord(null)
  }

  if (!sessionReady) return <div style={{ height: 36, marginBottom: 20 }} />

  if (!session) {
    return (
      <a href="/" className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginBottom: 20 }}>
        Sign in to add
      </a>
    )
  }

  if (records.length === 0) {
    return (
      <>
        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', marginBottom: 20 }}
          onClick={() => setShowAddModal(true)}
        >
          + Add to library
        </button>
        {showAddModal && (
          <AddGameModal
            agent={session.agent}
            did={session.did}
            onClose={() => setShowAddModal(false)}
            onAdded={(record) => { setRecords([record]); setShowAddModal(false) }}
            initialGame={game as IgdbGame & { coverUrl?: string }}
          />
        )}
      </>
    )
  }

  const hasAnyFinished = records.some((r) => normalizeStatus(r.value.status) === 'played')

  if (records.length === 1) {
    return (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => setEditingRecord(records[0])}
          >
            Edit in library
          </button>
          {hasAnyFinished && (
            <button
              className="btn btn-ghost"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => setShowAddModal(true)}
            >
              + New playthrough
            </button>
          )}
        </div>
        {editingRecord && (
          <EditModal
            record={editingRecord}
            agent={session.agent}
            did={session.did}
            onSaved={handleRecordUpdated}
            onDeleted={() => handleRecordDeleted(editingRecord.uri)}
            onClose={() => setEditingRecord(null)}
          />
        )}
        {showAddModal && (
          <AddGameModal
            agent={session.agent}
            did={session.did}
            onClose={() => setShowAddModal(false)}
            onAdded={(record) => { setRecords(rs => [...rs, record]); setShowAddModal(false) }}
            initialGame={game as IgdbGame & { coverUrl?: string }}
            defaultIsReplay
          />
        )}
      </>
    )
  }

  return (
    <>
      <div ref={dropdownRef} style={{ position: 'relative', marginBottom: 20 }}>
        <button
          className="btn btn-ghost"
          style={{ width: '100%', justifyContent: 'space-between' }}
          onClick={() => setDropdownOpen(o => !o)}
        >
          <span>In library</span>
          <ChevronDown size={16} style={{ flexShrink: 0 }} />
        </button>
        {dropdownOpen && (
          <div className="playthrough-dropdown">
            {records.map((r, i) => (
              <button
                key={r.uri}
                className="playthrough-dropdown-item"
                onClick={() => { setEditingRecord(r); setDropdownOpen(false) }}
              >
                {playthroughLabel(r, i)}
              </button>
            ))}
            {hasAnyFinished && (
              <>
                <div className="playthrough-dropdown-divider" />
                <button
                  className="playthrough-dropdown-item playthrough-dropdown-new"
                  onClick={() => { setShowAddModal(true); setDropdownOpen(false) }}
                >
                  + New playthrough
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {editingRecord && (
        <EditModal
          record={editingRecord}
          agent={session.agent}
          did={session.did}
          onSaved={handleRecordUpdated}
          onDeleted={() => handleRecordDeleted(editingRecord.uri)}
          onClose={() => setEditingRecord(null)}
        />
      )}
      {showAddModal && (
        <AddGameModal
          agent={session.agent}
          did={session.did}
          onClose={() => setShowAddModal(false)}
          onAdded={(record) => { setRecords(rs => [...rs, record]); setShowAddModal(false) }}
          initialGame={game as IgdbGame & { coverUrl?: string }}
        />
      )}
    </>
  )
}

function EditModal({ record, agent, did, onSaved, onDeleted, onClose }: {
  record: GameRecordView
  agent: Agent
  did: string
  onSaved: (updated: GameRecordView) => void
  onDeleted: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Partial<GameRecord>>({
    status: normalizeStatus(record.value.status) as GameStatus,
    playedStatus: inferPlayedStatus(record.value.status, record.value.playedStatus),
    platform: record.value.platform,
    rating: record.value.rating,
    startedAt: record.value.startedAt,
    finishedAt: record.value.finishedAt,
    isReplay: record.value.isReplay,
    backloggedStatus: record.value.backloggedStatus,
    owned: record.value.owned ?? false,
    reviewBlogUri: record.value.reviewBlogUri,
  })
  const [saving, setSaving] = useState(false)
  const [blogPosts, setBlogPosts] = useState<{ uri: string; title: string }[]>([])
  const [freshCoverUrl, setFreshCoverUrl] = useState<string | null>(null)
  const [refreshingArt, setRefreshingArt] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!overflowOpen) return
    function handleMouseDown(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) setOverflowOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [overflowOpen])

  useEffect(() => {
    async function fetchBlogPosts() {
      try {
        const settingsRes = await agent.com.atproto.repo.getRecord({
          repo: did,
          collection: 'com.crashthearcade.settings',
          rkey: 'self'
        }).catch(() => null)

        const blogPublicationUri = (settingsRes?.data?.value as any)?.blogPublicationUri
        if (!blogPublicationUri) return

        const docsRes = await agent.com.atproto.repo.listRecords({
          repo: did,
          collection: 'site.standard.document',
          limit: 100
        })

        const posts = (docsRes.data.records ?? [])
          .filter((r: any) => r.value && r.value.site === blogPublicationUri)
          .map((r: any) => ({
            uri: r.uri,
            title: r.value?.title || 'Untitled Post'
          }))

        setBlogPosts(posts)
      } catch (err) {
        console.error('Failed to load blog posts in modal:', err)
      }
    }
    fetchBlogPosts()
  }, [agent, did])

  async function refreshArtwork() {
    setRefreshingArt(true)
    try {
      const res = await fetch(`/api/igdb/game-data?ids=${record.value.game.igdbId}`)
      if (!res.ok) return
      const data = await res.json()
      const fresh = data[record.value.game.igdbId]
      if (fresh?.coverUrl) setFreshCoverUrl(fresh.coverUrl)
    } catch {}
    finally { setRefreshingArt(false) }
  }

  async function save() {
    setSaving(true)
    const uriParts = record.uri.split('/')
    const rkey = uriParts[uriParts.length - 1]
    const recordCollection = uriParts[uriParts.length - 2]
    try {
      const newStatus = draft.status ?? record.value.status
      const norm = normalizeStatus(newStatus)
      const isDone = norm === 'played'
      const updated: GameRecord = {
        ...record.value,
        ...draft,
        $type: 'com.crashthearcade.game',
        game: freshCoverUrl
          ? { ...record.value.game, coverUrl: freshCoverUrl }
          : record.value.game,
        playedStatus: isDone ? (draft.playedStatus ?? inferPlayedStatus(newStatus)) : undefined,
        backloggedStatus: norm === 'backlogged' ? (draft.backloggedStatus ?? inferBackloggedStatus(newStatus)) : undefined,
        finishedAt: isDone ? (draft.finishedAt ?? new Date().toISOString()) : draft.finishedAt,
        owned: draft.owned || undefined,
        reviewBlogUri: draft.reviewBlogUri || undefined,
        updatedAt: newStatus !== record.value.status ? new Date().toISOString() : record.value.updatedAt,
      }
      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: recordCollection,
        rkey,
        record: updated as unknown as Record<string, unknown>,
      })
      onSaved({ ...record, value: updated })
    } catch (err) {
      console.error('Failed to update:', err)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirm(`Remove "${record.value.game.title}" from your collection?`)) return
    const uriParts = record.uri.split('/')
    const rkey = uriParts[uriParts.length - 1]
    const recordCollection = uriParts[uriParts.length - 2]
    try {
      await agent.com.atproto.repo.deleteRecord({ repo: did, collection: recordCollection, rkey })
      onDeleted()
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  const currentStatusKey = encodeStatusKey(draft.status ?? record.value.status, draft.playedStatus, draft.backloggedStatus)
  const decoded = decodeStatusKey(currentStatusKey)
  const baseStatus = decoded.status

  const statusOptions = [
    { value: 'playing', title: 'Playing', subtitle: 'In progress now' },
    { value: 'backlogged', title: 'Backlogged', subtitle: 'Queued to play' },
    { value: 'shelved', title: 'Shelved', subtitle: 'Paused for now' },
    { value: 'wishlisted', title: 'Wishlisted', subtitle: 'Want to buy or play' },
    { value: 'played', title: 'Played', subtitle: 'Played, not finished' },
    { value: 'completed', title: 'Completed', subtitle: 'Beat the main story' },
    { value: 'mastered', title: 'Mastered', subtitle: 'Completed 100%' },
    { value: 'abandoned', title: 'Abandoned', subtitle: 'Dropped for good' },
  ]

  function handleMainStatusSelect(mainVal: string) {
    const d = decodeStatusKey(mainVal)
    setDraft((prev) => ({
      ...prev,
      status: d.status as GameStatus,
      playedStatus: d.playedStatus,
      backloggedStatus: d.backloggedStatus,
      rating: d.status !== 'played' ? undefined : prev.rating
    }))
  }

  function handleSubStatusSelect(subVal: string) {
    let targetKey = subVal
    if (currentStatusKey === subVal) {
      targetKey = subVal === 'shelved' ? 'backlogged' : 'played'
    }
    const d = decodeStatusKey(targetKey)
    setDraft((prev) => ({
      ...prev,
      status: d.status as GameStatus,
      playedStatus: d.playedStatus,
      backloggedStatus: d.backloggedStatus
    }))
  }

  return (
    <div className="modal-fullscreen-overlay" onClick={onClose}>
      <div className="modal modal-fullscreen" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <h2 style={{ margin: 0 }}>Edit playthrough</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="list-overflow-wrap" ref={overflowRef}>
              <button className="btn btn-ghost list-overflow-btn" onClick={() => setOverflowOpen(o => !o)} title="More options">⋯</button>
              {overflowOpen && (
                <div className="list-overflow-menu">
                  <button
                    className="list-overflow-option"
                    onMouseDown={(e) => { e.preventDefault(); setOverflowOpen(false); refreshArtwork() }}
                    disabled={refreshingArt}
                  >
                    {refreshingArt ? 'Refreshing…' : freshCoverUrl ? 'Artwork updated ✓' : 'Refresh artwork'}
                  </button>
                </div>
              )}
            </div>
            <button className="modal-close-btn" onClick={onClose} aria-label="Close">
              <X size={24} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 32, alignItems: 'center' }}>
          <img
            src={freshCoverUrl ?? record.value.game.coverUrl ?? '/no-cover.png'}
            alt={record.value.game.title}
            style={{ width: 64, height: 86, borderRadius: 6, objectFit: 'cover', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', flexShrink: 0 }}
          />
          <div>
            <div style={{ fontWeight: 900, fontSize: 'var(--text-lg)' }}>{record.value.game.title}</div>
            {record.value.game.releaseYear && (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 4 }}>{record.value.game.releaseYear}</div>
            )}
          </div>
        </div>

        <div className="form-field">
          <label>Status</label>
          <div className="status-pill-grid">
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`status-pill${currentStatusKey === opt.value ? ' active' : ''}`}
                onClick={() => handleSubStatusSelect(opt.value)}
              >
                <span className="status-pill-title">{opt.title}</span>
                <span className="status-pill-subtitle">{opt.subtitle}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="form-row" style={{ gridTemplateColumns: '2fr 1fr 1fr', gap: 16 }}>
          <div className="form-field">
            <label>Platform</label>
            <Select
              variant="input"
              value={draft.platform ?? ''}
              onChange={(v) => setDraft((d) => ({ ...d, platform: v || undefined }))}
              options={[
                { value: '', label: '—' },
                ...COMMON_PLATFORMS.map((p) => ({ value: p, label: p })),
                ...(draft.platform && !COMMON_PLATFORMS.includes(draft.platform) ? [{ value: draft.platform, label: draft.platform }] : []),
              ]}
            />
          </div>
          <div className="form-field">
            <label>Replay</label>
            <Select
              variant="input"
              value={draft.isReplay ? 'yes' : ''}
              onChange={(v) => setDraft((d) => ({ ...d, isReplay: v === 'yes' || undefined }))}
              options={[{ value: '', label: 'No' }, { value: 'yes', label: 'Yes' }]}
            />
          </div>
          <div className="form-field">
            <label>Ownership</label>
            <Select
              variant="input"
              value={draft.owned ? 'yes' : ''}
              onChange={(v) => setDraft((d) => ({ ...d, owned: v === 'yes' }))}
              options={[
                { value: 'yes', label: 'Owned' },
                { value: '', label: 'Not Owned' }
              ]}
            />
          </div>
        </div>

        {baseStatus !== 'backlogged' && baseStatus !== 'wishlisted' && (
          <div className="form-row" style={{ gridTemplateColumns: '2fr 1fr 1fr', gap: 16 }}>
            <div className="form-field" style={{ marginBottom: 16 }}>
              <label>Started Date</label>
              <input
                className="input"
                type="date"
                value={isoToDateInput(draft.startedAt)}
                onChange={(e) => setDraft((d) => ({ ...d, startedAt: dateInputToISO(e.target.value) }))}
              />
            </div>
            {baseStatus === 'played' ? (
              <div className="form-field" style={{ marginBottom: 16, gridColumn: 'span 2' }}>
                <label>Finished Date</label>
                <input
                  className="input"
                  type="date"
                  value={isoToDateInput(draft.finishedAt)}
                  onChange={(e) => setDraft((d) => ({ ...d, finishedAt: dateInputToISO(e.target.value) }))}
                />
              </div>
            ) : (
              <div style={{ gridColumn: 'span 2' }} />
            )}
          </div>
        )}

        {baseStatus === 'played' && (
          <div className="played-details-group">
            <div className="form-field" style={{ margin: 0 }}>
              <label style={{ marginBottom: 8 }}>Rating</label>
              <StarRatingInput value={draft.rating} onChange={(v) => setDraft((d) => ({ ...d, rating: v }))} />
            </div>

            {blogPosts.length > 0 && (
              <div className="form-field" style={{ margin: 0 }}>
                <label>Link review</label>
                <span className="settings-subtext">Attach a review from your linked publication</span>
                <Select
                  variant="input"
                  value={draft.reviewBlogUri ?? ''}
                  onChange={(v) => setDraft((d) => ({ ...d, reviewBlogUri: v || undefined }))}
                  options={[
                    { value: '', label: '— No review linked —' },
                    ...blogPosts.map((p) => ({ value: p.uri, label: p.title }))
                  ]}
                />
              </div>
            )}
          </div>
        )}

        <div className="form-actions" style={{ marginTop: 'auto', paddingTop: 24, gap: 12 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: 'var(--danger)', borderColor: 'var(--danger)', marginRight: 'auto' }}
            onClick={remove}
          >
            Delete
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
