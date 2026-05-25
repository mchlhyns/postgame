export type GameStatus =
  | 'playing'
  | 'wishlisted'
  | 'backlogged'
  | 'played'
  // legacy values still present in existing records:
  | 'started'
  | 'wishlist'
  | 'finished'
  | 'shelved'
  | 'abandoned'

export type PlayedStatus = 'completed' | 'mastered' | 'retired' | 'abandoned'
export type BackloggedStatus = 'shelved'

export interface GameRef {
  igdbId: number
  title: string
  coverUrl?: string
  screenshotUrl?: string
  igdbUrl?: string
  ctaUrl?: string
  releaseYear?: number
  releaseDate?: number
}

export interface GameRecord {
  $type: 'com.crashthearcade.game'
  game: GameRef
  status: GameStatus
  playedStatus?: PlayedStatus
  backloggedStatus?: BackloggedStatus
  platform?: string
  rating?: number
  notes?: string
  startedAt?: string
  finishedAt?: string
  isReplay?: boolean
  createdAt: string
  updatedAt?: string
}

export interface GameRecordView {
  uri: string
  cid: string
  value: GameRecord
}

export interface ListItem {
  igdbId: number
  title: string
  coverUrl?: string
  position: number
  award?: string
}

export interface ListRecord {
  $type: 'com.crashthearcade.list'
  name: string
  items: ListItem[]
  numbered?: boolean
  url?: string
  createdAt: string
  updatedAt: string
}

export interface ListRecordView {
  uri: string
  cid: string
  value: ListRecord
}

export interface IgdbGame {
  id: number
  name: string
  url?: string
  cover?: { url: string }
  screenshots?: { url: string }[]
  artworks?: { url: string }[]
  first_release_date?: number
  platforms?: { name: string }[]
  summary?: string
  rating?: number
  rating_count?: number
  hypes?: number
  involved_companies?: { company: { name: string }; developer: boolean; publisher: boolean }[]
  genres?: { name: string }[]
  websites?: { url: string }[]
  similar_games?: { id: number; name: string; cover?: { url: string }; platforms?: { name: string }[] }[]
}
