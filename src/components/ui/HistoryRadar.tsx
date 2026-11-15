import type { RadarAxis } from '@/lib/chart-radar'

const SIZE = { width: 320, height: 300, cx: 160, cy: 152, radius: 104 }
const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
function point(index: number, count: number, radius: number) {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / Math.max(1, count)
  return { x: SIZE.cx + Math.cos(angle) * radius, y: SIZE.cy + Math.sin(angle) * radius }
}
function polygon(axes: RadarAxis[], radius: number, weighted = false) {
  return axes.map((axis, index) => {
    const p = point(index, axes.length, radius * (weighted ? clamp(axis.value) : 1))
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }).join(' ')
}
/** Shared geometry for personal and comparison radars; both use the same Sona axes. */
export function HistoryRadar({ axes, secondary, label }: { axes: RadarAxis[]; secondary?: RadarAxis[]; label: string }) {
  return <svg className="rh-radar" viewBox={`0 0 ${SIZE.width} ${SIZE.height}`} role="img" aria-label={label}>
    {[1,2,3,4].map((ring) => <polygon key={ring} points={polygon(axes, SIZE.radius * ring / 4)} className="rh-radar-ring" />)}
    {axes.map((axis, index) => { const p = point(index, axes.length, SIZE.radius); return <line key={axis.key} x1={SIZE.cx} y1={SIZE.cy} x2={p.x} y2={p.y} className="rh-radar-spoke" /> })}
    {secondary && <polygon points={polygon(axes.map((axis) => secondary.find((item) => item.key === axis.key) ?? {...axis,value:0}), SIZE.radius, true)} className="rh-radar-shape-b" />}
    <polygon points={polygon(axes, SIZE.radius, true)} className="rh-radar-shape" />
    {axes.map((axis,index) => { const p=point(index,axes.length,SIZE.radius*clamp(axis.value)); return <circle key={axis.key+'-dot'} cx={p.x} cy={p.y} r={2.2} className="rh-radar-dot" /> })}
    {axes.map((axis,index) => {
      const p=point(index,axes.length,SIZE.radius+18)
      return <text key={axis.key} x={p.x} y={p.y+(p.y<SIZE.cy-20?-2:p.y>SIZE.cy+20?9:3)} textAnchor={Math.abs(p.x-SIZE.cx)<10?'middle':p.x>SIZE.cx?'start':'end'} className="rh-radar-label">{axis.label}</text>
    })}
  </svg>
}
