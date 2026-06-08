'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Agent } from '@atproto/api'
import { restoreSession, signOut, SETTINGS_COLLECTION } from '@/lib/atproto'
import MobileMenu from '@/components/MobileMenu'
import MobileFooterNav from '@/components/MobileFooterNav'
import HeaderSearch from '@/components/HeaderSearch'
import { LayoutPanelTop, Compass, Users, Library, Logs } from 'lucide-react'
import { extractCid } from '@/lib/appview-fetch'

export default function SiteHeader() {
  const pathname = usePathname()
  const [userHandle, setUserHandle] = useState<string | null>(null)
  const [session, setSession] = useState<{ agent: Agent; did: string } | null>(null)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)

  useLayoutEffect(() => {
    const cachedAvatar = sessionStorage.getItem('cta_avatar_url')
    const cachedDisplayName = sessionStorage.getItem('cta_display_name')
    if (cachedAvatar) setAvatarUrl(cachedAvatar)
    if (cachedDisplayName) setDisplayName(cachedDisplayName)
  }, [])

  useEffect(() => {
    restoreSession()
      .then(async (s) => {
        if (!s) {
          localStorage.removeItem('cta_authed')
        }
        if (s) {
          setSession(s)
          try {
            const res = await s.agent.com.atproto.repo.describeRepo({ repo: s.did })
            const handle = res.data.handle
            setUserHandle(handle)
            localStorage.setItem('cta_authed', '1')

            // Fetch Bluesky profile and resolve PDS in parallel
            const docUrl = s.did.startsWith('did:web:')
              ? `https://${s.did.slice('did:web:'.length).split(':')[0]}/.well-known/did.json`
              : `https://plc.directory/${s.did}`

            const cachedPds = sessionStorage.getItem(`pds_${s.did}`)
            const [profileRes, pdsUrl] = await Promise.all([
              fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(s.did)}`).catch(() => null),
              cachedPds
                ? Promise.resolve(cachedPds)
                : fetch(docUrl).then(async r => {
                    if (!r.ok) return 'https://bsky.social'
                    const doc = await r.json()
                    const svc = doc.service?.find((serv: any) => serv.id === '#atproto_pds')
                    const url = svc?.serviceEndpoint
                    const resolved = url?.startsWith('https://') ? url : 'https://bsky.social'
                    try { sessionStorage.setItem(`pds_${s.did}`, resolved) } catch {}
                    return resolved
                  }).catch(() => 'https://bsky.social'),
            ])

            try {
              if (profileRes?.ok) {
                const profile = await profileRes.json()
                if (profile.avatar) {
                  setAvatarUrl(profile.avatar)
                  try { sessionStorage.setItem('cta_avatar_url', profile.avatar) } catch {}
                }
                if (profile.displayName) {
                  setDisplayName(profile.displayName)
                  try { sessionStorage.setItem('cta_display_name', profile.displayName) } catch {}
                }
              }
            } catch {}

            // Fetch custom CTA settings
            try {
              const settingsRes = await s.agent.com.atproto.repo.getRecord({
                repo: s.did,
                collection: SETTINGS_COLLECTION,
                rkey: 'self',
              })
              const value = settingsRes.data.value as any
              if (value?.displayName) {
                setDisplayName(value.displayName)
                try { sessionStorage.setItem('cta_display_name', value.displayName) } catch {}
              }
              if (value?.avatarBlob) {
                const cid = extractCid(value.avatarBlob.ref) ?? extractCid(value.avatarBlob)
                if (cid) {
                  const url = `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(s.did)}&cid=${encodeURIComponent(cid)}`
                  setAvatarUrl(url)
                  try { sessionStorage.setItem('cta_avatar_url', url) } catch {}
                }
              }
            } catch {}
          } catch {}
        }
        setSessionChecked(true)
      })
      .catch(() => setSessionChecked(true))
  }, [])

  useEffect(() => {
    if (!sessionChecked) return
    if (!userHandle) {
      document.documentElement.classList.remove('has-header')
    }
  }, [sessionChecked, userHandle])

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  async function handleSignOut() {
    const s = await restoreSession()
    if (!s) return
    localStorage.removeItem('cta_authed')
    sessionStorage.removeItem('cta_avatar_url')
    sessionStorage.removeItem('cta_display_name')
    await signOut(s.did)
    window.location.href = '/'
  }

  if (pathname === '/' || pathname === '/oauth/callback') return null

  const isHome = pathname === '/home'
  const isDiscover = pathname === '/discover'
  const isCommunity = pathname === '/community'
  const isLibrary = pathname === '/library'
  const isLists = pathname === '/lists' || pathname.startsWith('/lists/')
  const isProfileSection = userHandle != null && (pathname === `/${userHandle}` || pathname.startsWith(`/${userHandle}/`))

  return (
    <>
      <aside className="site-sidebar">
          {/* Logo container at the top of the sidebar */}
          <div className="sidebar-logo" style={{ padding: '0 10px 24px 10px', display: 'flex', alignItems: 'center' }}>
            <a href={userHandle ? '/home' : '/'} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <img src="/logo.svg" alt="postgame" style={{ height: 22 }} />
            </a>
          </div>

          {/* Search container inside the sidebar */}
          <div className="sidebar-search" style={{ paddingBottom: '16px' }}>
            <HeaderSearch />
          </div>

          <nav className="sidebar-nav" style={{ paddingTop: 0 }}>
            {userHandle && (
              <a href="/home" className={`sidebar-nav-link${isHome ? ' sidebar-nav-link-active' : ''}`}>
                <LayoutPanelTop size={18} style={{ flexShrink: 0 }} />
                <span>Dashboard</span>
              </a>
            )}
            {userHandle && (
              <a href="/library" className={`sidebar-nav-link${isLibrary ? ' sidebar-nav-link-active' : ''}`}>
                <Library size={18} style={{ flexShrink: 0 }} />
                <span>Library</span>
              </a>
            )}
            <a href="/discover" className={`sidebar-nav-link${isDiscover ? ' sidebar-nav-link-active' : ''}`}>
              <Compass size={18} style={{ flexShrink: 0 }} />
              <span>Discover</span>
            </a>
            {userHandle && (
              <a href="/lists" className={`sidebar-nav-link${isLists ? ' sidebar-nav-link-active' : ''}`}>
                <Logs size={18} style={{ flexShrink: 0 }} />
                <span>Lists</span>
              </a>
            )}
            {userHandle && (
              <a href="/community" className={`sidebar-nav-link${isCommunity ? ' sidebar-nav-link-active' : ''}`}>
                <Users size={18} style={{ flexShrink: 0 }} />
                <span>Community</span>
              </a>
            )}
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-footer-links">
              <a href="/faq" className="sidebar-footer-link">FAQ</a>
              <a href="/feedback" className="sidebar-footer-link">Feedback</a>
              <a href="https://skyboard.dev/board/did:plc:crwol3wvv2w2lvvognhvd5cm/3mkdcspo57s2u" target="_blank" rel="noopener noreferrer" className="sidebar-footer-link">Roadmap</a>
            </div>
            <div className="sidebar-footer-socials">
              <a href="https://bsky.app/profile/postgame.at" target="_blank" rel="noopener noreferrer" aria-label="Bluesky">
                <span className="sidebar-footer-social-icon" style={{ maskImage: 'url(/bluesky.svg)', WebkitMaskImage: 'url(/bluesky.svg)' }} />
              </a>
              <a href="https://github.com/assemblezero/postgame" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                <span className="sidebar-footer-social-icon" style={{ maskImage: 'url(/github.svg)', WebkitMaskImage: 'url(/github.svg)' }} />
              </a>

            </div>
          </div>

          {sessionChecked && !userHandle ? (
            <div className="sidebar-profile">
              <a href="/" className="btn btn-primary" style={{ width: '100%', textAlign: 'center', textDecoration: 'none' }}>
                Sign in
              </a>
            </div>
          ) : (
            <div className="sidebar-profile" ref={menuRef}>
              <button className={`sidebar-profile-trigger${isProfileSection ? ' active' : ''}`} onClick={() => setMenuOpen(!menuOpen)} disabled={!userHandle}>
                <div className="sidebar-profile-avatar">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }} />
                  ) : userHandle ? (
                    userHandle.slice(0, 2).toUpperCase()
                  ) : null}
                </div>
                <div className="sidebar-profile-info">
                  {displayName && (
                    <span className="sidebar-profile-name" style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 900, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px', lineHeight: 1.25 }}>
                      {displayName}
                    </span>
                  )}
                  {userHandle && (
                    <span className="sidebar-profile-handle" style={displayName ? { color: 'var(--text-muted)', fontWeight: 500, fontSize: 'var(--text-xs)' } : undefined}>
                      @{userHandle}
                    </span>
                  )}
                </div>
                <svg
                  className={`sidebar-profile-chevron${menuOpen ? ' open' : ''}`}
                  width="14" height="14" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {menuOpen && userHandle && (
                <div className="sidebar-profile-dropdown">
                  <a href={`/${userHandle}`} className="sidebar-profile-item" onClick={() => setMenuOpen(false)}>
                    Profile
                  </a>
                  <a href="/settings" className="sidebar-profile-item" onClick={() => setMenuOpen(false)}>
                    Settings
                  </a>
                  <div className="sidebar-profile-divider" />
                  <button
                    className="sidebar-profile-item sidebar-profile-item-signout"
                    onClick={() => { setMenuOpen(false); handleSignOut() }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
      </aside>

      {userHandle && (
        <div className="mobile-footer-nav-wrap">
          <MobileFooterNav
            userHandle={userHandle}
            avatarUrl={avatarUrl}
            displayName={displayName}
            onSignOut={handleSignOut}
          />
        </div>
      )}

    </>
  )
}

