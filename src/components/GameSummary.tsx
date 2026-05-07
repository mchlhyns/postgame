'use client'

import { useState } from 'react'

const CHAR_LIMIT = 300

export default function GameSummary({ summary }: { summary: string }) {
  const [expanded, setExpanded] = useState(false)
  const long = summary.length > CHAR_LIMIT

  return (
    <p className="game-detail-summary">
      {long && !expanded ? summary.slice(0, CHAR_LIMIT).trimEnd() + '… ' : summary + ' '}
      {long && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="read-more-btn"
        >
          {expanded ? 'Read less' : 'Read more'}
        </button>
      )}
    </p>
  )
}
