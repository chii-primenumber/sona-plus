import { getCurrentSummonerIdentity } from '@/lib/assets'
import { styleClientEntry } from '@/lib/client-entry-button'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MatchHistoryModal as PlayerHistoryModal, preloadMatchHistoryModal } from '@/components/ui/MatchHistoryModal'
import { registerEmberRule } from '@/lib/ember-hook'
import { deadline } from '@/lib/history-api'
import { injector } from '@/lib/InjectorManager'
import { lcu } from '@/lib/lcu'
import { store } from '@/lib/store'
import { installFriendHistoryMenu } from './friend-history-menu'

const label = '详细战绩'
const profileIcon = 'lol-regalia-profile-v2-element'
const profileScreen = '.rcp-fe-lol-profiles-main, .rcp-fe-lol-profiles-modal'
const postgameActions = '.scoreboard-row-actions-button, .strawberry-scoreboard-row-actions-button, .jade-scoreboard-row-actions-button'

type Identity = { puuid?: string; summonerId?: number; name?: string; ownProfile?: boolean }
type Component = { element?: Element; get(key: string): unknown; set(key: string, value: unknown): void; _super(...args: unknown[]): unknown }
type MenuItem = { label: string; target: Component; action: (() => void) | string; icon?: Element }
type MenuManager = { setMenuItems(items: MenuItem[]): void; openAtEvent(event: MouseEvent): void }

let historyRoot: Root | undefined
let profileEntry: HTMLButtonElement | undefined
let summaryEntryHost: HTMLElement | undefined
let cachedProfileIdentity: Identity | undefined
let latestRequest = 0
let profileHistoryRegistered = false
let profileHistorySettingsBound = false
let ownIdentityCache: Identity | undefined
let inFlightOwn: Promise<Identity | undefined> | null = null
const summonerIdCache = new Map<number, Identity>()
const inFlightById = new Map<number, Promise<Identity | undefined>>()
const summaryIdentities = new WeakMap<Element, Identity>()
const rowListeners = new WeakMap<Component, (event: Event) => void>()

function rememberResolvedIdentity(identity: Identity) {
  if (!identity.puuid) return
  if (identity.summonerId && identity.summonerId > 0) {
    summonerIdCache.delete(identity.summonerId)
    summonerIdCache.set(identity.summonerId, {
      puuid: identity.puuid,
      summonerId: identity.summonerId,
      name: identity.name,
    })
    while (summonerIdCache.size > 64) {
      const oldest = summonerIdCache.keys().next().value
      if (oldest === undefined) break
      summonerIdCache.delete(oldest)
    }
  }
  if (identity.ownProfile) {
    ownIdentityCache = { ...identity, ownProfile: true }
  }
}

function playerIdentity(value: unknown): Identity | undefined {
  if (!value || typeof value !== 'object') return
  const player = value as Record<string, unknown>
  if (player.botPlayer === true) return
  const puuid = typeof player.puuid === 'string' ? player.puuid.trim() : ''
  const summonerId = Number(player.summonerId)
  if (!puuid && !(summonerId > 0)) return
  const name = player.riotIdGameName || player.gameName || player.summonerName || player.name || player.displayName
  const tag = player.riotIdTagLine || player.riotIdTagline || player.tagLine || player.gameTag
  return {
    puuid,
    summonerId,
    name: typeof name === 'string' ? (typeof tag === 'string' && tag && !name.includes('#') ? `${name}#${tag}` : name) : undefined,
  }
}

function resolveIdentitySync(identity: Identity): Identity | undefined {
  if (identity.puuid) {
    const byId = identity.summonerId && identity.summonerId > 0 ? summonerIdCache.get(identity.summonerId) : undefined
    const name = identity.name || byId?.name || (identity.ownProfile ? ownIdentityCache?.name : undefined)
    return name ? { ...identity, name } : identity
  }

  const assetOwn = getCurrentSummonerIdentity()
  if (assetOwn.puuid && (!ownIdentityCache || ownIdentityCache.puuid !== assetOwn.puuid)) {
    rememberResolvedIdentity({
      puuid: assetOwn.puuid,
      summonerId: assetOwn.summonerId || undefined,
      name: assetOwn.name || undefined,
      ownProfile: true,
    })
  }

  if (identity.ownProfile && ownIdentityCache?.puuid) {
    return { ...ownIdentityCache, name: identity.name || ownIdentityCache.name }
  }

  if (identity.summonerId && identity.summonerId > 0) {
    const cached = summonerIdCache.get(identity.summonerId)
    if (cached?.puuid) {
      return { ...cached, name: identity.name || cached.name }
    }
  }

  return undefined
}

function warmIdentity(identity: Identity): Promise<Identity | undefined> {
  const sync = resolveIdentitySync(identity)
  if (sync?.puuid) return Promise.resolve(sync)

  if (identity.ownProfile) {
    if (!inFlightOwn) {
      inFlightOwn = deadline(() => lcu.getSummonerInfo(), undefined, 7000)
        .then((profile) => {
          const resolved = playerIdentity(profile)
          if (resolved?.puuid) rememberResolvedIdentity({ ...resolved, ownProfile: true })
          return resolved
        })
        .finally(() => { inFlightOwn = null })
    }
    return inFlightOwn
  }

  const summonerId = Number(identity.summonerId)
  if (!(summonerId > 0)) return Promise.resolve(undefined)

  let pending = inFlightById.get(summonerId)
  if (!pending) {
    pending = deadline(() => lcu.getSummonerById(summonerId), undefined, 7000)
      .then((profile) => {
        const resolved = playerIdentity(profile)
        if (resolved?.puuid) rememberResolvedIdentity({ ...resolved, summonerId })
        return resolved
      })
      .finally(() => { inFlightById.delete(summonerId) })
    inFlightById.set(summonerId, pending)
  }
  return pending
}

function ensureHistoryRoot(): Root {
  if (!historyRoot) {
    const container = document.createElement('div')
    container.dataset.sonaOwned = 'true'
    document.body.append(container)
    historyRoot = createRoot(container)
  }
  return historyRoot
}

function renderHistoryModal(open: boolean, puuid: string, name: string) {
  const root = ensureHistoryRoot()
  const close = () => {
    latestRequest++
    root.render(createElement(PlayerHistoryModal, { open: false, onClose: close, puuid, playerName: name }))
  }
  root.render(createElement(PlayerHistoryModal, { open, onClose: close, puuid, playerName: name }))
}

async function openHistory(identity: Identity) {
  const request = ++latestRequest
  void preloadMatchHistoryModal()

  const sync = resolveIdentitySync(identity)
  if (sync?.puuid) {
    renderHistoryModal(true, sync.puuid, sync.name || identity.name || '玩家战绩')
    return
  }

  // Open the modal shell immediately on frame 0 so slow LCU summoner lookups never feel unresponsive
  renderHistoryModal(true, '', identity.name || '详细战绩')

  try {
    const resolved = await warmIdentity(identity)
    if (request !== latestRequest) return
    if (!resolved?.puuid) {
      renderHistoryModal(false, '', '')
      if (typeof Toast !== 'undefined') Toast.error('暂时无法查询这位召唤师的战绩')
      return
    }
    renderHistoryModal(true, resolved.puuid, resolved.name || identity.name || '玩家战绩')
  } catch {
    if (request === latestRequest) {
      renderHistoryModal(false, '', '')
      if (typeof Toast !== 'undefined') Toast.error('暂时无法查询这位召唤师的战绩')
    }
  }
}

function menuItem(identity: Identity, target: Component): MenuItem {
  // The client's context menu dispatches actions only when the item has a target.
  return { label, target, action: () => void openHistory(identity) }
}

function visible(element: Element) {
  return element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible'
}

function readIconIdentity(icon: Element, screen: Element): Identity | undefined {
  const anyIcon = icon as unknown as { puuid?: unknown; summonerId?: unknown }
  const rawPuuid =
    icon.getAttribute('puuid')
    || icon.getAttribute('data-puuid')
    || (typeof anyIcon.puuid === 'string' ? anyIcon.puuid : '')
    || icon.shadowRoot?.querySelector('[puuid]')?.getAttribute('puuid')
    || ''
  const rawSummonerId =
    icon.getAttribute('summoner-id')
    || icon.getAttribute('data-summoner-id')
    || (typeof anyIcon.summonerId === 'number' || typeof anyIcon.summonerId === 'string' ? anyIcon.summonerId : undefined)

  const parsed = playerIdentity({ puuid: rawPuuid, summonerId: rawSummonerId })
  if (parsed) return parsed

  if (icon.getAttribute('member-type') === 'current-player' || screen.classList.contains('rcp-fe-lol-profiles-main')) {
    return { ownProfile: true }
  }
  return undefined
}

function profileIdentity(screen: Element): Identity | undefined {
  const summary = screen.querySelector('.match-summary-profile-main, .match-summary-profile-overlay')
  if (summary && visible(summary)) {
    const identity = summaryIdentities.get(summary)
    if (identity) return identity
  }
  const icon = Array.from(screen.querySelectorAll(profileIcon)).find(visible)
  if (!icon) return
  return readIconIdentity(icon, screen)
}

function activeProfileScreen() {
  const screens = Array.from(document.querySelectorAll(profileScreen)).filter(visible).reverse()
  return screens.find((screen) => screen.classList.contains('rcp-fe-lol-profiles-modal')) ?? screens[0]
}

function injectProfileButton() {
  const screen = activeProfileScreen()
  if (!screen) {
    cachedProfileIdentity = undefined
    profileEntry?.remove()
    summaryEntryHost?.remove()
    return true
  }
  const navigation = screen.querySelector('.style-profile-sub-nav')
  const metadata = screen.querySelector('.match-details-layer-header .match-layer-header-info-list')
  const summaryVisible = !!metadata && visible(metadata)
  const host = summaryVisible ? metadata : navigation?.parentElement
  let navigationUncovered = false
  if (navigation && visible(navigation)) {
    const rect = navigation.getBoundingClientRect()
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    navigationUncovered = !!top && navigation.contains(top)
  }
  const current = host && (summaryVisible || navigationUncovered) ? profileIdentity(screen) : undefined
  if (!host || !current) {
    cachedProfileIdentity = undefined
    profileEntry?.remove()
    summaryEntryHost?.remove()
    return true
  }

  cachedProfileIdentity = current
  void preloadMatchHistoryModal()
  ensureHistoryRoot()
  if (!resolveIdentitySync(current)?.puuid) {
    void warmIdentity(current).catch(() => {})
  }

  if (!profileEntry) {
    profileEntry = document.createElement('button')
    profileEntry.type = 'button'
    profileEntry.className = 'sona-profile-history-entry'
    profileEntry.dataset.sonaOwned = 'true'
    styleClientEntry(profileEntry, label, 'history')
    profileEntry.addEventListener('pointerenter', () => {
      void preloadMatchHistoryModal()
      if (cachedProfileIdentity && !resolveIdentitySync(cachedProfileIdentity)?.puuid) {
        void warmIdentity(cachedProfileIdentity).catch(() => {})
      }
    })
    profileEntry.addEventListener('click', (event) => {
      event.stopPropagation()
      const active = activeProfileScreen()
      const latest = (active && profileIdentity(active)) || cachedProfileIdentity
      if (latest) void openHistory(latest)
    })
  }
  profileEntry.classList.toggle('sona-profile-history-entry-inline', summaryVisible)
  if (summaryVisible) {
    if (!summaryEntryHost || summaryEntryHost.parentElement !== host) {
      summaryEntryHost?.remove()
      summaryEntryHost = document.createElement(host.matches('ul,ol') ? 'li' : 'span')
      summaryEntryHost.className = 'match-layer-header-info-item'
      summaryEntryHost.dataset.sonaOwned = 'true'
      host.append(summaryEntryHost)
    }
    if (profileEntry.parentElement !== summaryEntryHost) summaryEntryHost.append(profileEntry)
  } else {
    summaryEntryHost?.remove()
    summaryEntryHost = undefined
    if (profileEntry.parentElement !== host) host.append(profileEntry)
  }
  return true
}

export function enableNativeProfileHistory() {
  const update = (enabled: boolean) => {
    if (enabled && !profileHistoryRegistered) { profileHistoryRegistered=true; injector.register(injectProfileButton) }
    else if (!enabled) {
      if (profileHistoryRegistered) injector.unregister(injectProfileButton)
      profileHistoryRegistered=false
      cachedProfileIdentity=undefined
      profileEntry?.remove(); profileEntry=undefined
      summaryEntryHost?.remove(); summaryEntryHost=undefined
    }
  }
  update(store.get('profileHistoryEntry'))
  if (!profileHistorySettingsBound) {
    profileHistorySettingsBound = true
    store.onChange('profileHistoryEntry', update)
    lcu.observe('/lol-summoner/v1/current-summoner', (msg) => {
      const resolved = playerIdentity(msg?.data)
      if (resolved?.puuid) rememberResolvedIdentity({ ...resolved, ownProfile: true })
    })
  }
}

export function registerNativeHistoryHooks(context: PenguContext) {
  context.rcp.postInit('rcp-fe-lol-uikit', (value) => {
    installFriendHistoryMenu(value,playerIdentity,(identity)=>{void openHistory(identity)},label)
  }, true)

  context.rcp.postInit('rcp-fe-lol-match-history', (value) => {
    const api = value as { displayMatchSummary?(...args: unknown[]): unknown } | undefined
    const display = api?.displayMatchSummary
    if (!api || typeof display !== 'function') return
    api.displayMatchSummary = function (options: unknown, ...rest: unknown[]) {
      const target = options as { rootElement?: unknown } | undefined
      const root = target?.rootElement
      if (root instanceof Element) {
        const identity = playerIdentity(options)
        if (identity) {
          summaryIdentities.set(root, identity)
          if (!resolveIdentitySync(identity)?.puuid) void warmIdentity(identity).catch(() => {})
        } else if (root.classList.contains('match-summary-profile-main')) {
          const own: Identity = { ownProfile: true }
          summaryIdentities.set(root, own)
          if (!resolveIdentitySync(own)?.puuid) void warmIdentity(own).catch(() => {})
        } else {
          summaryIdentities.delete(root)
        }
      }
      return display.call(this, options, ...rest)
    }
  }, true)

  registerEmberRule({
    name: 'history-scoreboard-player-menu',
    matcher: 'player-history-object',
    wraps: [{
      name: 'getMenuItemModel',
      replacement(original, args) {
        const items = original(...args)
        const component = this as Component
        const identity = playerIdentity(component.get('participant.player'))
        return identity && Array.isArray(items) ? [...items, menuItem(identity, component)] : items
      },
    }],
  })

  registerEmberRule({
    name: 'postgame-player-history-item',
    matcher: 'scoreboard-row-actions-menu-component',
    mixin: () => ({
      didRender(this: Component, ...args: unknown[]) {
        this._super(...args)
        const container = this.element?.querySelector('.player-actions-menu-container')
        const previous = container?.querySelector('.sona-postgame-history-entry')
        if (!container || previous || !playerIdentity(this.get('data'))) return
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'player-action-container sona-postgame-history-entry'
        button.textContent = label
        button.addEventListener('click', () => {
          const identity = playerIdentity(this.get('data'))
          if (identity) void openHistory(identity)
        })
        container.append(button)
      },
    }),
  })

  for (const matcher of ['scoreboard-row-component', 'strawberry-scoreboard-row-component']) {
    registerEmberRule({
      name: `postgame-history-context-${matcher}`,
      matcher,
      mixin: () => ({
        didInsertElement(this: Component, ...args: unknown[]) {
          this._super(...args)
          const listener = (event: Event) => {
            const identity = playerIdentity(this.get('player'))
            if (!identity || !(event instanceof MouseEvent)) return
            if (event.composedPath().some((node) => node instanceof Element && node.matches('.player-actions-menu-container, lc-flyout'))) return
            const trigger = this.element?.querySelector<HTMLElement>(postgameActions)
            const menu = this.get('ContextMenuManager') as MenuManager | undefined
            if (!trigger && !menu?.openAtEvent) return
            event.preventDefault()
            event.stopPropagation()
            if (trigger) trigger.click()
            else {
              menu!.setMenuItems([menuItem(identity, this)])
              menu!.openAtEvent(event)
            }
          }
          rowListeners.set(this, listener)
          this.element?.addEventListener('contextmenu', listener)
        },
        willDestroyElement(this: Component, ...args: unknown[]) {
          const listener = rowListeners.get(this)
          if (listener) this.element?.removeEventListener('contextmenu', listener)
          rowListeners.delete(this)
          this._super(...args)
        },
      }),
    })
  }
}
