'use client'

import { useEffect, useState } from 'react'
import { bskyAvatar } from '@/lib/appview-fetch'

type Player = {
  did: string
  handle: string
  displayName?: string
  avatar?: string
  status?: string
}

export default function GamePlayers({ igdbId }: { igdbId: number }) {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/appview/game-players?igdbId=${igdbId}`)
      .then(r => r.json())
      .then(data => setPlayers(data.players ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [igdbId])

  if (loading || players.length === 0) return null

  return (
    <div className="game-detail-meta-section">
      <div className="game-detail-meta-label">Players</div>
      <div className="game-players-grid">
        {players.slice(0, 12).map(p => (
          <a
            key={p.did}
            href={`/${p.handle}`}
            className="game-player-avatar-wrap"
            title={p.displayName || `@${p.handle}`}
          >
            {p.avatar
              ? <img src={bskyAvatar(p.avatar)} alt={p.handle} className="game-player-avatar" />
              : <div className="game-player-avatar game-player-avatar--placeholder" />
            }
          </a>
        ))}
      </div>
    </div>
  )
}
