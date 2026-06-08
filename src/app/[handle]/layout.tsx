import type { Metadata } from 'next'

const APP_URL = 'https://postgame.at'

interface Props {
  params: Promise<{ handle: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params
  const clean = handle.replace(/^@/, '')
  const title = `@${clean}`
  const description = `Check out @${clean}'s game collection on postgame. Track your games, in the Atmosphere.`
  const ogImage = `${APP_URL}/api/og/profile/${encodeURIComponent(clean)}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${APP_URL}/${clean}`,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  }
}

export default function HandleLayout({ children }: { children: React.ReactNode }) {
  return children
}
