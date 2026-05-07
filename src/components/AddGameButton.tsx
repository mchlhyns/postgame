'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
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
          + Add to collection
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

  if (records.length === 1) {
    return (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => setEditingRecord(records[0])}
          >
            Edit in collection
          </button>
          <button
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => setShowAddModal(true)}
          >
            + New playthrough
          </button>
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
          <span>In collection</span>
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
            <div className="playthrough-dropdown-divider" />
            <button
              className="playthrough-dropdown-item playthrough-dropdown-new"
              onClick={() => { setShowAddModal(true); setDropdownOpen(false) }}
            >
              + New playthrough
            </button>
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
    notes: record.value.notes,
    startedAt: record.value.startedAt,
    finishedAt: record.value.finishedAt,
    isReplay: record.value.isReplay,
    backloggedStatus: record.value.backloggedStatus,
  })
  const [saving, setSaving] = useState(false)

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
        playedStatus: isDone ? (draft.playedStatus ?? inferPlayedStatus(newStatus)) : undefined,
        backloggedStatus: norm === 'backlogged' ? (draft.backloggedStatus ?? inferBackloggedStatus(newStatus)) : undefined,
        finishedAt: isDone ? (draft.finishedAt ?? new Date().toISOString()) : draft.finishedAt,
        updatedAt: new Date().toISOString(),
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
          <img
            src={record.value.game.coverUrl ?? '/no-cover.png'}
            alt={record.value.game.title}
            style={{ width: 48, height: 64, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}
          />
          <div>
            <div style={{ fontWeight: 600 }}>{record.value.game.title}</div>
            {record.value.game.releaseYear && (
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{record.value.game.releaseYear}</div>
            )}
          </div>
        </div>

        <div className="form-field">
          <label>Status</label>
          <Select
            variant="input"
            value={encodeStatusKey(draft.status ?? record.value.status, draft.playedStatus, draft.backloggedStatus)}
            onChange={(key) => { const d = decodeStatusKey(key); setDraft((prev) => ({ ...prev, status: d.status as GameStatus, playedStatus: d.playedStatus, backloggedStatus: d.backloggedStatus })) }}
            options={STATUS_OPTIONS}
          />
        </div>

        <div className="form-row" style={{ gridTemplateColumns: '2fr 1fr' }}>
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
        </div>

        <div className="form-field" style={{ marginBottom: 8 }}>
          <label>Notes</label>
          <textarea
            className="input"
            rows={3}
            value={draft.notes ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value || undefined }))}
            placeholder="Optional notes"
          />
        </div>

        <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="form-field">
            <label>Started</label>
            <input
              className="input"
              type="date"
              value={isoToDateInput(draft.startedAt)}
              onChange={(e) => setDraft((d) => ({ ...d, startedAt: dateInputToISO(e.target.value) }))}
            />
          </div>
          <div className="form-field">
            <label>Finished</label>
            <input
              className="input"
              type="date"
              value={isoToDateInput(draft.finishedAt)}
              onChange={(e) => setDraft((d) => ({ ...d, finishedAt: dateInputToISO(e.target.value) }))}
            />
          </div>
        </div>

        <div className="form-field">
          <label style={{ marginBottom: 4 }}>Rating</label>
          <StarRatingInput value={draft.rating} onChange={(v) => setDraft((d) => ({ ...d, rating: v }))} />
        </div>

        <div className="form-actions">
          <button
            className="btn btn-ghost"
            style={{ color: 'var(--danger)', borderColor: 'var(--danger)', marginRight: 'auto' }}
            onClick={remove}
          >
            Delete
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
