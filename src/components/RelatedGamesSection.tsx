interface RelatedGame {
  id: number
  name: string
  coverUrl?: string
}

interface Props {
  games: RelatedGame[]
}

export default function RelatedGamesSection({ games }: Props) {
  return (
    <div className="game-detail-related-grid">
      {games.map(game => (
        <div key={game.id} className="game-card-grid">
          <div className="game-card-grid-cover-wrap">
            <a href={`/games/${game.id}`} style={{ display: 'block', lineHeight: 0 }}>
              <img className="game-card-grid-cover" src={game.coverUrl ?? '/no-cover.png'} alt={game.name} />
            </a>
          </div>
          <div className="game-card-grid-info">
            <div className="game-card-grid-title">
              <a href={`/games/${game.id}`}>{game.name}</a>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
