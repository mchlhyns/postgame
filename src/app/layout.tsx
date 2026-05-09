import type { Metadata } from 'next'
import './globals.css'
import SiteHeader from '@/components/SiteHeader'
import FooterWrapper from '@/components/FooterWrapper'
import BackToTop from '@/components/BackToTop'
import AccentColorApplier from '@/components/AccentColorApplier'

const APP_URL = 'https://crashthearcade.com'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'CRASH THE ARCADE',
    template: '%s · CRASH THE ARCADE',
  },
  description: 'Track and manage your gaming backlog',
  icons: { icon: '/favicon.png' },
  openGraph: {
    siteName: 'CRASH THE ARCADE',
    title: 'CRASH THE ARCADE',
    description: 'Track and manage your gaming backlog',
    url: APP_URL,
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'CRASH THE ARCADE' }],
  },
  twitter: {
    card: 'summary',
    title: 'CRASH THE ARCADE',
    description: 'Track and manage your gaming backlog',
    images: ['/og-image-thumb.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AccentColorApplier />
        <SiteHeader />
        {children}
        <FooterWrapper />
        <BackToTop />
      </body>
    </html>
  )
}
