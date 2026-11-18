/**
 * 选人阶段增强模型（纯函数层）：
 * - E1：小本本「避雷 / 注意」队友检测与防重复提醒签名
 * - E4：锁定英雄后已拥有皮肤 / 炫彩筛选与随机抽选
 * - E5：楼层互换（Pick Order Swap）与英雄交换（Trade）智能判定
 * - E6：分模式 / 分路秒抢与自动禁用英雄预设解析
 */

import { deobfuscateChampSelectPuuid } from '@/lib/champ-select-puuid'
import type { PlayerTagRecord } from '@/lib/player-tags'
import type { ChampSelectPlayer, ChampSelectSession } from '@/types/lcu'

// ==================== E1：选人阶段小本本避雷预警 ====================

export interface TeammateTagAlertItem {
  floor: number
  cellId: number
  puuid: string
  displayName: string
  championId: number
  tag: PlayerTagRecord
}

export interface TeammateTagAlertResult {
  warnings: TeammateTagAlertItem[]
  positives: TeammateTagAlertItem[]
  alertKey: string
}

export function resolveChampSelectMemberPuuid(
  player: Pick<ChampSelectPlayer, 'puuid' | 'nameVisibilityType' | 'obfuscatedPuuid'>,
  deobfuscate: (obfuscated: string) => string = deobfuscateChampSelectPuuid,
): string {
  if (player.puuid) return player.puuid
  if (player.nameVisibilityType === 'HIDDEN' && player.obfuscatedPuuid) {
    return deobfuscate(player.obfuscatedPuuid)
  }
  return ''
}

export function detectTeammateTagAlerts(
  session: ChampSelectSession | null | undefined,
  tagsMap: Record<string, PlayerTagRecord>,
  deobfuscate: (obfuscated: string) => string = deobfuscateChampSelectPuuid,
): TeammateTagAlertResult {
  if (!session || !Array.isArray(session.myTeam) || !tagsMap) {
    return { warnings: [], positives: [], alertKey: '' }
  }

  const warnings: TeammateTagAlertItem[] = []
  const positives: TeammateTagAlertItem[] = []

  session.myTeam.forEach((player, idx) => {
    if (player.cellId === session.localPlayerCellId) return
    const puuid = resolveChampSelectMemberPuuid(player, deobfuscate)
    if (!puuid) return
    const tag = tagsMap[puuid]
    if (!tag) return

    const liveName = player.gameName
      ? `${player.gameName}${player.tagLine ? `#${player.tagLine}` : ''}`
      : (player.playerAlias || '')
    const displayName = liveName || tag.name || `${idx + 1}楼队友`
    const item: TeammateTagAlertItem = {
      floor: idx + 1,
      cellId: player.cellId,
      puuid,
      displayName,
      championId: player.championId || player.championPickIntent || 0,
      tag,
    }

    if (tag.tone === 'avoid' || tag.tone === 'warn') {
      warnings.push(item)
    } else if (tag.tone === 'carry' || tag.tone === 'good') {
      positives.push(item)
    }
  })

  warnings.sort((a, b) => {
    const rank = (tone: string) => (tone === 'avoid' ? 0 : 1)
    return rank(a.tag.tone) - rank(b.tag.tone) || a.floor - b.floor
  })

  const alertKey = warnings.length > 0
    ? `${session.id || session.gameId || 'cs'}|${warnings.map((w) => `${w.puuid}:${w.tag.tone}:${w.tag.label}`).join(',')}`
    : ''

  return { warnings, positives, alertKey }
}

// ==================== E4：已拥有皮肤 / 炫彩自动随机 ====================

export interface LcuSkinOwnership {
  owned?: boolean
  rental?: { rented?: boolean }
}

export interface LcuSkinCarouselChroma {
  id: number
  name?: string
  unlocked?: boolean
  disabled?: boolean
  ownership?: LcuSkinOwnership
}

export interface LcuSkinCarouselItem {
  id: number
  championId?: number
  name?: string
  isBase?: boolean
  unlocked?: boolean
  disabled?: boolean
  ownership?: LcuSkinOwnership
  childSkins?: LcuSkinCarouselChroma[]
}

export interface SelectableSkinCandidate {
  id: number
  name: string
  isBase: boolean
  isChroma: boolean
}

function isUsableSkinNode(node: { disabled?: boolean; unlocked?: boolean; ownership?: LcuSkinOwnership }): boolean {
  if (node.disabled) return false
  return Boolean(node.unlocked || node.ownership?.owned || node.ownership?.rental?.rented)
}

export function collectSelectableOwnedSkins(
  skins: readonly LcuSkinCarouselItem[],
  options: { excludeBase?: boolean; includeChromas?: boolean } = {},
): SelectableSkinCandidate[] {
  const excludeBase = options.excludeBase ?? true
  const includeChromas = options.includeChromas ?? true
  const seen = new Set<number>()
  const allUsable: SelectableSkinCandidate[] = []

  for (const skin of skins) {
    if (!skin || !(skin.id > 0)) continue
    const isBase = Boolean(
      skin.isBase
      || (skin.championId && skin.id === skin.championId * 1000)
      || skin.id % 1000 === 0,
    )

    if (isUsableSkinNode(skin) && !seen.has(skin.id)) {
      seen.add(skin.id)
      allUsable.push({
        id: skin.id,
        name: skin.name?.trim() || `皮肤 #${skin.id}`,
        isBase,
        isChroma: false,
      })
    }

    if (includeChromas && Array.isArray(skin.childSkins)) {
      for (const chroma of skin.childSkins) {
        if (!chroma || !(chroma.id > 0) || seen.has(chroma.id)) continue
        if (!isUsableSkinNode(chroma)) continue
        seen.add(chroma.id)
        const baseName = skin.name?.trim() || ''
        const chromaName = chroma.name?.trim() || (baseName ? `${baseName} · 炫彩` : `炫彩 #${chroma.id}`)
        allUsable.push({
          id: chroma.id,
          name: chromaName,
          isBase: false,
          isChroma: true,
        })
      }
    }
  }

  if (excludeBase) {
    return allUsable.filter((item) => !item.isBase)
  }
  return allUsable
}

export function pickRandomOwnedSkin(
  skins: readonly LcuSkinCarouselItem[],
  options: {
    excludeBase?: boolean
    includeChromas?: boolean
    currentSkinId?: number
    rng?: () => number
  } = {},
): SelectableSkinCandidate | null {
  const candidates = collectSelectableOwnedSkins(skins, {
    excludeBase: options.excludeBase ?? true,
    includeChromas: options.includeChromas ?? true,
  })
  if (candidates.length === 0) return null

  const currentId = options.currentSkinId ?? 0
  const freshPool = candidates.length >= 2 && currentId > 0
    ? candidates.filter((c) => c.id !== currentId)
    : candidates
  const pool = freshPool.length > 0 ? freshPool : candidates
  const rand = options.rng ?? Math.random
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(rand() * pool.length)))
  return pool[index] ?? null
}

// ==================== E5：楼层互换 / 英雄交换请求自动处理 ====================

export type AutoSwapStrategy = 'friends_only' | 'favorable_or_friends' | 'all'

export interface IncomingSwapRaw {
  id: number
  cellId: number
  state: string
}

export interface SwapDecisionAction {
  kind: 'pick_order' | 'trade'
  id: number
  requesterFloor: number
  requesterName: string
  reason: string
}

export function evaluateIncomingSwapsAndTrades(params: {
  session: ChampSelectSession
  strategy: AutoSwapStrategy
  premadePuuids: ReadonlySet<string>
  friendPuuids: ReadonlySet<string>
  tagsMap: Record<string, PlayerTagRecord>
  wishlistIds?: readonly number[]
  wishlistEnabled?: boolean
  handledKeys: Set<string>
  deobfuscate?: (obf: string) => string
}): SwapDecisionAction[] {
  const {
    session,
    strategy,
    premadePuuids,
    friendPuuids,
    tagsMap,
    wishlistIds = [],
    wishlistEnabled = false,
    handledKeys,
    deobfuscate = deobfuscateChampSelectPuuid,
  } = params

  const actions: SwapDecisionAction[] = []
  const myTeam = session.myTeam ?? []
  const myIdx = myTeam.findIndex((p) => p.cellId === session.localPlayerCellId)
  const me = myIdx >= 0 ? myTeam[myIdx] : undefined
  const myChampId = me?.championId ?? 0
  const wishSet = wishlistEnabled ? new Set(wishlistIds.filter((id) => id > 0)) : new Set<number>()

  const inspectRequester = (cellId: number) => {
    const idx = myTeam.findIndex((p) => p.cellId === cellId)
    const player = idx >= 0 ? myTeam[idx] : undefined
    const puuid = player ? resolveChampSelectMemberPuuid(player, deobfuscate) : ''
    const tag = puuid ? tagsMap[puuid] : undefined
    const isAvoid = tag?.tone === 'avoid'
    const isTrusted = Boolean(
      puuid && (
        premadePuuids.has(puuid)
        || friendPuuids.has(puuid)
        || tag?.tone === 'carry'
        || tag?.tone === 'good'
      ),
    )
    const floor = idx >= 0 ? idx + 1 : 0
    const name = player?.gameName || player?.playerAlias || (floor > 0 ? `${floor}楼队友` : '队友')
    return { idx, floor, name, isAvoid, isTrusted }
  }

  // 1. Pick Order Swaps (排位楼层互换)
  const rawSwaps = Array.isArray(session.pickOrderSwaps) ? (session.pickOrderSwaps as IncomingSwapRaw[]) : []
  for (const swap of rawSwaps) {
    if (!swap || typeof swap.id !== 'number' || swap.state !== 'RECEIVED') continue
    const key = `swap:${swap.id}`
    if (handledKeys.has(key)) continue

    const req = inspectRequester(swap.cellId)
    if (req.isAvoid) continue

    const movesToLaterFloor = myIdx >= 0 && req.idx > myIdx
    const shouldAccept =
      strategy === 'all'
      || (strategy === 'friends_only' && req.isTrusted)
      || (strategy === 'favorable_or_friends' && (req.isTrusted || movesToLaterFloor))

    if (shouldAccept) {
      handledKeys.add(key)
      actions.push({
        kind: 'pick_order',
        id: swap.id,
        requesterFloor: req.floor,
        requesterName: req.name,
        reason: req.isTrusted ? '好友/好评队友' : movesToLaterFloor ? '换至后手楼层' : '自动同意全部',
      })
    }
  }

  // 2. Champion Trades (英雄互换)
  const rawTrades = Array.isArray(session.trades) ? session.trades : []
  for (const trade of rawTrades) {
    if (!trade || typeof trade.id !== 'number' || trade.state !== 'RECEIVED') continue
    const key = `trade:${trade.id}`
    if (handledKeys.has(key)) continue

    const req = inspectRequester(trade.cellId)
    if (req.isAvoid) continue

    // 保护当前手上的心愿英雄不被陌生路人自动换走
    if (myChampId > 0 && wishSet.has(myChampId) && !req.isTrusted) {
      continue
    }

    const shouldAccept =
      strategy === 'all'
      || ((strategy === 'friends_only' || strategy === 'favorable_or_friends') && req.isTrusted)

    if (shouldAccept) {
      handledKeys.add(key)
      actions.push({
        kind: 'trade',
        id: trade.id,
        requesterFloor: req.floor,
        requesterName: req.name,
        reason: req.isTrusted ? '好友/好评队友' : '自动同意全部',
      })
    }
  }

  return actions
}

// ==================== E6：分模式 / 分路秒抢与禁用预设 ====================

export type ChampSelectPresetScope =
  | 'pos:top'
  | 'pos:jungle'
  | 'pos:middle'
  | 'pos:bottom'
  | 'pos:utility'
  | 'mode:urf'
  | 'mode:cherry'
  | 'mode:ultbook'

export interface ChampSelectPresetEntry {
  lockIds: number[]
  banIds: number[]
}

export type ChampSelectPresetsMap = Partial<Record<ChampSelectPresetScope, ChampSelectPresetEntry>>

export const CHAMP_SELECT_PRESET_SCOPES: ReadonlyArray<{
  scope: 'default' | ChampSelectPresetScope
  label: string
}> = [
  { scope: 'default', label: '通用默认' },
  { scope: 'pos:top', label: '上单' },
  { scope: 'pos:jungle', label: '打野' },
  { scope: 'pos:middle', label: '中单' },
  { scope: 'pos:bottom', label: '下路' },
  { scope: 'pos:utility', label: '辅助' },
  { scope: 'mode:urf', label: '无限乱斗' },
  { scope: 'mode:cherry', label: '斗魂竞技场' },
  { scope: 'mode:ultbook', label: '轮换模式' },
]

export function normalizeChampSelectPresetsMap(raw: unknown): ChampSelectPresetsMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const validScopes = new Set<string>(
    CHAMP_SELECT_PRESET_SCOPES.map((s) => s.scope).filter((s) => s !== 'default'),
  )
  const sanitizeIds = (val: unknown): number[] =>
    Array.isArray(val)
      ? Array.from(new Set(val.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0)))
      : []

  const result: ChampSelectPresetsMap = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!validScopes.has(k) || !v || typeof v !== 'object' || Array.isArray(v)) continue
    const rec = v as Record<string, unknown>
    const lockIds = sanitizeIds(rec.lockIds)
    const banIds = sanitizeIds(rec.banIds)
    if (lockIds.length > 0 || banIds.length > 0) {
      result[k as ChampSelectPresetScope] = { lockIds, banIds }
    }
  }
  return result
}

export function resolveActivePresetScope(context: {
  gameMode?: string
  queueId?: number
  assignedPosition?: string
}): ChampSelectPresetScope | null {
  const mode = (context.gameMode || '').trim().toUpperCase()
  const qid = context.queueId ?? 0

  if (mode === 'URF' || mode === 'ARURF' || qid === 900 || qid === 1900) {
    return 'mode:urf'
  }
  if (mode === 'CHERRY' || mode === 'ARENA' || qid === 1700 || qid === 1710) {
    return 'mode:cherry'
  }
  if (mode === 'ULTBOOK' || mode === 'ONEFORALL' || mode === 'NEXUSBLITZ' || qid === 1400 || qid === 1020 || qid === 1300) {
    return 'mode:ultbook'
  }

  const pos = (context.assignedPosition || '').trim().toLowerCase()
  switch (pos) {
    case 'top':
      return 'pos:top'
    case 'jungle':
      return 'pos:jungle'
    case 'middle':
    case 'mid':
      return 'pos:middle'
    case 'bottom':
    case 'bot':
    case 'adc':
      return 'pos:bottom'
    case 'utility':
    case 'support':
      return 'pos:utility'
    default:
      return null
  }
}

export function resolvePresetChampionIds(
  kind: 'lock' | 'ban',
  context: {
    presetEnabled: boolean
    presets: ChampSelectPresetsMap | null | undefined
    defaultIds: readonly number[]
    gameMode?: string
    queueId?: number
    assignedPosition?: string
  },
): { ids: number[]; matchedScope: ChampSelectPresetScope | null } {
  const cleanDefault = Array.from(new Set((context.defaultIds ?? []).filter((id) => id > 0)))
  if (!context.presetEnabled || !context.presets) {
    return { ids: cleanDefault, matchedScope: null }
  }

  const scope = resolveActivePresetScope(context)
  if (!scope) {
    return { ids: cleanDefault, matchedScope: null }
  }

  const entry = context.presets[scope]
  const rawScoped = kind === 'lock' ? entry?.lockIds : entry?.banIds
  const cleanScoped = Array.from(new Set((rawScoped ?? []).filter((id) => id > 0)))

  if (cleanScoped.length > 0) {
    return { ids: cleanScoped, matchedScope: scope }
  }
  return { ids: cleanDefault, matchedScope: null }
}
