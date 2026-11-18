import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TooltipBubble } from '@/components/ui/HistoryAssetTooltip'

const PLUGIN_SURFACES = '#sona-root, .sona-modal-overlay, .sobp, .sona-entry-btn, .sona-profile-history-entry, [data-sona-team-history], [data-sona-opgg-preselect-build], [data-sona-opgg-ingame-build]'
let initialized = false
let tooltipRoot: Root | undefined
let active: HTMLElement | undefined
let activeText = ''

export function initSonaTooltips() {
  if (initialized) return
  initialized = true
  const dismissed = new WeakSet<HTMLElement>()
  const removalObserver = new MutationObserver(() => { if (active && !active.isConnected) hide() })
  function hide() {
    if (!active) return
    active = undefined
    activeText = ''
    removalObserver.disconnect()
    tooltipRoot?.render(null)
  }
  function show(event: Event) {
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[title], [data-sona-tooltip]') : null
    if (!(element instanceof HTMLElement) || !element.closest(PLUGIN_SURFACES)) { hide(); return }
    const text = element.getAttribute('title') || element.dataset.sonaTooltip
    if (!text) { hide(); return }
    if (event instanceof MouseEvent && event.type === 'mouseover' && !(event.relatedTarget instanceof Node && element.contains(event.relatedTarget))) dismissed.delete(element)
    if (dismissed.has(element)) { hide(); return }
    if (active === element && activeText === text) return
    if (element.hasAttribute('title')) {
      element.dataset.sonaTooltip = text
      element.removeAttribute('title')
      if (!element.hasAttribute('aria-description')) element.setAttribute('aria-description', text)
    }
    active = element
    activeText = text
    removalObserver.observe(document.body, { childList: true, subtree: true })
    if (!tooltipRoot) {
      const host = document.createElement('div')
      host.dataset.sonaOwned = 'true'
      document.body.append(host)
      tooltipRoot = createRoot(host)
    }
    const [title, ...lines] = text.split('\n')
    tooltipRoot.render(createElement(TooltipBubble, {
      anchor: element, title, description: lines.join('\n'), compact: !lines.length,
    }))
  }
  function leave(event: MouseEvent | FocusEvent) {
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[title], [data-sona-tooltip]') : null
    if (element && !(event.relatedTarget instanceof Node && element.contains(event.relatedTarget))) dismissed.delete(element)
    if (active && !(event.relatedTarget instanceof Node && active.contains(event.relatedTarget))) hide()
  }
  function activate(event: Event) {
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[title], [data-sona-tooltip]') : null
    if (element?.closest(PLUGIN_SURFACES)) { dismissed.add(element); hide() }
  }
  function key(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') activate(event)
    else if (event.key === 'Escape') { if (active) dismissed.add(active); hide() }
  }
  document.addEventListener('mouseover', show, true)
  document.addEventListener('focusin', show, true)
  document.addEventListener('mouseout', leave, true)
  document.addEventListener('focusout', leave, true)
  document.addEventListener('pointerdown', activate, true)
  document.addEventListener('click', activate, true)
  document.addEventListener('keydown', key, true)
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide() })
  window.addEventListener('blur', hide)
}
