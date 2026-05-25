'use client'

import { usePathname } from 'next/navigation'

const links = [
  { label: 'FAQ', href: '/faq' },
  { label: 'Feedback', href: '/feedback' },
  { label: 'Roadmap', href: 'https://skyboard.dev/board/did:plc:crwol3wvv2w2lvvognhvd5cm/3mkdcspo57s2u', external: true },
]

const iconLinks = [
  { label: 'Bluesky', icon: '/bluesky.svg', href: 'https://bsky.app/profile/crashthearcade.com' },
  { label: 'GitHub',  icon: '/github.svg',  href: 'https://github.com/mchlhyns/crashthearcade' },
]

export default function SiteFooter() {
  const pathname = usePathname()

  if (pathname === '/' || pathname === '/oauth/callback') return null

  return (
    <footer>
      <div className="container">
        <div className="footer-wordmark">
          CRASH THE ARCADE ©2026
        </div>
        <nav className="footer-links">
          {links.map(({ label, href, external }) => (
            <a
              key={href}
              href={href}
              className={pathname === href ? 'footer-link-active' : ''}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {label}
            </a>
          ))}
          {iconLinks.map(({ label, icon, href }) => (
            <a key={href} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="footer-icon-link">
              <span className={`footer-icon${label === 'GitHub' ? ' footer-icon--lg' : ''}`} style={{ maskImage: `url(${icon})` }} />
            </a>
          ))}
        </nav>
      </div>
    </footer>
  )
}
