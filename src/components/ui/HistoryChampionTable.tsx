import { useEffect, useMemo, useRef } from 'react'
import { HistoryImage, championName } from './HistoryWidgets'
import { getChampIcon } from '@/lib/assets'
import { HISTORY_DISPLAY_FIELDS, isHistoryFieldVisible, type HistoryHiddenFields } from '@/lib/history-display'
import { championStats, numberText, percentText } from '@/lib/history-model'
import { PERFORMANCE_STATS, performanceSummary, performanceText } from '@/lib/history-performance'
import { bindScrollbarHighlight } from '@/lib/scrollbar-highlight'
import { useHistoryPerformanceFields } from '@/lib/use-history-display'

type ChampionRow = ReturnType<typeof championStats>[number]
type Direction = 'asc' | 'desc'

export function HistoryChampionTable({ champions, minimum, hidden, sort, direction, onSort, onSelect }: {
  champions: ChampionRow[]
  minimum: number
  hidden: HistoryHiddenFields
  sort: string
  direction: Direction
  onSort: (column: string, direction: Direction) => void
  onSelect: (id: number) => void
}) {
  const selection = useHistoryPerformanceFields().champions
  const scrollRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const releaseHighlight = bindScrollbarHighlight(scroller)
    const syncScrollState = () => {
      scroller.toggleAttribute('data-overflow-x', scroller.scrollWidth > scroller.clientWidth + 1)
      scroller.toggleAttribute('data-scrolled-x', scroller.scrollLeft > 1)
    }
    syncScrollState()
    const observer = new ResizeObserver(syncScrollState)
    observer.observe(scroller)
    if (tableRef.current) observer.observe(tableRef.current)
    scroller.addEventListener('scroll', syncScrollState, { passive: true })
    return () => {
      releaseHighlight()
      observer.disconnect()
      scroller.removeEventListener('scroll', syncScrollState)
    }
  }, [])

  const extra = useMemo(() => PERFORMANCE_STATS.filter(({ key, sections }) =>
    sections.includes('champions') && selection?.includes(key)), [selection])
  const base = HISTORY_DISPLAY_FIELDS.champions.filter(([key]) => isHistoryFieldVisible(hidden, 'champions', key))
  const headers = [
    { key: 'name', label: '英雄', hint: undefined },
    ...base.map(([key, label]) => ({ key, label, hint: undefined })),
    ...extra.map((stat) => ({ key: `metric:${stat.key}`, label: stat.short, hint: stat.definition })),
  ]
  const activeSort = headers.some(({ key }) => key === sort) ? sort : base.some(([key]) => key === 'total') ? 'total' : 'name'
  const activeDirection = activeSort === sort ? direction : activeSort === 'name' ? 'asc' : 'desc'
  const rows = useMemo(() => {
    const keys = extra.map(({ key }) => key)
    return champions.filter((champion) => champion.total >= minimum).map((champion) => ({
      champion, name: championName(champion.id),
      extras: keys.length ? Object.fromEntries(performanceSummary(champion.games, keys, 'champions')
        .map(({ stat, value }) => [stat.key, value])) : {},
    }))
  }, [champions, extra, minimum])
  const sorted = useMemo(() => {
    const sign = activeDirection === 'asc' ? 1 : -1
    const metricKey = activeSort.startsWith('metric:') ? activeSort.slice(7) : ''
    const baseKey = activeSort as typeof HISTORY_DISPLAY_FIELDS.champions[number][0]
    return [...rows].sort((a, b) => {
      if (activeSort === 'name') return a.name.localeCompare(b.name, 'zh-CN') * sign
      const left = metricKey ? a.extras[metricKey] : a.champion[baseKey]
      const right = metricKey ? b.extras[metricKey] : b.champion[baseKey]
      if (left == null || right == null) return left != null ? -1 : right != null ? 1 : a.champion.id - b.champion.id
      return (left - right) * sign || b.champion.total - a.champion.total || a.champion.id - b.champion.id
    })
  }, [rows, activeSort, activeDirection])

  return <>
    <div className="rh-table-scroll rh-scroll-area" ref={scrollRef}>
      <table className="rh-champion-table" ref={tableRef}>
        <thead><tr>{headers.map(({ key, label, hint }) => (
          <th key={key} scope="col" aria-sort={activeSort === key ? activeDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
            <button type="button" className="rh-column-sort" data-sort-key={key} aria-label={`${label}排序`}
              data-sona-tooltip={hint}
              onClick={() => onSort(key, activeSort === key ? activeDirection === 'asc' ? 'desc' : 'asc' : key === 'name' ? 'asc' : 'desc')}>
              {label}
              <svg width="10" height="12" viewBox="0 0 12 14" aria-hidden="true" fill="currentColor">
                <path opacity={activeSort === key && activeDirection === 'asc' ? 1 : .3} d="M6 1 10 6H2Z"/>
                <path opacity={activeSort === key && activeDirection === 'desc' ? 1 : .3} d="m2 8 4 5 4-5Z"/>
              </svg>
            </button>
          </th>
        ))}</tr></thead>
        <tbody>{sorted.map(({ champion, name, extras }) => (
          <tr key={champion.id} onClick={(event) => {
            if ((event.target as Element).closest('button, a, input, select, textarea')) return
            if (window.getSelection()?.toString()) return
            onSelect(champion.id)
          }}>
            <td><button type="button" className="rh-player-link" onClick={() => onSelect(champion.id)}>
              <HistoryImage src={getChampIcon(champion.id)} label={name} nativeTooltip={false} /><span>{name}</span>
            </button></td>
            {base.map(([key]) => <td key={key}>{key === 'total' ? champion.total
              : key === 'kda' || key === 'csPerMinute' ? numberText(champion[key], key === 'kda' ? 2 : 1)
              : percentText(champion[key])}</td>)}
            {extra.map((stat) => <td key={stat.key} className="rh-champion-extra" data-stat={stat.key}>
              {performanceText(stat, extras[stat.key] ?? null)}
            </td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
    {!sorted.length && <div className="rh-empty">没有达到最低场次的英雄</div>}
  </>
}
