'use client'

import { useEffect, useState, useCallback } from 'react'
import { Agent } from '@atproto/api'
import { restoreSession, COLLECTION } from '@/lib/atproto'
import { GameRecordView, GameStatus, GameRecord } from '@/types'
import { statusLabel, matchesStatus, PRIMARY_STATUSES, normalizeStatus } from '@/lib/igdb'
import AddGameModal from '@/components/AddGameModal'
import GameCard from '@/components/GameCard'


const ALL_STATUSES = PRIMARY_STATUSES

export default function MyGamesPage() {
  const [session, setSession] = useState<{ agent: Agent; did: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [games, setGames] = useState<GameRecordView[]>([])
  const [gamesLoading, setGamesLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState<GameStatus | 'all'>('all')
  const [view, setView] = useState<'list' | 'grid'>('grid')
  const [sortBy, setSortBy] = useState<'added' | 'release' | 'type'>('added')
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    restoreSession()
      .then((s) => {
        if (!s) { window.location.href = '/'; return }
        setSession(s)
        setLoading(false)

        // Parse status query parameter from URL
        const params = new URLSearchParams(window.location.search)
        const st = params.get('status')
        if (st && (st === 'playing' || st === 'backlogged' || st === 'wishlisted' || st === 'played')) {
          setFilterStatus(st as GameStatus)
        }
      })
      .catch(() => { window.location.href = '/' })
  }, [])

  useEffect(() => {
    const savedView = localStorage.getItem('games-view-preference')
    if (savedView === 'list' || savedView === 'grid') {
      setView(savedView)
    }
  }, [])

  const updateView = (newView: 'list' | 'grid') => {
    setView(newView)
    localStorage.setItem('games-view-preference', newView)
  }

  const fetchGames = useCallback(async (agent: Agent, did: string) => {
    setGamesLoading(true)
    try {
      const allRecords: GameRecordView[] = []
      let cursor: string | undefined
      do {
        const res = await agent.com.atproto.repo.listRecords({ repo: did, collection: COLLECTION, limit: 100, cursor })
        allRecords.push(...(res.data.records as unknown as GameRecordView[]))
        cursor = res.data.cursor
      } while (cursor)
      setGames(allRecords)
    } catch (err) {
      console.error('Failed to fetch games:', err)
    } finally {
      setGamesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!session) return
    fetchGames(session.agent, session.did)
  }, [session, fetchGames])

  function handleGameAdded(record: GameRecordView) {
    setGames((prev) => [record, ...prev])
  }

  function handleGameUpdated(uri: string, value: GameRecord) {
    setGames((prev) => prev.map((g) => (g.uri === uri ? { ...g, value } : g)))
  }

  function handleGameDeleted(uri: string) {
    setGames((prev) => prev.filter((g) => g.uri !== uri))
  }

  if (loading) return <main style={{ flex: 1 }} />

  const deduped = Object.values(
    games.reduce<Record<number, GameRecordView>>((acc, record) => {
      const id = record.value.game.igdbId
      if (!acc[id] || record.value.createdAt > acc[id].value.createdAt) acc[id] = record
      return acc
    }, {})
  )

  const filtered = filterStatus === 'all' ? deduped : deduped.filter((g) => matchesStatus(g.value.status, filterStatus))

  const activeSortBy = sortBy
  const filteredGames = [...filtered].sort((a, b) => {
    if (activeSortBy === 'added') {
      const sortDate = (g: GameRecordView) =>
        normalizeStatus(g.value.status) === 'played'
          ? (g.value.finishedAt ?? g.value.updatedAt ?? g.value.createdAt)
          : (g.value.updatedAt ?? g.value.createdAt)
      return sortDate(b).localeCompare(sortDate(a))
    }
    if (activeSortBy === 'release') {
      const ag = a.value.game, bg = b.value.game
      const av = ag.releaseDate ?? (ag.releaseYear != null ? ag.releaseYear * 1e7 : Infinity)
      const bv = bg.releaseDate ?? (bg.releaseYear != null ? bg.releaseYear * 1e7 : Infinity)
      return av - bv
    }
    if (activeSortBy === 'type') return ALL_STATUSES.indexOf(a.value.status as any) - ALL_STATUSES.indexOf(b.value.status as any)
    return 0
  })

  const countFor = (s: string) => deduped.filter((g) => matchesStatus(g.value.status, s)).length

  return (
    <>
      <main>
        <div className="container page-top">
          <div className="my-games-main">
            <div style={{ marginBottom: '24px' }}>
              <h1 className="browse-section-title" style={{ marginBottom: 0 }}>Library</h1>
            </div>

            {/* Status Filter Tabs & View Toggle Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
              <div className="filter-tabs" style={{ margin: 0 }}>
                {([
                  { value: 'all', label: 'All' },
                  ...ALL_STATUSES.map((s) => ({ value: s, label: statusLabel(s) })),
                ] as const).map((t) => (
                  <button
                    key={t.value}
                    className={`filter-tab${filterStatus === t.value ? ' active' : ''}`}
                    onClick={() => {
                      setFilterStatus(t.value as any)
                      if (t.value !== 'all' && sortBy === 'type') setSortBy('added')
                    }}
                  >
                    {t.label}
                    <span style={{ marginLeft: 6, opacity: 0.6, fontWeight: 500 }}>
                      ({t.value === 'all' ? deduped.length : countFor(t.value)})
                    </span>
                  </button>
                ))}
              </div>
              <div className="view-toggle">
                <button className={`view-toggle-btn${view === 'grid' ? ' active' : ''}`} onClick={() => updateView('grid')} title="Grid view">⊞</button>
                <button className={`view-toggle-btn${view === 'list' ? ' active' : ''}`} onClick={() => updateView('list')} title="List view">☰</button>
              </div>
            </div>

            {gamesLoading ? (
              <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
            ) : filteredGames.length === 0 ? (
              <div className="empty-state">
                <h3>{filterStatus === 'all' ? 'No games yet' : `No ${statusLabel(filterStatus)} games`}</h3>
                <p>{filterStatus === 'all' ? 'Add a game to get started.' : 'Try a different filter.'}</p>
              </div>
            ) : (
              <div className={view === 'grid' ? 'game-grid' : 'game-list'}>
                {filterStatus === 'all' ? ALL_STATUSES.flatMap((status) => {
                  const group = filteredGames.filter((g) => matchesStatus(g.value.status, status))
                  if (group.length === 0) return []
                  return [
                    <div key={`divider-${status}`} className="game-list-divider">
                      {statusLabel(status)}
                    </div>,
                    ...group.map((record) => (
                      <GameCard
                        key={record.uri}
                        record={record}
                        agent={session!.agent}
                        view={view}
                        onUpdated={handleGameUpdated}
                        onDeleted={handleGameDeleted}
                      />
                    )),
                  ]
                }) : [
                  <div key={`divider-${filterStatus}`} className="game-list-divider">
                    {statusLabel(filterStatus)}
                  </div>,
                  ...filteredGames.map((record) => (
                    <GameCard
                      key={record.uri}
                      record={record}
                      agent={session!.agent}
                      view={view}
                      onUpdated={handleGameUpdated}
                      onDeleted={handleGameDeleted}
                    />
                  ))
                ]}
              </div>
            )}
          </div>
        </div>
      </main>

      {showAddModal && (
        <AddGameModal
          agent={session!.agent}
          did={session!.did}
          onClose={() => setShowAddModal(false)}
          onAdded={handleGameAdded}
        />
      )}
    </>
  )
}
