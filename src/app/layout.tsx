import type { Metadata, Viewport } from 'next'
import './globals.css'
import SiteHeader from '@/components/SiteHeader'
import BackToTop from '@/components/BackToTop'

const APP_URL = 'https://postgame.at'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'postgame',
    template: '%s · postgame',
  },
  description: 'Track and manage your gaming backlog',
  icons: { icon: '/favicon.png' },
  openGraph: {
    siteName: 'postgame',
    title: 'postgame',
    description: 'Track and manage your gaming backlog',
    url: APP_URL,
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'postgame' }],
  },
  twitter: {
    card: 'summary',
    title: 'postgame',
    description: 'Track and manage your gaming backlog',
    images: ['/og-image-thumb.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/Fustat/Fustat-VariableFont_wght.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <script defer data-domain="postgame.at" src="https://stats.postgame.at/js/script.js" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var path = window.location.pathname;
                  if (path !== '/' && path !== '/oauth/callback') {
                    document.documentElement.classList.add('has-header');
                    document.documentElement.classList.add('has-sidebar');
                  }
                } catch (e) {}
              })();
            `
          }}
        />
      </head>
      <body>
        <SiteHeader />
        {children}
        <BackToTop />
      </body>
    </html>
  )
}
