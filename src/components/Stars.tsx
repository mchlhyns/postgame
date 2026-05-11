'use client'

import { useState } from 'react'

const starPath = "M11.1001 2.44358C11.4645 1.69178 12.5355 1.69178 12.8999 2.44358L15.4347 7.67365C15.5805 7.97434 15.8668 8.18237 16.1978 8.2281L21.9567 9.02365C22.7842 9.13796 23.1151 10.1564 22.5128 10.7352L18.3216 14.7634C18.0807 14.9949 17.9713 15.3314 18.0301 15.6603L19.053 21.3821C19.2 22.2045 18.3335 22.8339 17.5969 22.4398L12.4716 19.6982C12.177 19.5406 11.823 19.5406 11.5283 19.6982L6.40231 22.4398C5.66562 22.8339 4.7992 22.2044 4.94631 21.382L5.96982 15.6604C6.02866 15.3315 5.91931 14.9949 5.67838 14.7633L1.4872 10.7352C0.884912 10.1565 1.2158 9.13796 2.0433 9.02365L7.80222 8.2281C8.13323 8.18237 8.41952 7.97434 8.56525 7.67365L11.1001 2.44358Z"

const STAR_FILLED = 'var(--accent)'

function StarFull({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d={starPath} fill={STAR_FILLED} />
    </svg>
  )
}

function StarEmpty({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d={starPath} fill="currentColor" fillOpacity={0.2} />
    </svg>
  )
}

function StarHalf({ size }: { size: number }) {
  const filledColor = STAR_FILLED
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12.001 19.5801C11.8388 19.58 11.6767 19.6195 11.5293 19.6982L6.40332 22.4395C5.66663 22.8335 4.80015 22.2042 4.94727 21.3818L5.9707 15.6602C6.02943 15.3313 5.91955 14.9952 5.67871 14.7637L1.48828 10.7354C0.88599 10.1565 1.21644 9.13775 2.04395 9.02344L7.80273 8.22852C8.13362 8.18281 8.41965 7.97435 8.56543 7.67383L11.1006 2.44336C11.2829 2.06741 11.6421 1.87975 12.001 1.87988V19.5801Z" fill={filledColor} />
      <path d="M11.9993 19.5801C12.1615 19.58 12.3236 19.6195 12.471 19.6982L17.597 22.4395C18.3337 22.8335 19.2001 22.2042 19.053 21.3818L18.0296 15.6602C17.9709 15.3313 18.0807 14.9952 18.3216 14.7637L22.512 10.7354C23.1143 10.1565 22.7838 9.13775 21.9563 9.02344L16.1975 8.22852C15.8667 8.18281 15.5806 7.97435 15.4349 7.67383L12.8997 2.44336C12.7174 2.06741 12.3582 1.87975 11.9993 1.87988V19.5801Z" fill="currentColor" fillOpacity={0.35} />
    </svg>
  )
}

export function Stars({ rating }: { rating: number }) {
  const full = Math.floor(rating)
  const half = rating % 1 >= 0.5
  const empty = 5 - full - (half ? 1 : 0)
  const size = 14
  return (
    <span style={{ display: 'inline-flex', gap: 1, alignItems: 'center' }}>
      {Array.from({ length: full }).map((_, i) => <StarFull key={`f${i}`} size={size} />)}
      {half && <StarHalf size={size} />}
      {Array.from({ length: empty }).map((_, i) => <StarEmpty key={`e${i}`} size={size} />)}
    </span>
  )
}

export function StarRatingInput({ value, onChange }: { value?: number; onChange: (v: number | undefined) => void }) {
  const [hover, setHover] = useState<number | undefined>()
  const display = hover ?? value ?? 0
  const size = 22

  return (
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center', cursor: 'pointer' }}>
      {Array.from({ length: 5 }).map((_, i) => {
        const halfVal = i * 2 + 1
        const fullVal = i * 2 + 2
        const isFull = display >= fullVal
        const isHalf = !isFull && display >= halfVal
        return (
          <span key={i} style={{ position: 'relative', width: size, height: size, flexShrink: 0, display: 'inline-flex' }}>
            {isFull
              ? <StarFull size={size} />
              : isHalf
              ? <StarHalf size={size} />
              : <StarEmpty size={size} />}
            <span
              style={{ position: 'absolute', left: 0, top: 0, width: '50%', height: '100%' }}
              onMouseEnter={() => setHover(halfVal)}
              onMouseLeave={() => setHover(undefined)}
              onClick={() => onChange(value === halfVal ? undefined : halfVal)}
            />
            <span
              style={{ position: 'absolute', right: 0, top: 0, width: '50%', height: '100%' }}
              onMouseEnter={() => setHover(fullVal)}
              onMouseLeave={() => setHover(undefined)}
              onClick={() => onChange(value === fullVal ? undefined : fullVal)}
            />
          </span>
        )
      })}
    </span>
  )
}
