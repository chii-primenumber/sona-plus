import { useState } from 'react'
import { HistoryAssetTooltip } from './HistoryAssetTooltip'

export function HistoryCopyId({ name }: { name: string }) {
  const [status, setStatus] = useState('')
  return <HistoryAssetTooltip title={status || '复制玩家 ID'} compact asChild>
    <button type="button" className="rh-copy-id" aria-label="复制玩家 ID" aria-description={status || undefined}
      onClick={async () => {
        try { await navigator.clipboard.writeText(name); setStatus('已复制') }
        catch { setStatus('复制失败') }
      }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
        {status === '已复制' ? <path d="m3 8 3 3 7-7" /> : <><rect x="5" y="2" width="8" height="10" rx="1" /><path d="M3 5v8a1 1 0 0 0 1 1h6" /></>}
      </svg>
    </button>
  </HistoryAssetTooltip>
}
