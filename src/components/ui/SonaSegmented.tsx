import type { CSSProperties } from 'react'
import '@/styles/SonaSegmented.css'

/** Compact theme-aware discrete choices, with no layout measurements or animation timers. */
export function SonaSegmented<T extends string | number>({ value, options, onChange, label, className = '', thumbClassName = '' }: {
  value: T; options: ReadonlyArray<{ value: T; label: string; ariaLabel?: string }>; onChange: (value: T) => void
  label: string; className?: string; thumbClassName?: string
}) {
  const index = Math.max(0, options.findIndex((option) => option.value === value))
  return <div className={`sona-segmented ${className}`} role="group" aria-label={label}
    style={{ '--sona-segment-count': Math.max(1, options.length) } as CSSProperties}>
    <span className={`sona-segmented-thumb ${thumbClassName}`} aria-hidden="true" style={{ transform: `translateX(${index * 100}%)` }} />
    {options.map((option, index) => <button key={option.value} type="button" aria-label={option.ariaLabel}
      aria-pressed={value === option.value} onClick={() => onChange(option.value)} onKeyDown={(event) => {
        const count = options.length
        const next = event.key === 'ArrowRight' ? (index + 1) % count : event.key === 'ArrowLeft' ? (index + count - 1) % count : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : -1
        if (next < 0) return
        event.preventDefault(); onChange(options[next].value)
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
      }}>{option.label}</button>)}
  </div>
}
