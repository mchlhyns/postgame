import type { Metadata } from 'next'
import { getGame } from '@/lib/igdb-game'

const APP_URL = 'https://postgame.at'

interface Props {
  params: Promise<{ igdbId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { igdbId } = await params
  const id = Number(igdbId)
  if (!Number.isFinite(id) || id <= 0) return {}

  const game = await getGame(id)
  if (!game) return {}

  const title = game.name
  const description = game.summary?.slice(0, 160) ?? `${game.name} on postgame`
  const ogImage = `${APP_URL}/api/og/game/${igdbId}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${APP_URL}/games/${igdbId}`,
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

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return children
}
