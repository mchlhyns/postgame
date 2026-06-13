'use client'
import { useEffect, useRef } from 'react'

interface Props {
  url?: string | null
  className: string
}

// The outer div (className) must have position:relative and overflow:hidden.
// The inner div is 170% tall (35% overflow each side) so translateY has room to move.
export default function ParallaxBannerImg({ url, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const inner = innerRef.current
    if (!container || !inner) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const update = () => {
      const rect = container.getBoundingClientRect()
      inner.style.transform = `translateY(${rect.top * 0.1}px)`
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  return (
    <div ref={containerRef} className={className}>
      <div
        ref={innerRef}
        style={{
          position: 'absolute',
          top: '-25%',
          left: 0,
          right: 0,
          height: '150%',
          backgroundImage: url ? `url(${url})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundColor: 'var(--tertiary)',
        }}
      />
    </div>
  )
}
