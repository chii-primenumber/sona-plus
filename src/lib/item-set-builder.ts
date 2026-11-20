import type { ItemSetBlock } from './lcu'
import type { OpggItemBuild } from './opgg-api'

const HEALTH_POTION_ID = 2003

export interface ItemSetBuildSource {
  starterItems: OpggItemBuild[]
  boots: OpggItemBuild[]
  prismItems: OpggItemBuild[]
  coreItems: OpggItemBuild[]
  lastItems: OpggItemBuild[]
}

function toItemSetEntry(id: number) {
  return {
    id: String(id),
    count: id === HEALTH_POTION_ID ? 2 : 1,
  }
}

export function normalizeItemIds(ids: number[]): number[] {
  const seen = new Set<number>()
  const normalized: number[] = []

  for (const id of ids) {
    const itemId = Number(id)
    if (!Number.isFinite(itemId) || itemId <= 0 || seen.has(itemId)) continue
    seen.add(itemId)
    normalized.push(itemId)
  }

  return normalized
}

function flattenItemBuilds(builds: OpggItemBuild[]): number[] {
  return normalizeItemIds(builds.flatMap((build) => build.ids))
}

function getItemBuildWinRate(build: OpggItemBuild): number {
  if (typeof build.winRate === 'number' && Number.isFinite(build.winRate) && build.winRate >= 0 && build.winRate <= 1) return build.winRate
  return build.play > 0 ? build.win / build.play : 0
}

function sortItemBuildsByWinRate(builds: OpggItemBuild[]): OpggItemBuild[] {
  return [...builds].sort((a, b) => {
    const winRateDiff = getItemBuildWinRate(b) - getItemBuildWinRate(a)
    return winRateDiff || b.pick_rate - a.pick_rate || b.play - a.play
  })
}

function createItemSetBlock(type: string, itemIds: number[]): ItemSetBlock | null {
  const ids = normalizeItemIds(itemIds)
  if (ids.length === 0) return null

  return {
    type,
    items: ids.map(toItemSetEntry),
  }
}

function appendItemSetBlock(blocks: ItemSetBlock[], type: string, itemIds: number[]): void {
  const block = createItemSetBlock(type, itemIds)
  if (block) blocks.push(block)
}

export function buildItemSetBlocks(
  recommendation: ItemSetBuildSource,
  preferredCoreBuild?: OpggItemBuild,
  getPrice: (id: number) => number = () => 0,
): ItemSetBlock[] {
  const blocks: ItemSetBlock[] = []
  const starterItems = sortItemBuildsByWinRate(recommendation.starterItems)
  const boots = sortItemBuildsByWinRate(recommendation.boots)
  const prismItems = sortItemBuildsByWinRate(recommendation.prismItems)
  const coreItems = sortItemBuildsByWinRate(recommendation.coreItems)
  const lastItems = sortItemBuildsByWinRate(recommendation.lastItems)

  starterItems.slice(0, 3).forEach((build, index) => {
    appendItemSetBlock(blocks, `${index + 1}. 出门装`, build.ids)
  })

  appendItemSetBlock(blocks, `${blocks.length + 1}. 鞋子`, flattenItemBuilds(boots))

  if (prismItems.length > 0) {
    appendItemSetBlock(blocks, `${blocks.length + 1}. 棱彩装备`, flattenItemBuilds(prismItems))
  }

  const preferredIds = normalizeItemIds(preferredCoreBuild?.ids ?? [])
  const preferredSig = preferredIds.length > 0 ? preferredIds.join(',') : ''
  if (preferredIds.length > 0) {
    appendItemSetBlock(blocks, `${blocks.length + 1}. ★ 精选核心装`, preferredIds)
  }

  const remainingCore = preferredSig
    ? coreItems.filter((build) => normalizeItemIds(build.ids).join(',') !== preferredSig)
    : coreItems

  remainingCore.slice(0, preferredIds.length > 0 ? 4 : 5).forEach((build, index) => {
    appendItemSetBlock(blocks, `${blocks.length + 1}. 核心装 ${index + 1}`, build.ids)
  })

  const sortedLast = flattenItemBuilds(lastItems)
    .map((id, index) => ({ id, index, price: getPrice(id) }))
    .sort((a, b) => b.price - a.price || a.index - b.index)
    .map((entry) => entry.id)
  appendItemSetBlock(blocks, `${blocks.length + 1}. 后续装备`, sortedLast)

  return blocks
}
