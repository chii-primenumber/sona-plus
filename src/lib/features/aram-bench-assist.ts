/**
 * 大乱斗替补席增强：心愿英雄提醒/秒换 + 队友绝活角标提示
 *
 * - 避开左上角 T 级角标（left:-2, top:-2）：
 *   - 心愿单标记放在右上角（★#N）并为 .champion-bench-item 叠加金色呼吸光圈
 *   - 队友绝活/熟练标记放在底部居中胶囊（如“2楼绝活”）
 * - 秒换具备优先级比较与手动换下防抢回保护，杜绝多心愿英雄死循环互换
 * - 悬停提示默认展示在替补席头像上方（空间不足时移至左右侧），不遮挡下方平衡性调整 buff 卡片
 */

import { getChampionById } from '@/lib/assets'
import {
  buildTeammateProficiencyIndex,
  createWishlistSwapState,
  formatBenchTeammateBadge,
  planWishlistBenchSwap,
  type BenchWishlistMatch,
  type TeammateChampionHint,
  type TeammateProficiencySource,
} from '@/lib/aram-bench-assist'
import { deobfuscateChampSelectPuuid } from '@/lib/champ-select-puuid'
import { fetchHistoryMastery, fetchHistoryPage } from '@/lib/history-api'
import { injector } from '@/lib/InjectorManager'
import { lcu, LcuEventUri, type ChampSelectSession, type LCUEventMessage } from '@/lib/lcu'
import { logger } from '@/lib/logger'
import { store } from '@/lib/store'
import type { GameflowPhase } from '@/types/lcu'

const STYLE_ID = 'sona-aram-bench-assist-style'
const TOOLTIP_ID = 'sona-aram-bench-assist-tooltip'
const WISH_ATTR = 'data-sona-bench-wishlist'
const MATE_ATTR = 'data-sona-bench-teammate'
const WISH_BADGE_ATTR = 'data-sona-bench-wish-badge'
const MATE_BADGE_ATTR = 'data-sona-bench-mate-badge'
const HOVER_BOUND_ATTR = 'data-sona-bench-assist-hover'
const POSITION_RESTORE_ATTR = 'data-sona-bench-orig-pos'
const POS_CHECKED_ATTR = 'data-sona-bench-pos-checked'
const RENDER_SIG_ATTR = 'data-sona-bench-sig'
const BENCH_INJECT_SELECTOR = '.bench-container, .champion-bench-item'

let unsubAll: (() => void) | null = null
let injectRegistered = false
let currentPhase: GameflowPhase = 'None'
let currentSession: ChampSelectSession | null = null
let swapState = createWishlistSwapState()
let proficiencyByChamp = new Map<number, TeammateChampionHint[]>()
let loadedTeammateKey = ''
let loadToken = 0
let hoveredBenchEl: HTMLElement | null = null

function ensureBenchStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .champion-bench-item[${WISH_ATTR}="active"] {
      box-shadow: inset 0 0 0 1.5px #f0c869, 0 0 10px rgba(240, 200, 105, 0.48) !important;
    }
    .champion-bench-item[${WISH_ATTR}="suppressed"] {
      box-shadow: inset 0 0 0 1px rgba(200, 170, 110, 0.52) !important;
    }
    [${WISH_BADGE_ATTR}] {
      position: absolute;
      top: 0;
      right: 0;
      z-index: 9;
      padding: 0 3.5px;
      height: 13px;
      line-height: 13px;
      border-radius: 0 1px 0 4px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0;
      color: #161004;
      background: linear-gradient(135deg, #ffe8a1 0%, #d8a136 100%);
      box-shadow: -1px 1px 4px rgba(0, 0, 0, 0.68);
      pointer-events: none;
      white-space: nowrap;
    }
    [${WISH_BADGE_ATTR}="suppressed"] {
      color: #e6dcc6;
      background: rgba(20, 16, 10, 0.9);
      border-left: 1px solid rgba(200, 170, 110, 0.5);
      border-bottom: 1px solid rgba(200, 170, 110, 0.5);
    }
    [${MATE_BADGE_ATTR}] {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 8;
      height: 15px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding: 0 2px 1.5px;
      box-sizing: border-box;
      font-size: 9px;
      line-height: 11px;
      font-weight: 600;
      letter-spacing: 0.01em;
      pointer-events: none;
      white-space: nowrap;
      overflow: hidden;
      background: linear-gradient(180deg, rgba(4, 8, 15, 0) 0%, rgba(5, 10, 18, 0.82) 36%, rgba(5, 10, 18, 0.96) 100%);
    }
    [${MATE_BADGE_ATTR}="ace"] {
      color: #ffe59e;
      border-bottom: 1.5px solid #e6bd62;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.96), 0 0 6px rgba(230, 189, 98, 0.25);
    }
    [${MATE_BADGE_ATTR}="skilled"] {
      color: #bce8ff;
      border-bottom: 1.5px solid #56c1f0;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.96), 0 0 6px rgba(86, 193, 240, 0.22);
    }
    #${TOOLTIP_ID} {
      position: fixed;
      z-index: 220000;
      min-width: 248px;
      max-width: 356px;
      padding: 9px 12px 10px;
      border-radius: 4px;
      background: linear-gradient(180deg, rgba(13, 20, 30, 0.98) 0%, rgba(7, 12, 20, 0.98) 100%);
      border: 1px solid rgba(200, 170, 110, 0.52);
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.76), inset 0 1px 0 rgba(255, 236, 185, 0.1);
      color: #f0e6d2;
      font-size: 12px;
      line-height: 1.45;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.14s ease;
    }
    #${TOOLTIP_ID}.is-visible {
      opacity: 1;
    }
    #${TOOLTIP_ID} .sona-ba-tt-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-weight: 700;
      color: #f0e6d2;
      margin-bottom: 6px;
      padding-bottom: 5px;
      border-bottom: 1px solid rgba(200, 170, 110, 0.24);
    }
    #${TOOLTIP_ID} .sona-ba-tt-sub {
      font-size: 10.5px;
      font-weight: 500;
      color: #c8aa6e;
    }
    #${TOOLTIP_ID} .sona-ba-tt-wish {
      color: #ffe294;
      font-weight: 600;
      font-size: 11.5px;
      margin-bottom: 6px;
      padding: 3px 7px;
      border-radius: 3px;
      background: rgba(230, 189, 98, 0.12);
      border-left: 2px solid #e6bd62;
    }
    #${TOOLTIP_ID} .sona-ba-tt-mate {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-top: 4px;
      font-size: 11.5px;
    }
    #${TOOLTIP_ID} .sona-ba-tt-mate-who {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      color: #f0e6d2;
    }
    #${TOOLTIP_ID} .sona-ba-tt-floor {
      flex: 0 0 auto;
      padding: 0 4px;
      height: 15px;
      line-height: 15px;
      border-radius: 2px;
      font-size: 10px;
      font-weight: 700;
      color: #cdbe91;
      background: rgba(200, 170, 110, 0.16);
    }
    #${TOOLTIP_ID} .sona-ba-tt-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 112px;
    }
    #${TOOLTIP_ID} .sona-ba-tt-tag {
      flex: 0 0 auto;
      padding: 0 4px;
      height: 15px;
      line-height: 14px;
      border-radius: 2px;
      font-size: 10px;
      font-weight: 700;
      box-sizing: border-box;
    }
    #${TOOLTIP_ID} .sona-ba-tt-tag--ace {
      color: #ffe49c;
      background: rgba(230, 189, 98, 0.16);
      border: 1px solid rgba(230, 189, 98, 0.52);
    }
    #${TOOLTIP_ID} .sona-ba-tt-tag--skilled {
      color: #bce8ff;
      background: rgba(86, 193, 240, 0.14);
      border: 1px solid rgba(86, 193, 240, 0.46);
    }
    #${TOOLTIP_ID} .sona-ba-tt-stats {
      flex: 0 0 auto;
      color: #a09b8c;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    #${TOOLTIP_ID} .sona-ba-tt-note {
      color: #8c98a6;
      font-size: 10.5px;
      margin-top: 6px;
      padding-top: 5px;
      border-top: 1px solid rgba(200, 170, 110, 0.14);
    }
  `
  document.head.appendChild(style)
}

function resolvePlayerPuuid(player: ChampSelectSession['myTeam'][number]): string {
  if (player.puuid) return player.puuid
  if (player.nameVisibilityType === 'HIDDEN' && player.obfuscatedPuuid) {
    return deobfuscateChampSelectPuuid(player.obfuscatedPuuid)
  }
  return ''
}

function extractBenchChampionId(item: Element): number | null {
  const attrVal = item.getAttribute('data-champion-id')
  if (attrVal && /^\d+$/.test(attrVal)) return Number(attrVal)

  const img = item.querySelector('img[src*="champion-icons"]')
  const imgMatch = img?.getAttribute('src')?.match(/champion-icons\/(\d+)\.(?:png|svg|jpg)/)
  if (imgMatch) return Number(imgMatch[1])

  const bg = item.querySelector('.bench-champion-background') as HTMLElement | null
  const styleText = [
    (item as HTMLElement).style?.backgroundImage ?? '',
    bg?.style?.backgroundImage ?? '',
  ].join(' ')
  const bgMatch = styleText.match(/champion-icons\/(\d+)\.(?:png|svg|jpg)/)
  if (bgMatch) return Number(bgMatch[1])

  return null
}

function getWishlistMatchMap(): Map<number, BenchWishlistMatch> {
  const map = new Map<number, BenchWishlistMatch>()
  if (!store.get('aramWishlistEnabled')) return map
  const wishlist = store.get('aramWishlistChampionIds')
  if (!Array.isArray(wishlist) || wishlist.length === 0) return map
  wishlist.forEach((champId, idx) => {
    if (champId > 0 && !map.has(champId)) {
      map.set(champId, {
        championId: champId,
        rank: idx + 1,
        isSuppressed: swapState.suppressedChampionIds.has(champId),
      })
    }
  })
  return map
}

function getOrCreateTooltip(): HTMLDivElement {
  let el = document.getElementById(TOOLTIP_ID) as HTMLDivElement | null
  if (!el) {
    el = document.createElement('div')
    el.id = TOOLTIP_ID
    document.body.appendChild(el)
  }
  return el
}

function hideBenchTooltip() {
  hoveredBenchEl = null
  const el = document.getElementById(TOOLTIP_ID)
  el?.classList.remove('is-visible')
}

function showBenchTooltip(anchor: HTMLElement, championId: number) {
  const wishMap = getWishlistMatchMap()
  const wish = wishMap.get(championId)
  const mateHints = store.get('aramBenchTeammateHint') ? (proficiencyByChamp.get(championId) ?? []) : []

  if (!wish && mateHints.length === 0) {
    hideBenchTooltip()
    return
  }

  hoveredBenchEl = anchor
  const champ = getChampionById(championId)
  const champLabel = champ ? `${champ.title ? `${champ.title} ` : ''}${champ.name}` : `英雄 #${championId}`

  const tooltip = getOrCreateTooltip()
  tooltip.replaceChildren()

  const head = document.createElement('div')
  head.className = 'sona-ba-tt-head'
  const titleSpan = document.createElement('span')
  titleSpan.textContent = champLabel
  const subSpan = document.createElement('span')
  subSpan.className = 'sona-ba-tt-sub'
  subSpan.textContent = '替补席情报'
  head.append(titleSpan, subSpan)
  tooltip.appendChild(head)

  if (wish) {
    const wishLine = document.createElement('div')
    wishLine.className = 'sona-ba-tt-wish'
    wishLine.textContent = wish.isSuppressed
      ? `★ 心愿英雄 #${wish.rank} · 已手动换下，不再自动抢回`
      : store.get('aramWishlistAutoSwap')
        ? `★ 心愿英雄 #${wish.rank} · 自动秒换顺位`
        : `★ 心愿英雄 #${wish.rank} · 心愿单提醒`
    tooltip.appendChild(wishLine)
  }

  for (const hint of mateHints) {
    const row = document.createElement('div')
    row.className = 'sona-ba-tt-mate'

    const who = document.createElement('span')
    who.className = 'sona-ba-tt-mate-who'

    const floorChip = document.createElement('span')
    floorChip.className = 'sona-ba-tt-floor'
    floorChip.textContent = `${hint.floor}楼`

    const nameSpan = document.createElement('span')
    nameSpan.className = 'sona-ba-tt-name'
    nameSpan.textContent = hint.name

    const tag = document.createElement('span')
    tag.className = `sona-ba-tt-tag sona-ba-tt-tag--${hint.tier}`
    tag.textContent = hint.tier === 'ace' ? '绝活' : '熟练'

    who.append(floorChip, nameSpan, tag)
    row.appendChild(who)

    if (hint.statsText) {
      const statsSpan = document.createElement('span')
      statsSpan.className = 'sona-ba-tt-stats'
      statsSpan.textContent = hint.statsText
      row.appendChild(statsSpan)
    }

    tooltip.appendChild(row)
  }

  if (mateHints.some((h) => h.tier === 'ace')) {
    const note = document.createElement('div')
    note.className = 'sona-ba-tt-note'
    note.textContent = '队友高胜率/高熟练招牌英雄，可留意队友是否想拿'
    tooltip.appendChild(note)
  }

  tooltip.classList.add('is-visible')

  const rect = anchor.getBoundingClientRect()
  const benchRect = anchor.closest('.bench-container')?.getBoundingClientRect() ?? rect
  const ttWidth = tooltip.offsetWidth || 260
  const ttHeight = tooltip.offsetHeight || 80
  let left = Math.round(rect.left + (rect.width - ttWidth) / 2)
  let top = Math.round(rect.top - ttHeight - 8)

  if (top < 10) {
    // 顶部空间不足时置于替补席及倒计时数字下方（留出 36px 倒计时安全区），绝不遮挡相邻替补席与读秒；
    // 若同时开启了平衡性 buff 提示（占替补席正下方 240px），自动右移并排展示。
    top = Math.round(benchRect.bottom + 36)
    if (store.get('balanceBuffTooltip')) {
      const rightSide = Math.round(rect.left + rect.width / 2 + 126)
      left = rightSide + ttWidth + 10 <= window.innerWidth
        ? rightSide
        : Math.max(10, Math.round(rect.left + rect.width / 2 - 126 - ttWidth))
    }
  }
  left = Math.max(10, Math.min(window.innerWidth - ttWidth - 10, left))

  tooltip.style.left = `${left}px`
  tooltip.style.top = `${top}px`
}

function ensureRelativePosition(el: HTMLElement) {
  if (el.hasAttribute(POS_CHECKED_ATTR)) return
  el.setAttribute(POS_CHECKED_ATTR, '1')
  const computed = window.getComputedStyle(el)
  if (computed.position === 'static') {
    el.setAttribute(POSITION_RESTORE_ATTR, el.style.position || '')
    el.style.position = 'relative'
  }
}

function syncBenchDomOverlays(): boolean {
  if (!currentSession?.benchEnabled) return true
  const container = document.querySelector('.bench-container')
  if (!container) return true

  ensureBenchStyle()
  const wishMap = getWishlistMatchMap()
  const showTeammateHints = store.get('aramBenchTeammateHint')

  const items = container.querySelectorAll('.champion-bench-item')
  items.forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    if (node.classList.contains('empty-bench-item')) {
      if (node.getAttribute(RENDER_SIG_ATTR) !== 'empty') {
        node.setAttribute(RENDER_SIG_ATTR, 'empty')
        node.removeAttribute(WISH_ATTR)
        node.removeAttribute(MATE_ATTR)
        node.querySelector(`[${WISH_BADGE_ATTR}]`)?.remove()
        node.querySelector(`[${MATE_BADGE_ATTR}]`)?.remove()
      }
      return
    }

    if (!node.hasAttribute(HOVER_BOUND_ATTR)) {
      node.setAttribute(HOVER_BOUND_ATTR, 'true')
      node.addEventListener('mouseenter', () => {
        const cid = extractBenchChampionId(node)
        if (cid && cid > 0) showBenchTooltip(node, cid)
      })
      node.addEventListener('mouseleave', () => {
        if (hoveredBenchEl === node) hideBenchTooltip()
      })
    }

    const championId = extractBenchChampionId(node)
    const wish = championId ? wishMap.get(championId) : undefined
    const mateHints = championId && showTeammateHints ? (proficiencyByChamp.get(championId) ?? []) : []
    const mateBadge = formatBenchTeammateBadge(mateHints)

    const wishStateVal = wish ? (wish.isSuppressed ? 'suppressed' : 'active') : ''
    const wishTextVal = wish ? (wish.isSuppressed ? '已让' : `★${wish.rank}`) : ''
    const mateTierVal = mateBadge?.tier ?? ''
    const mateLabelVal = mateBadge?.label ?? ''
    const nextSig = `${championId || 0}|${wishStateVal}:${wishTextVal}|${mateTierVal}:${mateLabelVal}`

    const existingWishBadge = node.querySelector(`[${WISH_BADGE_ATTR}]`) as HTMLElement | null
    const existingMateBadge = node.querySelector(`[${MATE_BADGE_ATTR}]`) as HTMLElement | null
    const badgesConsistent = Boolean(wish) === Boolean(existingWishBadge) && Boolean(mateBadge) === Boolean(existingMateBadge)
    if (node.getAttribute(RENDER_SIG_ATTR) === nextSig && badgesConsistent) {
      return
    }
    node.setAttribute(RENDER_SIG_ATTR, nextSig)

    if (wish) {
      ensureRelativePosition(node)
      node.setAttribute(WISH_ATTR, wishStateVal)
      if (!existingWishBadge) {
        const badge = document.createElement('span')
        badge.setAttribute(WISH_BADGE_ATTR, wishStateVal)
        badge.textContent = wishTextVal
        node.appendChild(badge)
      } else {
        existingWishBadge.setAttribute(WISH_BADGE_ATTR, wishStateVal)
        if (existingWishBadge.textContent !== wishTextVal) existingWishBadge.textContent = wishTextVal
      }
    } else {
      node.removeAttribute(WISH_ATTR)
      existingWishBadge?.remove()
    }

    if (mateBadge) {
      ensureRelativePosition(node)
      node.setAttribute(MATE_ATTR, mateBadge.tier)
      if (!existingMateBadge) {
        const badge = document.createElement('span')
        badge.setAttribute(MATE_BADGE_ATTR, mateBadge.tier)
        badge.textContent = mateBadge.label
        node.appendChild(badge)
      } else {
        existingMateBadge.setAttribute(MATE_BADGE_ATTR, mateBadge.tier)
        if (existingMateBadge.textContent !== mateBadge.label) existingMateBadge.textContent = mateBadge.label
      }
    } else {
      node.removeAttribute(MATE_ATTR)
      existingMateBadge?.remove()
    }
  })

  return true
}

async function loadTeammatesProficiency(session: ChampSelectSession) {
  if (!session.benchEnabled || !store.get('aramBenchTeammateHint')) return

  const teammates = (session.myTeam || [])
    .map((p, idx) => ({
      floor: idx + 1,
      cellId: p.cellId,
      puuid: resolvePlayerPuuid(p),
      name: p.gameName ? p.gameName : (p.playerAlias || `${idx + 1}楼`),
    }))
    .filter((t) => t.cellId !== session.localPlayerCellId && Boolean(t.puuid))

  const teamKey = teammates.map((t) => `${t.floor}:${t.puuid}`).join('|')
  if (!teamKey || teamKey === loadedTeammateKey) return

  loadedTeammateKey = teamKey
  const token = ++loadToken

  const sources: TeammateProficiencySource[] = await Promise.all(
    teammates.map(async (mate) => {
      const [historyResp, masteries] = await Promise.all([
        fetchHistoryPage(mate.puuid, 0, 0, 40).catch(() => null),
        fetchHistoryMastery(mate.puuid).catch(() => []),
      ])
      return {
        floor: mate.floor,
        puuid: mate.puuid,
        name: mate.name,
        games: historyResp?.games ?? [],
        masteries,
      }
    }),
  )

  if (token !== loadToken) return
  proficiencyByChamp = buildTeammateProficiencyIndex(sources)
  logger.info('[AramBench] 已构建 %d 位队友绝活索引（命中 %d 个英雄）', sources.length, proficiencyByChamp.size)
  syncBenchDomOverlays()
}

function handleChampSelectSession(session: ChampSelectSession) {
  currentSession = session
  if (!session.benchEnabled) {
    if (injectRegistered) {
      injector.unregister(syncBenchDomOverlays)
      injectRegistered = false
    }
    cleanupBenchDom()
    return
  }

  if (!injectRegistered) {
    injector.register(syncBenchDomOverlays, { selector: BENCH_INJECT_SELECTOR })
    injectRegistered = true
  }

  void loadTeammatesProficiency(session)

  const localPlayer = (session.myTeam || []).find((p) => p.cellId === session.localPlayerCellId)
  const myChampionId = localPlayer?.championId ?? 0
  const benchChampionIds = (session.benchChampions || []).map((b) => b.championId).filter((id) => id > 0)

  const decision = planWishlistBenchSwap({
    benchEnabled: Boolean(session.benchEnabled),
    wishlistEnabled: store.get('aramWishlistEnabled'),
    autoSwapEnabled: store.get('aramWishlistAutoSwap'),
    wishlistIds: store.get('aramWishlistChampionIds'),
    myChampionId,
    benchChampionIds,
    state: swapState,
  })

  syncBenchDomOverlays()

  if (decision.autoSwapTargetId != null) {
    const targetId = decision.autoSwapTargetId
    const targetRank = decision.autoSwapTargetRank ?? 1
    swapState.inFlightTargetId = targetId
    swapState.lastAutoSwapTargetId = targetId
    swapState.lastAutoSwapAt = Date.now()

    lcu.benchSwap(targetId)
      .then(() => {
        const champ = getChampionById(targetId)
        const champName = champ ? `${champ.title ? `${champ.title} ` : ''}${champ.name}` : `#${targetId}`
        logger.info('[AramBench] 已自动秒换心愿英雄 → %s (顺位 #%d) ✓', champName, targetRank)
        if (typeof Toast !== 'undefined') {
          Toast.success(`替补席已秒换心愿英雄：${champName}（#${targetRank}）`)
        }
      })
      .catch((err) => {
        logger.warn('[AramBench] 秒换心愿英雄失败 (ID=%d):', targetId, err)
      })
      .finally(() => {
        swapState.inFlightTargetId = 0
      })
  }
}

function cleanupBenchDom() {
  hideBenchTooltip()
  document.getElementById(TOOLTIP_ID)?.remove()
  document.querySelectorAll(`[${WISH_BADGE_ATTR}],[${MATE_BADGE_ATTR}]`).forEach((el) => el.remove())
  document.querySelectorAll(`[${WISH_ATTR}],[${MATE_ATTR}],[${HOVER_BOUND_ATTR}],[${POS_CHECKED_ATTR}],[${RENDER_SIG_ATTR}]`).forEach((el) => {
    el.removeAttribute(WISH_ATTR)
    el.removeAttribute(MATE_ATTR)
    el.removeAttribute(HOVER_BOUND_ATTR)
    el.removeAttribute(POS_CHECKED_ATTR)
    el.removeAttribute(RENDER_SIG_ATTR)
  })
  document.querySelectorAll(`[${POSITION_RESTORE_ATTR}]`).forEach((el) => {
    if (el instanceof HTMLElement) {
      el.style.position = el.getAttribute(POSITION_RESTORE_ATTR) || ''
      el.removeAttribute(POSITION_RESTORE_ATTR)
    }
  })
}

function resetSessionState() {
  loadToken++
  currentSession = null
  loadedTeammateKey = ''
  proficiencyByChamp = new Map()
  swapState = createWishlistSwapState()
  if (injectRegistered) {
    injector.unregister(syncBenchDomOverlays)
    injectRegistered = false
  }
  cleanupBenchDom()
}

function handlePhaseChange(nextPhase: GameflowPhase) {
  if (nextPhase === currentPhase) return
  currentPhase = nextPhase

  if (nextPhase !== 'ChampSelect') {
    resetSessionState()
    return
  }

  swapState = createWishlistSwapState()

  void lcu.getChampSelectSession().then((session) => {
    if (currentPhase === 'ChampSelect') {
      handleChampSelectSession(session)
    }
  }).catch(() => { /* ignore */ })
}

export function refreshAramBenchAssist() {
  const anyEnabled = store.get('aramWishlistEnabled') || store.get('aramBenchTeammateHint')
  updateAramBenchAssist(anyEnabled)
  if (anyEnabled && currentPhase === 'ChampSelect' && currentSession) {
    if (!store.get('aramBenchTeammateHint')) {
      proficiencyByChamp = new Map()
      loadedTeammateKey = ''
    }
    handleChampSelectSession(currentSession)
  }
}

export function updateAramBenchAssist(enabled: boolean) {
  if (enabled && !unsubAll) {
    const stopPhase = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      handlePhaseChange(event.data as GameflowPhase)
    })
    const stopGameflow = lcu.observe(LcuEventUri.GAMEFLOW_PHASE, (event: LCUEventMessage) => {
      const payload = event.data as { phase?: unknown } | null
      if (typeof payload?.phase === 'string') {
        handlePhaseChange(payload.phase as GameflowPhase)
      }
    })
    const stopChampSelect = lcu.observe(LcuEventUri.CHAMP_SELECT, (event: LCUEventMessage) => {
      if (event.eventType === 'Delete') {
        resetSessionState()
        return
      }
      if (event.eventType === 'Create' || event.eventType === 'Update') {
        if (currentPhase !== 'ChampSelect') {
          currentPhase = 'ChampSelect'
        }
        handleChampSelectSession(event.data as ChampSelectSession)
      }
    })
    unsubAll = () => {
      stopPhase()
      stopGameflow()
      stopChampSelect()
    }

    void lcu.getGameflowPhase().then((phase) => {
      if (unsubAll) handlePhaseChange(phase)
    }).catch(() => { /* ignore */ })

    logger.info('[AramBench] 大乱斗替补席心愿单与队友绝活助手已启用 ✓')
  } else if (!enabled && unsubAll) {
    unsubAll()
    unsubAll = null
    currentPhase = 'None'
    resetSessionState()
    logger.info('[AramBench] 大乱斗替补席心愿单与队友绝活助手已禁用')
  }
}
