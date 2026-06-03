'use client'

import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Agent } from '@atproto/api'
import { IgdbGame, GameRecordView, PlayedStatus, BackloggedStatus } from '@/types'
import { COLLECTION } from '@/lib/atproto'
import { formatIgdbGame, PLAYED_STATUS_LABELS, normalizeStatus, abbreviatePlatform, isoToDateInput, dateInputToISO } from '@/lib/igdb'
import Select from '@/components/Select'
import { StarRatingInput } from '@/components/Stars'

interface Props {
  agent: Agent
  did: string
  onClose: () => void
  onAdded: (record: GameRecordView) => void
  initialGame?: IgdbGame & { coverUrl?: string }
  defaultIsReplay?: boolean
}

export default function AddGameModal({ agent, did, onClose, onAdded, initialGame, defaultIsReplay }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<IgdbGame[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<IgdbGame | null>(initialGame ?? null)
  const [statusKey, setStatusKey] = useState('')
  const [platform, setPlatform] = useState('')
  const [rating, setRating] = useState<number | undefined>()
  const [isReplay, setIsReplay] = useState(defaultIsReplay ?? false)
  const [owned, setOwned] = useState(false)
  const [startedAt, setStartedAt] = useState<string | undefined>()
  const [finishedAt, setFinishedAt] = useState<string | undefined>()
  const [blogPosts, setBlogPosts] = useState<{ uri: string; title: string }[]>([])
  const [reviewBlogUri, setReviewBlogUri] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!agent || !did) return
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

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      return
    }
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/igdb/search?q=${encodeURIComponent(query)}`)
        if (res.status === 429) return // silently back off if rate limited
        const data = await res.json()
        setResults((data.games ?? []).map(formatIgdbGame))
      } catch {
        // ignore
      } finally {
        setSearching(false)
      }
    }, 500)
  }, [query])

  const { status, playedStatus, backloggedStatus } = decodeStatusKey(statusKey)

  function handleStatusChange(key: string) {
    const { status: newStatus } = decodeStatusKey(key)
    if (newStatus !== 'played') {
      setRating(undefined)
      setStartedAt(undefined)
      setFinishedAt(undefined)
    } else {
      setFinishedAt(new Date().toISOString())
    }
    setStatusKey(key)
  }

  async function handleAdd() {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const ratingNum = rating
      const record = {
        $type: 'com.crashthearcade.game',
        game: {
          igdbId: selected.id,
          title: selected.name,
          coverUrl: (selected as IgdbGame & { coverUrl?: string }).coverUrl,
          screenshotUrl: (selected as IgdbGame & { screenshotUrl?: string }).screenshotUrl,
          igdbUrl: selected.url,
          ctaUrl: `https://crashthearcade.com/games/${selected.id}`,
          releaseYear: selected.first_release_date
            ? new Date(selected.first_release_date * 1000).getFullYear()
            : undefined,
          releaseDate: selected.first_release_date,
        },
        status,
        playedStatus,
        platform: platform || undefined,
        rating: ratingNum,
        startedAt: startedAt || undefined,
        finishedAt: status === 'played' ? (finishedAt || new Date().toISOString()) : undefined,
        backloggedStatus,
        isReplay: isReplay || undefined,
        owned: owned || undefined,
        reviewBlogUri: reviewBlogUri || undefined,
        createdAt: new Date().toISOString(),
      }

      const res = await agent.com.atproto.repo.createRecord({
        repo: did,
        collection: COLLECTION,
        record,
      })

      onAdded({
        uri: res.data.uri,
        cid: res.data.cid,
        value: record as any,
      })
      onClose()
    } catch (err: any) {
      console.error('Failed to add game:', err)
      setError(err?.message ?? 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const igdbPlatforms = selected?.platforms?.map((p) => abbreviatePlatform(p.name)) ?? []
  const platformOptions = [
    { value: '', label: '—' },
    ...igdbPlatforms.map((p) => ({ value: p, label: p })),
  ]

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

  return (
    <div className="modal-fullscreen-overlay" onClick={onClose}>
      <div className="modal modal-fullscreen" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <h2 style={{ margin: 0 }}>Add game</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={24} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {!selected ? (
          <div className="form-field add-modal-field">
            <div className="search-wrapper">
              <input
                className="input"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a game"
              />
              {(results.length > 0 || searching) && (
                <div className="search-results">
                  {searching && (
                    <div style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      Searching…
                    </div>
                  )}
                  {results.map((game) => {
                    const g = game as IgdbGame & { coverUrl?: string }
                    const year = game.first_release_date
                      ? new Date(game.first_release_date * 1000).getFullYear()
                      : null
                    const platforms = game.platforms?.map((p) => abbreviatePlatform(p.name)).join(', ')
                    return (
                      <div
                        key={game.id}
                        className="search-result-item"
                        onClick={() => { setSelected(game); setQuery(''); setResults([]) }}
                      >
                        <img className="search-result-cover" src={g.coverUrl ?? '/no-cover.png'} alt={game.name} />
                        <div className="search-result-info">
                          <strong>{game.name}</strong>
                          <span className="search-result-platforms">
                            {[year ?? 'Unknown year', platforms].filter(Boolean).join(' | ')}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16, marginBottom: 32, alignItems: 'center' }}>
              <img
                src={(selected as IgdbGame & { coverUrl?: string }).coverUrl ?? '/no-cover.png'}
                alt={selected.name}
                style={{ width: 64, height: 86, borderRadius: 6, objectFit: 'cover', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
              />
              <div>
                <div style={{ fontWeight: 800, fontSize: 'var(--text-lg)' }}>{selected.name}</div>
                {selected.first_release_date && (
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {new Date(selected.first_release_date * 1000).getFullYear()}
                  </div>
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
                    className={`status-pill${statusKey === opt.value ? ' active' : ''}`}
                    onClick={() => handleStatusChange(opt.value)}
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
                  value={platform}
                  onChange={setPlatform}
                  options={platformOptions}
                />
              </div>
              {statusKey !== 'wishlisted' ? (
                <div className="form-field">
                  <label>Replay</label>
                  <Select
                    variant="input"
                    value={isReplay ? 'yes' : ''}
                    onChange={(v) => setIsReplay(v === 'yes')}
                    options={[{ value: '', label: 'No' }, { value: 'yes', label: 'Yes' }]}
                  />
                </div>
              ) : (
                <div />
              )}
              <div className="form-field">
                <label>Ownership</label>
                <Select
                  variant="input"
                  value={owned ? 'yes' : ''}
                  onChange={(v) => setOwned(v === 'yes')}
                  options={[
                    { value: 'yes', label: 'Owned' },
                    { value: '', label: 'Not Owned' }
                  ]}
                />
              </div>
            </div>

            {status === 'played' && (
              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div className="form-field" style={{ margin: 0 }}>
                  <label>Started Date</label>
                  <input
                    className="input"
                    type="date"
                    value={isoToDateInput(startedAt)}
                    onChange={(e) => setStartedAt(dateInputToISO(e.target.value))}
                  />
                </div>
                <div className="form-field" style={{ margin: 0 }}>
                  <label>Finished Date</label>
                  <input
                    className="input"
                    type="date"
                    value={isoToDateInput(finishedAt)}
                    onChange={(e) => setFinishedAt(dateInputToISO(e.target.value))}
                  />
                </div>
              </div>
            )}

            {status === 'played' && (
              <div className="played-details-group">
                <div className="form-field" style={{ margin: 0 }}>
                  <label style={{ marginBottom: 8 }}>Rating</label>
                  <StarRatingInput value={rating} onChange={setRating} />
                </div>

                {blogPosts.length > 0 && (
                  <div className="form-field" style={{ margin: 0 }}>
                    <label>Link review</label>
                    <span className="settings-subtext">Attach a review from your linked publication</span>
                    <Select
                      variant="input"
                      value={reviewBlogUri}
                      onChange={setReviewBlogUri}
                      options={[
                        { value: '', label: '— No review linked —' },
                        ...blogPosts.map((p) => ({ value: p.uri, label: p.title }))
                      ]}
                    />
                  </div>
                )}
              </div>
            )}

            {error && <p className="error-msg" style={{ marginBottom: 24 }}>{error}</p>}

            <div className="form-actions" style={{ marginTop: 'auto', paddingTop: 24, justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving || !statusKey}>
                {saving ? 'Saving…' : 'Add to library'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export const STATUS_OPTIONS = [
  { value: 'playing',    label: 'Playing' },
  { value: 'backlogged', label: 'Backlogged' },
  { value: 'shelved',    label: 'Shelved', indent: true },
  { value: 'wishlisted', label: 'Wishlisted' },
  { value: 'played',     label: 'Played' },
  { value: 'completed',  label: 'Completed', indent: true },
  { value: 'mastered',   label: 'Mastered', indent: true },
  { value: 'retired',    label: 'Retired', indent: true },
  { value: 'abandoned',  label: 'Abandoned', indent: true },
]

export function encodeStatusKey(status: string, playedStatus?: string, backloggedStatus?: string): string {
  const norm = normalizeStatus(status)
  if (norm === 'played') return playedStatus ?? 'played'
  if (norm === 'backlogged' && backloggedStatus === 'shelved') return 'shelved'
  return norm
}

export function decodeStatusKey(key: string): {
  status: string
  playedStatus?: PlayedStatus
  backloggedStatus?: BackloggedStatus
} {
  switch (key) {
    case 'played':    return { status: 'played' }
    case 'completed': return { status: 'played', playedStatus: 'completed' }
    case 'mastered':  return { status: 'played', playedStatus: 'mastered' }
    case 'retired':   return { status: 'played', playedStatus: 'retired' }
    case 'abandoned': return { status: 'played', playedStatus: 'abandoned' }
    case 'shelved':   return { status: 'backlogged', backloggedStatus: 'shelved' }
    default:          return { status: key }
  }
}
