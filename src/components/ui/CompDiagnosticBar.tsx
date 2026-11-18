import { useMemo } from 'react'
import { getChampIcon } from '@/lib/assets'
import { analyzeChampSelectSession, type TeamCompDiagnostic } from '@/lib/comp-diagnostic'
import { HistoryAssetTooltip } from '@/components/ui/HistoryAssetTooltip'
import type { ChampSelectSession } from '@/types/lcu'
import '@/styles/CompDiagnosticBar.css'

export function CompDiagnosticBar({
  session,
  diagnostic: externalDiagnostic,
  compact = false,
}: {
  session?: ChampSelectSession | null
  diagnostic?: TeamCompDiagnostic | null
  compact?: boolean
}) {
  const diag = useMemo(
    () => externalDiagnostic ?? analyzeChampSelectSession(session),
    [externalDiagnostic, session],
  )

  if (!diag) return null

  const hasDanger = diag.tags.some((t) => t.severity === 'danger')
  const countSubtitle = diag.pickedCount === 0
    ? `0/${diag.totalSlots}`
    : diag.intentCount > 0
      ? `${diag.pickedCount}/${diag.totalSlots}（含${diag.intentCount}预选）`
      : `${diag.lockedCount}/${diag.totalSlots} 已定`

  const breakdownDescription = diag.members.length > 0
    ? diag.members.map((m) => {
        const stateText = m.isIntent ? '[预选] ' : ''
        return `${m.floor}楼 ${stateText}${m.championName}（${m.roleTag}）· 物${m.adPct}% 魔${m.apPct}% 真${m.truePct}%`
      }).join('\n')
    : '等待己方队员亮出或锁定英雄'

  return (
    <div
      className={`sona-comp-diag${hasDanger ? ' sona-comp-diag--danger' : ''}${compact ? ' sona-comp-diag--compact' : ''}`}
      data-testid={compact ? 'native-comp-diagnostic' : 'bp-comp-diagnostic'}
    >
      <div className="sona-comp-diag-left">
        <span className="sona-comp-diag-title">
          阵容诊断
          <span className="sona-comp-diag-sub">{countSubtitle}</span>
        </span>
        {diag.members.length > 0 && (
          <div className="sona-comp-diag-avatars">
            {diag.members.map((m) => (
              <HistoryAssetTooltip
                key={`${m.floor}-${m.championId}`}
                title={`${m.floor}楼 · ${m.championName}${m.isIntent ? '（预选）' : ''}`}
                subtitle={m.roleTag}
                description={`预计伤害构成：物理 ${m.adPct}% · 魔法 ${m.apPct}% · 真实 ${m.truePct}%`}
                asChild
              >
                <span className={`sona-comp-diag-avatar${m.isIntent ? ' is-intent' : ''}`}>
                  <img src={getChampIcon(m.championId)} alt={m.championName} />
                </span>
              </HistoryAssetTooltip>
            ))}
          </div>
        )}
      </div>

      {diag.pickedCount > 0 && (
        <HistoryAssetTooltip
          title="团队预计伤害结构与定位明细"
          subtitle={`物理 ${diag.physicalPct}% · 魔法 ${diag.magicPct}% · 真实 ${diag.truePct}%`}
          description={breakdownDescription}
          asChild
        >
          <div
            className="sona-comp-diag-bar-section"
            aria-label={`团队预计伤害：物理 ${diag.physicalPct}% · 魔法 ${diag.magicPct}% · 真实 ${diag.truePct}%`}
          >
            <div className="sona-comp-diag-legend">
              <span className="sona-comp-diag-stat">
                <i className="sona-comp-diag-dot sona-comp-diag-dot--ad" />
                物理 {diag.physicalPct}%
              </span>
              <span className="sona-comp-diag-stat">
                <i className="sona-comp-diag-dot sona-comp-diag-dot--ap" />
                魔法 {diag.magicPct}%
              </span>
              <span className="sona-comp-diag-stat">
                <i className="sona-comp-diag-dot sona-comp-diag-dot--true" />
                真实 {diag.truePct}%
              </span>
            </div>
            <div className="sona-comp-diag-track">
              <span className="sona-comp-diag-seg sona-comp-diag-seg--ad" style={{ width: `${diag.physicalPct}%` }} />
              <span className="sona-comp-diag-seg sona-comp-diag-seg--ap" style={{ width: `${diag.magicPct}%` }} />
              <span className="sona-comp-diag-seg sona-comp-diag-seg--true" style={{ width: `${diag.truePct}%` }} />
            </div>
          </div>
        </HistoryAssetTooltip>
      )}

      <div className="sona-comp-diag-tags">
        {diag.tags.map((tag) => (
          <HistoryAssetTooltip
            key={tag.id}
            title={tag.label}
            description={tag.detail}
            asChild
          >
            <span className={`sona-comp-diag-pill sona-comp-diag-pill--${tag.severity}`}>
              {tag.label}
            </span>
          </HistoryAssetTooltip>
        ))}
      </div>
    </div>
  )
}
