'use client'

import { useEffect, useRef, useState } from 'react'

interface Item {
  label: string
  href: string
  active?: boolean
}

interface Props {
  label: string
  active?: boolean
  items: Item[]
}

export default function NavDropdown({ label, active, items }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <div ref={ref} className="nav-dropdown">
      <button
        className={`nav-link${active ? ' nav-link-active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
        <svg
          className={`nav-dropdown-chevron${open ? ' open' : ''}`}
          width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="nav-dropdown-menu">
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`nav-dropdown-item${item.active ? ' nav-dropdown-item-active' : ''}`}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
