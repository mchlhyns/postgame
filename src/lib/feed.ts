export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function feedActionText(status: string, playedStatus?: string): string {
  switch (status) {
    case 'playing':
    case 'started': return 'playing'
    case 'backlogged': return 'backlogged'
    case 'wishlisted':
    case 'wishlist': return 'wishlisted'
    case 'played':
    case 'finished': {
      switch (playedStatus) {
        case 'completed': return 'completed'
        case 'mastered': return 'mastered'
        case 'retired': return 'retired'
        case 'abandoned': return 'abandoned'
        default: return 'played'
      }
    }
    case 'completed': return 'completed'
    case 'shelved': return 'shelved'
    case 'abandoned': return 'abandoned'
    case 'retired': return 'retired'
    default: return status
  }
}
