/**
 * E2（上）：对局结束智能自动点赞
 *
 * - `smart` 策略（默认）：读取赛后统计 + 组排/好友列表 + 小本本标记
 *   - 坚决跳过小本本标记为「红色 · 避雷」的玩家
 *   - 优先投给：组排好友 / 小本本大腿好评队友 -> 本局 MVP / 最高 Akari 评分队友 -> 其余正常队友 -> 高光对手
 * - `random` 策略：原版随机打散给票
 */

import { getTrackedPremadePuuids } from '@/lib/features/auto-accept-swap'
import { lcu, LcuEventUri, type GameflowPhase, type LCUEventMessage } from '@/lib/lcu'
import { logger } from '@/lib/logger'
import {
  evaluateMatchMvpAndScores,
  normalizeEogStatsToGameSummary,
  planSmartHonorTargets,
  type HonorCategoryType,
} from '@/lib/postgame-intel'
import { store } from '@/lib/store'
import { sleep } from '@/lib/utils'

const HONOR_CATEGORIES: readonly HonorCategoryType[] = ['HEART', 'COOL', 'SHOTCALLER']

export interface HonorBallot {
  gameId: number
  eligibleAllies: Array<{
    botPlayer: boolean
    championId: number
    championName: string
    puuid: string
    summonerId: number
    role: string
  }>
  eligibleOpponents: Array<{
    botPlayer: boolean
    championId: number
    championName: string
    puuid: string
    summonerId: number
    role: string
  }>
  honoredPlayers: unknown[]
  votePool: {
    fromGamePlayed: number
    fromHighHonor: number
    fromRecentHonors: number
    fromRollover: number
    votes: number
  }
}

export async function autoHonorTeammate() {
  try {
    const ballotRes = await fetch('/lol-honor-v2/v1/ballot')
    if (!ballotRes.ok) {
      logger.info('[AutoHonor] 当前没有待点赞的对局')
      return
    }

    const ballot = (await ballotRes.json()) as HonorBallot
    const allies = [...(ballot.eligibleAllies || [])]
    const opponents = [...(ballot.eligibleOpponents || [])]

    if (allies.length === 0 && opponents.length === 0) {
      logger.info('[AutoHonor] 没有可点赞的玩家')
      return
    }

    const votes = ballot.votePool?.votes ?? 1
    const strategy = store.get('autoHonorStrategy')

    if (strategy === 'smart' || strategy === 'friends_only') {
      const onlyFriends = strategy === 'friends_only'
      let friendPuuids = new Set<string>()
      try {
        const friends = await lcu.getFriends()
        if (Array.isArray(friends)) {
          friendPuuids = new Set(friends.map((f) => f.puuid).filter(Boolean))
        }
      } catch { /* ignore */ }

      const premadePuuids = getTrackedPremadePuuids()
      const hasAnyFriendCandidate = [...allies, ...opponents].some(
        (c) => Boolean(c.puuid && (premadePuuids.has(c.puuid) || friendPuuids.has(c.puuid))),
      )

      let perfMap = new Map<string, import('@/lib/postgame-intel').MatchPlayerPerformanceBadge>()
      if (!onlyFriends || hasAnyFriendCandidate) {
        let eog = await lcu.getEogStatsBlock()
        if (!eog && !onlyFriends) {
          await sleep(350)
          eog = await lcu.getEogStatsBlock()
        }
        const gameSummary = normalizeEogStatsToGameSummary(eog)
        perfMap = evaluateMatchMvpAndScores(gameSummary)
      }

      const planned = planSmartHonorTargets({
        votes,
        allies,
        opponents,
        tagsMap: store.get('playerTags'),
        premadePuuids,
        friendPuuids,
        performanceByPuuid: perfMap,
        onlyFriends,
      })

      const honoredLabels: string[] = []
      for (let i = 0; i < planned.length; i++) {
        const target = planned[i]
        const honorRes = await fetch('/lol-honor-v2/v1/honor-player', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            puuid: target.puuid,
            summonerId: target.summonerId,
            gameId: ballot.gameId,
            honorCategory: target.category,
          }),
        })

        if (honorRes.ok) {
          honoredLabels.push(`${target.championName}（${target.reason}）`)
          logger.info('[AutoHonor] %s第%d票 ✓ → [%s] %s (%s)', onlyFriends ? '仅好友' : '智能', i + 1, target.category, target.championName, target.reason)
        } else {
          logger.error('[AutoHonor] 第%d票失败:', i + 1, honorRes.status, await honorRes.text())
        }
      }

      // 若本局未投满票（例如「仅好友」模式下单排无好友，或只有 1 位双排好友），主动提交 OPT_OUT 结束荣誉界面防止卡停
      if (planned.length < votes) {
        await fetch('/lol-honor-v2/v1/honor-player', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            puuid: '',
            summonerId: 0,
            gameId: ballot.gameId,
            honorCategory: 'OPT_OUT',
          }),
        }).catch(() => {})
        if (planned.length === 0) {
          logger.info('[AutoHonor] %s：无匹配目标，已自动跳过荣誉投票', onlyFriends ? '仅好友模式' : '智能点赞')
        }
      }

      if (honoredLabels.length > 0 && typeof Toast !== 'undefined') {
        Toast.success(`${onlyFriends ? '好友点赞' : '智能点赞'}：${honoredLabels.join('、')}`)
      }
      return
    }

    // random 策略：洗牌随机给票
    for (let i = allies.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[allies[i], allies[j]] = [allies[j], allies[i]]
    }
    for (let i = opponents.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[opponents[i], opponents[j]] = [opponents[j], opponents[i]]
    }

    const targets = [...allies, ...opponents].slice(0, votes)
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]
      const category = HONOR_CATEGORIES[Math.floor(Math.random() * HONOR_CATEGORIES.length)]
      const isAlly = i < allies.length

      const honorRes = await fetch('/lol-honor-v2/v1/honor-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          puuid: target.puuid,
          summonerId: target.summonerId,
          gameId: ballot.gameId,
          honorCategory: category,
        }),
      })

      if (honorRes.ok) {
        logger.info('[AutoHonor] 第%d票 ✓ → [%s] 给了 %s%s', i + 1, category, target.championName, isAlly ? '' : ' (对手)')
      } else {
        logger.error('[AutoHonor] 第%d票失败:', i + 1, honorRes.status, await honorRes.text())
      }
    }
  } catch (err) {
    logger.error('[AutoHonor] 自动点赞异常:', err)
  }
}

let autoHonorUnsub: (() => void) | null = null

export function updateAutoHonor(enabled: boolean) {
  if (enabled && !autoHonorUnsub) {
    autoHonorUnsub = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      const phase = event.data as GameflowPhase
      if (phase === 'PreEndOfGame') {
        void autoHonorTeammate()
      }
    })
    logger.info('Auto honor enabled ✓')
  } else if (!enabled && autoHonorUnsub) {
    autoHonorUnsub()
    autoHonorUnsub = null
    logger.info('Auto honor disabled')
  }
}
