function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return mins === 1 ? '1 minute ago' : `${mins} minutes ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`
  const d = new Date(iso)
  const month = d.toLocaleDateString('en-US', { month: 'long' })
  return `${month} ${ordinal(d.getDate())}, ${d.getFullYear()}`
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
