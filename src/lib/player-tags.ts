import { useSyncExternalStore } from 'react'
import { store } from '@/lib/store'
import type { SgpGameSummaryLol, SgpParticipantLol } from '@/types/sgp'

export type PlayerTagTone = 'carry' | 'good' | 'note' | 'warn' | 'avoid'

export interface PlayerTagRecord {
  puuid: string
  name: string
  label: string
  tone: PlayerTagTone
  note: string
  serverId?: string
  matchId?: string
  updatedAt: number
}

export interface PlayerTagPreset {
  label: string
  tone: PlayerTagTone
  hint: string
}

export const PLAYER_TAG_PRESETS: readonly PlayerTagPreset[] = [
  { label: '大腿', tone: 'carry', hint: '操作意识出色，值得信赖' },
  { label: '绝活', tone: 'good', hint: '特定英雄熟练度极高' },
  { label: '心态稳', tone: 'note', hint: '逆风不摆烂、沟通良好' },
  { label: '需注意', tone: 'warn', hint: '状态起伏大或打法激进' },
  { label: '避雷', tone: 'avoid', hint: '挂机、演员或严重影响体验' },
]

const VALID_TONES = new Set<PlayerTagTone>(['carry', 'good', 'note', 'warn', 'avoid'])

export function normalizePlayerTagRecord(raw: unknown): PlayerTagRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const puuid = typeof item.puuid === 'string' ? item.puuid.trim() : ''
  if (!puuid) return null
  const rawTone = typeof item.tone === 'string' ? item.tone.trim() as PlayerTagTone : 'note'
  const tone: PlayerTagTone = VALID_TONES.has(rawTone) ? rawTone : 'note'
  const label = (typeof item.label === 'string' ? item.label.trim() : '').slice(0, 10) || '标记'
  const note = (typeof item.note === 'string' ? item.note.trim() : '').slice(0, 200)
  const name = (typeof item.name === 'string' ? item.name.trim() : '').slice(0, 80)
  const serverId = typeof item.serverId === 'string' && item.serverId.trim() ? item.serverId.trim() : undefined
  const matchId = typeof item.matchId === 'string' && item.matchId.trim() ? item.matchId.trim() : undefined
  const updatedAt = typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now()

  return {
    puuid,
    name,
    label,
    tone,
    note,
    ...(serverId ? { serverId } : {}),
    ...(matchId ? { matchId } : {}),
    updatedAt,
  }
}

export function normalizePlayerTagsMap(raw: unknown): Record<string, PlayerTagRecord> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: Record<string, PlayerTagRecord> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalized = normalizePlayerTagRecord({ ...(value && typeof value === 'object' ? value : {}), puuid: (value as PlayerTagRecord | undefined)?.puuid || key })
    if (normalized) result[normalized.puuid] = normalized
  }
  return result
}

export function getPlayerTag(puuid: string): PlayerTagRecord | null {
  if (!puuid) return null
  const map = store.get('playerTags')
  return map?.[puuid] ?? null
}

export function upsertPlayerTag(input: {
  puuid: string
  name?: string
  label: string
  tone: PlayerTagTone
  note?: string
  serverId?: string
  matchId?: string
}): PlayerTagRecord | null {
  const puuid = input.puuid.trim()
  if (!puuid) return null
  const current = store.get('playerTags') ?? {}
  const existing = current[puuid]
  const record = normalizePlayerTagRecord({
    puuid,
    name: input.name?.trim() || existing?.name || '',
    label: input.label,
    tone: input.tone,
    note: input.note ?? '',
    serverId: input.serverId ?? existing?.serverId,
    matchId: input.matchId ?? existing?.matchId,
    updatedAt: Date.now(),
  })
  if (!record) return null
  store.set('playerTags', {
    ...current,
    [puuid]: record,
  })
  return record
}

export function removePlayerTag(puuid: string): boolean {
  if (!puuid) return false
  const current = store.get('playerTags') ?? {}
  if (!(puuid in current)) return false
  const next = { ...current }
  delete next[puuid]
  store.set('playerTags', next)
  return true
}

const subscribePlayerTags = (listener: () => void) => store.onChange('playerTags', listener)
const getPlayerTagsSnapshot = () => store.get('playerTags')

export function usePlayerTags(): Record<string, PlayerTagRecord> {
  return useSyncExternalStore(subscribePlayerTags, getPlayerTagsSnapshot, getPlayerTagsSnapshot)
}

export function usePlayerTag(puuid: string): PlayerTagRecord | null {
  const map = usePlayerTags()
  return puuid ? (map[puuid] ?? null) : null
}

function subscribePlayerTagEnabled(callback: () => void): () => void {
  return store.onChange('playerTagEnabled', () => callback())
}

function getPlayerTagEnabledSnapshot(): boolean {
  return Boolean(store.get('playerTagEnabled'))
}

export function usePlayerTagFeatureEnabled(): boolean {
  return useSyncExternalStore(subscribePlayerTagEnabled, getPlayerTagEnabledSnapshot, getPlayerTagEnabledSnapshot)
}

function subscribeEncounterAlertEnabled(callback: () => void): () => void {
  return store.onChange('encounterAlertEnabled', () => callback())
}

function getEncounterAlertEnabledSnapshot(): boolean {
  return Boolean(store.get('encounterAlertEnabled'))
}

export function useEncounterAlertEnabled(): boolean {
  return useSyncExternalStore(subscribeEncounterAlertEnabled, getEncounterAlertEnabledSnapshot, getEncounterAlertEnabledSnapshot)
}

function subscribePostgameEnhancement(callback: () => void): () => void {
  return store.onChange('postgameEnhancement', () => callback())
}

function getPostgameEnhancementSnapshot(): boolean {
  return Boolean(store.get('postgameEnhancement'))
}

export function usePostgameEnhancementEnabled(): boolean {
  return useSyncExternalStore(subscribePostgameEnhancement, getPostgameEnhancementSnapshot, getPostgameEnhancementSnapshot)
}

export interface RecentEncounterMatch {
  gameId: number
  gameCreation: number
  relation: 'ally' | 'enemy'
  selfWin: boolean
  targetChampionId: number
  kills: number
  deaths: number
  assists: number
}

export interface RecentEncounterSummary {
  puuid: string
  total: number
  allyCount: number
  enemyCount: number
  selfWins: number
  selfLosses: number
  recent: RecentEncounterMatch[]
}

function getParticipantSide(p: SgpParticipantLol, game: SgpGameSummaryLol): number {
  if (game.json.gameMode === 'CHERRY' && p.playerSubteamId && p.playerSubteamId > 0) {
    return p.playerSubteamId
  }
  return p.teamId
}

function isRemakeOrInvalid(game: SgpGameSummaryLol, selfPlayer: SgpParticipantLol): boolean {
  if (game.json.gameDuration < 240 && selfPlayer.gameEndedInEarlySurrender) return true
  if (typeof selfPlayer.win !== 'boolean') return true
  return false
}

/**
 * 基于当前登录玩家近期对局记录，计算与其他每位玩家的同局撞车统计
 */
export function buildEncounterLookup(games: SgpGameSummaryLol[], selfPuuid: string): Map<string, RecentEncounterSummary> {
  const map = new Map<string, RecentEncounterSummary>()
  if (!selfPuuid || !Array.isArray(games) || games.length === 0) return map

  const seenGameIds = new Set<number>()
  for (const game of games) {
    const gameId = game?.json?.gameId
    if (!gameId || seenGameIds.has(gameId)) continue
    seenGameIds.add(gameId)

    const participants = game.json.participants
    if (!Array.isArray(participants)) continue
    const selfPlayer = participants.find((p) => p.puuid === selfPuuid)
    if (!selfPlayer || isRemakeOrInvalid(game, selfPlayer)) continue

    const selfSide = getParticipantSide(selfPlayer, game)
    for (const p of participants) {
      if (!p.puuid || p.puuid === selfPuuid) continue
      const relation: 'ally' | 'enemy' = getParticipantSide(p, game) === selfSide ? 'ally' : 'enemy'
      let summary = map.get(p.puuid)
      if (!summary) {
        summary = {
          puuid: p.puuid,
          total: 0,
          allyCount: 0,
          enemyCount: 0,
          selfWins: 0,
          selfLosses: 0,
          recent: [],
        }
        map.set(p.puuid, summary)
      }
      summary.total += 1
      if (relation === 'ally') summary.allyCount += 1
      else summary.enemyCount += 1
      if (selfPlayer.win) summary.selfWins += 1
      else summary.selfLosses += 1
      if (summary.recent.length < 4) {
        summary.recent.push({
          gameId,
          gameCreation: game.json.gameCreation,
          relation,
          selfWin: Boolean(selfPlayer.win),
          targetChampionId: p.championId || 0,
          kills: p.kills ?? 0,
          deaths: p.deaths ?? 0,
          assists: p.assists ?? 0,
        })
      }
    }
  }

  return map
}
