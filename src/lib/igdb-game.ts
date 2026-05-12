import { unstable_cache } from 'next/cache'
import { getIgdbToken, igdbQuery } from '@/lib/igdb-server'
import { IgdbGame } from '@/types'

export const getGame = unstable_cache(
  async (id: number): Promise<IgdbGame | null> => {
    const token = await getIgdbToken()
    const results = await igdbQuery(
      token,
      'games',
      `fields name,url,cover.url,screenshots.url,artworks.url,first_release_date,platforms.name,summary,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,genres.name,websites.url,similar_games.id,similar_games.name,similar_games.cover.url,similar_games.platforms.name; where id = ${id}; limit 1;`
    ) as IgdbGame[]
    return results?.[0] ?? null
  },
  ['igdb-game-detail-v7'],
  { revalidate: 604800 }
)
