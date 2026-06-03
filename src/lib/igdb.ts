import { IgdbGame, PlayedStatus, BackloggedStatus } from '@/types'

/** Convert a date input value (YYYY-MM-DD) to an ISO datetime string for storage */
export function dateInputToISO(value: string): string | undefined {
  if (!value) return undefined
  const [year, month, day] = value.split('-').map(Number)
  const d = new Date()
  d.setFullYear(year, month - 1, day)
  return d.toISOString()
}

/** Convert an ISO datetime string to a date input value (YYYY-MM-DD) */
export function isoToDateInput(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

/** Format an ISO datetime string for display (e.g. "Jan 2024") */
export function formatDate(iso: string | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function normalizeCoverUrl(url: string): string {
  // IGDB returns URLs like //images.igdb.com/igdb/image/upload/t_thumb/...
  // We want t_cover_big for better quality
  return url
    .replace(/^\/\//, 'https://')
    .replace('/t_thumb/', '/t_cover_big/')
}

export function normalizeScreenshotUrl(url: string): string {
  return url
    .replace(/^\/\//, 'https://')
    .replace(/\/t_[^/]+\//, '/t_screenshot_big/')
}

export const COMMON_PLATFORMS = [
  'PC', 'Mac', 'PS5', 'PS4', 'PS3',
  'Xbox Series X/S', 'Xbox One', 'Xbox 360',
  'Nintendo Switch', 'Nintendo Switch 2', 'Wii U', '3DS',
  'iOS', 'Android',
]

const PLATFORM_ABBREVS: Record<string, string> = {
  'PC (Microsoft Windows)': 'PC',
  'PlayStation 5': 'PS5',
  'PlayStation 4': 'PS4',
  'PlayStation 3': 'PS3',
  'PlayStation 2': 'PS2',
  'PlayStation': 'PS1',
  'Xbox Series X|S': 'Xbox Series X/S',
  'Nintendo Switch 2': 'Switch 2',
  'Nintendo Switch': 'Switch',
  'Nintendo 3DS': '3DS',
  'New Nintendo 3DS': '3DS',
}

export function abbreviatePlatform(name: string): string {
  return PLATFORM_ABBREVS[name] ?? name
}

export const PRIMARY_STATUSES = ['playing', 'backlogged', 'wishlisted', 'played'] as const
export type PrimaryStatus = typeof PRIMARY_STATUSES[number]

export const PLAYED_STATUSES: PlayedStatus[] = ['completed', 'mastered', 'abandoned']
export const BACKLOGGED_STATUSES: BackloggedStatus[] = ['shelved']

/** Normalize legacy status values to the current primary status */
export function normalizeStatus(status: string): PrimaryStatus {
  switch (status) {
    case 'started': return 'playing'
    case 'wishlist': return 'wishlisted'
    case 'shelved': return 'backlogged'
    case 'finished':
    case 'abandoned': return 'played'
    default: return status as PrimaryStatus
  }
}

/** Infer the played sub-status from a record (handles legacy status values) */
export function inferPlayedStatus(status: string, playedStatus?: string): PlayedStatus | undefined {
  if (playedStatus) return playedStatus as PlayedStatus
  if (status === 'finished') return 'completed'
  if (status === 'abandoned') return 'abandoned'
  return undefined
}

/** Infer the backlogged sub-status from a record (handles legacy status values) */
export function inferBackloggedStatus(status: string, backloggedStatus?: string): BackloggedStatus | undefined {
  if (backloggedStatus) return backloggedStatus as BackloggedStatus
  if (status === 'shelved') return 'shelved'
  return undefined
}

export const PLAYED_STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  mastered: 'Mastered',
  retired: 'Retired',
  abandoned: 'Abandoned',
}

export const BACKLOGGED_STATUS_LABELS: Record<string, string> = {
  shelved: 'Shelved',
}

const PRIMARY_STATUS_LABELS: Record<string, string> = {
  playing: 'Playing',
  wishlisted: 'Wishlisted',
  backlogged: 'Backlogged',
  played: 'Played',
}

/** Return the display label for a game status + optional sub-status */
export function statusLabel(status: string, playedStatus?: string, backloggedStatus?: string): string {
  const norm = normalizeStatus(status)
  if (norm === 'played') {
    const ps = inferPlayedStatus(status, playedStatus)
    if (ps) return PLAYED_STATUS_LABELS[ps] ?? ps
  }
  if (norm === 'backlogged') {
    const bs = inferBackloggedStatus(status, backloggedStatus)
    if (bs) return BACKLOGGED_STATUS_LABELS[bs] ?? bs
  }
  return PRIMARY_STATUS_LABELS[norm] ?? (norm.charAt(0).toUpperCase() + norm.slice(1))
}

/** Whether a record's status matches a filter status (handles legacy values) */
export function matchesStatus(recordStatus: string, filterStatus: string): boolean {
  return normalizeStatus(recordStatus) === filterStatus
}

/** Returns the CSS class suffix for a status badge */
export function statusClass(status: string, playedStatus?: string, backloggedStatus?: string): string {
  const norm = normalizeStatus(status)
  if (norm === 'played') return inferPlayedStatus(status, playedStatus) ?? 'played'
  if (norm === 'backlogged') return inferBackloggedStatus(status, backloggedStatus) ?? 'backlogged'
  return norm
}

export function formatIgdbGame(game: IgdbGame): IgdbGame & { coverUrl?: string; screenshotUrl?: string } {
  return {
    ...game,
    coverUrl: game.cover ? normalizeCoverUrl(game.cover.url) : undefined,
    screenshotUrl: game.screenshots?.[0] ? normalizeScreenshotUrl(game.screenshots[0].url) : undefined,
  }
}
