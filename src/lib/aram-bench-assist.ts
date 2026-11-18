import type { HistoryMastery } from '@/lib/history-api'
import { shouldSkipPlayerScoreGame } from '@/lib/player-score'
import type { SgpGameSummaryLol } from '@/types/sgp'

export interface WishlistSwapState {
  previousMyChampionId: number
  lastAutoSwapTargetId: number
  lastAutoSwapAt: number
  inFlightTargetId: number
  suppressedChampionIds: Set<number>
}

export function createWishlistSwapState(): WishlistSwapState {
  return {
    previousMyChampionId: 0,
    lastAutoSwapTargetId: 0,
    lastAutoSwapAt: 0,
    inFlightTargetId: 0,
    suppressedChampionIds: new Set<number>(),
  }
}

export interface BenchWishlistMatch {
  championId: number
  /** 1-based 优先级序号（1 为最高优先级） */
  rank: number
  /** 当前会话内玩家曾手动换下/随走该英雄，不再自动抢回 */
  isSuppressed: boolean
}

export interface WishlistSwapDecision {
  /** 替补席中命中心愿单的所有英雄（按优先级升序） */
  benchMatches: BenchWishlistMatch[]
  /** 当前手中英雄在心愿单中的 1-based 排名（不在心愿单中为 null） */
  myWishlistRank: number | null
  /** 需要立即执行 benchSwap 的目标英雄 ID（无需或不满足条件时为 null） */
  autoSwapTargetId: number | null
  /** 目标英雄的 1-based 优先级排名 */
  autoSwapTargetRank: number | null
}

export function planWishlistBenchSwap(params: {
  benchEnabled: boolean
  wishlistEnabled: boolean
  autoSwapEnabled: boolean
  wishlistIds: readonly number[]
  myChampionId: number
  benchChampionIds: readonly number[]
  state: WishlistSwapState
  now?: number
  cooldownMs?: number
}): WishlistSwapDecision {
  const {
    benchEnabled,
    wishlistEnabled,
    autoSwapEnabled,
    wishlistIds,
    myChampionId,
    benchChampionIds,
    state,
    now = Date.now(),
    cooldownMs = 1200,
  } = params

  const benchSet = new Set(benchChampionIds.filter((id) => id > 0))

  // 检测玩家手动换下/重随：如果上一帧手里的英雄这一帧跑到了替补席，且新英雄不是我们自动换的目标，说明玩家主动放弃了它
  if (
    state.previousMyChampionId > 0
    && myChampionId > 0
    && myChampionId !== state.previousMyChampionId
  ) {
    if (benchSet.has(state.previousMyChampionId) && myChampionId !== state.lastAutoSwapTargetId) {
      state.suppressedChampionIds.add(state.previousMyChampionId)
    }
  }
  if (myChampionId > 0 && state.suppressedChampionIds.has(myChampionId)) {
    state.suppressedChampionIds.delete(myChampionId)
  }
  if (myChampionId > 0) {
    state.previousMyChampionId = myChampionId
  }

  if (!benchEnabled || !wishlistEnabled || wishlistIds.length === 0) {
    return {
      benchMatches: [],
      myWishlistRank: null,
      autoSwapTargetId: null,
      autoSwapTargetRank: null,
    }
  }

  const rankByChamp = new Map<number, number>()
  wishlistIds.forEach((id, idx) => {
    if (id > 0 && !rankByChamp.has(id)) {
      rankByChamp.set(id, idx + 1)
    }
  })

  const myWishlistRank = myChampionId > 0 ? (rankByChamp.get(myChampionId) ?? null) : null
  const effectiveMyRank = myWishlistRank ?? Number.POSITIVE_INFINITY

  const benchMatches: BenchWishlistMatch[] = []
  for (const champId of benchSet) {
    const rank = rankByChamp.get(champId)
    if (rank != null) {
      benchMatches.push({
        championId: champId,
        rank,
        isSuppressed: state.suppressedChampionIds.has(champId),
      })
    }
  }
  benchMatches.sort((a, b) => a.rank - b.rank)

  if (!autoSwapEnabled || state.inFlightTargetId > 0 || now - state.lastAutoSwapAt < cooldownMs) {
    return {
      benchMatches,
      myWishlistRank,
      autoSwapTargetId: null,
      autoSwapTargetRank: null,
    }
  }

  const bestUpgrade = benchMatches.find((m) => !m.isSuppressed && m.rank < effectiveMyRank)
  return {
    benchMatches,
    myWishlistRank,
    autoSwapTargetId: bestUpgrade ? bestUpgrade.championId : null,
    autoSwapTargetRank: bestUpgrade ? bestUpgrade.rank : null,
  }
}

export type TeammateProficiencyTier = 'ace' | 'skilled'

export interface TeammateProficiencySource {
  floor: number
  puuid: string
  name: string
  games?: SgpGameSummaryLol[]
  masteries?: HistoryMastery[]
}

export interface TeammateChampionHint {
  floor: number
  puuid: string
  name: string
  championId: number
  tier: TeammateProficiencyTier
  recentGames: number
  recentWins: number
  winRate: number | null
  championLevel: number
  championPoints: number
  score: number
  statsText: string
  summaryText: string
}

function formatPointsShort(points: number): string {
  if (points >= 10000) {
    return `${(points / 10000).toFixed(points >= 100000 ? 0 : 1)}万点`
  }
  return `${points}点`
}

export function buildTeammateProficiencyIndex(
  teammates: readonly TeammateProficiencySource[],
): Map<number, TeammateChampionHint[]> {
  const index = new Map<number, TeammateChampionHint[]>()

  for (const mate of teammates) {
    if (!mate.puuid) continue

    const gameStats = new Map<number, { games: number; wins: number }>()
    const seenGameIds = new Set<number>()
    for (const game of mate.games ?? []) {
      const gameId = game?.json?.gameId
      if (typeof gameId === 'number' && gameId > 0) {
        if (seenGameIds.has(gameId)) continue
        seenGameIds.add(gameId)
      }
      if (shouldSkipPlayerScoreGame(game, mate.puuid)) continue
      const p = game.json?.participants?.find((pt) => pt.puuid === mate.puuid)
      if (!p || !(p.championId > 0)) continue
      const cur = gameStats.get(p.championId) ?? { games: 0, wins: 0 }
      cur.games += 1
      if (p.win) cur.wins += 1
      gameStats.set(p.championId, cur)
    }

    const sortedMasteries = [...(mate.masteries ?? [])]
      .filter((m): m is HistoryMastery => Boolean(m && m.championId > 0))
      .sort((a, b) => (b.championPoints ?? 0) - (a.championPoints ?? 0))

    const masteryByChamp = new Map<number, { item: HistoryMastery; rank: number }>()
    sortedMasteries.forEach((m, idx) => {
      if (!masteryByChamp.has(m.championId)) {
        masteryByChamp.set(m.championId, { item: m, rank: idx + 1 })
      }
    })

    const candidateChampIds = new Set<number>([
      ...gameStats.keys(),
      ...sortedMasteries.slice(0, 6).map((m) => m.championId),
    ])

    for (const championId of candidateChampIds) {
      const g = gameStats.get(championId)
      const mEntry = masteryByChamp.get(championId)
      const m = mEntry?.item
      const masteryRank = mEntry?.rank ?? 999
      const recentGames = g?.games ?? 0
      const recentWins = g?.wins ?? 0
      const winRate = recentGames > 0 ? recentWins / recentGames : null
      const championLevel = m?.championLevel ?? 0
      const championPoints = m?.championPoints ?? 0

      // 仅将队友真正排名前列的招牌英雄或近期高频高胜率英雄识别为绝活/熟练，避免高账号等级玩家满屏泛滥
      const recentSlump = recentGames >= 3 && winRate !== null && winRate < 0.45
      const isAce =
        (recentGames >= 4 && winRate !== null && winRate >= 0.6)
        || (recentGames >= 3 && winRate !== null && winRate >= 0.66 && championPoints >= 30000)
        || (!recentSlump && masteryRank <= 3 && (championPoints >= 80000 || championLevel >= 12))

      const isSkilled =
        !isAce && !recentSlump && (
          (recentGames >= 3 && winRate !== null && winRate >= 0.52)
          || (masteryRank <= 6 && (championPoints >= 35000 || championLevel >= 7))
        )

      if (!isAce && !isSkilled) continue

      const tier: TeammateProficiencyTier = isAce ? 'ace' : 'skilled'
      const score =
        (tier === 'ace' ? 1000 : 0)
        + recentGames * 26
        + (winRate !== null ? Math.round(winRate * 100) : 0)
        + Math.min(350, Math.round(championPoints / 1000))

      const parts: string[] = []
      if (recentGames >= 2 && winRate !== null) {
        parts.push(`${recentGames}场 ${Math.round(winRate * 100)}%胜`)
      } else if (recentGames === 1 && winRate !== null) {
        parts.push(`近期1场${recentWins > 0 ? '胜' : '负'}`)
      }
      if (championLevel >= 5 || championPoints >= 20000) {
        parts.push(`Lv.${championLevel} · ${formatPointsShort(championPoints)}`)
      }

      const displayName = mate.name || `${mate.floor}楼队友`
      const statsText = parts.join(' · ')
      const summaryText = `${mate.floor}楼 ${displayName} [${tier === 'ace' ? '绝活' : '熟练'}]${statsText ? ` · ${statsText}` : ''}`

      const list = index.get(championId) ?? []
      list.push({
        floor: mate.floor,
        puuid: mate.puuid,
        name: displayName,
        championId,
        tier,
        recentGames,
        recentWins,
        winRate,
        championLevel,
        championPoints,
        score,
        statsText,
        summaryText,
      })
      index.set(championId, list)
    }
  }

  for (const list of index.values()) {
    list.sort((a, b) => b.score - a.score || a.floor - b.floor)
  }

  return index
}

export function formatBenchTeammateBadge(hints: readonly TeammateChampionHint[]): {
  label: string
  tier: TeammateProficiencyTier
} | null {
  if (hints.length === 0) return null
  const top = hints[0]
  const uniqueFloors = new Set(hints.map((h) => h.floor)).size
  const suffix = top.tier === 'ace' ? '绝活' : '熟练'
  const moreMark = uniqueFloors > 1 ? '+' : ''
  return {
    label: `${top.floor}楼${suffix}${moreMark}`,
    tier: top.tier,
  }
}
