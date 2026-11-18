/**
 * BP 选人阶段原生界面阵容诊断条
 *
 * 0 额外网络请求，实时订阅 ChampSelectSession 并在己方选人列下方挂载紧凑阵容诊断条。
 */

import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CompDiagnosticBar } from '@/components/ui/CompDiagnosticBar'
import { isArenaQueue } from '@/lib/comp-diagnostic'
import { injector } from '@/lib/InjectorManager'
import { lcu, LcuEventUri, type ChampSelectSession, type LCUEventMessage } from '@/lib/lcu'
import { logger } from '@/lib/logger'
import type { GameflowPhase } from '@/types/lcu'

const HOST_ID = 'sona-native-comp-diagnostic-host'

let unsubAll: (() => void) | null = null
let injectRegistered = false
let currentPhase: GameflowPhase = 'None'
let currentSession: ChampSelectSession | null = null
let hostEl: HTMLDivElement | null = null
let reactRoot: Root | null = null
let lastRenderedSig = ''
let sessionQueryToken = 0

function computeSessionSig(session: ChampSelectSession | null): string {
  if (!session || session.myTeam.length < 2 || isArenaQueue(session.queueId, session.myTeam.length)) {
    return 'empty'
  }
  const teamPart = session.myTeam
    .map((m) => `${m.cellId}:${m.championId || 0}:${m.championPickIntent || 0}`)
    .join(',')
  return `${session.queueId ?? 0}|${teamPart}`
}

function findAllyAnchor(): { parent: Element; after?: Element } | null {
  const yourParty = document.querySelector('.summoner-array.your-party')
  if (yourParty) {
    return { parent: yourParty }
  }
  const firstAllyWrapper = document.querySelector('.party.visible .summoner-wrapper.visible.left')
  const party = firstAllyWrapper?.closest('.party.visible')
  if (party && party.parentElement) {
    return { parent: party.parentElement, after: party }
  }
  return null
}

function renderBar(force = false) {
  if (!reactRoot) return
  const nextSig = computeSessionSig(currentSession)
  if (!force && nextSig === lastRenderedSig) return
  lastRenderedSig = nextSig
  if (nextSig === 'empty' || !currentSession) {
    reactRoot.render(null)
    return
  }
  reactRoot.render(createElement(CompDiagnosticBar, { session: currentSession, compact: true }))
}

function tryInjectDiagnosticBar(): boolean {
  if (currentPhase !== 'ChampSelect') return true

  const anchor = findAllyAnchor()
  if (!anchor) {
    return true
  }

  let created = false
  if (!hostEl) {
    hostEl = document.createElement('div')
    hostEl.id = HOST_ID
    reactRoot = createRoot(hostEl)
    created = true
  }

  if (!hostEl.isConnected || hostEl.parentElement !== anchor.parent) {
    if (anchor.after) {
      anchor.after.insertAdjacentElement('afterend', hostEl)
    } else {
      anchor.parent.appendChild(hostEl)
    }
  }

  renderBar(created)
  return true
}

function cleanupMount() {
  sessionQueryToken++
  currentSession = null
  lastRenderedSig = ''
  if (injectRegistered) {
    injector.unregister(tryInjectDiagnosticBar)
    injectRegistered = false
  }
  if (reactRoot) {
    reactRoot.unmount()
    reactRoot = null
  }
  if (hostEl) {
    hostEl.remove()
    hostEl = null
  }
  document.getElementById(HOST_ID)?.remove()
}

function handlePhaseChange(nextPhase: GameflowPhase) {
  if (nextPhase === currentPhase) return
  currentPhase = nextPhase

  if (nextPhase !== 'ChampSelect') {
    cleanupMount()
    return
  }

  const token = ++sessionQueryToken
  if (!injectRegistered) {
    injector.register(tryInjectDiagnosticBar, { selector: '.your-party, .party' })
    injectRegistered = true
  }
  void lcu.getChampSelectSession().then((session) => {
    if (token !== sessionQueryToken || currentPhase !== 'ChampSelect') return
    currentSession = session
    tryInjectDiagnosticBar()
  }).catch(() => { /* ignore */ })
}

export function updateChampSelectCompDiagnostic(enabled: boolean) {
  if (enabled && !unsubAll) {
    const stopPhase = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      handlePhaseChange(event.data as GameflowPhase)
    })
    const stopGameflowSession = lcu.observe(LcuEventUri.GAMEFLOW_PHASE, (event: LCUEventMessage) => {
      const payload = event.data as { phase?: unknown } | null
      if (typeof payload?.phase === 'string') {
        handlePhaseChange(payload.phase as GameflowPhase)
      }
    })
    const stopChampSelect = lcu.observe(LcuEventUri.CHAMP_SELECT, (event: LCUEventMessage) => {
      if (event.eventType === 'Delete') {
        currentSession = null
        renderBar()
        return
      }
      if (event.eventType === 'Create' || event.eventType === 'Update') {
        currentSession = event.data as ChampSelectSession
        if (currentPhase === 'ChampSelect') {
          tryInjectDiagnosticBar()
        }
      }
    })
    unsubAll = () => {
      stopPhase()
      stopGameflowSession()
      stopChampSelect()
    }

    void lcu.getGameflowPhase().then((phase) => {
      if (unsubAll) handlePhaseChange(phase)
    }).catch(() => { /* ignore */ })

    logger.info('[CompDiag] BP 阵容伤害结构与短板诊断条已启用 ✓')
  } else if (!enabled && unsubAll) {
    unsubAll()
    unsubAll = null
    currentPhase = 'None'
    cleanupMount()
    logger.info('[CompDiag] BP 阵容伤害结构与短板诊断条已禁用')
  }
}
