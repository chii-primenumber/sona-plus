import { useEffect, useId, useMemo, useState } from 'react'
import { fetchMatchTimeline } from '@/lib/history-api'
import { formatGoldDiff, formatTimelineClock, parseMatchTimeline, type ParsedMatchTimeline, type TimelineMilestone } from '@/lib/match-timeline'
import type { SgpGameSummaryLol } from '@/types/sgp'

const SVG_WIDTH = 640
const SVG_HEIGHT = 132
const PAD_LEFT = 44
const PAD_RIGHT = 12
const PAD_TOP = 12
const PAD_BOTTOM = 20

function milestoneAccent(milestone: TimelineMilestone): { glyph: string; color: string } {
  switch (milestone.kind) {
    case 'first-blood':
      return { glyph: '✦', color: '#ff5c6c' }
    case 'first-tower':
      return { glyph: '♜', color: '#f0d79a' }
    case 'grubs':
      return { glyph: '❖', color: '#c084fc' }
    case 'herald':
      return { glyph: '◈', color: '#a855f7' }
    case 'atakhan':
      return { glyph: '✿', color: '#f43f5e' }
    case 'baron':
      return { glyph: '♛', color: '#d8b4fe' }
    case 'dragon': {
      const label = milestone.shortLabel
      if (label.includes('火')) return { glyph: '▲', color: '#ff7849' }
      if (label.includes('水')) return { glyph: '▲', color: '#38bdf8' }
      if (label.includes('风')) return { glyph: '▲', color: '#67e8f9' }
      if (label.includes('土')) return { glyph: '▲', color: '#d4a373' }
      if (label.includes('海')) return { glyph: '▲', color: '#60a5fa' }
      if (label.includes('炼金')) return { glyph: '▲', color: '#a3e635' }
      if (label.includes('远古')) return { glyph: '★', color: '#fbbf24' }
      return { glyph: '▲', color: '#c8aa6e' }
    }
  }
}

function buildCurveGeometry(timeline: ParsedMatchTimeline) {
  const { points, maxAbsDiff } = timeline
  const plotWidth = SVG_WIDTH - PAD_LEFT - PAD_RIGHT
  const plotHeight = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM
  const midY = PAD_TOP + plotHeight / 2
  const halfH = plotHeight / 2
  const maxMinute = Math.max(1, points[points.length - 1]?.minute ?? 1)
  const scaleY = (diff: number) => midY - (Math.max(-maxAbsDiff, Math.min(maxAbsDiff, diff)) / maxAbsDiff) * halfH
  const scaleX = (minute: number) => PAD_LEFT + (minute / maxMinute) * plotWidth

  const coords = points.map((point) => ({
    ...point,
    x: scaleX(point.minute),
    y: scaleY(point.diff),
  }))

  const linePath = coords.map((p, index) => `${index === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${midY.toFixed(1)} L${coords[0].x.toFixed(1)},${midY.toFixed(1)} Z`

  const ticks: number[] = []
  const step = maxMinute <= 15 ? 3 : maxMinute <= 30 ? 5 : 10
  for (let m = 0; m <= maxMinute; m += step) ticks.push(m)
  if (ticks[ticks.length - 1] !== maxMinute && maxMinute - ticks[ticks.length - 1] >= Math.max(2, step / 2)) {
    ticks.push(maxMinute)
  }

  const milestonesByMinute = new Map<number, TimelineMilestone[]>()
  for (const milestone of timeline.milestones) {
    for (let dm = -1; dm <= 1; dm++) {
      const m = milestone.minute + dm
      const bucket = milestonesByMinute.get(m)
      if (bucket) bucket.push(milestone)
      else milestonesByMinute.set(m, [milestone])
    }
  }

  return { coords, linePath, areaPath, midY, halfH, plotWidth, plotHeight, maxMinute, scaleX, ticks, milestonesByMinute }
}

export function HistoryTimelinePanel({ game }: { game: SgpGameSummaryLol }) {
  const gameId = game.json.gameId
  const clipUid = useId().replace(/:/g, '')
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [timeline, setTimeline] = useState<ParsedMatchTimeline | null>(null)
  const [errorText, setErrorText] = useState('')
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!gameId || gameId <= 0) {
      setTimeline(null)
      setStatus('empty')
      return
    }
    const controller = new AbortController()
    setStatus('loading')
    setErrorText('')
    setHoverIndex(null)

    fetchMatchTimeline(gameId, controller.signal)
      .then((raw) => {
        if (controller.signal.aborted) return
        const parsed = parseMatchTimeline(raw, game)
        if (!parsed) {
          setTimeline(null)
          setStatus('empty')
          return
        }
        setTimeline(parsed)
        setStatus('ready')
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setTimeline(null)
        setErrorText(error instanceof Error ? error.message : '加载失败')
        setStatus('error')
      })

    return () => controller.abort()
  }, [gameId, game])

  const geometry = useMemo(() => (timeline ? buildCurveGeometry(timeline) : null), [timeline])

  if (status === 'loading') {
    return <div className="rh-timeline" data-testid="match-timeline-panel"><div className="rh-timeline-state">加载曲线…</div></div>
  }
  if (status === 'error' || status === 'empty' || !timeline || !geometry) {
    return (
      <div className="rh-timeline" data-testid="match-timeline-panel">
        <div
          className="rh-timeline-state rh-timeline-state--muted"
          data-sona-tooltip={errorText ? `跨区或较早对局可能无时间线 · ${errorText}` : '跨区或较早对局可能无时间线'}
        >
          暂无时间线
        </div>
      </div>
    )
  }

  const activePoint = hoverIndex != null ? geometry.coords[hoverIndex] : geometry.coords[geometry.coords.length - 1]
  const nearbyEvents = hoverIndex != null && activePoint ? (geometry.milestonesByMinute.get(activePoint.minute) ?? []) : []

  const blueClipId = `rh-tl-blue-${clipUid}`
  const redClipId = `rh-tl-red-${clipUid}`

  return (
    <div className="rh-timeline" data-testid="match-timeline-panel">
      <div className="rh-timeline-head">
        <div className="rh-timeline-summary">
          {timeline.maxBlueLead && (
            <span
              className="rh-timeline-stat rh-timeline-stat--blue"
              data-sona-tooltip={`蓝色方最高经济领先 ${formatGoldDiff(timeline.maxBlueLead.diff)}（第 ${timeline.maxBlueLead.minute} 分）`}
            >
              <i className="rh-tl-dot rh-tl-dot--blue" aria-hidden="true" />
              <b>+{formatGoldDiff(timeline.maxBlueLead.diff).replace(/^\+/, '')}</b>
              <small>{timeline.maxBlueLead.minute}m</small>
            </span>
          )}
          {timeline.maxRedLead && (
            <span
              className="rh-timeline-stat rh-timeline-stat--red"
              data-sona-tooltip={`红色方最高经济领先 ${formatGoldDiff(timeline.maxRedLead.diff)}（第 ${timeline.maxRedLead.minute} 分）`}
            >
              <i className="rh-tl-dot rh-tl-dot--red" aria-hidden="true" />
              <b>+{formatGoldDiff(timeline.maxRedLead.diff).replace(/^\+/, '')}</b>
              <small>{timeline.maxRedLead.minute}m</small>
            </span>
          )}
          {timeline.comeback && (
            <span
              className="rh-timeline-comeback"
              data-sona-tooltip={`${timeline.comeback.teamId === 100 ? '蓝色方' : '红色方'}曾落后 ${formatGoldDiff(timeline.comeback.maxDeficit).replace(/^\+/, '')} 后逆转获胜`}
            >
              ↺ 翻盘 <b>-{formatGoldDiff(timeline.comeback.maxDeficit).replace(/^\+/, '')}</b>
            </span>
          )}
        </div>
        {activePoint && (
          <div className="rh-timeline-readout" data-testid="timeline-readout">
            <span className="rh-tl-min">{activePoint.minute}m</span>
            <b className={activePoint.diff > 0 ? 'is-blue' : activePoint.diff < 0 ? 'is-red' : ''}>
              {activePoint.diff === 0 ? '持平' : `${activePoint.diff > 0 ? '蓝' : '红'} +${formatGoldDiff(Math.abs(activePoint.diff)).replace(/^\+/, '')}`}
            </b>
            <span className="rh-tl-pair">
              <em className="is-blue">{(activePoint.blueGold / 1000).toFixed(1)}k</em>
              <i>/</i>
              <em className="is-red">{(activePoint.redGold / 1000).toFixed(1)}k</em>
            </span>
            {nearbyEvents.length > 0 && (
              <span className="rh-timeline-readout-events">
                {nearbyEvents.map((m) => `${formatTimelineClock(m.timestampMs)} ${m.shortLabel}`).join(' · ')}
              </span>
            )}
          </div>
        )}
      </div>

      <svg
        className="rh-timeline-svg"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        role="img"
        aria-label="对局经济差曲线图"
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          if (rect.width <= 0 || geometry.coords.length === 0) return
          const svgX = ((event.clientX - rect.left) / rect.width) * SVG_WIDTH
          const ratio = Math.max(0, Math.min(1, (svgX - PAD_LEFT) / geometry.plotWidth))
          const nearest = Math.round(ratio * (geometry.coords.length - 1))
          setHoverIndex((prev) => (prev === nearest ? prev : nearest))
        }}
      >
        <defs>
          <clipPath id={blueClipId}>
            <rect x={PAD_LEFT} y={PAD_TOP} width={geometry.plotWidth} height={geometry.halfH} />
          </clipPath>
          <clipPath id={redClipId}>
            <rect x={PAD_LEFT} y={geometry.midY} width={geometry.plotWidth} height={geometry.halfH} />
          </clipPath>
        </defs>

        <line x1={PAD_LEFT} y1={PAD_TOP} x2={SVG_WIDTH - PAD_RIGHT} y2={PAD_TOP} className="rh-timeline-grid" />
        <line x1={PAD_LEFT} y1={SVG_HEIGHT - PAD_BOTTOM} x2={SVG_WIDTH - PAD_RIGHT} y2={SVG_HEIGHT - PAD_BOTTOM} className="rh-timeline-grid" />
        <line x1={PAD_LEFT} y1={geometry.midY} x2={SVG_WIDTH - PAD_RIGHT} y2={geometry.midY} className="rh-timeline-zero" />

        <text x={PAD_LEFT - 6} y={PAD_TOP + 4} textAnchor="end" className="rh-timeline-axis rh-timeline-axis--blue">
          +{formatGoldDiff(timeline.maxAbsDiff).replace(/^\+/, '')}
        </text>
        <text x={PAD_LEFT - 6} y={geometry.midY + 3} textAnchor="end" className="rh-timeline-axis">0</text>
        <text x={PAD_LEFT - 6} y={SVG_HEIGHT - PAD_BOTTOM + 2} textAnchor="end" className="rh-timeline-axis rh-timeline-axis--red">
          +{formatGoldDiff(timeline.maxAbsDiff).replace(/^\+/, '')}
        </text>

        {geometry.ticks.map((minute) => (
          <text key={minute} x={geometry.scaleX(minute)} y={SVG_HEIGHT - 4} textAnchor="middle" className="rh-timeline-axis">
            {minute}m
          </text>
        ))}

        <path d={geometry.areaPath} clipPath={`url(#${blueClipId})`} className="rh-timeline-area-blue" />
        <path d={geometry.areaPath} clipPath={`url(#${redClipId})`} className="rh-timeline-area-red" />
        <path d={geometry.linePath} className="rh-timeline-line" />

        {timeline.milestones.map((milestone) => {
          const cx = geometry.scaleX(Math.min(geometry.maxMinute, milestone.timestampMs / 60_000))
          const accent = milestoneAccent(milestone)
          return (
            <circle
              key={milestone.id}
              cx={cx}
              cy={geometry.midY}
              r={milestone.kind === 'baron' || milestone.kind === 'atakhan' ? 3.8 : 2.8}
              fill={accent.color}
              stroke={milestone.teamId === 100 ? '#00c7d9' : '#ff4655'}
              strokeWidth="1.2"
            />
          )
        })}

        {hoverIndex != null && activePoint && (
          <g className="rh-timeline-hover">
            <line x1={activePoint.x} y1={PAD_TOP} x2={activePoint.x} y2={SVG_HEIGHT - PAD_BOTTOM} className="rh-timeline-cursor" />
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="3.8"
              fill={activePoint.diff >= 0 ? '#00c7d9' : '#ff4655'}
              stroke="#f0e6d2"
              strokeWidth="1.4"
            />
          </g>
        )}
      </svg>

      {timeline.milestones.length > 0 && (
        <div className="rh-timeline-milestones" data-testid="timeline-milestones">
          {timeline.milestones.map((milestone) => {
            const accent = milestoneAccent(milestone)
            return (
              <span
                key={milestone.id}
                className={`rh-timeline-chip rh-timeline-chip--${milestone.teamId === 100 ? 'blue' : 'red'}${milestone.kind === 'baron' || milestone.kind === 'atakhan' ? ' is-major' : ''}`}
                data-sona-tooltip={`${formatTimelineClock(milestone.timestampMs)} · ${milestone.teamId === 100 ? '蓝色方' : '红色方'} ${milestone.label}`}
              >
                <i className="rh-timeline-glyph" style={{ color: accent.color }} aria-hidden="true">{accent.glyph}</i>
                <time>{formatTimelineClock(milestone.timestampMs)}</time>
                <b>{milestone.shortLabel}</b>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
