export type LootDisenchantStrategy =
  | 'owned_all'
  | 'keep_one_unowned'
  | 'keep_one_all'
  | 'all'

export interface LcuRawLootItem {
  lootId?: string
  lootName?: string
  type?: string
  displayCategories?: string
  count?: number
  disenchantValue?: number
  disenchantLootName?: string
  disenchantRecipeName?: string
  itemDesc?: string
  localizedName?: string
  itemStatus?: string
  redeemableStatus?: string
  storeItemId?: number
  tilePath?: string
}

export interface NormalizedLootShard {
  lootId: string
  name: string
  category: 'champion' | 'skin' | 'other'
  type: string
  count: number
  disenchantValue: number
  currency: 'BE' | 'OE' | 'OTHER'
  recipeName: string
  owned: boolean
  championId: number
  tilePath: string
}

export interface PlannedShardDisenchant {
  shard: NormalizedLootShard
  disenchantCount: number
  keepCount: number
  totalEssence: number
}

export function resolveDisenchantRecipe(item: LcuRawLootItem): string {
  const explicit = typeof item.disenchantRecipeName === 'string' ? item.disenchantRecipeName.trim() : ''
  if (explicit) return explicit
  const type = typeof item.type === 'string' ? item.type.trim().toUpperCase() : ''
  if (type === 'CHAMPION_RENTAL') return 'CHAMPION_RENTAL_disenchant'
  if (type === 'CHAMPION') return 'CHAMPION_disenchant'
  if (type === 'SKIN_RENTAL') return 'SKIN_RENTAL_disenchant'
  if (type === 'SKIN') return 'SKIN_disenchant'
  if (type === 'WARDSKIN_RENTAL' || type === 'WARD_SKIN_RENTAL') return `${type}_disenchant`
  return ''
}

function resolveCategory(item: LcuRawLootItem): 'champion' | 'skin' | 'other' | null {
  const category = (item.displayCategories ?? '').toUpperCase()
  const type = (item.type ?? '').toUpperCase()
  if (category === 'CHAMPION' || type === 'CHAMPION_RENTAL' || type === 'CHAMPION') {
    if (type.includes('TOKEN') || (item.lootId ?? '').startsWith('CHAMPION_TOKEN')) return null
    return 'champion'
  }
  if (category === 'SKIN' || type === 'SKIN_RENTAL' || type === 'SKIN') {
    return 'skin'
  }
  if (['WARDSKIN', 'EMOTE', 'SUMMONERICON', 'ETERNALS'].includes(category)) {
    return 'other'
  }
  return null
}

function resolveCurrency(item: LcuRawLootItem, category: 'champion' | 'skin' | 'other'): 'BE' | 'OE' | 'OTHER' {
  const name = (item.disenchantLootName ?? '').toUpperCase()
  if (name.includes('CHAMPION') || name === 'CURRENCY_CHAMPION') return 'BE'
  if (name.includes('COSMETIC') || name === 'CURRENCY_COSMETIC') return 'OE'
  if (category === 'champion') return 'BE'
  if (category === 'skin') return 'OE'
  return 'OTHER'
}

export function normalizeLootShards(
  lootMap: Record<string, unknown> | null | undefined,
  resolveFallbackChampionName?: (championId: number) => string,
): NormalizedLootShard[] {
  if (!lootMap || typeof lootMap !== 'object') return []
  const out: NormalizedLootShard[] = []

  for (const [key, raw] of Object.entries(lootMap)) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as LcuRawLootItem
    const lootId = (typeof item.lootId === 'string' && item.lootId.trim()) ? item.lootId.trim() : key
    const count = typeof item.count === 'number' && Number.isFinite(item.count) ? Math.floor(item.count) : 0
    const disenchantValue = typeof item.disenchantValue === 'number' && Number.isFinite(item.disenchantValue)
      ? Math.floor(item.disenchantValue)
      : 0
    if (!lootId || count <= 0 || disenchantValue <= 0) continue

    const category = resolveCategory(item)
    if (!category) continue

    const recipeName = resolveDisenchantRecipe(item)
    if (!recipeName) continue

    const championId = typeof item.storeItemId === 'number' && Number.isFinite(item.storeItemId) ? item.storeItemId : 0
    const rawName = (item.itemDesc || item.localizedName || '').trim()
    const fallbackName = championId > 0 && resolveFallbackChampionName ? resolveFallbackChampionName(championId) : ''
    const name = rawName || fallbackName || lootId
    const owned = item.itemStatus === 'OWNED' || item.redeemableStatus === 'ALREADY_OWNED'
    const tilePath = typeof item.tilePath === 'string' && item.tilePath.trim()
      ? item.tilePath.trim()
      : (category === 'champion' && championId > 0 ? `/lol-game-data/assets/v1/champion-icons/${championId}.png` : '')

    out.push({
      lootId,
      name,
      category,
      type: item.type ?? '',
      count,
      disenchantValue,
      currency: resolveCurrency(item, category),
      recipeName,
      owned,
      championId,
      tilePath,
    })
  }

  return out.sort((a, b) => (
    (b.disenchantValue * b.count) - (a.disenchantValue * a.count)
    || b.count - a.count
    || a.name.localeCompare(b.name, 'zh-CN')
  ))
}

export function computeDisenchantCount(shard: NormalizedLootShard, strategy: LootDisenchantStrategy): number {
  if (shard.count <= 0) return 0
  switch (strategy) {
    case 'owned_all':
      return shard.owned ? shard.count : 0
    case 'keep_one_unowned':
      return shard.owned ? shard.count : Math.max(0, shard.count - 1)
    case 'keep_one_all':
      return Math.max(0, shard.count - 1)
    case 'all':
      return shard.count
    default:
      return 0
  }
}

export function planShardDisenchants(
  shards: NormalizedLootShard[],
  strategy: LootDisenchantStrategy,
  category: 'champion' | 'skin' = 'champion',
): PlannedShardDisenchant[] {
  const result: PlannedShardDisenchant[] = []
  for (const shard of shards) {
    if (shard.category !== category) continue
    const disenchantCount = computeDisenchantCount(shard, strategy)
    const keepCount = Math.max(0, shard.count - disenchantCount)
    result.push({
      shard,
      disenchantCount,
      keepCount,
      totalEssence: disenchantCount * shard.disenchantValue,
    })
  }
  return result
}
