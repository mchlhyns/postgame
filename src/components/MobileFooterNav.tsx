'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { LayoutPanelTop, Library, Search, Users, X } from 'lucide-react'
import HeaderSearch from '@/components/HeaderSearch'

interface Props {
  userHandle: string
  avatarUrl: string | null
  displayName: string | null
  onSignOut: () => void
}

// Temporary diagnostic overlay for the iOS Safari footer positioning bug.
// Activate with ?vvdebug=1 in the URL. Remove once the bug is resolved.
function VVDebug() {
  const [info, setInfo] = useState('')
  useEffect(() => {
    let raf = 0
    function tick() {
      const vv = window.visualViewport
      const nav = document.querySelector('.mobile-footer-nav')
      const navBottom = nav ? Math.round(nav.getBoundingClientRect().bottom) : -1
      setInfo([
        `innerH ${window.innerHeight}`,
        `vvH ${vv ? Math.round(vv.height) : '?'} vvTop ${vv ? Math.round(vv.offsetTop) : '?'}`,
        `clientH ${document.documentElement.clientHeight}`,
        `scrollY ${Math.round(window.scrollY)}`,
        `docH ${document.documentElement.scrollHeight}`,
        `navBottom ${navBottom}`,
      ].join('\n'))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div style={{
      position: 'fixed', top: 70, left: 8, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)', color: '#0f0',
      font: '12px/1.5 monospace', padding: '6px 10px',
      borderRadius: 6, pointerEvents: 'none', whiteSpace: 'pre',
    }}>
      {info}
    </div>
  )
}

export default function MobileFooterNav({ userHandle, avatarUrl, displayName, onSignOut }: Props) {
  const pathname = usePathname()
  const [searchOpen, setSearchOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const debug = typeof window !== 'undefined' && window.location.search.includes('vvdebug')

  const isHome = pathname === '/home'
  const isLibrary = pathname === '/library'
  const isCommunity = pathname === '/community'
  const isProfileSection = pathname === `/${userHandle}` || pathname.startsWith(`/${userHandle}/`)

  return (
    <>
      {debug && <VVDebug />}
      <HeaderSearch open={searchOpen} onOpen={() => setSearchOpen(true)} onClose={() => setSearchOpen(false)} />

      {moreOpen && (
        <>
          <div className="mobile-more-backdrop" onClick={() => setMoreOpen(false)} />
          <div className="mobile-more-sheet">
            <div className="mobile-more-header">
              <div className="mobile-more-user">
                <div className="mobile-more-avatar">
                  {avatarUrl
                    ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    : <span>{userHandle.slice(0, 2).toUpperCase()}</span>
                  }
                </div>
                <div>
                  {displayName && <div className="mobile-more-name">{displayName}</div>}
                  <div className="mobile-more-handle">@{userHandle}</div>
                </div>
              </div>
              <button className="mobile-more-close" onClick={() => setMoreOpen(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <div className="mobile-more-links">
              <a href={`/${userHandle}`} className={`mobile-more-item${isProfileSection ? ' active' : ''}`} onClick={() => setMoreOpen(false)}>Profile</a>
              <a href="/lists" className={`mobile-more-item${pathname === '/lists' || pathname.startsWith('/lists/') ? ' active' : ''}`} onClick={() => setMoreOpen(false)}>Lists</a>
              <a href="/discover" className={`mobile-more-item${pathname === '/discover' ? ' active' : ''}`} onClick={() => setMoreOpen(false)}>Discover</a>
              <a href="/settings" className={`mobile-more-item${pathname === '/settings' ? ' active' : ''}`} onClick={() => setMoreOpen(false)}>Settings</a>
            </div>

            <div className="mobile-more-footer">
              <div className="mobile-more-footer-links">
                <a href="/faq" className="mobile-more-footer-link" onClick={() => setMoreOpen(false)}>FAQ</a>
                <a href="/feedback" className="mobile-more-footer-link" onClick={() => setMoreOpen(false)}>Feedback</a>
              </div>
              <button className="mobile-more-signout" onClick={() => { setMoreOpen(false); onSignOut() }}>
                Sign out
              </button>
            </div>
          </div>
        </>
      )}

      <nav className="mobile-footer-nav">
        <a href="/home" className={`mobile-footer-tab${isHome ? ' active' : ''}`}>
          <LayoutPanelTop size={22} strokeWidth={isHome ? 2.5 : 2} />
          <span>Home</span>
        </a>
        <a href="/library" className={`mobile-footer-tab${isLibrary ? ' active' : ''}`}>
          <Library size={22} strokeWidth={isLibrary ? 2.5 : 2} />
          <span>Library</span>
        </a>
        <button className={`mobile-footer-tab${searchOpen ? ' active' : ''}`} onClick={() => setSearchOpen(true)}>
          <Search size={22} strokeWidth={searchOpen ? 2.5 : 2} />
          <span>Search</span>
        </button>
        <a href="/community" className={`mobile-footer-tab${isCommunity ? ' active' : ''}`}>
          <Users size={22} strokeWidth={isCommunity ? 2.5 : 2} />
          <span>Community</span>
        </a>
        <button className={`mobile-footer-tab${moreOpen ? ' active' : ''}`} onClick={() => setMoreOpen(true)}>
          <div className={`mobile-footer-avatar${moreOpen || isProfileSection ? ' active' : ''}`}>
            {avatarUrl
              ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }} />
              : <span style={{ fontSize: '0.625rem', fontWeight: 800 }}>{userHandle.slice(0, 2).toUpperCase()}</span>
            }
          </div>
          <span>Me</span>
        </button>
      </nav>
    </>
  )
}
