'use client'

import { useState, useEffect, useRef } from 'react'
import { Check, FileText, Pencil, RotateCcw, X } from 'lucide-react'
import { Agent } from '@atproto/api'
import { GameRecordView, GameStatus, GameRecord } from '@/types'
import { COLLECTION } from '@/lib/atproto'
import { isoToDateInput, dateInputToISO, formatDate, statusClass, statusLabel, COMMON_PLATFORMS, normalizeStatus, inferPlayedStatus, inferBackloggedStatus, PLAYED_STATUS_LABELS, abbreviatePlatform } from '@/lib/igdb'
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
  const platform = value.platform ? abbreviatePlatform(value.platform) : undefined
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Partial<GameRecord>>({})
  const [freshCoverUrl, setFreshCoverUrl] = useState<string | null>(null)
  const [refreshingArt, setRefreshingArt] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [overflowPos, setOverflowPos] = useState<{ top: number; right: number } | null>(null)
  const overflowRef = useRef<HTMLDivElement>(null)
  const overflowMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!overflowOpen) return
    function handleMouseDown(e: MouseEvent) {
      if (overflowRef.current?.contains(e.target as Node) || overflowMenuRef.current?.contains(e.target as Node)) return
      setOverflowOpen(false)
      setOverflowPos(null)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [overflowOpen])

  async function refreshArtwork() {
    setRefreshingArt(true)
    try {
      const res = await fetch(`/api/igdb/game-data?ids=${value.game.igdbId}`)
      if (!res.ok) return
      const data = await res.json()
      const fresh = data[value.game.igdbId]
      if (fresh?.coverUrl) setFreshCoverUrl(fresh.coverUrl)
    } catch {}
    finally { setRefreshingArt(false) }
  }

  function startEdit() {
    setDraft({
      status: normalizeStatus(value.status) as GameStatus,
      playedStatus: inferPlayedStatus(value.status, value.playedStatus),
      platform: value.platform,
      rating: value.rating,
      startedAt: value.startedAt ?? value.createdAt,
      finishedAt: value.finishedAt,
      isReplay: value.isReplay,
      backloggedStatus: value.backloggedStatus,
      owned: value.owned ?? false,
      reviewBlogUri: value.reviewBlogUri,
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
        $type: 'at.postgame.game',
        game: freshCoverUrl ? { ...value.game, coverUrl: freshCoverUrl } : value.game,
        playedStatus: isDone ? (draft.playedStatus ?? inferPlayedStatus(newStatus)) : undefined,
        backloggedStatus: norm === 'backlogged' ? (draft.backloggedStatus ?? inferBackloggedStatus(newStatus)) : undefined,
        finishedAt: isDone ? (draft.finishedAt ?? new Date().toISOString()) : draft.finishedAt,
        owned: draft.owned || undefined,
        reviewBlogUri: draft.reviewBlogUri || undefined,
        updatedAt: newStatus !== value.status ? new Date().toISOString() : value.updatedAt,
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

  const currentStatusKey = editing ? encodeStatusKey(draft.status ?? value.status, draft.playedStatus, draft.backloggedStatus) : ''
  const decoded = editing ? decodeStatusKey(currentStatusKey) : { status: '' }
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

  const [blogPosts, setBlogPosts] = useState<{ url: string; title: string }[]>([])

  useEffect(() => {
    if (!agent || !editing) return
    const existingReviewUri = draft.reviewBlogUri
    async function fetchBlogPosts() {
      try {
        const settingsRes = await agent!.com.atproto.repo.getRecord({
          repo: agent!.assertDid,
          collection: 'at.postgame.settings',
          rkey: 'self'
        }).catch(() => null)

        const blogPublicationUri = (settingsRes?.data?.value as any)?.blogPublicationUri
        if (!blogPublicationUri) return

        const pubRkey = blogPublicationUri.split('/').pop()
        const pubRes = await agent!.com.atproto.repo.getRecord({
          repo: agent!.assertDid,
          collection: 'site.standard.publication',
          rkey: pubRkey,
        }).catch(() => null)
        const pubDomain: string = (pubRes?.data?.value as any)?.domain || (pubRes?.data?.value as any)?.url || ''
        const cleanDomain = pubDomain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '')

        const docsRes = await agent!.com.atproto.repo.listRecords({
          repo: agent!.assertDid,
          collection: 'site.standard.document',
          limit: 100
        })

        const posts = (docsRes.data.records ?? [])
          .filter((r: any) => r.value && r.value.site === blogPublicationUri)
          .map((r: any) => {
            const path: string = r.value?.path || ''
            const cleanPath = path.startsWith('/') ? path : `/${path}`
            const url = cleanDomain ? `https://${cleanDomain}${cleanPath}` : ''
            return { atUri: r.uri as string, url, title: r.value?.title || 'Untitled Post' }
          })
          .filter((p) => p.url)

        setBlogPosts(posts.map(({ url, title }) => ({ url, title })))

        // Migrate legacy AT URI to HTTP URL in the draft
        if (existingReviewUri?.startsWith('at://')) {
          const match = posts.find((p) => p.atUri === existingReviewUri)
          if (match) setDraft((d) => ({ ...d, reviewBlogUri: match.url }))
        }
      } catch (err) {
        console.error('Failed to load blog posts in modal:', err)
      }
    }
    fetchBlogPosts()
  }, [agent, editing])

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

  const editModal = editing ? (
    <div className="modal-fullscreen-overlay" onClick={() => setEditing(false)}>
      <div className="modal modal-fullscreen" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <h2 style={{ margin: 0 }}>Edit playthrough</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
            {overflowOpen && overflowPos && (
              <div
                ref={overflowMenuRef}
                className="list-overflow-menu"
                style={{ position: 'fixed', top: overflowPos.top, right: overflowPos.right, zIndex: 1000 }}
              >
                <button
                  className="list-overflow-option"
                  onMouseDown={(e) => { e.preventDefault(); setOverflowOpen(false); setOverflowPos(null); refreshArtwork() }}
                  disabled={refreshingArt}
                >
                  {refreshingArt ? 'Refreshing…' : freshCoverUrl ? 'Artwork updated ✓' : 'Refresh artwork'}
                </button>
              </div>
            )}
            <button className="modal-close-btn" onClick={() => setEditing(false)} aria-label="Close">
              <X size={24} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 32, alignItems: 'center' }}>
          <img
            src={freshCoverUrl ?? value.game.coverUrl ?? '/no-cover.png'}
            alt={value.game.title}
            style={{ width: 64, height: 86, borderRadius: 6, objectFit: 'cover', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', flexShrink: 0 }}
          />
          <div>
            <div style={{ fontWeight: 900, fontSize: 'var(--text-lg)' }}>{value.game.title}</div>
            {value.game.releaseYear && (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 4 }}>{value.game.releaseYear}</div>
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
                    ...blogPosts.map((p) => ({ value: p.url, label: p.title }))
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
            onClick={() => { setEditing(false); deleteRecord() }}
          >
            Delete
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={saveEdit} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  if (view === 'started') {
    const bannerSrc = value.game.screenshotUrl
    const gameHref = `/games/${value.game.igdbId}`
    const coverEl = (
      <img className="game-card-started-cover" src={value.game.coverUrl ?? '/no-cover.png'} alt={value.game.title} />
    )
    return (
      <>
        <a href={gameHref} className="game-card-started" style={{ textDecoration: 'none', position: 'relative' }}>
          <div className="game-card-started-banner" style={bannerSrc ? { backgroundImage: `url(${bannerSrc})` } : undefined} />
          <div className="game-card-started-bottom">
            <div className="game-card-started-cover-wrap">{coverEl}</div>
            <div className="game-card-started-info">
              <div className="game-card-started-title">
                <span className="game-card-started-title-text" title={value.game.title}>{value.game.title}</span>
                {value.isReplay && <span data-tooltip="Replay" className="card-badge"><RotateCcw size={15} /></span>}
                {value.owned && <span data-tooltip="Owned" className="card-badge"><Check size={15} /></span>}
              </div>
              {(() => {
                const parts: string[] = []
                if (platform) parts.push(platform)
                if (value.startedAt) parts.push(`Started ${formatDate(value.startedAt)}`)
                return parts.length > 0 ? <span className="game-card-started-meta">{parts.join(' • ')}</span> : null
              })()}
              {(value.rating && normalizeStatus(value.status) !== 'playing') || value.reviewBlogUri ? (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {value.rating && normalizeStatus(value.status) !== 'playing' && <Stars rating={value.rating / 2} />}
                  {value.reviewBlogUri && <a href={value.reviewBlogUri.startsWith('http') ? value.reviewBlogUri : undefined} target="_blank" rel="noopener noreferrer" data-tooltip="Read review" className="card-badge"><FileText size={15} /></a>}
                </div>
              ) : null}
            </div>
          </div>
        </a>
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
            {!readonly && (
              <button className="browse-card-action" onClick={(e) => { e.stopPropagation(); startEdit() }}>
                <Pencil size={16} strokeWidth={2} />
                Edit
              </button>
            )}
          </div>
          <a className="game-card-grid-info" href={gameHref}>
            <div className="game-card-grid-title">
              <span className="game-card-grid-title-text" title={value.game.title}>{value.game.title}</span>
              {value.isReplay && <span data-tooltip="Replay" className="card-badge"><RotateCcw size={13} /></span>}
              {value.owned && <span data-tooltip="Owned" className="card-badge"><Check size={13} /></span>}
            </div>
            {(() => {
              const parts: string[] = []
              if (platform) parts.push(platform)
              
              const norm = normalizeStatus(value.status)
              let subLabel: string | undefined
              if (norm === 'backlogged') {
                const bs = inferBackloggedStatus(value.status, value.backloggedStatus)
                if (bs === 'shelved') subLabel = 'Shelved'
              } else if (norm === 'played') {
                const ps = inferPlayedStatus(value.status, value.playedStatus)
                if (ps) {
                  subLabel = PLAYED_STATUS_LABELS[ps] || ps.charAt(0).toUpperCase() + ps.slice(1)
                }
              }
              
              if (subLabel) parts.push(subLabel)
              
              return parts.length > 0 ? (
                <div className="game-card-meta" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {parts.join(' • ')}
                </div>
              ) : null
            })()}
            {(normalizeStatus(value.status) === 'played' && value.rating) || value.reviewBlogUri ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {normalizeStatus(value.status) === 'played' && value.rating && <Stars rating={value.rating / 2} />}
                {value.reviewBlogUri && <a href={value.reviewBlogUri.startsWith('http') ? value.reviewBlogUri : undefined} target="_blank" rel="noopener noreferrer" data-tooltip="Read review" className="card-badge note-icon"><FileText size={13} /></a>}
              </div>
            ) : null}
          </a>
        </div>
        {!readonly && editModal}
      </>
    )
  }

  const gameHref = `/games/${value.game.igdbId}`

  return (
    <div className={`game-card game-card--${normalizeStatus(value.status)} game-card--${statusClass(value.status, value.playedStatus, value.backloggedStatus)}${inferBackloggedStatus(value.status, value.backloggedStatus) === 'shelved' ? ' game-card--shelved' : ''}`}>
      {value.game.coverUrl ? (
        <img className="game-card-cover" src={value.game.coverUrl} alt={value.game.title} />
      ) : (
        <img className="game-card-cover" src="/no-cover.png" alt={value.game.title} />
      )}

      <a className="game-card-body" href={gameHref}>
        <div className="game-card-title">
          <span className="game-card-title-text" title={value.game.title}>{value.game.title}</span>
          {value.isReplay && <span data-tooltip="Replay" className="card-badge"><RotateCcw size={12} /></span>}
          {value.owned && <span data-tooltip="Owned" className="card-badge"><Check size={12} /></span>}
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

        {value.rating || value.reviewBlogUri ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {value.rating && <Stars rating={value.rating / 2} />}
            {value.reviewBlogUri && <a href={value.reviewBlogUri.startsWith('http') ? value.reviewBlogUri : undefined} target="_blank" rel="noopener noreferrer" data-tooltip="Read review" className="card-badge note-icon"><FileText size={12} /></a>}
          </div>
        ) : null}
      </a>

      {!readonly && (
        <div style={{ flexShrink: 0 }}>
          <button className="btn btn-ghost" onClick={startEdit}>Edit</button>
        </div>
      )}

      {!readonly && editModal}
    </div>
  )
}
