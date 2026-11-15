/**
 * 趋势与雷达面板
 *
 * 数据全部来自当前已加载对局；不落盘、不发请求。
 * 雷达固定使用 Sona 八维，趋势评分随全局评分机制切换。
 */
import { useMemo, useState } from 'react'
import type { HistoryMatch } from '@/lib/history-model'
import type { PlayerScore, PlayerScoreSystem } from '@/lib/player-score'
import { formatPlayerScore, playerScoreLabel } from '@/lib/player-score'
import {
  buildTrendSeries,
  formatTrendValue,
  movingAverage,
  TREND_METRICS,
  type TrendMetricKey,
} from '@/lib/chart-series'
import { buildRadarProfile } from '@/lib/chart-radar'
import type { SgpGameSummaryLol } from '@/types/sgp'
import '@/styles/HistoryCharts.css'
import { HistoryRadar } from './HistoryRadar'

function TrendChart({ values, labels, formatValue }: {
  values: Array<number | null>
  labels: string[]
  formatValue: (value: number) => string
}) {
  const width = 900
  const height = 230
  const pad = { left: 48, right: 16, top: 14, bottom: 42 }
  const known = values.filter((value): value is number => value != null)
  const fallback = known.length ? known : [0]
  const min = Math.min(...fallback)
  const max = Math.max(...fallback)
  const span = max - min || Math.max(1, Math.abs(max) * 0.1)
  const lo = min - span * 0.12
  const hi = max + span * 0.12
  const innerWidth = width - pad.left - pad.right
  const innerHeight = height - pad.top - pad.bottom
  const x = (index: number) => pad.left + (values.length <= 1 ? innerWidth / 2 : (index / (values.length - 1)) * innerWidth)
  const y = (value: number) => pad.top + (1 - (value - lo) / (hi - lo || 1)) * innerHeight
  const line = (series: Array<number | null>) => series
    .map((value, index) => (value == null ? null : `${x(index).toFixed(1)},${y(value).toFixed(1)}`))
    .filter((point): point is string => point != null)
    .map((point, index) => `${index ? 'L' : 'M'}${point}`)
    .join(' ')
  const ticks = [0, 1, 2, 3, 4].map((step) => lo + ((hi - lo) * step) / 4)

  return (
    <svg className="rh-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`近 ${values.length} 场趋势：平均 ${formatValue(values.filter((value): value is number => value != null).reduce((sum, value) => sum + value, 0) / Math.max(1, values.filter((value) => value != null).length))}`}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad.left} y1={y(tick)} x2={width - pad.right} y2={y(tick)} className="rh-chart-grid" />
          <text x={pad.left - 8} y={y(tick) + 3} textAnchor="end" className="rh-chart-axis">{formatValue(tick)}</text>
        </g>
      ))}
      {values.map((_, index) => (index % 5 === 0
        ? <line key={`v-${index}`} x1={x(index)} y1={pad.top} x2={x(index)} y2={height - pad.bottom} className="rh-chart-grid-v" />
        : null))}
      <path d={line(values)} className="rh-chart-line" />
      <path d={line(movingAverage(values, 5))} className="rh-chart-avg" />
      {values.map((_, index) => (
        <circle key={`dot-${index}`} cx={x(index)} cy={height - pad.bottom + 16} r={3.2} className={labels[index] === 'win' ? 'rh-chart-win' : 'rh-chart-loss'} />
      ))}
      <text x={pad.left} y={height - 8} textAnchor="start" className="rh-chart-axis">较早</text>
      <text x={width - pad.right} y={height - 8} textAnchor="end" className="rh-chart-axis">最近</text>
    </svg>
  )
}

export function HistoryTrendPanel({ matches, games, puuid, system, score }: {
  matches: HistoryMatch[]
  games: SgpGameSummaryLol[]
  puuid: string
  system: PlayerScoreSystem
  score: PlayerScore | null
}) {
  const [metric, setMetric] = useState<TrendMetricKey>('score')
  // 雷达固定使用 Sona 八维：其 breakdown 是 0–100 内部分，分布均匀；
  // Akari 九项按满分归一化后大多贴近 0，画成雷达会退化成一条针，因此只用于条形展示。
  const radar = useMemo(() => {
    if (!games.length) return null
    return buildRadarProfile(games, puuid, 'sona')
  }, [games, puuid])
  const series = useMemo(() => buildTrendSeries(matches, metric, system), [matches, metric, system])
  const values = series.points.map((point) => point.value)
  const formatValue = (value: number) => formatTrendValue(value, metric, system)
  const winRate = series.points.length ? Math.round((series.wins / series.points.length) * 100) : null

  if (!matches.length) {
    return <div className="rh-empty">当前筛选下没有可用于图表的对局。可重置筛选或继续加载。<span className="rh-kaomoji" aria-hidden="true">(・ω・)</span></div>
  }

  return (
    <div className="rh-chart" data-testid="history-charts">
      <section className="rh-chart-card">
        <header className="rh-chart-head">
          <h3>个人能力 · Sona 八维</h3>

          <span className="rh-chart-hint">
            {matches.length} 场已加载 · 有效 {radar ? radar.validGames : 0} 场
            {radar && radar.confidence != null ? ` · 置信度 ${radar.confidence.toFixed(2)}` : ''}
          </span>
        </header>
        {radar ? (
          <div className="rh-radar-wrap">
            <HistoryRadar axes={radar.axes} label="Sona 八维能力雷达" />
            <div className="rh-radar-side">
              <div className="rh-radar-rows">
                {radar.axes.map((axis) => (
                  <div className="rh-radar-row" key={axis.key}>
                    <span className="rh-radar-name">{axis.label}</span>
                    <span className="rh-radar-bar"><i style={{ width: `${Math.round(axis.value * 100)}%` }} /></span>
                    <span className="rh-radar-value">{Math.round(axis.value * 100)}</span>
                  </div>
                ))}
              </div>
              <p className="rh-chart-note">
                {playerScoreLabel(system)} {formatPlayerScore(score ? score.score : NaN, system)}
                {score ? ` / ${score.maxScore} 分（左侧评分卡同源）` : ''}。
                雷达为 Sona 八维能力画像（0–100 内部分），与当前评分机制无关。
              </p>
            </div>
          </div>
        ) : <p className="rh-muted">样本不足，暂不生成雷达。</p>}
      </section>

      <section className="rh-chart-card">
        <header className="rh-chart-head">
          <h3>近期趋势</h3>
          <span className="rh-chart-hint">基于当前已加载 {matches.length} 场，随分页增长</span>
        </header>
        <div className="rh-trend-chips" role="group" aria-label="趋势指标">
          {TREND_METRICS.map((item) => (
            <button key={item.key} type="button" aria-pressed={metric === item.key} onClick={() => setMetric(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
        <TrendChart values={values} labels={series.points.map((point) => point.outcome)} formatValue={formatValue} />
        <div className="rh-chart-kpis">
          <div><b>{formatTrendValue(series.average, metric, system)}</b><span>平均</span></div>
          <div><b>{formatTrendValue(series.latest, metric, system)}</b><span>最近一场</span></div>
          <div><b>{winRate == null ? '—' : `${winRate}%`}</b><span>胜率</span></div>
          <div><b>{series.valid} / {series.points.length}</b><span>有效 / 样本</span></div>
        </div>
        <p className="rh-chart-note">
          细线为逐场值，粗线为 5 场移动平均；底部色带为胜负（蓝胜 / 暗红负），空档表示重开或数据缺失。
          评分趋势按当前机制逐场计算{system === 'akari' ? '，不含胜率项（胜负已由色带表达）' : ''}。
        </p>
      </section>
    </div>
  )
}
