import { SharedRequests } from './shared-requests'
import { deadline } from './history-api'
import { sortRecommendationBuilds } from './recommendation-rates'
import { escapeGameText, GAME_TEXT_COLORS } from './game-description'
import type { BuildRecommendation, RecommendationAssets } from '@/components/ui/OpggBuildRecommendationPanel'
import type { OpggItemBuild } from './opgg-api'

export const ARAMKIT_BASE = 'https://data.aramkit.cn'
interface VersionRow { version: string; dataPath: string; resourcePath: string; dataDate?: string }
interface Stats { rank?: number; sampleCount?: number; pickRate?: number; winRate?: number }
interface Later extends Stats { item: { id: number } }
interface Route extends Stats { purchaseOrder: Array<{ id: number }>; boots?: Later[]; laterItems?: Later[] }
interface Profile extends Stats { itemSet: Array<{ id: number }>; routes?: Route[] }
interface Archetype extends Stats { key: string; profiles: Profile[] }
interface Resource { name?: string; icon?: string; rarity?: string; priceTotal?: number; isFinal?: boolean; categories?: string[]; tooltip?: { blocks?: Array<{ role?: string; spans?: Array<{ type: string; text?: string; label?: string; semantic?: string }> }> } }
export interface AramKitDetail {
  champion: { id: number; rank?: number; tier?: string; stats: Stats }
  summoners?: Array<Stats & { spells: Array<{ id: number }> }>
  augments: { all: Array<Stats & { id: number }> }
  items: { unfiltered: { all: Array<Stats & { id: number }> } }
  builds: { unfiltered: { sampleCount?: number; archetypes: Archetype[] } }
}
export interface AramKitResources { items: Record<string, Resource>; augments: Record<string, Resource>; archetypes?: Record<string, { name?: string }> }

function rate(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null }
function ids(items: Array<{ id: number }> | undefined) { return (items ?? []).map((item) => Number(item.id)).filter((id) => Number.isSafeInteger(id) && id > 0) }
function asset(path?: string) {
  if (!path) return ''
  if (/^assets\/[A-Za-z0-9/_.-]+$/.test(path) && !path.includes('..')) return `${ARAMKIT_BASE}/${path}`
  return path.startsWith(`${ARAMKIT_BASE}/assets/`) ? path : ''
}
function description(resource: Resource) {
  return (resource.tooltip?.blocks ?? []).map((block) => {
    const spans = block.spans ?? []
    const statLine = spans.some((span) => span.semantic === 'stat') && spans.every((span) => !span.semantic || span.semantic === 'stat')
    const text = spans.map((span, index) => {
      // Leading stat icons repeat the label printed after the value; scaling icons inside effects do not.
      if (statLine && index === 0 && span.type === 'icon') return ''
      let text = escapeGameText(span.type === 'text' ? span.text ?? '' : span.label ?? '')
      const semantic = span.semantic?.toLowerCase()
      if (statLine && !semantic) text = text.replace(/([+−-]?\d+(?:[,.]\d+)*(?:%)?)/g, '<stat>$1</stat>')
      return semantic && typeof GAME_TEXT_COLORS[semantic] === 'string' ? `<${semantic}>${text}</${semantic}>` : text
    }).join('')
    return block.role === 'rules' || block.role === 'flavorText' ? `<${block.role}>${text}</${block.role}>` : text
  }).filter(Boolean).join('\n')
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
  // Rebase core selection rates to the complete core-build population before pooling.
  const coreTotal = detail.builds.unfiltered.sampleCount
  const coreRows = new Map<string, { itemIds: number[]; rows: Array<Stats & { globalPick: number | null }> }>()
  for (const archetype of detail.builds.unfiltered.archetypes) for (const profile of archetype.profiles) {
    const itemIds = ids(profile.itemSet)
    if (itemIds.length !== 3 || new Set(itemIds).size !== 3) continue
    const count = profile.sampleCount
    const globalPick = typeof coreTotal === 'number' && coreTotal > 0 && typeof count === 'number' && count >= 0
      ? rate(count / coreTotal)
      : rate(archetype.pickRate) != null && rate(profile.pickRate) != null ? archetype.pickRate! * profile.pickRate! : null
    const key = [...itemIds].sort((a,b)=>a-b).join(',')
    const entry = coreRows.get(key) ?? { itemIds, rows: [] }
    entry.rows.push({ ...profile, globalPick }); coreRows.set(key, entry)
  }
  const cores = [...coreRows.values()].map(({ itemIds, rows }) => {
    const countsKnown = rows.every((row)=>typeof row.sampleCount==='number' && Number.isFinite(row.sampleCount) && row.sampleCount>=0)
    const count = countsKnown ? rows.reduce((sum,row)=>sum+row.sampleCount!,0) : NaN
    const winsKnown = rows.every((row)=>rate(row.winRate)!=null)
    const winRate = rows.length===1 ? rate(rows[0].winRate) : winsKnown && count>0
      ? rows.reduce((sum,row)=>sum+row.winRate!*row.sampleCount!,0)/count : null
    const pickRate = typeof coreTotal==='number' && coreTotal>0 && countsKnown ? rate(count/coreTotal)
      : rows.every((row)=>row.globalPick!=null) ? rate(rows.reduce((sum,row)=>sum+row.globalPick!,0)) : null
    return build(itemIds, { sampleCount:count,winRate:winRate??undefined,pickRate:pickRate??undefined }, baseline)
  })
  const coreItems = sortRecommendationBuilds(cores,'pick')
  const augments = new Map<number, Array<{ id: number; pickRate: number; winRate?: number }>>()
  for (const row of detail.augments.all) {
    const resource = resources.augments[String(row.id)]
    const rarity = resource?.rarity === 'prismatic' ? 8 : resource?.rarity === 'gold' ? 4 : resource?.rarity === 'silver' ? 1 : 0
    if (!rarity || !resource) continue
    assets.augments[row.id] = { name: resource.name || String(row.id), iconPath: asset(resource.icon), description: description(resource), rarity: resource.rarity! }
    const list = augments.get(rarity) ?? []
    list.push({ id: row.id, pickRate: rate(row.pickRate) ?? NaN, winRate: rate(row.winRate) ?? undefined }); augments.set(rarity, list)
  }
  const percent = (value: number | null) => value == null ? '—' : `${(value * 100).toFixed(1)}%`
  return {
    mode: 'aram', modeLabel: '海克斯大乱斗', position: 'none', version: version.version,
    sourceLabel: `ARAMKit · ${version.version} · 全分段 · 原始数据`, assets, baselineWinRate: baseline,
    summary: [`总体胜率 ${percent(baseline)}`, `登场 ${percent(rate(detail.champion.stats?.pickRate))}`, `Tier ${detail.champion.tier || '—'}`],
    summonerSpells: (detail.summoners ?? []).filter((row) => ids(row.spells).length === 2).map((row) => ({ ids: ids(row.spells), win: NaN, play: row.sampleCount ?? NaN, winRate: rate(row.winRate), pick_rate: rate(row.pickRate) ?? NaN, baselineWinRate: baseline })),
    starterItems: [], boots: sortRecommendationBuilds(allBoots,'pick'), coreItems, lastItems: sortRecommendationBuilds(allItems,'pick'),
    prismItems: [], runePages: [], matchups: [], augments: [...augments].map(([rarity, items]) => ({ rarity, items })),
    meta: { rank: detail.champion.rank ?? null, previousRank: null, rankDelta: null, totalRank: null, matchCount: detail.champion.stats?.sampleCount ?? null, version: version.version, updatedAt: version.dataDate ?? '' },
    warning: coreItems.length ? undefined : 'ARAMKit 暂无该英雄的海斗核心组合数据。',
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
    const [detail, items, augments] = await Promise.all([
      this.read<AramKitDetail>(`${version.dataPath}/stats/all/champion-details/${championId}.json`, signal),
      this.read<Record<string, Resource>>(`${version.resourcePath}/zh-CN/resources/items.json`, signal, 600000),
      this.read<Record<string, Resource>>(`${version.resourcePath}/zh-CN/resources/augments.json`, signal, 600000),
    ])
    return parseAramKitRecommendation(detail, { items, augments }, version, championId)
  }
}
export const aramkitApi = new AramKitDataApi()
