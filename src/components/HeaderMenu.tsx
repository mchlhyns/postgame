'use client'

import { useState, useRef, useEffect } from 'react'

interface Props {
  userHandle: string | null
  onSignOut: () => void
  active?: boolean
}

export default function HeaderMenu({ userHandle, onSignOut, active }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  return (
    <div ref={ref} className="header-menu">
      <button className={`header-menu-trigger${active ? ' header-menu-trigger-active' : ''}`} onClick={() => setOpen((o) => !o)}>
        {userHandle ? `@${userHandle}` : '···'}
        <svg
          className={`header-menu-chevron${open ? ' open' : ''}`}
          width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="header-menu-dropdown">
          {userHandle && (
            <a href={`/${userHandle}`} className="header-menu-item" onClick={() => setOpen(false)}>
              Profile
            </a>
          )}
          <a href="/library" className="header-menu-item" onClick={() => setOpen(false)}>
            Library
          </a>
          <a href="/lists" className="header-menu-item" onClick={() => setOpen(false)}>
            Lists
          </a>
          <a href="/settings" className="header-menu-item" onClick={() => setOpen(false)}>
            Settings
          </a>
          <div className="header-menu-divider" />
          <button
            className="header-menu-item header-menu-item-signout"
            onClick={() => { setOpen(false); onSignOut() }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
