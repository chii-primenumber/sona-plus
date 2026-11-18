/**
 * E4：选人阶段锁定英雄后「已拥有皮肤 / 炫彩自动随机」
 *
 * - 英雄锁定后自动从 `/lol-champ-select/v1/skin-carousel-skins` 中抽取一款已拥有的皮肤或炫彩
 * - 每个已锁定英雄仅自动触发一次（玩家后续手动点皮肤轮播不会被覆盖；大乱斗换了新英雄则会再次随机）
 */

import { getChampionById } from '@/lib/assets'
import { pickRandomOwnedSkin } from '@/lib/champselect-enhancements'
import { lcu, LcuEventUri, type ChampSelectSession, type LCUEventMessage } from '@/lib/lcu'
import { logger } from '@/lib/logger'
import { store } from '@/lib/store'
import { sleep } from '@/lib/utils'
import type { GameflowPhase } from '@/types/lcu'

let unsubAll: (() => void) | null = null
let currentPhase: GameflowPhase = 'None'
let lastRandomizedChampId = 0
let inFlightToken = 0

function getLockedLocalChampion(session: ChampSelectSession): { championId: number; selectedSkinId: number } | null {
  if (session.allowSkinSelection === false) return null
  const me = (session.myTeam ?? []).find((p) => p.cellId === session.localPlayerCellId)
  if (!me || !(me.championId > 0)) return null

  // 大乱斗 / 无选人动作队列：拥有 championId 即已锁定
  const actions = (session.actions ?? []).flat(2)
  const myPickActions = actions.filter((a) => a.type === 'pick' && a.actorCellId === session.localPlayerCellId)
  if (myPickActions.length > 0 && !myPickActions.every((a) => a.completed)) {
    return null
  }

  return {
    championId: me.championId,
    selectedSkinId: me.selectedSkinId ?? 0,
  }
}

async function triggerRandomSkinForChampion(championId: number, currentSkinId: number, token: number) {
  // 等待客户端皮肤轮播数据与英雄锁定同步完成
  await sleep(160)
  if (token !== inFlightToken || currentPhase !== 'ChampSelect' || !store.get('autoRandomSkin')) return

  let skins = await lcu.getSkinCarouselSkins().catch(() => [])
  if ((!Array.isArray(skins) || skins.length === 0) && token === inFlightToken) {
    await sleep(320)
    if (token !== inFlightToken || currentPhase !== 'ChampSelect') return
    skins = await lcu.getSkinCarouselSkins().catch(() => [])
  }

  if (!Array.isArray(skins) || skins.length === 0) return

  const chosen = pickRandomOwnedSkin(skins, {
    excludeBase: store.get('autoRandomSkinExcludeBase'),
    includeChromas: true,
    currentSkinId,
  })

  if (!chosen || chosen.id === currentSkinId) return
  if (token !== inFlightToken || currentPhase !== 'ChampSelect') return

  try {
    await lcu.setSelectedSkinId(chosen.id)
    const champ = getChampionById(championId)
    const champName = champ?.name || `#${championId}`
    logger.info('[RandomSkin] 已为 %s 随机切换皮肤/炫彩 → %s (ID=%d) ✓', champName, chosen.name, chosen.id)
    if (typeof Toast !== 'undefined') {
      Toast.success(`已随机皮肤：${chosen.name}`)
    }
  } catch (err) {
    logger.warn('[RandomSkin] 切换皮肤失败 (skinId=%d):', chosen.id, err)
  }
}

function handleSession(session: ChampSelectSession) {
  if (!store.get('autoRandomSkin')) return
  const locked = getLockedLocalChampion(session)
  if (!locked) {
    lastRandomizedChampId = 0
    return
  }

  if (locked.championId === lastRandomizedChampId) return
  lastRandomizedChampId = locked.championId
  const token = ++inFlightToken
  void triggerRandomSkinForChampion(locked.championId, locked.selectedSkinId, token)
}

function resetSession() {
  inFlightToken++
  lastRandomizedChampId = 0
}

function handlePhaseChange(nextPhase: GameflowPhase) {
  if (nextPhase === currentPhase) return
  currentPhase = nextPhase
  if (nextPhase !== 'ChampSelect') {
    resetSession()
    return
  }
  resetSession()
  void lcu.getChampSelectSession().then((session) => {
    if (currentPhase === 'ChampSelect') handleSession(session)
  }).catch(() => { /* ignore */ })
}

export function updateAutoRandomSkin(enabled: boolean) {
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
        resetSession()
        return
      }
      if (event.eventType === 'Create' || event.eventType === 'Update') {
        currentPhase = 'ChampSelect'
        handleSession(event.data as ChampSelectSession)
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

    logger.info('[RandomSkin] 锁定英雄自动随机皮肤/炫彩已启用 ✓')
  } else if (!enabled && unsubAll) {
    unsubAll()
    unsubAll = null
    currentPhase = 'None'
    resetSession()
    logger.info('[RandomSkin] 锁定英雄自动随机皮肤/炫彩已禁用')
  }
}
