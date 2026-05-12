'use client'

import { useEffect, useState } from 'react'
import { normalizeStatus } from '@/lib/igdb'

const COUNTS = [
  { label: 'Playing', status: 'playing' },
  { label: 'Backlogged', status: 'backlogged' },
  { label: 'Wishlisted', status: 'wishlisted' },
  { label: 'Played', status: 'played' },
]

export default function GameBannerStats({ igdbId }: { igdbId: number }) {
  const [counts, setCounts] = useState<{ label: string; count: number }[]>([])

  useEffect(() => {
    fetch(`/api/appview/game-players?igdbId=${igdbId}`)
      .then(r => r.json())
      .then(data => {
        const players: { status?: string }[] = data.players ?? []
        setCounts(
          COUNTS.map(({ label, status }) => ({
            label,
            count: players.filter(p => p.status && normalizeStatus(p.status) === status).length,
          })).filter(c => c.count > 0)
        )
      })
      .catch(() => {})
  }, [igdbId])

  if (counts.length === 0) return null

  return (
    <div className="profile-stats" style={{ marginLeft: 'auto', flexShrink: 0 }}>
      {counts.map(({ label, count }) => (
        <div key={label} style={{ textAlign: 'right' }}>
          <div className="profile-stat-count">{count}</div>
          <div className="profile-stat-label">{label}</div>
        </div>
      ))}
    </div>
  )
}
