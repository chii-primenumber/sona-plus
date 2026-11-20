import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { HistoryAssetTooltip } from './HistoryAssetTooltip'
import { HistoryCopyId } from './HistoryCopyId'
import { HistoryPlayerName } from './HistoryPlayerName'
import { championName, HistoryImage } from './HistoryWidgets'
import { getChampIcon, getQueueName } from '@/lib/assets'
import { getOutcome, metric, numberText, profileIconUrl, type EncounterRelation, type HistoryMatch, type RecentEncounter } from '@/lib/history-model'
import { bindScrollbarHighlight } from '@/lib/scrollbar-highlight'

const ENCOUNTER_HOVER_MS = 750
const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

export interface EncounterTarget {
  puuid: string
  name: string
  relation: EncounterRelation
}

export function HistoryEncounterButton({ person, blocked, selected, onPreview, onInspect }: {
  person: RecentEncounter
  blocked: boolean
  selected: boolean
  onPreview: (anchor: HTMLButtonElement, keyboard: boolean) => void
  onInspect: () => void
}) {
  const [pending, setPending] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const timer = useRef(0)
  const cancel = () => {
    window.clearTimeout(timer.current)
    setPending(false)
  }
  useLayoutEffect(() => {
    if (blocked) setPending(false)
    return () => window.clearTimeout(timer.current)
  }, [blocked])
  useEffect(() => {
    if (!pending) return
    const scroller = buttonRef.current?.closest('.rh-sidebar')
    if (!scroller) return
    const onScroll = () => cancel()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [pending])

  return <button
    ref={buttonRef}
    type="button" aria-label={person.name} aria-keyshortcuts="ArrowRight" data-encounter-player={person.puuid}
    className={selected ? 'is-encounter-pinned' : undefined}
    onClick={() => { cancel(); onInspect() }}
    onPointerEnter={(event) => {
      if (blocked || event.pointerType === 'touch') return
      const anchor = event.currentTarget
      window.clearTimeout(timer.current)
      setPending(true)
      timer.current = window.setTimeout(() => {
        setPending(false)
        if (anchor.isConnected && anchor.matches(':hover') && !document.hidden) onPreview(anchor, false)
      }, ENCOUNTER_HOVER_MS)
    }}
    onPointerLeave={cancel}
    onPointerCancel={cancel}
    onKeyDown={(event) => {
      if (event.key !== 'ArrowRight') return
      event.preventDefault()
      cancel()
      onPreview(event.currentTarget, true)
    }}
  >
    <HistoryImage src={profileIconUrl(person.profileIcon)} label={person.name} nativeTooltip={false} />
    <HistoryPlayerName name={person.name} showTag tooltip="none" />
    <small>{person.meetings.length} 场 · {person.wins} 胜 {person.losses} 负</small>
    {pending && <svg className="rh-encounter-progress" viewBox="0 0 16 16" aria-hidden="true">
      <circle className="rh-encounter-progress-track" cx="8" cy="8" r="6" />
      <circle className="rh-encounter-progress-fill" cx="8" cy="8" r="6" pathLength="100"
        style={{ animationDuration: `${ENCOUNTER_HOVER_MS}ms` }} />
    </svg>}
  </button>
}

export function HistoryEncounterPreview({ target, person, left, top, keyboard, escapeDisabled = false, onClose, onExpand, onInspect, onMatch }: {
  target: EncounterTarget
  person?: RecentEncounter
  left: number
  top: number
  keyboard: boolean
  escapeDisabled?: boolean
  onClose: () => void
  onExpand: () => void
  onInspect: () => void
  onMatch: (match: HistoryMatch, trigger: HTMLButtonElement) => void
}) {
  const panelRef = useRef<HTMLElement>(null)
  const gamesRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => gamesRef.current ? bindScrollbarHighlight(gamesRef.current) : undefined, [])
  useEffect(() => {
    if (escapeDisabled) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      onCloseRef.current()
    }
    document.addEventListener('keydown', handleKey, true)
    return () => document.removeEventListener('keydown', handleKey, true)
  }, [escapeDisabled])
  const isEnemy = target.relation === 'enemy'
  const label = isEnemy ? '交手' : '同队'
  useLayoutEffect(() => {
    const panel = panelRef.current
    const shell = panel?.parentElement
    if (!panel || !shell) return
    const place = () => {
      panel.style.left = `${Math.max(8, Math.min(left, shell.clientWidth - panel.offsetWidth - 8))}px`
      panel.style.top = `${Math.max(8, Math.min(top, shell.clientHeight - panel.offsetHeight - 8))}px`
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(shell)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [left, top])

  return <section ref={panelRef} className="rh-encounter-preview" role="region" aria-label={`${target.name}的${label}对局`}>
    <header className="rh-encounter-preview-header">
      <div className="rh-encounter-heading">
        <div className="rh-encounter-identity">
          <button type="button" className="rh-encounter-name" onClick={onInspect} aria-label={`查看 ${target.name} 的战绩`}>
            <HistoryPlayerName name={target.name} showTag tooltip="none" />
          </button>
          <HistoryCopyId key={target.name} name={target.name} />
        </div>
        <small>{label} {person?.meetings.length ?? 0} 场{person ? ` · ${isEnemy ? '我方 ' : ''}${person.wins} 胜 ${person.losses} 负` : ''}</small>
      </div>
      <HistoryAssetTooltip title="在战绩明细中展开" compact asChild>
        <button type="button" className="rh-button rh-icon-button" aria-label="在战绩明细中展开" onClick={onExpand}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 4h10M3 8h5m-5 4h5m3-6 3 2-3 2" />
          </svg>
        </button>
      </HistoryAssetTooltip>
      <button type="button" className="rh-button rh-encounter-close" aria-label="关闭交手记录" autoFocus={keyboard} onClick={onClose}>×</button>
    </header>
    <div ref={gamesRef} className="rh-encounter-games rh-scroll-area">
      {person?.meetings.length ? person.meetings.map(({ match, player }, index) => {
        const date = new Date(match.game.json.gameCreation)
        const outcome = getOutcome(match.game, player)
        const result = outcome === 'win' ? (isEnemy ? '对方胜' : '胜利') : outcome === 'loss' ? (isEnemy ? '对方负' : '失败') : '—'
        return <button type="button" className="rh-encounter-game" key={match.id} data-match-id={match.id}
          onClick={(event) => onMatch(match, event.currentTarget)}>
          <span className="rh-encounter-champions">
            <span className="rh-encounter-champion" data-sona-tooltip={`本页玩家 · ${championName(match.player.championId)}`}>
              {index === 0 && <small>本页</small>}
              <HistoryImage src={getChampIcon(match.player.championId)} label={championName(match.player.championId)} nativeTooltip={false} />
            </span>
            <span className="rh-encounter-champion rh-encounter-champion--other" data-sona-tooltip={`对方 · ${championName(player.championId)}`}>
              {index === 0 && <small>对方</small>}
              <HistoryImage src={getChampIcon(player.championId)} label={championName(player.championId)} nativeTooltip={false} />
            </span>
          </span>
          <span className="rh-encounter-game-meta">
            <strong>{getQueueName(match.game.json.queueId)}</strong>
            <small>{Number.isFinite(date.getTime()) ? dateFormat.format(date) : '—'}</small>
          </span>
          <span className="rh-encounter-kda" aria-label="对方击杀 / 死亡 / 助攻">
            {numberText(metric(player, 'kills', match.game))}<i>/</i>
            <em>{numberText(metric(player, 'deaths', match.game))}</em><i>/</i>
            {numberText(metric(player, 'assists', match.game))}
          </span>
          <b className={`rh-encounter-outcome rh-report-outcome--${outcome}`}>{result}</b>
        </button>
      }) : <p className="rh-muted">当前筛选下暂无对局</p>}
    </div>
  </section>
}
