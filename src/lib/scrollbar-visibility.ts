import '@/styles/ScrollbarVisibility.css'

const SCOPE = '#sona-root, .sona-modal-overlay, .sobp, .sona-select-dropdown, .rh-asset-tooltip, .sobp-tooltip'
let dispose: (() => void) | null = null

/** One delegated listener; timers exist only for containers that have just scrolled. */
export function initScrollbarVisibility(): () => void {
  if (dispose) return dispose
  const timers = new Map<HTMLElement, number>()
  let held: HTMLElement | null = null
  const hide = (element: HTMLElement) => {
    const timer = timers.get(element)
    if (timer != null) window.clearTimeout(timer)
    timers.delete(element)
    element.removeAttribute('data-sona-scrolling')
  }
  const schedule = (element: HTMLElement) => {
    const timer = timers.get(element)
    if (timer != null) window.clearTimeout(timer)
    timers.set(element, window.setTimeout(() => {
      if (held !== element) hide(element)
    }, 900))
  }
  const onScroll = (event: Event) => {
    const element = event.target
    if (!(element instanceof HTMLElement) || !element.closest(SCOPE)) return
    element.setAttribute('data-sona-scrolling', '')
    schedule(element)
  }
  const onPointerDown = (event: PointerEvent) => {
    const element = event.target
    if (element instanceof HTMLElement && element.hasAttribute('data-sona-scrolling')) held = element
  }
  const release = () => {
    if (held) schedule(held)
    held = null
  }
  const clear = () => {
    held = null
    for (const element of timers.keys()) hide(element)
  }
  const onVisibility = () => { if (document.hidden) clear() }
  document.addEventListener('scroll', onScroll, {capture:true, passive:true})
  document.addEventListener('pointerdown', onPointerDown, {capture:true, passive:true})
  document.addEventListener('pointerup', release, true)
  document.addEventListener('pointercancel', release, true)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('blur', clear)
  dispose = () => {
    clear()
    document.removeEventListener('scroll', onScroll, true)
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('pointerup', release, true)
    document.removeEventListener('pointercancel', release, true)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('blur', clear)
    dispose = null
  }
  return dispose
}
