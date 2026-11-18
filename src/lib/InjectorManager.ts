import { logger } from '@/lib/logger'

type InjectTask = () => boolean
interface InjectOptions { selector?: string }
const OWNED = '#sona-root, .sona-modal-overlay, .rh-asset-tooltip, #sona-opgg-build-panel, [data-sona-owned], #sona-native-comp-diagnostic-host, #sona-aram-bench-assist-tooltip, [data-sona-bench-wish-badge], [data-sona-bench-mate-badge], [data-sona-tier-badge], #sona-champselect-tag-alert, [data-sona-postgame-badge]'

/** Batch native changes; plugin contents do not trigger another pass through native injection tasks. */
export class InjectorManager {
  private tasks = new Map<InjectTask, InjectOptions>()
  private observer: MutationObserver | null = null
  private records: MutationRecord[] = []
  private timer = 0
  private frame = 0
  private lastRun = 0
  private hiddenDirty = false
  private fullScan = false
  private visibility = () => {
    if (document.hidden) {
      this.hiddenDirty ||= Boolean(this.records.length || this.timer || this.frame)
      clearTimeout(this.timer); cancelAnimationFrame(this.frame)
      this.timer = 0; this.frame = 0; this.records = []; this.fullScan = false
    } else if (this.hiddenDirty) {
      this.hiddenDirty = false; this.lastRun = performance.now()
      for (const task of this.tasks.keys()) this.run(task)
    }
  }

  register(task: InjectTask, options: InjectOptions = {}) {
    this.tasks.set(task, options)
    if (document.hidden) this.hiddenDirty = true
    else this.run(task)
  }
  unregister(task: InjectTask) { this.tasks.delete(task) }
  private run(task: InjectTask) {
    try { task() } catch (error) { logger.error('[Injector] Task failed:', error) }
  }
  private relevant(record: MutationRecord, selector: string) {
    const parent = record.target instanceof Element ? record.target : record.target.parentElement
    if (parent?.closest(selector)) return true
    return [...record.addedNodes, ...record.removedNodes].some((node) => node instanceof Element && (node.matches(selector) || Boolean(node.querySelector(selector))))
  }
  start() {
    if (this.observer) return
    this.observer = new MutationObserver((records) => {
      // Hidden renderers may suspend rAF for minutes: never retain their mutation nodes.
      if (document.hidden) { this.hiddenDirty = true; return }
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement
        if (target?.closest(OWNED)) continue
        const changed = [...record.addedNodes, ...record.removedNodes]
        if (changed.length && changed.every((node) => node instanceof Element && node.id !== 'sona-root' && node.matches(OWNED))) continue
        if (!this.fullScan) this.records.push(record)
        if (this.records.length > 256) { this.records = []; this.fullScan = true }
      }
      if ((!this.records.length && !this.fullScan) || this.timer || this.frame) return
      this.timer = window.setTimeout(() => {
        this.timer = 0
        this.frame = requestAnimationFrame(() => {
          this.frame = 0; this.lastRun = performance.now()
          const pending = this.records; this.records = []
          const fullScan = this.fullScan; this.fullScan = false
          for (const [task, options] of this.tasks) {
            if (fullScan || !options.selector || pending.some((record) => this.relevant(record, options.selector!))) this.run(task)
          }
        })
      }, Math.max(0, 100 - (performance.now() - this.lastRun)))
    })
    this.observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('visibilitychange', this.visibility)
  }
  stop() {
    this.observer?.disconnect(); this.observer = null
    document.removeEventListener('visibilitychange', this.visibility)
    clearTimeout(this.timer); cancelAnimationFrame(this.frame)
    this.timer = 0; this.frame = 0; this.records = []
    this.hiddenDirty = false; this.fullScan = false
  }
}
export const injector = new InjectorManager()
