'use client'

import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Agent } from '@atproto/api'
import { IgdbGame, GameRecordView, PlayedStatus, BackloggedStatus } from '@/types'
import { COLLECTION } from '@/lib/atproto'
import { formatIgdbGame, PLAYED_STATUS_LABELS, normalizeStatus, abbreviatePlatform } from '@/lib/igdb'
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    if (newStatus !== 'played') setRating(undefined)
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
        finishedAt: status === 'played' ? new Date().toISOString() : undefined,
        backloggedStatus,
        isReplay: isReplay || undefined,
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>Add game</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
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
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
              <img
                src={(selected as IgdbGame & { coverUrl?: string }).coverUrl ?? '/no-cover.png'}
                alt={selected.name}
                style={{ width: 48, height: 64, borderRadius: 4, objectFit: 'cover' }}
              />
              <div>
                <div style={{ fontWeight: 600 }}>{selected.name}</div>
                {selected.first_release_date && (
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    {new Date(selected.first_release_date * 1000).getFullYear()}
                  </div>
                )}
              </div>
            </div>

            <div className="form-field">
              <label>Status</label>
              <Select
                variant="input"
                value={statusKey}
                onChange={handleStatusChange}
                options={[{ value: '', label: '—' }, ...STATUS_OPTIONS]}
              />
            </div>

            <div className="form-row" style={{ gridTemplateColumns: statusKey === 'wishlisted' ? '1fr' : '2fr 1fr' }}>
              <div className="form-field">
                <label>Platform</label>
                <Select
                  variant="input"
                  value={platform}
                  onChange={setPlatform}
                  options={platformOptions}
                />
              </div>
              {statusKey !== 'wishlisted' && (
                <div className="form-field">
                  <label>Replay</label>
                  <Select
                    variant="input"
                    value={isReplay ? 'yes' : ''}
                    onChange={(v) => setIsReplay(v === 'yes')}
                    options={[{ value: '', label: 'No' }, { value: 'yes', label: 'Yes' }]}
                  />
                </div>
              )}
            </div>

            {status === 'played' && (
              <div className="form-field">
                <label style={{ marginBottom: 4 }}>Rating</label>
                <StarRatingInput value={rating} onChange={setRating} />
              </div>
            )}

            {error && <p className="error-msg">{error}</p>}

            <div className="form-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving || !statusKey}>
                {saving ? 'Saving…' : 'Add to collection'}
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
