'use client'

import { useState } from 'react'
import { Pencil, RotateCcw } from 'lucide-react'
import { Agent } from '@atproto/api'
import { GameRecordView, GameStatus, GameRecord } from '@/types'
import { COLLECTION } from '@/lib/atproto'
import { isoToDateInput, dateInputToISO, formatDate, statusClass, statusLabel, COMMON_PLATFORMS, normalizeStatus, inferPlayedStatus, inferBackloggedStatus, PLAYED_STATUS_LABELS } from '@/lib/igdb'
import Select from '@/components/Select'
import { STATUS_OPTIONS, decodeStatusKey, encodeStatusKey } from '@/components/AddGameModal'
import { Stars, StarRatingInput } from '@/components/Stars'

interface Props {
  record: GameRecordView
  agent?: Agent
  view?: 'list' | 'grid' | 'started'
  onUpdated?: (uri: string, value: GameRecord) => void
  onDeleted?: (uri: string) => void
  readonly?: boolean
}

export default function GameCard({ record, agent, view = 'list', onUpdated, onDeleted, readonly = false }: Props) {
  const { uri, value } = record
  const uriParts = uri.split('/')
  const rkey = uriParts[uriParts.length - 1]
  const recordCollection = uriParts[uriParts.length - 2]
  const platform = value.platform?.replace(/\s*\(Microsoft Windows\)/gi, '') || undefined
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Partial<GameRecord>>({})

  function startEdit() {
    setDraft({
      status: normalizeStatus(value.status) as GameStatus,
      playedStatus: inferPlayedStatus(value.status, value.playedStatus),
      platform: value.platform,
      rating: value.rating,
      notes: value.notes,
      startedAt: value.startedAt,
      finishedAt: value.finishedAt,
      isReplay: value.isReplay,
      backloggedStatus: value.backloggedStatus,
    })
    setEditing(true)
  }

  async function saveEdit() {
    if (!agent) return
    setSaving(true)
    try {
      const newStatus = draft.status ?? value.status
      const norm = normalizeStatus(newStatus)
      const isDone = norm === 'played'
      const updated: GameRecord = {
        ...value,
        ...draft,
        $type: 'com.crashthearcade.game',
        playedStatus: isDone ? (draft.playedStatus ?? inferPlayedStatus(newStatus)) : undefined,
        backloggedStatus: norm === 'backlogged' ? (draft.backloggedStatus ?? inferBackloggedStatus(newStatus)) : undefined,
        finishedAt: isDone ? (draft.finishedAt ?? new Date().toISOString()) : draft.finishedAt,
        updatedAt: new Date().toISOString(),
      }
      await agent.com.atproto.repo.putRecord({
        repo: agent.assertDid,
        collection: recordCollection,
        rkey,
        record: updated as unknown as Record<string, unknown>,
      })
      onUpdated?.(uri, updated)
      setEditing(false)
    } catch (err) {
      console.error('Failed to update record:', err)
    } finally {
      setSaving(false)
    }
  }

  async function deleteRecord() {
    if (!agent) return
    if (!confirm(`Remove "${value.game.title}" from your collection?`)) return
    try {
      await agent.com.atproto.repo.deleteRecord({
        repo: agent.assertDid,
        collection: recordCollection,
        rkey,
      })
      onDeleted?.(uri)
    } catch (err) {
      console.error('Failed to delete record:', err)
    }
  }

  const editModal = editing ? (
    <div className="modal-overlay" onClick={() => setEditing(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
          <img
            src={value.game.coverUrl ?? '/no-cover.png'}
            alt={value.game.title}
            style={{ width: 48, height: 64, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}
          />
          <div>
            <div style={{ fontWeight: 600 }}>{value.game.title}</div>
            {value.game.releaseYear && (
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{value.game.releaseYear}</div>
            )}
          </div>
        </div>

        <div className="form-field">
          <label>Status</label>
          <Select
            variant="input"
            value={encodeStatusKey(draft.status ?? value.status, draft.playedStatus, draft.backloggedStatus)}
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
          <button className="btn btn-ghost" style={{ color: 'var(--danger)', borderColor: 'var(--danger)',marginRight: 'auto' }} onClick={() => { setEditing(false); deleteRecord() }}>
            Delete
          </button>
          <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  if (view === 'started') {
    const bannerSrc = value.game.screenshotUrl
    const gameHref = `/games/${value.game.igdbId}`
    const coverEl = value.game.coverUrl ? (
      <a href={gameHref} style={{ display: 'block', lineHeight: 0, flexShrink: 0 }}>
        <img className="game-card-started-cover" src={value.game.coverUrl} alt={value.game.title} />
      </a>
    ) : (
      <img className="game-card-started-cover" src="/no-cover.png" alt={value.game.title} />
    )
    return (
      <>
        <div className="game-card-started">
          <div className="game-card-started-banner" style={bannerSrc ? { backgroundImage: `url(${bannerSrc})` } : undefined} />
          <div className="game-card-started-bottom">
            <div className="game-card-started-cover-wrap">{coverEl}</div>
            <div className="game-card-started-info">
              <div className="game-card-started-title">
                <a href={gameHref}>{value.game.title}</a>
                {value.isReplay && <span title="Replay" style={{ display: 'inline-flex', flexShrink: 0, marginLeft: 6 }}><RotateCcw size={15} style={{ color: 'var(--accent)' }} /></span>}
              </div>
              {(() => {
                const parts: string[] = []
                if (platform) parts.push(platform)
                if (value.startedAt) parts.push(`Started ${formatDate(value.startedAt)}`)
                return parts.length > 0 ? <div className="game-card-started-meta">{parts.join(' • ')}</div> : null
              })()}
              {value.rating && normalizeStatus(value.status) !== 'playing' && <div style={{ marginTop: 6 }}><Stars rating={value.rating / 2}  /></div>}
            </div>
          </div>
        </div>
        {!readonly && editModal}
      </>
    )
  }

  if (view === 'grid') {
    const gameHref = `/games/${value.game.igdbId}`
    return (
      <>
        <div className="game-card-grid">
          <div className="game-card-grid-cover-wrap">
            {value.game.coverUrl ? (
              <a href={gameHref} onClick={(e) => e.stopPropagation()} style={{ display: 'block', lineHeight: 0 }}>
                <img className="game-card-grid-cover" src={value.game.coverUrl} alt={value.game.title} />
              </a>
            ) : (
              <img className="game-card-grid-cover" src="/no-cover.png" alt={value.game.title} />
            )}
            {(() => {
              const norm = normalizeStatus(value.status)
              const sc = norm === 'played' || (norm === 'backlogged' && inferBackloggedStatus(value.status, value.backloggedStatus))
                ? statusClass(value.status, value.playedStatus, value.backloggedStatus)
                : null
              const hideBadge = sc === 'completed' || sc === 'finished'
              return sc && !hideBadge ? (
                <span className={`game-card-badge game-card-badge--${sc}`}>
                  {statusLabel(value.status, value.playedStatus, value.backloggedStatus)}
                </span>
              ) : null
            })()}
            {!readonly && (
              <button className="browse-card-action" onClick={(e) => { e.stopPropagation(); startEdit() }}>
                <Pencil size={16} strokeWidth={2} />
                Edit
              </button>
            )}
          </div>
          <div className="game-card-grid-info">
            <div className="game-card-grid-title">
              <a href={gameHref} onClick={(e) => e.stopPropagation()}>{value.game.title}</a>
              {value.isReplay && <span title="Replay" style={{ display: 'inline-flex', flexShrink: 0, marginLeft: 5 }}><RotateCcw size={13} style={{ color: 'var(--accent)' }} /></span>}
          </div>
            {platform && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 0 }}>
                {platform}
              </div>
            )}
            {normalizeStatus(value.status) === 'played' && value.rating && (
              <div><Stars rating={value.rating / 2}  /></div>
            )}
          </div>
        </div>
        {!readonly && editModal}
      </>
    )
  }

  return (
    <div className={`game-card game-card--${normalizeStatus(value.status)} game-card--${statusClass(value.status, value.playedStatus, value.backloggedStatus)}${inferBackloggedStatus(value.status, value.backloggedStatus) === 'shelved' ? ' game-card--shelved' : ''}`}>
      {value.game.coverUrl ? (
        <img className="game-card-cover" src={value.game.coverUrl} alt={value.game.title} />
      ) : (
        <img className="game-card-cover" src="/no-cover.png" alt={value.game.title} />
      )}

      <div className="game-card-body">
        <div className="game-card-title">
          <a href={`/games/${value.game.igdbId}`}>{value.game.title}</a>
          {value.isReplay && <span title="Replay" style={{ display: 'inline-flex', flexShrink: 0, marginLeft: 6 }}><RotateCcw size={12} style={{ color: 'var(--accent)' }} /></span>}
        </div>

        {(() => {
          const parts: string[] = []
          if (platform) parts.push(platform)
          const norm = normalizeStatus(value.status)
          const bs = inferBackloggedStatus(value.status, value.backloggedStatus)
          if (norm === 'backlogged' && bs === 'shelved') {
            const shelfDate = value.updatedAt ?? value.createdAt
            parts.push(`Shelved ${formatDate(shelfDate)}`)
          } else if (norm !== 'wishlisted' && norm !== 'backlogged') {
            if (value.startedAt && !value.finishedAt) parts.push(`Started ${formatDate(value.startedAt)}`)
            if (value.finishedAt) {
              const ps = inferPlayedStatus(value.status, value.playedStatus)
              const doneLabel = ps ? (PLAYED_STATUS_LABELS[ps] ?? 'Finished') : 'Finished'
              parts.push(`${doneLabel} ${formatDate(value.finishedAt)}`)
            }
          }
          return parts.length > 0 ? (
            <div className="game-card-meta">{parts.join(' • ')}</div>
          ) : null
        })()}

        {value.rating && (
          <div><Stars rating={value.rating / 2}  /></div>
        )}

        {value.notes && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{value.notes}</p>
        )}
      </div>

      {!readonly && (
        <div style={{ flexShrink: 0 }}>
          <button className="btn btn-ghost" onClick={startEdit}>Edit</button>
        </div>
      )}

      {!readonly && editModal}
    </div>
  )
}
