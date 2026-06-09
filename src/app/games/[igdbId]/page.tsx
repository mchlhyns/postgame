import { notFound } from 'next/navigation'
import { getGame } from '@/lib/igdb-game'
import { normalizeCoverUrl, normalizeScreenshotUrl, abbreviatePlatform, HIDDEN_PLATFORMS } from '@/lib/igdb'
import { IgdbGame } from '@/types'
import GamePageBanner from '@/components/GamePageBanner'
import GameBannerStats from '@/components/GameBannerStats'
import AddGameButton from '@/components/AddGameButton'
import ScreenshotGallery from '@/components/ScreenshotGallery'
import RelatedGamesSection from '@/components/RelatedGamesSection'
import GameSummary from '@/components/GameSummary'

export default async function GamePage({ params }: { params: Promise<{ igdbId: string }> }) {
  const { igdbId } = await params
  const id = Number(igdbId)
  if (!Number.isFinite(id) || id <= 0) notFound()

  const game = await getGame(id)
  if (!game) notFound()

  const coverUrl = game.cover ? normalizeCoverUrl(game.cover.url) : undefined

  const bannerUrl = game.screenshots?.[0]
    ? normalizeScreenshotUrl(game.screenshots[0].url)
    : game.artworks?.[0]
      ? normalizeScreenshotUrl(game.artworks[0].url)
      : undefined

  const allScreenshots = [
    ...(game.screenshots ?? []).map(s => normalizeScreenshotUrl(s.url)),
    ...(game.artworks ?? []).map(a => normalizeScreenshotUrl(a.url)),
  ].slice(0, 6)

  const developers = game.involved_companies?.filter(c => c.developer).map(c => c.company.name) ?? []
  const publishers = game.involved_companies?.filter(c => c.publisher && !c.developer).map(c => c.company.name) ?? []
  const genres = game.genres?.map(g => g.name) ?? []
  const platforms = game.platforms?.map(p => abbreviatePlatform(p.name)).filter(p => !HIDDEN_PLATFORMS.has(p)) ?? []

  const releaseDate = game.first_release_date ? new Date(game.first_release_date * 1000) : undefined

  const links = (game.websites ?? []).reduce<{ label: string; url: string }[]>((acc, w) => {
    const u = w.url
    let label: string | null = null
    if (/steampowered\.com/i.test(u)) label = 'Steam'
    else if (/gog\.com/i.test(u)) label = 'GOG'
    else if (/epicgames\.com/i.test(u)) label = 'Epic Games'
    else if (/itch\.io/i.test(u)) label = 'itch.io'
    else if (/wikipedia\.org/i.test(u)) label = 'Wikipedia'
    if (label) acc.push({ label, url: u })
    return acc
  }, [])

  const gameForClient: Pick<IgdbGame, 'id' | 'name' | 'url' | 'first_release_date' | 'platforms'> & { coverUrl?: string; screenshotUrl?: string } = {
    id: game.id,
    name: game.name,
    url: game.url,
    first_release_date: game.first_release_date,
    platforms: game.platforms,
    coverUrl,
    screenshotUrl: bannerUrl,
  }

  const subtitle = platforms.length > 0
    ? platforms.join(', ')
    : undefined

  const metaSections = (
    <>
      {developers.length > 0 && (
        <div className="game-detail-meta-section">
          <div className="game-detail-meta-label">{developers.length === 1 ? 'Developer' : 'Developers'}</div>
          <div className="game-detail-meta-value">{developers.join(', ')}</div>
        </div>
      )}
      {publishers.length > 0 && (
        <div className="game-detail-meta-section">
          <div className="game-detail-meta-label">{publishers.length === 1 ? 'Publisher' : 'Publishers'}</div>
          <div className="game-detail-meta-value">{publishers.join(', ')}</div>
        </div>
      )}
      {genres.length > 0 && (
        <div className="game-detail-meta-section">
          <div className="game-detail-meta-label">{genres.length === 1 ? 'Genre' : 'Genres'}</div>
          <div className="game-detail-meta-value">{genres.join(', ')}</div>
        </div>
      )}
      {releaseDate && (
        <div className="game-detail-meta-section">
          <div className="game-detail-meta-label">Release date</div>
          <div className="game-detail-meta-value">
            {releaseDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      )}
      {links.length > 0 && (
        <div className="game-detail-meta-section">
          <div className="game-detail-meta-label">Links</div>
          <div className="game-detail-meta-value game-detail-links">
            {links.map(link => (
              <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="game-detail-link">
                {link.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  )

  return (
    <>
      <main>
        <GamePageBanner bannerUrl={bannerUrl} />

        <div className="container">
          <div className="game-detail-layout">
            <div className="game-detail-sidebar">
              <img src={coverUrl ?? '/no-cover.png'} alt={game.name} className="game-detail-cover" />
              <div className="game-detail-add-desktop">
                <AddGameButton game={gameForClient} />
              </div>
              <div className="game-detail-meta-desktop">
                {metaSections}
              </div>
            </div>

            <div className="game-detail-content">
              <div className="game-detail-mobile-top">
                <img src={coverUrl ?? '/no-cover.png'} alt={game.name} className="game-detail-cover game-detail-cover-mobile" />
              </div>
              <div className="game-detail-add-mobile">
                <AddGameButton game={gameForClient} />
              </div>
              <div className="game-detail-banner-info">
                <div style={{ minWidth: 0 }}>
                  <h1 className="game-detail-title">{game.name}</h1>
                  {subtitle && <p className="game-detail-banner-sub">{subtitle}</p>}
                </div>
                <GameBannerStats igdbId={id} />
              </div>
              {game.summary && <GameSummary summary={game.summary} />}
              {allScreenshots.length > 0 && (
                <ScreenshotGallery screenshots={allScreenshots} />
              )}
              <div className="game-detail-meta-mobile">
                {metaSections}
              </div>
              {(game.similar_games?.length ?? 0) > 0 && (
                <div className="game-detail-related">
                  <div className="game-list-divider" style={{ marginBottom: 12 }}>Similar games</div>
                  <RelatedGamesSection
                    games={game.similar_games!.slice(0, 4).map(sg => ({
                      id: sg.id,
                      name: sg.name,
                      coverUrl: sg.cover ? normalizeCoverUrl(sg.cover.url) : undefined,
                      platforms: sg.platforms?.map(p => abbreviatePlatform(p.name)),
                    }))}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
