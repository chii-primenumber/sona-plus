/**
 * E5：选人阶段自动处理「楼层互换 / 英雄交换请求」
 *
 * 支持策略：
 * - `friends_only`：仅自动同意组排队友、好友及小本本「大腿/好评」玩家
 * - `favorable_or_friends`：好友全同意 + 排位自动同意换到更靠后的后手楼层
 * - `all`：自动同意所有请求（但始终拦截小本本「避雷」玩家，并保护自己手上的心愿英雄）
 */

import { evaluateIncomingSwapsAndTrades } from '@/lib/champselect-enhancements'
import { lcu, LcuEventUri, type ChampSelectSession, type LCUEventMessage } from '@/lib/lcu'
import { logger } from '@/lib/logger'
import { store } from '@/lib/store'
import type { GameflowPhase, Lobby } from '@/types/lcu'

let unsubAll: (() => void) | null = null
let currentPhase: GameflowPhase = 'None'
let premadePuuids = new Set<string>()
let friendPuuids = new Set<string>()
let handledKeys = new Set<string>()
let friendsLoaded = false

export function getTrackedPremadePuuids(): ReadonlySet<string> {
  return premadePuuids
}

function syncLobbyPremades(lobby: Lobby | null) {
  if (!lobby || !Array.isArray(lobby.members)) return
  premadePuuids = new Set(
    lobby.members
      .filter((m) => !m.isBot && Boolean(m.puuid))
      .map((m) => m.puuid),
  )
}

async function ensureFriendsCache() {
  if (friendsLoaded) return
  friendsLoaded = true
  try {
    const friends = await lcu.getFriends()
    if (Array.isArray(friends)) {
      friendPuuids = new Set(friends.map((f) => f.puuid).filter(Boolean))
    }
  } catch {
    friendsLoaded = false
  }
}

function handleChampSelectSession(session: ChampSelectSession) {
  if (!store.get('autoAcceptSwap')) return

  const decisions = evaluateIncomingSwapsAndTrades({
    session,
    strategy: store.get('autoAcceptSwapStrategy'),
    premadePuuids,
    friendPuuids,
    tagsMap: store.get('playerTags'),
    wishlistIds: store.get('aramWishlistChampionIds'),
    wishlistEnabled: store.get('aramWishlistEnabled'),
    handledKeys,
  })

  for (const decision of decisions) {
    const task = decision.kind === 'pick_order'
      ? lcu.acceptPickOrderSwap(decision.id)
      : lcu.acceptChampSelectTrade(decision.id)

    const actionText = decision.kind === 'pick_order' ? '楼层互换' : '英雄交换'
    void task
      .then(() => {
        logger.info('[AutoSwap] 已自动同意 %s（来自 %s，原因：%s）✓', actionText, decision.requesterName, decision.reason)
        if (typeof Toast !== 'undefined') {
          Toast.success(`已自动同意 ${decision.requesterName} 的${actionText}（${decision.reason}）`)
        }
      })
      .catch((err) => {
        logger.warn('[AutoSwap] 自动同意 %s 失败 (id=%d):', actionText, decision.id, err)
      })
  }
}

function handlePhaseChange(nextPhase: GameflowPhase) {
  if (nextPhase === currentPhase) return
  currentPhase = nextPhase

  if (nextPhase === 'None') {
    premadePuuids = new Set()
    handledKeys = new Set()
    friendsLoaded = false
    return
  }

  if (nextPhase === 'Lobby' || nextPhase === 'Matchmaking' || nextPhase === 'ReadyCheck') {
    handledKeys = new Set()
    void lcu.getLobby().then(syncLobbyPremades).catch(() => { /* ignore */ })
    return
  }

  if (nextPhase === 'ChampSelect') {
    handledKeys = new Set()
    void ensureFriendsCache().then(() => {
      if (currentPhase !== 'ChampSelect') return
      return lcu.getChampSelectSession().then((s) => {
        if (currentPhase === 'ChampSelect') handleChampSelectSession(s)
      })
    }).catch(() => { /* ignore */ })
  }
}

export function updateAutoAcceptSwap(enabled: boolean) {
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
    const stopLobby = lcu.observe(LcuEventUri.LOBBY, (event: LCUEventMessage) => {
      if (event.eventType !== 'Delete') {
        syncLobbyPremades(event.data as Lobby)
      }
    })
    const stopChampSelect = lcu.observe(LcuEventUri.CHAMP_SELECT, (event: LCUEventMessage) => {
      if (event.eventType === 'Delete') {
        handledKeys = new Set()
        return
      }
      if (event.eventType === 'Create' || event.eventType === 'Update') {
        currentPhase = 'ChampSelect'
        handleChampSelectSession(event.data as ChampSelectSession)
      }
    })

    unsubAll = () => {
      stopPhase()
      stopGameflow()
      stopLobby()
      stopChampSelect()
    }

    void lcu.getLobby().then(syncLobbyPremades).catch(() => { /* ignore */ })
    void lcu.getGameflowPhase().then((phase) => {
      if (unsubAll) handlePhaseChange(phase)
    }).catch(() => { /* ignore */ })

    logger.info('[AutoSwap] 自动处理楼层互换/英雄交换请求已启用 ✓')
  } else if (!enabled && unsubAll) {
    unsubAll()
    unsubAll = null
    currentPhase = 'None'
    handledKeys = new Set()
    logger.info('[AutoSwap] 自动处理楼层互换/英雄交换请求已禁用')
  }
}
