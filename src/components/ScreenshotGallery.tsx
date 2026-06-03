'use client'

import { useState, useEffect, useCallback } from 'react'

interface Props {
  screenshots: string[]
}

export default function ScreenshotGallery({ screenshots }: Props) {
  const [active, setActive] = useState<number | null>(null)

  const close = useCallback(() => setActive(null), [])

  const prev = useCallback(() => {
    setActive((i) => (i === null ? null : (i - 1 + screenshots.length) % screenshots.length))
  }, [screenshots.length])

  const next = useCallback(() => {
    setActive((i) => (i === null ? null : (i + 1) % screenshots.length))
  }, [screenshots.length])

  useEffect(() => {
    if (active === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, close, prev, next])

  useEffect(() => {
    if (active === null) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [active])

  return (
    <>
      <div className="game-detail-screenshots">
        {screenshots.map((url, i) => (
          <button
            key={i}
            className="screenshot-thumb-btn"
            onClick={() => setActive(i)}
            aria-label={`View screenshot ${i + 1}`}
          >
            <img src={url} alt="" className="game-detail-screenshot" />
          </button>
        ))}
      </div>

      {active !== null && (
        <div className="lightbox-overlay" onClick={close}>
          <button className="lightbox-close" onClick={close} aria-label="Close">✕</button>
          {screenshots.length > 1 && (
            <button
              className="lightbox-nav lightbox-prev"
              onClick={(e) => { e.stopPropagation(); prev() }}
              aria-label="Previous"
            >‹</button>
          )}
          <img
            src={screenshots[active]}
            alt=""
            className="lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          {screenshots.length > 1 && (
            <button
              className="lightbox-nav lightbox-next"
              onClick={(e) => { e.stopPropagation(); next() }}
              aria-label="Next"
            >›</button>
          )}
          <div className="lightbox-counter">{active + 1} / {screenshots.length}</div>
        </div>
      )}
    </>
  )
}
