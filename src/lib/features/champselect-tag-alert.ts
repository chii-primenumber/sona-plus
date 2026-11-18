/**
 * E1：选人阶段「排到小本本避雷 / 注意玩家」强预警横幅
 *
 * 0 额外网络请求，支持匿名排位反混淆 PUUID，支持当场点开该玩家详细战绩或一键收起。
 */

import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MatchHistoryModal } from '@/components/ui/MatchHistoryModal'
import { detectTeammateTagAlerts, type TeammateTagAlertItem } from '@/lib/champselect-enhancements'
import { lcu, LcuEventUri, type ChampSelectSession, type LCUEventMessage } from '@/lib/lcu'
import { logger } from '@/lib/logger'
import { store } from '@/lib/store'
import type { GameflowPhase } from '@/types/lcu'

const HOST_ID = 'sona-champselect-tag-alert'
const STYLE_ID = 'sona-champselect-tag-alert-style'

let unsubAll: (() => void) | null = null
let currentPhase: GameflowPhase = 'None'
let currentSession: ChampSelectSession | null = null
let dismissedKey = ''
let toastedKey = ''
let historyModalRoot: Root | null = null
let historyModalContainer: HTMLDivElement | null = null

function ensureAlertStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${HOST_ID} {
      position: fixed;
      top: 86px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 215000;
      width: min(468px, 92vw);
      padding: 10px 14px 11px;
      box-sizing: border-box;
      border-radius: 4px;
      background: linear-gradient(180deg, rgba(32, 12, 16, 0.96) 0%, rgba(15, 9, 13, 0.97) 100%);
      border: 1px solid rgba(235, 92, 92, 0.72);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 196, 196, 0.14);
      color: #f0e6d2;
      font: 12px/1.45 "Microsoft YaHei UI", "Segoe UI", sans-serif;
    }
    #${HOST_ID}.is-warn-only {
      background: linear-gradient(180deg, rgba(32, 22, 10, 0.96) 0%, rgba(16, 12, 8, 0.97) 100%);
      border-color: rgba(240, 173, 78, 0.72);
    }
    #${HOST_ID} .sona-csta-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 7px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(235, 92, 92, 0.24);
    }
    #${HOST_ID}.is-warn-only .sona-csta-head {
      border-bottom-color: rgba(240, 173, 78, 0.24);
    }
    #${HOST_ID} .sona-csta-title {
      font-size: 13px;
      font-weight: 700;
      color: #ff9c9c;
      letter-spacing: 0.02em;
    }
    #${HOST_ID}.is-warn-only .sona-csta-title {
      color: #ffd089;
    }
    #${HOST_ID} .sona-csta-dismiss {
      padding: 2px 9px;
      height: 22px;
      border-radius: 3px;
      border: 1px solid rgba(200, 170, 110, 0.42);
      background: rgba(18, 24, 34, 0.75);
      color: #e6dcc6;
      font: 600 11px "Microsoft YaHei UI", sans-serif;
      cursor: pointer;
    }
    #${HOST_ID} .sona-csta-dismiss:hover {
      border-color: #c8aa6e;
      color: #fff;
    }
    #${HOST_ID} .sona-csta-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    #${HOST_ID} .sona-csta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 5px 8px;
      border-radius: 3px;
      background: rgba(8, 12, 18, 0.56);
    }
    #${HOST_ID} .sona-csta-main {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1;
    }
    #${HOST_ID} .sona-csta-who {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    #${HOST_ID} .sona-csta-floor {
      flex: 0 0 auto;
      padding: 0 4px;
      height: 16px;
      line-height: 16px;
      border-radius: 2px;
      font-size: 10.5px;
      font-weight: 700;
      color: #cdbe91;
      background: rgba(200, 170, 110, 0.18);
    }
    #${HOST_ID} .sona-csta-name {
      font-weight: 700;
      color: #f0e6d2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #${HOST_ID} .sona-csta-tag {
      flex: 0 0 auto;
      padding: 0 6px;
      height: 16px;
      line-height: 15px;
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 700;
      box-sizing: border-box;
    }
    #${HOST_ID} .sona-csta-tag--avoid {
      color: #ff9494;
      background: rgba(231, 76, 60, 0.22);
      border: 1px solid rgba(231, 76, 60, 0.62);
    }
    #${HOST_ID} .sona-csta-tag--warn {
      color: #ffc582;
      background: rgba(243, 156, 18, 0.2);
      border: 1px solid rgba(243, 156, 18, 0.56);
    }
    #${HOST_ID} .sona-csta-note {
      font-size: 11px;
      color: #b8afa0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #${HOST_ID} .sona-csta-inspect {
      flex: 0 0 auto;
      padding: 2px 8px;
      height: 22px;
      border-radius: 3px;
      border: 1px solid rgba(200, 170, 110, 0.36);
      background: rgba(200, 170, 110, 0.12);
      color: #e8cfa0;
      font: 600 11px "Microsoft YaHei UI", sans-serif;
      cursor: pointer;
    }
    #${HOST_ID} .sona-csta-inspect:hover {
      background: rgba(200, 170, 110, 0.24);
      border-color: #c8aa6e;
    }
  `
  document.head.appendChild(style)
}

function openTeammateHistory(item: TeammateTagAlertItem) {
  if (!historyModalContainer) {
    historyModalContainer = document.createElement('div')
    historyModalContainer.dataset.sonaOwned = 'true'
    document.body.appendChild(historyModalContainer)
    historyModalRoot = createRoot(historyModalContainer)
  }
  const close = () => {
    historyModalRoot?.render(createElement(MatchHistoryModal, { open: false, onClose: close, puuid: item.puuid, playerName: item.displayName }))
  }
  historyModalRoot?.render(createElement(MatchHistoryModal, { open: true, onClose: close, puuid: item.puuid, playerName: item.displayName }))
}

function removeBanner() {
  document.getElementById(HOST_ID)?.remove()
}

function renderAlertBanner() {
  if (
    currentPhase !== 'ChampSelect'
    || !currentSession
    || !store.get('champSelectTagAlert')
    || !store.get('playerTagEnabled')
  ) {
    removeBanner()
    return
  }

  const tagsMap = store.get('playerTags')
  const { warnings, alertKey } = detectTeammateTagAlerts(currentSession, tagsMap)

  if (warnings.length === 0 || !alertKey || alertKey === dismissedKey) {
    removeBanner()
    return
  }

  ensureAlertStyle()

  if (alertKey !== toastedKey) {
    toastedKey = alertKey
    const first = warnings[0]
    if (typeof Toast !== 'undefined') {
      Toast.error(`小本本预警：${first.floor}楼 ${first.displayName} 已被标记为「${first.tag.label}」！`)
    }
    logger.info('[TagAlert] 选人阶段命中 %d 名小本本预警玩家 → %s', warnings.length, alertKey)
  }

  let host = document.getElementById(HOST_ID) as HTMLDivElement | null
  if (!host) {
    host = document.createElement('div')
    host.id = HOST_ID
    host.setAttribute('data-testid', 'champselect-tag-alert')
    document.body.appendChild(host)
  }

  const hasAvoid = warnings.some((w) => w.tag.tone === 'avoid')
  host.classList.toggle('is-warn-only', !hasAvoid)
  host.replaceChildren()

  const head = document.createElement('div')
  head.className = 'sona-csta-head'

  const title = document.createElement('span')
  title.className = 'sona-csta-title'
  title.textContent = hasAvoid
    ? `⚠ 小本本避雷预警 · 同队命中 ${warnings.length} 人`
    : `⚠ 小本本关注提醒 · 同队命中 ${warnings.length} 人`

  const dismissBtn = document.createElement('button')
  dismissBtn.type = 'button'
  dismissBtn.className = 'sona-csta-dismiss'
  dismissBtn.textContent = '知道了'
  dismissBtn.addEventListener('click', () => {
    dismissedKey = alertKey
    removeBanner()
  })

  head.append(title, dismissBtn)
  host.appendChild(head)

  const list = document.createElement('div')
  list.className = 'sona-csta-list'

  for (const item of warnings) {
    const row = document.createElement('div')
    row.className = 'sona-csta-row'

    const main = document.createElement('div')
    main.className = 'sona-csta-main'

    const who = document.createElement('div')
    who.className = 'sona-csta-who'

    const floor = document.createElement('span')
    floor.className = 'sona-csta-floor'
    floor.textContent = `${item.floor}楼`

    const name = document.createElement('span')
    name.className = 'sona-csta-name'
    name.textContent = item.displayName

    const tag = document.createElement('span')
    tag.className = `sona-csta-tag sona-csta-tag--${item.tag.tone === 'avoid' ? 'avoid' : 'warn'}`
    tag.textContent = item.tag.label

    who.append(floor, name, tag)
    main.appendChild(who)

    if (item.tag.note) {
      const note = document.createElement('div')
      note.className = 'sona-csta-note'
      note.textContent = `备注：${item.tag.note}`
      main.appendChild(note)
    }

    const inspectBtn = document.createElement('button')
    inspectBtn.type = 'button'
    inspectBtn.className = 'sona-csta-inspect'
    inspectBtn.textContent = '查战绩'
    inspectBtn.addEventListener('click', () => openTeammateHistory(item))

    row.append(main, inspectBtn)
    list.appendChild(row)
  }

  host.appendChild(list)
}

function resetState() {
  currentSession = null
  dismissedKey = ''
  toastedKey = ''
  removeBanner()
}

function handlePhaseChange(nextPhase: GameflowPhase) {
  if (nextPhase === currentPhase) return
  currentPhase = nextPhase
  if (nextPhase !== 'ChampSelect') {
    resetState()
    return
  }

  void lcu.getChampSelectSession().then((session) => {
    if (currentPhase === 'ChampSelect') {
      currentSession = session
      renderAlertBanner()
    }
  }).catch(() => { /* ignore */ })
}

export function refreshChampSelectTagAlert() {
  const active = store.get('champSelectTagAlert') && store.get('playerTagEnabled')
  updateChampSelectTagAlert(active)
  if (active && currentPhase === 'ChampSelect') {
    renderAlertBanner()
  }
}

export function updateChampSelectTagAlert(enabled: boolean) {
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
        resetState()
        return
      }
      if (event.eventType === 'Create' || event.eventType === 'Update') {
        currentPhase = 'ChampSelect'
        currentSession = event.data as ChampSelectSession
        renderAlertBanner()
      }
    })
    const stopTags = store.onChange('playerTags', () => {
      if (currentPhase === 'ChampSelect') renderAlertBanner()
    })

    unsubAll = () => {
      stopPhase()
      stopGameflow()
      stopChampSelect()
      stopTags()
    }

    void lcu.getGameflowPhase().then((phase) => {
      if (unsubAll) handlePhaseChange(phase)
    }).catch(() => { /* ignore */ })

    logger.info('[TagAlert] 选人阶段小本本避雷预警已启用 ✓')
  } else if (!enabled && unsubAll) {
    unsubAll()
    unsubAll = null
    currentPhase = 'None'
    resetState()
    logger.info('[TagAlert] 选人阶段小本本避雷预警已禁用')
  }
}
