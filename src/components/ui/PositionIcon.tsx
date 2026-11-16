import { HistoryAssetTooltip } from './HistoryAssetTooltip'
import { POSITION_NAMES } from '@/lib/history-model'

/** Small lane silhouettes using the client's map-corner / diagonal visual language. */
export function PositionIcon({ position = '', tooltip = false }: { position?: string; tooltip?: boolean }) {
  const shape: Record<string, string> = {
    TOP: 'M3 3h16l-4 4H7v8l-4 4z', BOTTOM: 'M21 21H5l4-4h8V9l4-4z',
    MIDDLE: 'M5 19 19 5h-5L5 14z', JUNGLE: 'm5 3 6 7 1 10-6-6zm14 0-5 7-1 10 6-7z',
    UTILITY: 'm3 7 7 3 2-6 2 6 7-3-4 7-4 2v5h-2v-5l-4-2z',
  }
  const label = POSITION_NAMES[position] || '全部位置'
  const icon = <svg className="sona-position-icon" role="img" aria-label={label} width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    {shape[position] ? <><path d="M4 4h16v16H4z" fill="none" stroke="currentColor" strokeWidth="1" opacity=".35"/><path d={shape[position]} /></> : <path d="m12 2 10 10-10 10L2 12zm0 4-6 6 6 6 6-6z"/>}
  </svg>
  return tooltip ? <HistoryAssetTooltip title={label} compact focusable={false} asChild>{icon}</HistoryAssetTooltip> : icon
}
