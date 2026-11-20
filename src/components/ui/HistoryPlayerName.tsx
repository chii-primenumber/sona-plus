import { splitRiotId } from '@/lib/history-model'

export function HistoryPlayerName({ name, showTag = false, color, tooltip = 'auto' }: {
  name: string; showTag?: boolean; color?: string; tooltip?: 'auto' | 'overflow' | 'none'
}) {
  const identity = splitRiotId(name)
  const hiddenTag = tooltip === 'auto' && !showTag && Boolean(identity.tag)
  return <span className="rh-player-name" aria-label={name}
    data-sona-tooltip={hiddenTag ? name : undefined}
    data-sona-overflow-tooltip={tooltip !== 'none' && !hiddenTag ? name : undefined}>
    <span className="rh-player-name-text" style={{ color }}>{identity.name}</span>
    {showTag && identity.tag && <span className="rh-id-tag">{identity.tag}</span>}
  </span>
}
