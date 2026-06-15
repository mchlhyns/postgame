import ParallaxBannerImg from '@/components/ParallaxBannerImg'
import GameBannerStats from '@/components/GameBannerStats'

interface Props {
  bannerUrl?: string
  title: string
  subtitle?: string
  igdbId: number
}

export default function GamePageBanner({ bannerUrl, title, subtitle, igdbId }: Props) {
  return (
    <div className="game-detail-banner-block" style={{ position: 'relative' }}>
      <ParallaxBannerImg className="game-detail-banner-img" url={bannerUrl} />
      <div className="game-detail-banner-overlay" />
      <div className="game-detail-banner-content-wrap">
        <div className="container game-detail-banner-content">
          <div className="game-detail-banner-spacer" />
          <div className="game-detail-banner-title-area">
            <div style={{ minWidth: 0 }}>
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
