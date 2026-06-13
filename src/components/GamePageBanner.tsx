import ParallaxBannerImg from '@/components/ParallaxBannerImg'

interface Props {
  bannerUrl?: string
}

export default function GamePageBanner({ bannerUrl }: Props) {
  return (
    <div className="game-detail-banner-block" style={{ position: 'relative' }}>
      <ParallaxBannerImg className="game-detail-banner-img" url={bannerUrl} />
    </div>
  )
}
