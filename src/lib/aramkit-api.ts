import { SharedRequests } from './shared-requests'
import { deadline } from './history-api'
import type { BuildRecommendation, RecommendationAssets, RecommendationItemGroup } from '@/components/ui/OpggBuildRecommendationPanel'
import type { OpggItemBuild } from './opgg-api'

export const ARAMKIT_BASE = 'https://data.aramkit.cn'
interface VersionRow { version: string; dataPath: string; resourcePath: string; dataDate?: string }
interface Stats { rank?: number; sampleCount?: number; pickRate?: number; winRate?: number }
interface Later extends Stats { item: { id: number } }
interface Route extends Stats { purchaseOrder: Array<{ id: number }>; boots?: Later[]; laterItems?: Later[] }
interface Profile extends Stats { itemSet: Array<{ id: number }>; routes?: Route[] }
interface Archetype extends Stats { key: string; profiles: Profile[] }
interface Resource { name?: string; icon?: string; rarity?: string; priceTotal?: number; isFinal?: boolean; categories?: string[]; tooltip?: { blocks?: Array<{ spans?: Array<{ type: string; text?: string; label?: string }> }> } }
export interface AramKitDetail {
  champion: { id: number; rank?: number; tier?: string; stats: Stats }
  summoners?: Array<Stats & { spells: Array<{ id: number }> }>
  augments: { all: Array<Stats & { id: number }> }
  items: { unfiltered: { all: Array<Stats & { id: number }> } }
  builds: { unfiltered: { archetypes: Archetype[] } }
}
export interface AramKitResources { items: Record<string, Resource>; augments: Record<string, Resource>; archetypes: Record<string, { name?: string }> }

function rate(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null }
function ids(items: Array<{ id: number }> | undefined) { return (items ?? []).map((item) => Number(item.id)).filter((id) => Number.isSafeInteger(id) && id > 0) }
function asset(path?: string) {
  if (!path) return ''
  if (/^assets\/[A-Za-z0-9/_.-]+$/.test(path) && !path.includes('..')) return `${ARAMKIT_BASE}/${path}`
  return path.startsWith(`${ARAMKIT_BASE}/assets/`) ? path : ''
}
function description(resource: Resource) {
  return (resource.tooltip?.blocks ?? []).map((block) => (block.spans ?? []).map((span) => span.type === 'text' ? span.text ?? '' : span.label ?? '').join('')).filter(Boolean).join('\n')
}

/** Mirrors ARAMKit's all/unfiltered dataset. No other-mode or other-provider fallback. */
export function parseAramKitRecommendation(detail: AramKitDetail, resources: AramKitResources, version: VersionRow, championId: number): BuildRecommendation {
  if (detail?.champion?.id !== championId || !Array.isArray(detail.builds?.unfiltered?.archetypes) || !Array.isArray(detail.items?.unfiltered?.all) || !Array.isArray(detail.augments?.all)) throw new Error('ARAMKit 海斗数据格式不匹配。')
  const baseline = rate(detail.champion.stats?.winRate)
  const assets: RecommendationAssets = { items: {}, augments: {} }
  const itemInfo = (id: number) => {
    if (!assets.items[id]) {
      const resource = resources.items[String(id)]
      if (!resource) throw new Error(`ARAMKit 缺少装备资料 (${id})。`)
      assets.items[id] = { name: resource.name || String(id), iconPath: asset(resource.icon), description: description(resource), price: resource.priceTotal ?? 0, isBoots: Boolean(resource.categories?.some((category) => category.toLowerCase() === 'boots')) }
    }
    return assets.items[id]
  }
  const build = (itemIds: number[], stats: Stats, base: number | null): OpggItemBuild => {
    itemIds.forEach(itemInfo)
    return { ids: itemIds, win: NaN, play: typeof stats.sampleCount === 'number' && stats.sampleCount >= 0 ? stats.sampleCount : NaN, winRate: rate(stats.winRate), pick_rate: rate(stats.pickRate) ?? NaN, baselineWinRate: base }
  }
  const completed = (rows: Later[], base: number | null) => rows.filter((row) => row.item?.id > 0).filter((row) => {
    const info = itemInfo(row.item.id), resource = resources.items[String(row.item.id)]
    return !info.isBoots && resource.isFinal !== false
  }).map((row) => build([row.item.id], row, base))
  const allRows = detail.items.unfiltered.all.filter((row) => row.id > 0)
  const allItems = completed(allRows.map((row) => ({ ...row, item: { id: row.id } })), baseline)
  const allBoots = allRows.filter((row) => itemInfo(row.id).isBoots).map((row) => build([row.id], row, baseline))
  const groups: RecommendationItemGroup[] = detail.builds.unfiltered.archetypes.map((archetype) => {
    const profiles = archetype.profiles.filter((profile) => ids(profile.itemSet).length === 3 && new Set(ids(profile.itemSet)).size === 3)
    const coreItems = profiles.map((profile) => build(ids(profile.itemSet), profile, baseline))
    return {
      id: archetype.key, label: resources.archetypes[archetype.key]?.name || archetype.key, baselineWinRate: rate(archetype.winRate), coreItems,
      lastItems: allItems, boots: allBoots,
      profiles: profiles.map((profile, index) => ({
        id: String(index), label: `#${index + 1} ${ids(profile.itemSet).map((id) => itemInfo(id).name).join(' + ')}`,
        routes: (profile.routes ?? []).filter((route) => ids(route.purchaseOrder).length === 3).map((route, routeIndex) => ({
          id: String(routeIndex), label: ids(route.purchaseOrder).map((id) => itemInfo(id).name).join(' → '), baselineWinRate: rate(route.winRate),
          lastItems: completed(route.laterItems ?? [], rate(route.winRate)),
          boots: (route.boots ?? []).filter((row) => row.item?.id > 0 && itemInfo(row.item.id).isBoots).map((row) => build([row.item.id], row, rate(route.winRate))),
        })),
      })),
    }
  }).filter((group) => group.coreItems.length)
  const augments = new Map<number, Array<{ id: number; pickRate: number; winRate?: number }>>()
  for (const row of detail.augments.all) {
    const resource = resources.augments[String(row.id)]
    const rarity = resource?.rarity === 'prismatic' ? 8 : resource?.rarity === 'gold' ? 4 : resource?.rarity === 'silver' ? 1 : 0
    if (!rarity || !resource) continue
    assets.augments[row.id] = { name: resource.name || String(row.id), iconPath: asset(resource.icon), description: description(resource), rarity: resource.rarity! }
    const list = augments.get(rarity) ?? []
    list.push({ id: row.id, pickRate: rate(row.pickRate) ?? NaN, winRate: rate(row.winRate) ?? undefined }); augments.set(rarity, list)
  }
  const first = groups[0], firstRoute = first?.profiles?.[0]?.routes[0]
  const percent = (value: number | null) => value == null ? '—' : `${(value * 100).toFixed(1)}%`
  return {
    mode: 'aram', modeLabel: '海克斯大乱斗', position: 'none', version: version.version,
    sourceLabel: `ARAMKit · ${version.version} · 全分段 · 原始数据`, assets, baselineWinRate: baseline,
    summary: [`总体胜率 ${percent(baseline)}`, `登场 ${percent(rate(detail.champion.stats?.pickRate))}`, `Tier ${detail.champion.tier || '—'}`],
    summonerSpells: (detail.summoners ?? []).filter((row) => ids(row.spells).length === 2).map((row) => ({ ids: ids(row.spells), win: NaN, play: row.sampleCount ?? NaN, winRate: rate(row.winRate), pick_rate: rate(row.pickRate) ?? NaN, baselineWinRate: baseline })),
    starterItems: [], boots: firstRoute?.boots ?? allBoots, coreItems: first?.coreItems ?? [], lastItems: firstRoute?.lastItems ?? allItems, itemGroups: groups,
    prismItems: [], runePages: [], matchups: [], augments: [...augments].map(([rarity, items]) => ({ rarity, items })),
    meta: { rank: detail.champion.rank ?? null, previousRank: null, rankDelta: null, totalRank: null, matchCount: detail.champion.stats?.sampleCount ?? null, version: version.version, updatedAt: version.dataDate ?? '' },
    warning: groups.length ? undefined : 'ARAMKit 暂无该英雄的海斗核心组合数据。',
  }
}

export class AramKitDataApi {
  private requests = new SharedRequests(3, 8, 30000)
  private read<T>(path: string, signal?: AbortSignal, ttlMs = 0): Promise<T> {
    return this.requests.run(path, (sharedSignal) => deadline(async (transportSignal) => {
      const response = await fetch(`${ARAMKIT_BASE}/${path}`, { signal: transportSignal, mode: 'cors', credentials: 'omit', headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error(`ARAMKit 请求失败 (${response.status})。`)
      return response.json() as Promise<T>
    }, sharedSignal, 12000), { signal, ttlMs })
  }
  async getChampionRecommendation(championId: number, gameVersion: string, signal?: AbortSignal): Promise<BuildRecommendation> {
    const manifest = await this.read<{ latest: string; versions: VersionRow[] }>('data/versions.json', signal, 600000)
    const patch = gameVersion.match(/^\d+\.\d+/)?.[0]
    const rows = Array.isArray(manifest.versions) ? manifest.versions : []
    const version = rows.find((row) => row.version === patch) ?? rows.find((row) => row.version === manifest.latest)
    if (!version || !/^data\/[\w.-]+$/.test(version.dataPath) || !/^resources\/[\w.-]+$/.test(version.resourcePath) || version.dataPath.includes('..') || version.resourcePath.includes('..')) throw new Error('ARAMKit 版本索引无效。')
    const [detail, items, augments, archetypes] = await Promise.all([
      this.read<AramKitDetail>(`${version.dataPath}/stats/all/champion-details/${championId}.json`, signal),
      this.read<Record<string, Resource>>(`${version.resourcePath}/zh-CN/resources/items.json`, signal, 600000),
      this.read<Record<string, Resource>>(`${version.resourcePath}/zh-CN/resources/augments.json`, signal, 600000),
      this.read<Record<string, { name?: string }>>(`${version.resourcePath}/zh-CN/resources/archetypes.json`, signal, 600000),
    ])
    return parseAramKitRecommendation(detail, { items, augments, archetypes }, version, championId)
  }
}
export const aramkitApi = new AramKitDataApi()
