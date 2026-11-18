/**
 * 赛后结算与战报情报模型（E2 纯函数层）：
 * - 统一单局评分（0–16 Akari 单局趋势分 + 兜底战力分）及全场 MVP / SVP 归属计算
 * - LCU `/lol-end-of-game/v1/eog-stats-block` 转换为标准 `SgpGameSummaryLol`
 * - 智能自动点赞决策：坚决跳过「避雷」玩家，优先开黑/大腿/好评队友 -> 本局最高评分队友
 */

import { calculateAkariGameTrendScore } from '@/lib/akari-score'
import { finite, getOutcome, teamKey } from '@/lib/history-model'
import type { PlayerTagRecord } from '@/lib/player-tags'
import type { SgpGameSummaryLol, SgpParticipantLol } from '@/types/sgp'

// ==================== 单局评分与 MVP / SVP 计算 ====================

export interface MatchPlayerPerformanceBadge {
  puuid: string
  summonerId: number
  score: number
  award: 'MVP' | 'SVP' | null
}

function fallbackSingleGameScore(player: SgpParticipantLol, team: SgpParticipantLol[]): number {
  const kills = finite(player.kills) ?? 0
  const deaths = finite(player.deaths) ?? 0
  const assists = finite(player.assists) ?? 0
  const kda = (kills + assists) / Math.max(1, deaths)
  const teamKills = Math.max(1, team.reduce((s, p) => s + (finite(p.kills) ?? 0), 0))
  const teamDmg = Math.max(1, team.reduce((s, p) => s + (finite(p.totalDamageDealtToChampions) ?? 0), 0))
  const kp = (kills + assists) / teamKills
  const dmgShare = (finite(player.totalDamageDealtToChampions) ?? 0) / teamDmg
  const raw = Math.min(4.5, Math.sqrt(Math.max(0, kda)) * 1.4) + kp * 4.5 + dmgShare * 9.5 + (player.win ? 0.5 : 0)
  return Number(Math.max(1, Math.min(16, raw)).toFixed(2))
}

export function evaluateMatchMvpAndScores(game: SgpGameSummaryLol | null | undefined): Map<string, MatchPlayerPerformanceBadge> {
  const result = new Map<string, MatchPlayerPerformanceBadge>()
  const participants = game?.json?.participants
  if (!game || !Array.isArray(participants) || participants.length < 2) {
    return result
  }

  // Group by team
  const byTeam = new Map<number, SgpParticipantLol[]>()
  for (const p of participants) {
    const key = teamKey(p, game)
    const list = byTeam.get(key) ?? []
    list.push(p)
    byTeam.set(key, list)
  }

  // Arena (CHERRY) has >2 subteams; standard 5v5 has 2 teams
  const isArena = game.json.gameMode === 'CHERRY' || byTeam.size > 2

  for (const [, teamPlayers] of byTeam) {
    if (teamPlayers.length < 2 && !isArena) continue

    let bestKey = ''
    let bestScore = -1
    let bestKillsAndAssists = -1
    const outcome = getOutcome(game, teamPlayers[0])
    if (outcome !== 'win' && outcome !== 'loss') continue

    for (const p of teamPlayers) {
      const idKey = p.puuid || (p.summonerId ? `sid:${p.summonerId}` : '')
      if (!idKey) continue

      const akariScore = p.puuid ? calculateAkariGameTrendScore(game, p.puuid) : null
      const score = akariScore !== null ? Number(akariScore.toFixed(2)) : fallbackSingleGameScore(p, teamPlayers)

      result.set(idKey, {
        puuid: p.puuid || '',
        summonerId: p.summonerId || 0,
        score,
        award: null,
      })

      const ka = (finite(p.kills) ?? 0) + (finite(p.assists) ?? 0)
      if (score > bestScore || (score === bestScore && ka > bestKillsAndAssists)) {
        bestScore = score
        bestKillsAndAssists = ka
        bestKey = idKey
      }
    }

    if (bestKey && !isArena && teamPlayers.length >= 2) {
      const badge = result.get(bestKey)
      if (badge) {
        badge.award = outcome === 'win' ? 'MVP' : 'SVP'
      }
    }
  }

  return result
}

// ==================== LCU EOG Stats Block 归一化 ====================

export interface LcuEogPlayer {
  puuid?: string
  summonerId?: number
  summonerName?: string
  riotIdGameName?: string
  riotIdTagLine?: string
  championId?: number
  botPlayer?: boolean
  isLocalPlayer?: boolean
  teamId?: number
  stats?: Record<string, number | boolean | undefined>
}

export interface LcuEogTeam {
  teamId?: number
  isWinningTeam?: boolean
  players?: LcuEogPlayer[]
}

export interface LcuEogStatsBlock {
  gameId?: number
  gameLength?: number
  gameMode?: string
  gameType?: string
  queueType?: string
  teams?: LcuEogTeam[]
  localPlayer?: LcuEogPlayer
}

function readStatNum(stats: Record<string, number | boolean | undefined> | undefined, ...keys: string[]): number {
  if (!stats) return 0
  for (const k of keys) {
    const v = stats[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return 0
}

export function normalizeEogStatsToGameSummary(eog: LcuEogStatsBlock | null | undefined): SgpGameSummaryLol | null {
  if (!eog || !Array.isArray(eog.teams) || eog.teams.length === 0) return null

  const participants: SgpParticipantLol[] = []
  const sgpTeams: SgpGameSummaryLol['json']['teams'] = []
  let participantId = 1

  for (const team of eog.teams) {
    const tid = typeof team.teamId === 'number' ? team.teamId : (sgpTeams.length === 0 ? 100 : 200)
    const isWin = Boolean(team.isWinningTeam)
    sgpTeams.push({
      teamId: tid,
      win: isWin,
      bans: [],
      objectives: {
        baron: { first: false, kills: 0 },
        champion: { first: false, kills: 0 },
        dragon: { first: false, kills: 0 },
        horde: { first: false, kills: 0 },
        inhibitor: { first: false, kills: 0 },
        riftHerald: { first: false, kills: 0 },
        tower: { first: false, kills: 0 },
      },
    })

    for (const p of team.players ?? []) {
      const st = p.stats
      const winFlag = typeof st?.WIN === 'boolean'
        ? st.WIN
        : typeof st?.WIN === 'number'
          ? st.WIN > 0
          : isWin

      participants.push({
        participantId: participantId++,
        puuid: p.puuid || '',
        summonerId: p.summonerId || 0,
        summonerName: p.summonerName || p.riotIdGameName || '',
        riotIdGameName: p.riotIdGameName || p.summonerName || '',
        riotIdTagline: p.riotIdTagLine || '',
        championId: p.championId || 0,
        championName: '',
        teamId: p.teamId || tid,
        teamPosition: '',
        individualPosition: '',
        lane: '',
        role: '',
        win: winFlag,
        gameEndedInEarlySurrender: false,
        gameEndedInSurrender: false,
        kills: readStatNum(st, 'CHAMPIONS_KILLED', 'kills'),
        deaths: readStatNum(st, 'NUM_DEATHS', 'deaths'),
        assists: readStatNum(st, 'ASSISTS', 'assists'),
        totalDamageDealtToChampions: readStatNum(st, 'TOTAL_DAMAGE_DEALT_TO_CHAMPIONS', 'totalDamageDealtToChampions'),
        physicalDamageDealtToChampions: readStatNum(st, 'PHYSICAL_DAMAGE_DEALT_TO_CHAMPIONS', 'physicalDamageDealtToChampions'),
        magicDamageDealtToChampions: readStatNum(st, 'MAGIC_DAMAGE_DEALT_TO_CHAMPIONS', 'magicDamageDealtToChampions'),
        trueDamageDealtToChampions: readStatNum(st, 'TRUE_DAMAGE_DEALT_TO_CHAMPIONS', 'trueDamageDealtToChampions'),
        totalDamageTaken: readStatNum(st, 'TOTAL_DAMAGE_TAKEN', 'totalDamageTaken'),
        totalHeal: readStatNum(st, 'TOTAL_HEAL', 'totalHeal'),
        totalHealsOnTeammates: readStatNum(st, 'TOTAL_HEAL_ON_TEAMMATES', 'totalHealsOnTeammates'),
        totalDamageShieldedOnTeammates: readStatNum(st, 'TOTAL_DAMAGE_SHIELDED_ON_TEAMMATES', 'totalDamageShieldedOnTeammates'),
        goldEarned: readStatNum(st, 'GOLD_EARNED', 'goldEarned'),
        totalMinionsKilled: readStatNum(st, 'MINIONS_KILLED', 'totalMinionsKilled'),
        neutralMinionsKilled: readStatNum(st, 'NEUTRAL_MINIONS_KILLED', 'neutralMinionsKilled'),
        visionScore: readStatNum(st, 'VISION_SCORE', 'visionScore'),
        timeCCingOthers: readStatNum(st, 'TIME_CCING_OTHERS', 'timeCCingOthers'),
      } as unknown as SgpParticipantLol)
    }
  }

  if (participants.length === 0) return null

  return {
    metadata: {
      product: 'lol',
      tags: [],
      participants: participants.map((p) => p.puuid).filter(Boolean),
      timestamp: String(Date.now()),
      data_version: '2',
      info_type: 'game_summary',
      match_id: String(eog.gameId || 0),
      private: false,
    },
    json: {
      gameCreation: Date.now(),
      gameDuration: Math.max(300, eog.gameLength || 1200),
      gameId: eog.gameId || 0,
      gameMode: eog.gameMode || 'CLASSIC',
      gameType: 'MATCHED_GAME',
      gameVersion: '',
      mapId: 11,
      platformId: '',
      queueId: 420,
      seasonId: 0,
      participants,
      teams: sgpTeams,
    } as unknown as SgpGameSummaryLol['json'],
  }
}

// ==================== 智能自动点赞决策 ====================

export type HonorCategoryType = 'HEART' | 'COOL' | 'SHOTCALLER'

export interface HonorCandidateInput {
  puuid: string
  summonerId: number
  championId: number
  championName: string
  botPlayer?: boolean
  isOpponent?: boolean
}

export interface PlannedHonorVote {
  puuid: string
  summonerId: number
  championName: string
  isOpponent: boolean
  category: HonorCategoryType
  reason: string
}

export function planSmartHonorTargets(params: {
  votes: number
  allies: readonly HonorCandidateInput[]
  opponents: readonly HonorCandidateInput[]
  tagsMap: Record<string, PlayerTagRecord>
  premadePuuids?: ReadonlySet<string>
  friendPuuids?: ReadonlySet<string>
  performanceByPuuid?: ReadonlyMap<string, MatchPlayerPerformanceBadge>
  onlyFriends?: boolean
}): PlannedHonorVote[] {
  const {
    votes,
    allies,
    opponents,
    tagsMap,
    premadePuuids = new Set<string>(),
    friendPuuids = new Set<string>(),
    performanceByPuuid = new Map<string, MatchPlayerPerformanceBadge>(),
    onlyFriends = false,
  } = params

  if (!(votes > 0)) return []

  const scoreCandidate = (c: HonorCandidateInput, isOpponent: boolean) => {
    if (c.botPlayer) return null
    const tag = c.puuid ? tagsMap[c.puuid] : undefined
    // 坚决跳过小本本「避雷」玩家
    if (tag?.tone === 'avoid') return null

    const isPremade = Boolean(c.puuid && (premadePuuids.has(c.puuid) || friendPuuids.has(c.puuid)))
    if (onlyFriends && !isPremade) return null

    const perf = (c.puuid && performanceByPuuid.get(c.puuid))
      || (c.summonerId ? performanceByPuuid.get(`sid:${c.summonerId}`) : undefined)
    const perfScore = perf?.score ?? 6
    const isPraised = tag?.tone === 'carry' || tag?.tone === 'good'
    const isWarn = tag?.tone === 'warn'

    let priority = isOpponent ? 0 : 1000
    let reason = isOpponent ? (isPremade ? '对面好友' : '对手高光表现') : '队友稳定发挥'
    let category: HonorCategoryType = isPremade ? 'HEART' : 'COOL'

    if (!isOpponent && isPremade) {
      priority += 500
      reason = '组排好友'
      category = 'HEART'
    } else if (!isOpponent && isPraised) {
      priority += 380
      reason = `小本本[${tag?.label}]`
      category = 'HEART'
    }

    if (isWarn) {
      priority -= 250
    }

    if (perf?.award === 'MVP' || perf?.award === 'SVP') {
      priority += 160
      if (!isPremade && !isPraised) {
        reason = `本局 ${perf.award} (${perf.score.toFixed(1)}分)`
      }
      category = 'SHOTCALLER'
    } else if (perf) {
      if (!isPremade && !isPraised) {
        reason = `本局评分 ${perf.score.toFixed(1)}`
      }
      if (perf.score >= 9.5) category = 'SHOTCALLER'
    }

    priority += perfScore * 12

    return {
      candidate: c,
      isOpponent,
      priority,
      category,
      reason,
    }
  }

  const ranked = [
    ...allies.map((a) => scoreCandidate(a, false)),
    ...opponents.map((o) => scoreCandidate(o, true)),
  ].filter((x): x is NonNullable<typeof x> => x !== null)

  ranked.sort((a, b) => b.priority - a.priority)

  return ranked.slice(0, votes).map((entry) => ({
    puuid: entry.candidate.puuid,
    summonerId: entry.candidate.summonerId,
    championName: entry.candidate.championName,
    isOpponent: entry.isOpponent,
    category: entry.category,
    reason: entry.reason,
  }))
}
