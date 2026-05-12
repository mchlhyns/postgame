import GameBannerStats from '@/components/GameBannerStats'

interface Props {
  igdbId: number
  bannerUrl?: string
  coverUrl?: string
  title: string
  subtitle?: string
}

export default function GamePageBanner({ igdbId, bannerUrl, coverUrl, title, subtitle }: Props) {
  return (
    <div className="game-detail-banner-block">
      <div
        className="game-detail-banner-img"
        style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined}
      />
      <div className="container">
        <div className="game-detail-banner-content">
          <img src={coverUrl ?? '/no-cover.png'} alt={title} className="game-detail-cover" />
          <div className="game-detail-banner-info">
            <div>
              <h1 className="game-detail-title">{title}</h1>
              {subtitle && <p className="game-detail-banner-sub">{subtitle}</p>}
            </div>
            <GameBannerStats igdbId={igdbId} />
          </div>
        </div>
      </div>
    </div>
  )
}
