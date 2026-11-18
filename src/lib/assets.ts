/**
 * 全局游戏资源映射
 *
 * 通过 LCU JSON 接口动态获取装备/召唤师技能/队列/地图的映射。
 * 在 index.tsx 的 load() 中调用 initAssets() 初始化，
 * 之后任何模块都可以直接 import 使用查询函数。
 *
 * 英雄头像可以直接用 /lol-game-data/assets/v1/champion-icons/{id}.png 拼接，
 * 不需要额外映射。
 */

import { lcu } from '@/lib/lcu'
import { logger } from '@/lib/logger'
import type { GameQueue } from '@/types/lcu'
import balanceData from '@/data/champion-balance.json'
import { getCorsProxyCandidates } from '@/lib/cors-proxy'
import { store } from '@/lib/store'
import { richDescription } from './game-description'

/** 路径小写化，LCU 资源路径不区分大小写但统一小写更安全 */
function normalizePath(raw: string): string {
  return raw.toLowerCase()
}

/** Riot 资源描述里常带 HTML 标签，这里转成适合 tooltip 的纯文本。 */
export function normalizeDescription(raw: unknown): string {
  if (typeof raw !== 'string') return ''

  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(li|p|div)>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function pickDescription(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const description = richDescription(source[key])
    if (description) return description
  }
  return ''
}

// ==================== 映射表 ====================

const itemMap = new Map<number, string>()
const itemNameMap = new Map<number, string>()
const itemDescriptionMap = new Map<number, string>()
const itemPriceMap = new Map<number, number>()
const spellMap = new Map<number, string>()
const spellNameMap = new Map<number, string>()
const spellDescriptionMap = new Map<number, string>()
const perkMap = new Map<number, string>()
const perkNameMap = new Map<number, string>()
const perkDescriptionMap = new Map<number, string>()
const perkStatDescriptions = new Map<number, string[]>()
const perkStyleMap = new Map<number, string>()
const perkStyleNameMap = new Map<number, string>()
const perkStyleDescriptionMap = new Map<number, string>()
const augmentMap = new Map<number, { name: string; iconPath: string; rarity: string; description: string }>()
const queueMap = new Map<number, GameQueue>()
const mapDataMap = new Map<number, { id: number; name: string; gameModeName: string; [key: string]: unknown }>()

/** 英雄信息：id → { id, name(英雄名), title(称号), alias(英文名) } */
export interface ChampionInfo {
  id: number
  /** 英雄名字，如 "安妮" */
  name: string
  /** 英雄称号，如 "黑暗之女" */
  title: string
  /** 英文名，如 "Annie" */
  alias: string
  /** 官方定位标签，如 ["mage", "support"] */
  roles?: string[]
}
const championMap = new Map<number, ChampionInfo>()

/**
 * 英雄在特殊模式下的平衡数值
 *
 * 数据源：Fandom LoL Wiki 的 Module:ChampionData/data
 * 结构稀疏——没有调整的字段不会存在。
 *
 * 数值含义示例（以大乱斗为例）：
 * - dmg_dealt = 1.05 → 造成伤害 ×1.05（+5%）
 * - dmg_taken = 0.97 → 受到伤害 ×0.97（-3%）
 * - ability_haste = 10 → 固定 +10 技能急速
 */
export type ChampionBalanceStats = {
  dmg_dealt?: number        // 造成伤害（倍率）
  dmg_taken?: number        // 承受伤害（倍率）
  healing?: number          // 治疗效果（倍率）
  shielding?: number        // 护盾效果（倍率）
  ability_haste?: number    // 技能急速（加数）
  mana_regen?: number       // 法力回复（倍率）
  energy_regen?: number     // 能量回复（倍率）
  attack_speed?: number     // 攻击速度（倍率）
  movement_speed?: number   // 移动速度（倍率）
  tenacity?: number         // 韧性（倍率）
}

/** 支持的特殊模式 key */
export type BalanceMode = 'aram' | 'urf' | 'ofa' | 'nb' | 'ar' | 'usb'

export interface ChampionBalance {
  id: number
  alias: string
  /** 各模式下的平衡调整（只有有调整的模式才存在） */
  stats: Partial<Record<BalanceMode, ChampionBalanceStats>>
}
const championBalanceMap = new Map<number, ChampionBalance>()

let initialized = false

// ==================== 当前账号 puuid ====================

/** 当前登录账号的 puuid / summonerId / Riot ID，在插件 load 时获取一次 */
let currentPuuid = ''
let currentSummonerId = 0
let currentSummonerName = ''

/** 获取当前账号的 puuid（插件加载时初始化，之后不变） */
export function getPuuid(): string {
  return currentPuuid
}

/** 获取当前登录召唤师已缓存的身份信息（零网络请求） */
export function getCurrentSummonerIdentity(): { puuid: string; summonerId: number; name: string } {
  return {
    puuid: currentPuuid,
    summonerId: currentSummonerId,
    name: currentSummonerName,
  }
}

// ==================== 初始化 ====================

/**
 * 拉取装备/召唤师技能/队列/地图数据，构建全局映射。
 * 应在插件 load() 时调用一次，失败不阻塞启动。
 */
export async function initAssets() {
  if (initialized) return

  // 最先获取当前账号 puuid（签名等功能的账号隔离依赖此值）
  try {
    const summoner = await lcu.getSummonerInfo()
    currentPuuid = summoner.puuid || ''
    currentSummonerId = Number(summoner.summonerId) || 0
    const gName = (summoner.gameName || summoner.displayName || '').trim()
    const gTag = (summoner.tagLine || '').trim()
    currentSummonerName = gName ? (gTag && !gName.includes('#') ? `${gName}#${gTag}` : gName) : ''
    logger.info('[Assets] 当前账号 puuid=%s', currentPuuid)
  } catch (err) {
    logger.warn('[Assets] 获取 puuid 失败:', err)
  }

  // 加载本地英雄平衡数据（内置离线保底 + 已缓存热更新）
  loadChampionBalance()
  scheduleRemoteChampionBalanceSync()

  // 每个资源独立 catch，失败不影响其他；最多重试 3 次（每次间隔 3 秒）
  await tryInit(0)
}

// ==================== 英雄平衡数据（内置保底 + 远端 24h 热缓存） ====================

const REMOTE_BALANCE_URL = 'https://raw.githubusercontent.com/chii-primenumber/sona-plus/main/src/data/champion-balance.json'
const BALANCE_CACHE_TTL_MS = 24 * 60 * 60 * 1000
let balanceSyncScheduled = false
let activeBalanceUpdatedAt = ''

function parseIsoTimestamp(value: unknown): number {
  if (typeof value !== 'string' || !value) return 0
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : 0
}

function applyBalanceMap(champions: Record<string, unknown>): number {
  let applied = 0
  for (const [idKey, rawEntry] of Object.entries(champions)) {
    const id = Number(idKey)
    if (!Number.isFinite(id) || id <= 0 || !rawEntry || typeof rawEntry !== 'object') continue
    const entry = rawEntry as Partial<ChampionBalance>
    if (!entry.stats || typeof entry.stats !== 'object') continue
    championBalanceMap.set(id, {
      id,
      alias: typeof entry.alias === 'string' ? entry.alias : '',
      stats: entry.stats,
    })
    applied += 1
  }
  return applied
}

/**
 * 从内置 JSON 及本地较新热缓存加载英雄平衡数据到 championBalanceMap
 */
function loadChampionBalance() {
  try {
    const bundledUpdatedAt = balanceData._meta?.updatedAt ?? ''
    const bundledTime = parseIsoTimestamp(bundledUpdatedAt)
    championBalanceMap.clear()
    applyBalanceMap(balanceData.champions as Record<string, unknown>)
    activeBalanceUpdatedAt = bundledUpdatedAt

    const cached = store.get('cachedChampionBalance')
    if (cached && typeof cached === 'object') {
      const cachedTime = parseIsoTimestamp(cached.updatedAt)
      const cachedEntries = cached.champions && typeof cached.champions === 'object'
        ? Object.keys(cached.champions).length
        : 0
      if (cachedTime > bundledTime && cachedEntries > 0) {
        championBalanceMap.clear()
        const count = applyBalanceMap(cached.champions)
        activeBalanceUpdatedAt = cached.updatedAt
        logger.info('[Assets] 已应用热缓存英雄平衡数据 → %d 个英雄 (更新于 %s)', count, activeBalanceUpdatedAt)
        return
      }
      if (cachedEntries > 0 && cachedTime <= bundledTime) {
        store.set('cachedChampionBalance', {
          fetchedAt: cached.fetchedAt || 0,
          updatedAt: bundledUpdatedAt,
          champions: {},
        })
      }
    }

    logger.info(
      '[Assets] 英雄平衡数据加载完成 → %d 个英雄 (数据更新于 %s)',
      championBalanceMap.size,
      activeBalanceUpdatedAt || '未知',
    )
  } catch (err) {
    logger.error('[Assets] 英雄平衡数据加载失败:', err)
  }
}

export async function syncRemoteChampionBalance(force = false): Promise<boolean> {
  const cached = store.get('cachedChampionBalance')
  if (!force && cached && Number.isFinite(cached.fetchedAt) && Date.now() - cached.fetchedAt < BALANCE_CACHE_TTL_MS) {
    return false
  }

  const candidates = [REMOTE_BALANCE_URL, ...getCorsProxyCandidates(REMOTE_BALANCE_URL)]
  for (const url of candidates) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch(url, { signal: controller.signal, method: 'GET', mode: 'cors' })
      if (!res.ok) continue
      const data = await res.json() as { _meta?: { updatedAt?: string }; champions?: Record<string, unknown> }
      const remoteUpdatedAt = data?._meta?.updatedAt ?? ''
      const remoteTime = parseIsoTimestamp(remoteUpdatedAt)
      if (!remoteTime || !data?.champions || typeof data.champions !== 'object') continue

      const bundledUpdatedAt = balanceData._meta?.updatedAt ?? ''
      const bundledTime = parseIsoTimestamp(bundledUpdatedAt)
      const currentTime = parseIsoTimestamp(activeBalanceUpdatedAt)

      if (remoteTime > Math.max(bundledTime, currentTime)) {
        championBalanceMap.clear()
        const count = applyBalanceMap(data.champions)
        if (count > 0) {
          activeBalanceUpdatedAt = remoteUpdatedAt
          store.set('cachedChampionBalance', {
            fetchedAt: Date.now(),
            updatedAt: remoteUpdatedAt,
            champions: data.champions,
          })
          logger.info('[Assets] 远端英雄平衡数据已热更新 → %d 个英雄 (%s)', count, remoteUpdatedAt)
          return true
        }
      }

      store.set('cachedChampionBalance', {
        fetchedAt: Date.now(),
        updatedAt: activeBalanceUpdatedAt || bundledUpdatedAt,
        champions: remoteTime > bundledTime ? data.champions : {},
      })
      return false
    } catch {
      // try next candidate silently
    } finally {
      clearTimeout(timer)
    }
  }

  return false
}

function scheduleRemoteChampionBalanceSync() {
  if (balanceSyncScheduled || typeof window === 'undefined') return
  balanceSyncScheduled = true
  window.setTimeout(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    void syncRemoteChampionBalance(false)
  }, 20000)
}

/**
 * 尝试初始化（失败的资源自动重试）
 * @param attempt 当前重试次数
 */
async function tryInit(attempt: number) {
  const MAX_RETRY = 3
  const RETRY_DELAY = 2000

  const [items, spells, queues, maps, perks, perkStyles, champions, augments] = await Promise.all([
    lcu.getItems().catch((e) => { logger.warn('[Assets] getItems 失败:', e); return [] }),
    lcu.getSummonerSpells().catch((e) => { logger.warn('[Assets] getSummonerSpells 失败:', e); return [] }),
    lcu.getQueues().catch((e) => { logger.warn('[Assets] getQueues 失败:', e); return [] }),
    lcu.getMapAssets().catch((e) => { logger.warn('[Assets] getMapAssets 失败:', e); return [] }),
    lcu.getPerks().catch((e) => { logger.warn('[Assets] getPerks 失败:', e); return [] }),
    lcu.getPerkStyles().catch((e) => { logger.warn('[Assets] getPerkStyles 失败:', e); return { styles: [] } }),
    lcu.getChampionSummary().catch((e) => { logger.warn('[Assets] getChampionSummary 失败:', e); return [] }),
    lcu.getAugments().catch((e) => { logger.warn('[Assets] getAugments 失败:', e); return [] }),
  ])

  // 只填充获取到的数据（失败的返回空数组，for 循环自然跳过）
  for (const item of items) {
    if (item.id > 0 && item.iconPath) itemMap.set(item.id, normalizePath(item.iconPath))
    if (item.id > 0 && item.name) itemNameMap.set(item.id, item.name)
    if (item.id > 0) {
      const description = pickDescription(item as Record<string, unknown>, [
        'description',
        'shortDescription',
        'longDescription',
        'tooltip',
        'tooltipText',
      ])
      if (description) itemDescriptionMap.set(item.id, description)
      const price = item.priceTotal ?? item.price ?? 0
      if (Number.isFinite(price) && price > 0) itemPriceMap.set(item.id, price)
    }
  }
  for (const spell of spells) {
    if (spell.id > 0 && spell.iconPath) spellMap.set(spell.id, normalizePath(spell.iconPath))
    if (spell.id > 0 && spell.name) spellNameMap.set(spell.id, spell.name)
    if (spell.id > 0) {
      const description = pickDescription(spell as unknown as Record<string, unknown>, [
        'description',
        'shortDescription',
        'longDescription',
        'tooltip',
        'tooltipText',
      ])
      if (description) spellDescriptionMap.set(spell.id, description)
    }
  }
  for (const queue of queues) {
    queueMap.set(queue.id, queue)
  }
  for (const map of maps as Array<{ id: number; name: string; gameModeName: string }>) {
    if (map.id != null) mapDataMap.set(map.id, map)
  }
  for (const perk of perks) {
    if (perk.id > 0 && perk.iconPath) perkMap.set(perk.id, normalizePath(perk.iconPath))
    if (perk.id > 0 && perk.name) perkNameMap.set(perk.id, perk.name)
    if (perk.id > 0) {
      const description = pickDescription(perk as Record<string, unknown>, [
        'longDesc',
        'shortDesc',
        'description',
        'tooltip',
        'tooltipText',
      ])
      if (description) perkDescriptionMap.set(perk.id, description)
      if (Array.isArray(perk.endOfGameStatDescs)) {
        perkStatDescriptions.set(perk.id, perk.endOfGameStatDescs.map(normalizeDescription).filter(Boolean))
      }
    }
  }
  for (const style of perkStyles.styles) {
    if (style.id > 0 && style.iconPath) perkStyleMap.set(style.id, normalizePath(style.iconPath))
    if (style.id > 0 && style.name) perkStyleNameMap.set(style.id, style.name)
    if (style.id > 0 && style.tooltip) perkStyleDescriptionMap.set(style.id, richDescription(style.tooltip))
  }
  for (const champ of champions) {
    if (champ.id > 0) {
      championMap.set(champ.id, {
        id: champ.id,
        name: champ.description || '',
        title: champ.name || '',
        alias: champ.alias,
        roles: Array.isArray(champ.roles) ? champ.roles : [],
      })
    }
  }
  for (const augment of augments) {
    if (augment.id > 0) {
      augmentMap.set(augment.id, {
        name: augment.nameTRA || String(augment.id),
        iconPath: augment.augmentSmallIconPath ? normalizePath(augment.augmentSmallIconPath) : '',
        rarity: augment.rarity || '',
        description: richDescription(augment.summaryDescription),
      })
    }
  }

  logger.info(
    '[Assets] 资源映射初始化 (attempt %d) → 装备 %d, 技能 %d, 符文 %d, 符文系 %d, 强化符文 %d, 队列 %d, 地图 %d, 英雄 %d',
    attempt + 1,
    itemMap.size, spellMap.size, perkMap.size, perkStyleMap.size, augmentMap.size, queueMap.size, mapDataMap.size, championMap.size,
  )

  // 判断是否有关键资源缺失，决定是否重试
  const missing = [
    itemMap.size === 0 && 'items',
    spellMap.size === 0 && 'spells',
    queueMap.size === 0 && 'queues',
    championMap.size === 0 && 'champions',
  ].filter(Boolean)

  if (missing.length > 0 && attempt < MAX_RETRY) {
    logger.warn('[Assets] 关键资源缺失: %s，%d 秒后重试 (%d/%d)', missing.join(','), RETRY_DELAY / 1000, attempt + 1, MAX_RETRY)
    setTimeout(() => tryInit(attempt + 1), RETRY_DELAY)
    return
  }

  initialized = true
  if (missing.length > 0) {
    logger.error('[Assets] 重试 %d 次后仍有资源缺失: %s', MAX_RETRY, missing.join(','))
  } else {
    logger.info('[Assets] 资源映射初始化完成 ✓')
  }
}

// ==================== 查询 ====================

/** 获取英雄头像路径（直接用 ID 拼接即可） */
export function getChampIcon(id: number): string {
  return `/lol-game-data/assets/v1/champion-icons/${id}.png`
}

/** 获取装备图标路径 */
export function getItemIcon(id: number): string {
  return itemMap.get(id) ?? (id > 0 ? `/lol-game-data/assets/v1/item-icons/${id}.png` : '')
}

/** 获取装备名称 */
export function getItemName(id: number): string {
  return itemNameMap.get(id) ?? String(id)
}

/** 获取装备总价（金币）；未知返回 0 */
export function getItemPrice(id: number): number {
  return itemPriceMap.get(id) ?? 0
}

/** 获取装备完整信息（名称、图标、描述） */
export function getItemInfo(id: number): { name: string; iconPath: string; description: string; price: number } {
  return {
    name: itemNameMap.get(id) ?? String(id),
    iconPath: getItemIcon(id),
    description: itemDescriptionMap.get(id) ?? '',
    price: itemPriceMap.get(id) ?? 0,
  }
}

/** 获取召唤师技能图标路径 */
export function getSpellIcon(id: number): string {
  return spellMap.get(id) ?? ''
}

/** 获取召唤师技能名称 */
export function getSpellName(id: number): string {
  return spellNameMap.get(id) ?? String(id)
}

/** 获取召唤师技能完整信息（名称、图标、描述） */
export function getSpellInfo(id: number): { name: string; iconPath: string; description: string } {
  return {
    name: spellNameMap.get(id) ?? String(id),
    iconPath: spellMap.get(id) ?? '',
    description: spellDescriptionMap.get(id) ?? '',
  }
}

/** 获取单个符文图标路径（基石符文等） */
export function getPerkIcon(id: number): string {
  return perkMap.get(id) ?? ''
}

/** 获取单个符文名称 */
export function getPerkName(id: number): string {
  return perkNameMap.get(id) ?? String(id)
}

/** 获取单个符文完整信息（名称、图标、描述） */
export function getPerkInfo(id: number): { name: string; iconPath: string; description: string; stats: string[] } {
  return {
    name: perkNameMap.get(id) ?? String(id),
    iconPath: perkMap.get(id) ?? '',
    description: perkDescriptionMap.get(id) ?? '',
    stats: perkStatDescriptions.get(id) ?? [],
  }
}

/** 获取符文系图标路径（主系/副系） */
export function getPerkStyleIcon(id: number): string {
  return perkStyleMap.get(id) ?? ''
}

/** 获取符文系名称 */
export function getPerkStyleName(id: number): string {
  return perkStyleNameMap.get(id) ?? String(id)
}

/** Official style tooltip, already included in the client's perkstyles.json. */
export function getPerkStyleDescription(id: number): string {
  return perkStyleDescriptionMap.get(id) ?? ''
}

/** 获取强化符文 / Arena Augment 信息 */
export function getAugmentInfo(id: number): { name: string; iconPath: string; rarity: string; description: string } | undefined {
  return augmentMap.get(id)
}

/** 通过 queueId 获取队列名称（中文），如 "极地大乱斗"、"排位赛 单排/双排" */
export function getQueueName(queueId: number): string {
  return queueMap.get(queueId)?.name ?? `队列${queueId}`
}

/** 通过 queueId 获取完整队列数据 */
export function getQueue(queueId: number): GameQueue | undefined {
  return queueMap.get(queueId)
}

/** 通过 mapId 获取地图名称，如 "召唤师峡谷"、"嚎哭深渊" */
export function getMapName(mapId: number): string {
  return mapDataMap.get(mapId)?.name ?? `地图${mapId}`
}

/** 通过 mapId 获取游戏模式名称，如 "经典"、"极地大乱斗" */
export function getGameModeName(mapId: number): string {
  return mapDataMap.get(mapId)?.gameModeName ?? ''
}

/** 资源映射是否已就绪 */
export function isAssetsReady(): boolean {
  return initialized
}

/** 获取所有英雄列表 */
export function getAllChampions(): ChampionInfo[] {
  return Array.from(championMap.values()).filter(c => c.id > 0)
}

/** 通过 ID 获取英雄信息 */
export function getChampionById(id: number): ChampionInfo | undefined {
  return championMap.get(id)
}

/**
 * 模糊搜索英雄（名字、称号、英文名）
 * @param keyword 搜索关键词
 * @param limit 最大返回数量，默认 8
 */
export function searchChampions(keyword: string, limit = 8): ChampionInfo[] {
  if (!keyword.trim()) return []
  const kw = keyword.trim().toLowerCase()
  const results: ChampionInfo[] = []

  championMap.forEach((c) => {
    if (c.id <= 0) return
    if (
      c.name.toLowerCase().includes(kw) ||
      c.title.toLowerCase().includes(kw) ||
      c.alias.toLowerCase().includes(kw)
    ) {
      results.push(c)
    }
  })

  // 精确匹配名字的排前面
  results.sort((a, b) => {
    const aExact = a.name.toLowerCase() === kw ? 0 : 1
    const bExact = b.name.toLowerCase() === kw ? 0 : 1
    return aExact - bExact
  })

  return results.slice(0, limit)
}

// ==================== 英雄平衡数据查询 ====================

/** 通过英雄 ID 获取平衡数据（ARAM + URF） */
export function getChampionBalance(id: number): ChampionBalance | undefined {
  return championBalanceMap.get(id)
}

/** 获取所有英雄平衡数据（用于调试/导出） */
export function getAllChampionBalances(): ChampionBalance[] {
  return Array.from(championBalanceMap.values())
}

/** 英雄平衡数据是否已就绪 */
export function isChampionBalanceReady(): boolean {
  return championBalanceMap.size > 0
}

/** 获取英雄平衡数据的元信息（数据源、更新时间等） */
export function getChampionBalanceMeta() {
  return activeBalanceUpdatedAt
    ? { ...balanceData._meta, updatedAt: activeBalanceUpdatedAt, championCount: championBalanceMap.size }
    : balanceData._meta
}

/**
 * 获取当前可玩的队列列表（用于战绩模式过滤下拉框）
 *
 * 过滤条件：
 * - 基础：id > 0、非自定义、isEnabled、queueAvailability = Available
 * - 排除 gameMode:
 *   - TUTORIAL         — 新手教程（通用）
 *   - TUTORIAL_MODULE_1 — 新手教程 第一部分
 *   - TUTORIAL_MODULE_2 — 新手教程 第二部分
 *   - TUTORIAL_MODULE_3 — 新手教程 第三部分
 *   - PRACTICETOOL     — 训练模式
 *   - SWIFTPLAY        — 入门级人机
 *   - TFT              — 云顶之弈（所有云顶模式）
 * - 排除 type:
 *   - CHERRY_UNRANKED  — 非排位斗魂竞技场（未公开队列）
 */
export function getPlayableQueues(): { id: number; name: string }[] {
  const EXCLUDED_MODES = new Set([
    'TUTORIAL',
    'TUTORIAL_MODULE_1',
    'TUTORIAL_MODULE_2',
    'TUTORIAL_MODULE_3',
    'PRACTICETOOL',
    'SWIFTPLAY',
    'TFT',
  ])

  const EXCLUDED_TYPES = new Set([
    'CHERRY_UNRANKED',
  ])

  const result: { id: number; name: string }[] = []
  queueMap.forEach((q) => {
    if (q.id <= 0 || q.isCustom) return
    if (!q.isEnabled || q.queueAvailability !== 'Available') return
    if (EXCLUDED_MODES.has(q.gameMode)) return
    if (EXCLUDED_TYPES.has(q.type)) return
    result.push({ id: q.id, name: q.name || q.shortName || `队列${q.id}` })
  })
  // 按名称排序
  result.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  return result
}

/**
 * 将自定义房间或同名衍生队列 ID 归一到标准可玩匹配队列 ID：
 * - 例如创建自定义「海克斯大乱斗」房间时，自动归一为匹配「海克斯大乱斗」(2400)，
 *   杜绝下拉框出现两个同名「海克斯大乱斗」且默认选中少量自定义记录队列。
 * - 召唤师峡谷普通自定义内战归一到 0（全部模式）。
 */
export function resolveCanonicalQueueId(
  queueId: number,
  hint?: { name?: string; gameMode?: string; isCustom?: boolean; mapId?: number } | null,
): number {
  if (!Number.isFinite(queueId) || queueId <= 0) return 0
  const playable = getPlayableQueues()
  if (playable.some((q) => q.id === queueId)) return queueId

  const raw = queueMap.get(queueId)
  const effectiveName = (raw?.name || raw?.shortName || hint?.name || '').trim()
  const isCustom = Boolean(raw?.isCustom || hint?.isCustom)
  const mode = (raw?.gameMode || hint?.gameMode || '').toUpperCase()
  const mapId = raw?.mapId ?? hint?.mapId ?? 0

  if (effectiveName) {
    const sameNamePlayable = playable.find((q) => q.name.trim() === effectiveName)
    if (sameNamePlayable) return sameNamePlayable.id
  }

  if (!isCustom) return queueId

  if (mode === 'KIWI') {
    const kiwi = playable.find((q) => q.id === 2400 || (queueMap.get(q.id)?.gameMode || '').toUpperCase() === 'KIWI')
    return kiwi ? kiwi.id : 2400
  }
  if (mode === 'ARAM' || mapId === 12) {
    const aram = playable.find((q) => q.id === 450 || (queueMap.get(q.id)?.gameMode || '').toUpperCase() === 'ARAM')
    return aram ? aram.id : 450
  }
  if (mode === 'CHERRY' || mode === 'ARENA') {
    const arena = playable.find((q) => (queueMap.get(q.id)?.gameMode || '').toUpperCase() === 'CHERRY')
    if (arena) return arena.id
  }
  return 0
}
