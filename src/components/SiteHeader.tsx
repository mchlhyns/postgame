'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Agent } from '@atproto/api'
import { restoreSession, signOut } from '@/lib/atproto'
import HeaderMenu from '@/components/HeaderMenu'
import MobileMenu from '@/components/MobileMenu'
import AddGameModal from '@/components/AddGameModal'

export default function SiteHeader() {
  const pathname = usePathname()
  const [userHandle, setUserHandle] = useState<string | null>(null)
  const [session, setSession] = useState<{ agent: Agent; did: string } | null>(null)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    restoreSession()
      .then((s) => {
        if (s) {
          setSession(s)
          s.agent.com.atproto.repo.describeRepo({ repo: s.did })
            .then((res) => setUserHandle(res.data.handle))
            .catch(() => {})
        }
        setSessionChecked(true)
      })
      .catch(() => setSessionChecked(true))
  }, [])

  useEffect(() => {
    function onScroll() {
      if (headerRef.current) {
        headerRef.current.classList.toggle('scrolled', window.scrollY > 4)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  async function handleSignOut() {
    const s = await restoreSession()
    if (!s) return
    await signOut(s.did)
    window.location.href = '/'
  }

  if (pathname === '/' || pathname === '/oauth/callback') return null

  const isDiscover = pathname === '/discover'
  const isSocial = pathname === '/social'
  const isProfileSection =
    pathname === '/games' ||
    pathname.startsWith('/lists') ||
    (userHandle != null && (pathname === `/${userHandle}` || pathname.startsWith(`/${userHandle}/`)))

  return (
    <header ref={headerRef}>
      <div className="container">
        <a
          href={sessionChecked && userHandle ? '/discover' : '/'}
          style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}
        >
          <img src="/logo.png" alt="" style={{ height: 18, lineHeight: 0 }} />
          <span className="header-site-name">CRASH THE ARCADE</span>
        </a>
        {sessionChecked && (
          userHandle ? (
            <>
              <nav className="header-desktop-nav">
                <a href="/discover" className={`nav-link${isDiscover ? ' nav-link-active' : ''}`}>Discover</a>
                <a href="/social" className={`nav-link${isSocial ? ' nav-link-active' : ''}`}>Social</a>
                <HeaderMenu userHandle={userHandle} onSignOut={handleSignOut} active={isProfileSection} />
                <button className="btn btn-primary btn-sm" style={{ marginLeft: 14 }} onClick={() => setShowAddModal(true)}>+ Add game</button>
              </nav>
              <MobileMenu userHandle={userHandle} onSignOut={handleSignOut} />
              {showAddModal && session && (
                <AddGameModal
                  agent={session.agent}
                  did={session.did}
                  onClose={() => setShowAddModal(false)}
                  onAdded={() => setShowAddModal(false)}
                />
              )}
            </>
          ) : (
            <a href="/" className="btn btn-ghost btn-sm">
              Sign in
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
            </a>
          )
        )}
      </div>
    </header>
  )
}
