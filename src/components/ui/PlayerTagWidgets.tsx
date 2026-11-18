import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { SonaButton } from '@/components/ui/SonaButton'
import { HistoryAssetTooltip } from '@/components/ui/HistoryAssetTooltip'
import { getChampionById } from '@/lib/assets'
import {
  PLAYER_TAG_PRESETS,
  removePlayerTag,
  upsertPlayerTag,
  useEncounterAlertEnabled,
  usePlayerTag,
  usePlayerTagFeatureEnabled,
  usePlayerTags,
  type PlayerTagRecord,
  type PlayerTagTone,
  type RecentEncounterSummary,
} from '@/lib/player-tags'
import '@/styles/PlayerTagWidgets.css'

const TONE_OPTIONS: Array<{ value: PlayerTagTone; label: string }> = [
  { value: 'carry', label: '金色 · 大腿' },
  { value: 'good', label: '绿色 · 好评' },
  { value: 'note', label: '蓝色 · 备注' },
  { value: 'warn', label: '橙色 · 注意' },
  { value: 'avoid', label: '红色 · 避雷' },
]

const shortDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function TagBookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M4 2.5h8a1 1 0 0 1 1 1v10l-5-3-5 3v-10a1 1 0 0 1 1-1Z" />
    </svg>
  )
}

export function TagBookIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M3 2.5h8.5a1.5 1.5 0 0 1 1.5 1.5v9.5H4.5A1.5 1.5 0 0 1 3 12V2.5Z" />
      <path d="M3 11.5h10M6 5.5h4M6 8h3" />
    </svg>
  )
}

function getTagTooltipParts(record: PlayerTagRecord): { title: string; subtitle?: string; description?: string } {
  const dateText = Number.isFinite(record.updatedAt) ? shortDateFormatter.format(record.updatedAt) : ''
  return {
    title: `小本本标记：${record.label}`,
    subtitle: dateText ? `更新于 ${dateText}` : undefined,
    description: record.note || undefined,
  }
}

export function PlayerTagBadge({
  puuid,
  record: providedRecord,
  onClick,
}: {
  puuid: string
  record?: PlayerTagRecord | null
  onClick?: (event: MouseEvent<HTMLElement>) => void
}) {
  const enabled = usePlayerTagFeatureEnabled()
  const subscribed = usePlayerTag(providedRecord === undefined ? puuid : '')
  const record = providedRecord !== undefined ? providedRecord : subscribed
  if (!enabled || !record) return null

  const tip = getTagTooltipParts(record)
  const isCompact = !tip.description && !tip.subtitle
  if (onClick) {
    return (
      <HistoryAssetTooltip title={tip.title} subtitle={tip.subtitle} description={tip.description} compact={isCompact} asChild>
        <button
          type="button"
          className={`rh-ptag-badge rh-ptag-badge--${record.tone}`}
          data-testid="player-tag-badge"
          onClick={(e) => {
            e.stopPropagation()
            onClick(e)
          }}
        >
          {record.label}
        </button>
      </HistoryAssetTooltip>
    )
  }

  return (
    <HistoryAssetTooltip title={tip.title} subtitle={tip.subtitle} description={tip.description} compact={isCompact} focusable={false} asChild>
      <span className={`rh-ptag-badge rh-ptag-badge--${record.tone}`} data-testid="player-tag-badge">
        {record.label}
      </span>
    </HistoryAssetTooltip>
  )
}

export function EncounterAlertBadge({ encounter }: { encounter?: RecentEncounterSummary }) {
  const enabled = useEncounterAlertEnabled()
  if (!enabled || !encounter || encounter.total <= 0) return null

  const relationLabel = encounter.allyCount > 0 && encounter.enemyCount > 0
    ? `同局 ${encounter.total}场`
    : encounter.allyCount > 0
      ? `曾同队 ${encounter.total}场`
      : `曾交手 ${encounter.total}场`

  const toneClass = encounter.selfWins > encounter.selfLosses
    ? ' rh-encounter-badge--positive'
    : encounter.selfLosses > encounter.selfWins
      ? ' rh-encounter-badge--negative'
      : ''

  const detailLines = encounter.recent.map((m) => {
    const time = Number.isFinite(m.gameCreation) ? shortDateFormatter.format(m.gameCreation) : '近期'
    const side = m.relation === 'ally' ? '同队' : '对手'
    const champ = getChampionById(m.targetChampionId)?.name || `英雄#${m.targetChampionId}`
    const outcome = m.selfWin ? '我方胜' : '我方负'
    return `${time} · ${side} · ${champ} ${m.kills}/${m.deaths}/${m.assists} · ${outcome}`
  })

  return (
    <HistoryAssetTooltip
      title={`近期撞车：我方 ${encounter.selfWins}胜 ${encounter.selfLosses}负`}
      subtitle={`同队 ${encounter.allyCount} 场 · 对手 ${encounter.enemyCount} 场`}
      description={detailLines.join('\n')}
      focusable={false}
      asChild
    >
      <span className={`rh-encounter-badge${toneClass}`} data-testid="encounter-alert-badge">
        {relationLabel} ({encounter.selfWins}胜{encounter.selfLosses}负)
      </span>
    </HistoryAssetTooltip>
  )
}

export interface PlayerTagTarget {
  puuid: string
  name: string
  serverId?: string
  matchId?: string
}

export function PlayerTagEditorModal({
  open,
  target,
  onClose,
}: {
  open: boolean
  target: PlayerTagTarget | null
  onClose: () => void
}) {
  const existing = usePlayerTag(target?.puuid ?? '')
  const [label, setLabel] = useState('大腿')
  const [tone, setTone] = useState<PlayerTagTone>('carry')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open || !target) return
    if (existing) {
      setLabel(existing.label)
      setTone(existing.tone)
      setNote(existing.note)
    } else {
      setLabel(PLAYER_TAG_PRESETS[0].label)
      setTone(PLAYER_TAG_PRESETS[0].tone)
      setNote('')
    }
  }, [open, target?.puuid, existing])

  if (!target) return null

  const handleSave = () => {
    upsertPlayerTag({
      puuid: target.puuid,
      name: target.name,
      label: label.trim() || '标记',
      tone,
      note,
      serverId: target.serverId,
      matchId: target.matchId,
    })
    onClose()
  }

  const handleDelete = () => {
    removePlayerTag(target.puuid)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} width={460} height={390}>
      <div className="rh-ptag-modal" data-testid="player-tag-editor">
        <h3>
          <span>标记玩家（小本本）</span>
          <small>{target.name || target.puuid.slice(0, 12)}</small>
        </h3>

        <div className="rh-ptag-field">
          <span>快捷预设</span>
          <div className="rh-ptag-presets">
            {PLAYER_TAG_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={`rh-ptag-preset${label === preset.label && tone === preset.tone ? ' is-active' : ''}`}
                title={preset.hint}
                onClick={() => {
                  setLabel(preset.label)
                  setTone(preset.tone)
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
          <label className="rh-ptag-field">
            <span>标签文字（最多 10 字）</span>
            <input
              type="text"
              maxLength={10}
              aria-label="玩家标签文字"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例如：大腿 / 绝活盲僧"
            />
          </label>
          <div className="rh-ptag-field">
            <span>徽章配色</span>
            <div className="rh-ptag-tones">
              {TONE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`rh-ptag-badge rh-ptag-badge--${opt.value}`}
                  style={{ opacity: tone === opt.value ? 1 : 0.45 }}
                  onClick={() => setTone(opt.value)}
                >
                  {opt.label.split(' · ')[1]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="rh-ptag-field">
          <span>备注说明（可选，悬浮徽章时展示）</span>
          <textarea
            maxLength={200}
            aria-label="玩家备注说明"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="记录该玩家的打法特点、擅长英雄或同局印象…"
          />
        </label>

        <div className="rh-ptag-actions">
          {existing && (
            <SonaButton variant="secondary" style={{ marginRight: 'auto', color: '#ff8585', borderColor: 'rgba(231, 76, 60, 0.45)' }} onClick={handleDelete}>
              移除标记
            </SonaButton>
          )}
          <SonaButton variant="secondary" onClick={onClose}>取消</SonaButton>
          <SonaButton variant="primary" onClick={handleSave}>
            保存标记
          </SonaButton>
        </div>
      </div>
    </Modal>
  )
}

export function PlayerTagBookModal({
  open,
  onClose,
  onInspectPlayer,
}: {
  open: boolean
  onClose: () => void
  onInspectPlayer?: (puuid: string, name: string, serverId?: string) => void
}) {
  const tagsMap = usePlayerTags()
  const [query, setQuery] = useState('')
  const [toneFilter, setToneFilter] = useState<'all' | PlayerTagTone>('all')
  const [editing, setEditing] = useState<PlayerTagTarget | null>(null)

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return Object.values(tagsMap)
      .filter((item) => {
        if (toneFilter !== 'all' && item.tone !== toneFilter) return false
        if (!q) return true
        return (
          item.name.toLowerCase().includes(q) ||
          item.label.toLowerCase().includes(q) ||
          item.note.toLowerCase().includes(q) ||
          item.puuid.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [tagsMap, query, toneFilter])

  return (
    <>
      <Modal open={open} onClose={onClose} width="min(740px, 92vw)" height="min(560px, 88vh)">
        <div className="rh-ptag-modal" data-testid="player-tag-book">
          <h3>
            <span>玩家小本本</span>
            <small>共标记 {Object.keys(tagsMap).length} 位召唤师</small>
          </h3>

          <div className="rh-ptag-book-toolbar">
            <input
              type="search"
              aria-label="搜索已标记玩家"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索召唤师名字、标签或备注…"
            />
            <div className="rh-ptag-tones">
              <button
                type="button"
                className={`rh-ptag-preset${toneFilter === 'all' ? ' is-active' : ''}`}
                onClick={() => setToneFilter('all')}
              >
                全部
              </button>
              {TONE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`rh-ptag-preset${toneFilter === opt.value ? ' is-active' : ''}`}
                  onClick={() => setToneFilter(opt.value)}
                >
                  {opt.label.split(' · ')[1]}
                </button>
              ))}
            </div>
          </div>

          <div className="rh-ptag-book-list">
            {list.length === 0 ? (
              <div className="rh-empty" style={{ margin: 'auto 0' }}>
                {Object.keys(tagsMap).length === 0
                  ? '尚未标记任何玩家。可在战绩页、单场战报或对局详情中点击书签图标添加标记。'
                  : '没有匹配的标记记录。'}
              </div>
            ) : (
              list.map((record) => (
                <div key={record.puuid} className="rh-ptag-book-row">
                  <div className="rh-ptag-book-main">
                    <div className="rh-ptag-book-head">
                      {onInspectPlayer ? (
                        <button
                          type="button"
                          className="rh-ptag-book-name"
                          onClick={() => {
                            onClose()
                            onInspectPlayer(record.puuid, record.name || record.puuid, record.serverId)
                          }}
                        >
                          {record.name || record.puuid}
                        </button>
                      ) : (
                        <strong style={{ fontSize: 13 }}>{record.name || record.puuid}</strong>
                      )}
                      <PlayerTagBadge puuid={record.puuid} record={record} onClick={() => setEditing({ puuid: record.puuid, name: record.name, serverId: record.serverId, matchId: record.matchId })} />
                      <span className="rh-ptag-book-time">
                        {Number.isFinite(record.updatedAt) ? shortDateFormatter.format(record.updatedAt) : ''}
                      </span>
                    </div>
                    {record.note && <p className="rh-ptag-book-note">{record.note}</p>}
                  </div>
                  <div className="rh-ptag-book-ops">
                    <SonaButton onClick={() => setEditing({ puuid: record.puuid, name: record.name, serverId: record.serverId, matchId: record.matchId })}>
                      编辑
                    </SonaButton>
                    <SonaButton onClick={() => removePlayerTag(record.puuid)}>删除</SonaButton>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>
      <PlayerTagEditorModal open={Boolean(editing)} target={editing} onClose={() => setEditing(null)} />
    </>
  )
}
