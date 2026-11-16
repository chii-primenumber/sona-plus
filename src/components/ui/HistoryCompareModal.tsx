import { HistorySelect } from './HistorySelect'
/** Player comparison: loaded shared matches by default, independent history for a manual ID. */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Modal } from './Modal'
import { HistoryRadar } from './HistoryRadar'
import { HistoryAssetTooltip } from './HistoryAssetTooltip'
import { RefreshIcon, SearchIcon } from './icons'
import { useHistoryPages } from '@/lib/use-history-pages'
import { parsePlayerQuery, searchHistoryPlayers, type HistoryPlayer } from '@/lib/history-search'
import { toHistoryMatches } from '@/lib/history-model'
import type { PlayerScoreSystem } from '@/lib/player-score'
import { formatPlayerScore, playerScoreLabel } from '@/lib/player-score'
import { compareHighlight, comparePlayers, formatCompareDelta, formatCompareValue, type CompareRow } from '@/lib/chart-compare'
import type { SgpGameSummaryLol } from '@/types/sgp'
import '@/styles/HistoryCharts.css'

export interface CompareCandidate { puuid: string; name: string; independent?: boolean }
interface CompareFilters { championId: number; position: string; outcome: string; hideAborted: boolean }
const defaultFilters: CompareFilters = { championId: 0, position: '', outcome: '', hideAborted: true }

export function HistoryCompareModal({ open, onClose, games, puuid, system, candidates, serverId, queueId = 0, count = 50, filters = defaultFilters, onRefresh, sourceLoading = false }: {
  open: boolean; onClose: () => void; games: SgpGameSummaryLol[]; puuid: string; system: PlayerScoreSystem
  candidates: CompareCandidate[]; serverId?: string; queueId?: number; count?: number; filters?: CompareFilters
  onRefresh?: () => void; sourceLoading?: boolean
}) {
  const [selected, setSelected] = useState('')
  const [manual, setManual] = useState<CompareCandidate[]>([])
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [choices, setChoices] = useState<HistoryPlayer[]>([])
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const search = useRef<AbortController | null>(null)
  const options = useMemo(() => {
    const players = new Map(candidates.filter((candidate) => candidate.puuid !== puuid).map((candidate) => [candidate.puuid, candidate]))
    for (const candidate of manual) if (candidate.puuid !== puuid) players.set(candidate.puuid, candidate)
    return [...players.values()]
  }, [candidates, manual, puuid])
  const key = options.map((candidate) => candidate.puuid).join(',')
  useEffect(() => {
    if (!open || sourceLoading) return
    setSelected((current) => options.some((candidate) => candidate.puuid === current) ? current : options[0]?.puuid ?? '')
  }, [open, key, sourceLoading])
  useEffect(() => {
    return () => search.current?.abort()
  }, [open, serverId, puuid])
  useEffect(() => {
    if (!open) { search.current?.abort(); setSearching(false); setChoices([]) }
  }, [open])
  const target = options.find((candidate) => candidate.puuid === selected)
  const independent = Boolean(target?.independent)
  const pages = useHistoryPages(independent ? selected : '', queueId, count, open && independent, serverId)
  const otherGames = useMemo(() => toHistoryMatches(pages.games, selected).filter((match) =>
    (!queueId || match.game.json.queueId === queueId) &&
    (!filters.championId || match.player.championId === filters.championId) &&
    (!filters.position || match.position === filters.position) &&
    (!filters.outcome || match.outcome === filters.outcome) &&
    (!filters.hideAborted || (match.outcome !== 'remake' && match.outcome !== 'abort'))
  ).map((match) => match.game), [pages.games, selected, queueId, filters.championId, filters.position, filters.outcome, filters.hideAborted])
  const loading = searching || sourceLoading || (independent && pages.loading)
  const result = useMemo(() => {
    if (!open || !selected || loading || (independent && pages.error)) return null
    const value = comparePlayers(games, puuid, selected, system, independent ? otherGames : games)
    return value ? { ...value, bName: target?.name || value.bName } : null
  }, [open, games, puuid, selected, system, independent, otherGames, loading, pages.error, target?.name, revision])
  const axes = result ? result.a.axes : []
  const rows: CompareRow[] = result ? result.rows : []
  function choose(player: HistoryPlayer) {
    if (player.puuid === puuid) { search.current?.abort(); setSearching(false); setError('请选择其他玩家进行对比。'); setChoices([]); return }
    search.current?.abort(); setSearching(false); setError(''); setChoices([])
    setManual((previous) => [...previous.filter((item) => item.puuid !== player.puuid), { puuid: player.puuid, name: player.name, independent: true }].slice(-12))
    setSelected(player.puuid)
  }
  async function lookup(event: FormEvent) {
    event.preventDefault(); search.current?.abort()
    const controller = new AbortController(); search.current = controller
    setSearching(true); setError(''); setChoices([])
    try {
      const players = await searchHistoryPlayers(parsePlayerQuery(query), serverId ?? '', controller.signal)
      if (controller.signal.aborted) return
      if (players.length === 1) choose(players[0])
      else if (players.length) { setChoices(players); setSearching(false) }
      else { setError('未找到玩家，请检查 ID。'); setSearching(false) }
    } catch (failure) {
      if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : '查询失败，请重试。'); setSearching(false) }
    }
  }
  function refresh() {
    setError(''); setRevision((value) => value + 1)
    onRefresh?.()
    if (independent) pages.refresh()
  }
  return <Modal open={open} onClose={onClose} careerBackground width="min(1080px, 94vw)" height="min(700px, 88vh)">
    <div className="rh-shell rh-compare" data-testid="player-compare">
      <header className="rh-chart-head"><h3>玩家对比</h3></header>
      <div className="rh-compare-pick">
        <label>对比对象
          <HistorySelect aria-label="选择对比玩家" value={selected} onChangeValue={(value) => {
            search.current?.abort(); setSearching(false); setError(''); setChoices([]); setSelected(value)
          }} disabled={!options.length}>
            {!options.length && <option value="">选择玩家</option>}
            {options.map((candidate) => <option key={candidate.puuid} value={candidate.puuid}>{candidate.name}</option>)}
          </HistorySelect>
        </label>
        <form className="rh-compare-search" onSubmit={lookup}>
          <input type="search" aria-label="输入对比玩家 ID" placeholder="名字 / 名字#编号 / PUUID" value={query} maxLength={120} autoComplete="off" onChange={(event) => {
            search.current?.abort(); setSearching(false); setChoices([]); setError(''); setQuery(event.target.value)
          }} />
          <HistoryAssetTooltip title="查询对比玩家" compact asChild><button type="submit" className="rh-button rh-icon-button" aria-label="查询对比玩家" disabled={!query.trim() || searching}><SearchIcon /></button></HistoryAssetTooltip>
        </form>
        <HistoryAssetTooltip title="刷新" compact asChild><button type="button" className="rh-button rh-icon-button rh-compare-refresh" aria-label="刷新" onClick={refresh} disabled={loading}><RefreshIcon /></button></HistoryAssetTooltip>
        {result && <span className="rh-compare-samples rh-muted">{independent ? '各自近期对局' : `同场 ${result.sharedGames} 局`} · 有效样本 {result.a.validGames} / {result.b.validGames}</span>}
      </div>
      {error && <div className="rh-compare-status rh-error" role="alert">{error}</div>}
      {choices.length > 0 && <div className="rh-compare-choices" role="region" aria-label="对比玩家搜索结果">{choices.map((player) => <button key={player.puuid} type="button" className="rh-button" onClick={() => choose(player)}>{player.name}</button>)}</div>}
      {loading ? <div className="rh-empty" role="status"><span className="rh-spinner" />{searching ? '正在查找玩家…' : '正在读取对比战绩…'}</div> : independent && pages.error ? <div className="rh-compare-status rh-error" role="alert">{pages.error}<button type="button" onClick={pages.refresh}>重试</button></div> : result ? (
        <div className="rh-compare-body">
          <div className="rh-compare-radar">
            <HistoryRadar axes={axes} secondary={result.b.axes} label={`${result.aName} 与 ${result.bName} 的 Sona 八维雷达对比`} />
            <div className="rh-compare-legend">
              <span><i className="is-a" />{result.aName} · {playerScoreLabel(system)} {formatPlayerScore(result.aScore ?? NaN, system)}</span>
              <span><i className="is-b" />{result.bName} · {playerScoreLabel(system)} {formatPlayerScore(result.bScore ?? NaN, system)}</span>
            </div>
          </div>
          <div className="rh-compare-table-wrap">
            <table className="rh-compare-table">
              <thead><tr><th>指标</th><th>{result.aName}</th><th>{result.bName}</th><th>差值 A−B</th></tr></thead>
              <tbody>{rows.map((row) => {
                const highlight = compareHighlight(row)
                return <tr key={row.key}><td>{row.label}</td>
                  <td className={highlight === 'a' ? 'is-higher' : ''}>{formatCompareValue(row.a, row.format, system)}</td>
                  <td className={highlight === 'b' ? 'is-higher' : ''}>{formatCompareValue(row.b, row.format, system)}</td>
                  <td className="rh-compare-delta">{formatCompareDelta(row, system)}</td></tr>
              })}</tbody>
            </table>
          </div>
        </div>
      ) : <p className="rh-muted">{selected ? '当前筛选下样本不足，无法生成对比。' : '选择玩家或输入 ID 开始对比。'}</p>}
    </div>
  </Modal>
}
