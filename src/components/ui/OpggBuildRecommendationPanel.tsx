import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CareerBackdrop } from './CareerBackdrop'
import { HistoryAssetTooltip } from './HistoryAssetTooltip'
import { SonaSelect } from '@/components/ui/SonaSelect'
import { SonaSegmented } from './SonaSegmented'
import tier1Icon from '@/../assets/tier/t1.svg'
import tier2Icon from '@/../assets/tier/t2.svg'
import tier3Icon from '@/../assets/tier/t3.svg'
import tier4Icon from '@/../assets/tier/t4.svg'
import tier5Icon from '@/../assets/tier/t5.svg'
import {
  getAugmentInfo,
  getChampionById,
  getItemInfo,
  getPerkIcon,
  getPerkInfo,
  getPerkName,
  getPerkStyleIcon,
  getPerkStyleName,
  getQueueName,
  getQueue,
  getSpellIcon,
  getSpellInfo,
  getSpellName,
} from '@/lib/assets'
import { lcu } from '@/lib/lcu'
import { getRankedMiniCrest } from '@/lib/ranked-assets'
import { type OpggItemBuild, type OpggMatchup, type OpggMode, type OpggPosition, type OpggRuneBuild, type OpggTier } from '@/lib/opgg-api'
import { translate, useI18n } from '@/i18n'
import '@/styles/OpggBuildRecommendationPanel.css'

import { recommendationDelta, recommendationWinRate, sortRecommendationBuilds } from '@/lib/recommendation-rates'
const BaselineWinRate = createContext<number | null>(null)
export interface RecommendationAssets {
  items: Record<number, { name: string; iconPath: string; description: string; price: number; isBoots?: boolean }>
  augments: Record<number, { name: string; iconPath: string; description: string; rarity: string }>
}
const emptyAssets: RecommendationAssets = { items: {}, augments: {} }
const RecommendationAssetContext = createContext<RecommendationAssets>(emptyAssets)
function useItemInfo() {
  const assets = useContext(RecommendationAssetContext)
  return (id: number): RecommendationAssets['items'][number] => assets.items[id] ?? getItemInfo(id)
}

const EQUIPMENT_SORT_OPTIONS = [{value:'pick',label:'选取率',ariaLabel:'选取率优先'},{value:'win',label:'胜率',ariaLabel:'胜率优先'}] as const
const MAX_RECOMMENDATION_ROWS = 5
const OPGG_TIER_BASE_OPTIONS: Array<{ value: OpggTier; label: string }> = [
  { value: 'all', label: '全部段位' },
  { value: 'challenger', label: '最强王者' },
  { value: 'grandmaster', label: '傲世宗师' },
  { value: 'master_plus', label: '超凡大师+' },
  { value: 'master', label: '超凡大师' },
  { value: 'diamond_plus', label: '璀璨钻石+' },
  { value: 'diamond', label: '璀璨钻石' },
  { value: 'emerald_plus', label: '流光翡翠+' },
  { value: 'emerald', label: '流光翡翠' },
  { value: 'platinum_plus', label: '华贵铂金+' },
  { value: 'platinum', label: '华贵铂金' },
  { value: 'gold_plus', label: '荣耀黄金+' },
  { value: 'gold', label: '荣耀黄金' },
  { value: 'silver', label: '不屈白银' },
  { value: 'bronze', label: '英勇黄铜' },
  { value: 'iron', label: '坚韧黑铁' },
]
export const OPGG_TIER_OPTIONS: Array<{ value: OpggTier; label: string; icon?: string }> = OPGG_TIER_BASE_OPTIONS.map((option) => ({
  ...option,
  icon: getRankedMiniCrest(option.value.replace('_plus', '')),
}))
const OPGG_POSITION_VALUES: OpggPosition[] = ['top', 'jungle', 'mid', 'adc', 'support']

export interface RecommendationContext {
  championId: number
  queueId: number
  gameVersion: string
  gameMode: string
  position: OpggPosition
}

export interface BuildRecommendation {
  assets?: RecommendationAssets
  sourceLabel?: string
  mode: OpggMode
  modeLabel: string
  version: string
  position: OpggPosition
  baselineWinRate?: number | null
  summary: string[]
  summonerSpells: OpggItemBuild[]
  starterItems: OpggItemBuild[]
  boots: OpggItemBuild[]
  coreItems: OpggItemBuild[]
  prismItems: OpggItemBuild[]
  lastItems: OpggItemBuild[]
  runePages: OpggRuneBuild[]
  matchups: OpggMatchup[]
  augments: Array<{
    rarity: number
    label?: string
    items: Array<{ id: number; pickRate: number; averagePlace?: number; firstPlace?: number; winRate?: number }>
  }>
  meta?: RecommendationMeta
  warning?: string
}

export interface RecommendationMeta {
  rank: number | null
  previousRank: number | null
  rankDelta: number | null
  totalRank: number | null
  matchCount: number | null
  version: string
  updatedAt: string
}

export interface OpggBuildRecommendationPanelProps {
  context: RecommendationContext
  recommendation: BuildRecommendation | null
  loadError: string
  isLoading: boolean
  selectedTier: OpggTier
  onTierChange: (tier: OpggTier) => void
  onPositionChange: (position: OpggPosition) => void
  onClose: () => void
  koreanMatchups?: { items: OpggMatchup[]; version?: string }
}

export function OpggBuildRecommendationPanel({
  context,
  recommendation,
  loadError,
  isLoading,
  selectedTier,
  onTierChange,
  onPositionChange,
  onClose,
  koreanMatchups,
}: OpggBuildRecommendationPanelProps) {
  const { t } = useI18n()
  const [equipmentOrder, setEquipmentOrder] = useState<'pick'|'win'>('pick')
  const champion = getChampionById(context.championId)
  const championName = champion ? `${champion.title} ${champion.name}` : t('opgg.unrecognizedChampion')
  const queueText = recommendation?.modeLabel || (context.queueId > 0 ? getQueueName(context.queueId) : t('opgg.unknownQueue'))
  const positionText = recommendation?.position ?? context.position
  const modeTags = koreanMatchups
    ? ['OP.GG', '韩服单双排', formatPositionText(positionText), koreanMatchups.version && `${koreanMatchups.version} 版本`].filter(Boolean).join(' · ')
    : [queueText, formatPositionText(positionText), recommendation?.sourceLabel].filter(Boolean).join(' · ')
  const mayhem = isKiwiMode(context) || context.queueId === 2400
  const coreItems = useMemo(()=>mayhem?sortRecommendationBuilds(recommendation?.coreItems??[],equipmentOrder):recommendation?.coreItems,[recommendation?.coreItems,equipmentOrder,mayhem])
  const lastItems = useMemo(()=>mayhem?sortRecommendationBuilds(recommendation?.lastItems??[],equipmentOrder):recommendation?.lastItems,[recommendation?.lastItems,equipmentOrder,mayhem])
  const boots = useMemo(()=>mayhem?sortRecommendationBuilds(recommendation?.boots??[],equipmentOrder):recommendation?.boots,[recommendation?.boots,equipmentOrder,mayhem])
  const showAugments = mayhem || recommendation?.mode === 'arena'
  const showEarlyItems = mayhem || recommendation?.mode === 'ranked' || getQueue(context.queueId)?.mapId === 11
  const showPositionFilter = !!koreanMatchups || supportsPositionFilter(context, recommendation)

  return (
    <BaselineWinRate.Provider value={recommendation?.baselineWinRate ?? null}><RecommendationAssetContext.Provider value={recommendation?.assets ?? emptyAssets}><div className="sobp sobp--career">
      <CareerBackdrop />
      <div className="sobp-ambient" />

      <header className="sobp-titlebar">
        <div className="sobp-title-main">
          <div className="sobp-champion-ring">
            <img src={`/lol-game-data/assets/v1/champion-icons/${context.championId}.png`} alt="" />
          </div>
          <div className="sobp-title-text">
            <div className="sobp-title">
              <span className="sobp-title-mark">❖</span>
              <span className="sobp-title-name">{championName}</span>
            </div>
            {modeTags && <div className="sobp-mode-tag">{modeTags}</div>}
          </div>
        </div>
        <div className="sobp-title-actions">
          {showPositionFilter && (
            <PositionFilterSelect value={context.position} onChange={onPositionChange} allowUnselected={!!koreanMatchups} />
          )}
          {!mayhem && <TierFilterSelect value={selectedTier} onChange={onTierChange} />}
        </div>
        <button type="button" className="sobp-close" onClick={onClose} aria-label={t('opgg.close')}>
          ×
        </button>
        {(recommendation?.meta || !!recommendation?.summary.length) && <div className="sobp-overview">
          <TrendMeta meta={recommendation?.meta} />
          <SummaryCards values={recommendation?.summary ?? []} />
        </div>}
      </header>

      <main className="sobp-body">
        {koreanMatchups ? (
          <>
            {context.position === 'none' && <PanelMessage>选择该英雄的分路以查询韩服对位。</PanelMessage>}
            {context.position !== 'none' && !isLoading && !loadError &&
              <MatchupSection title="对位克制 · 胜率以所查英雄为视角" matchups={koreanMatchups.items} koreanView />}
          </>
        ) : (
          <>
            {mayhem && <AugmentSection title={t('opgg.section.augments')} groups={recommendation?.augments} />}
            <div className={`sobp-grid${mayhem ? " sobp-grid--mayhem" : ""}`}>
              {!mayhem && <RuneSection title={t('opgg.section.runes')} runes={recommendation?.runePages} championName={championName} modeLabel={recommendation?.modeLabel || queueText} />}
              <SpellSection title={t('opgg.section.spells')} builds={recommendation?.summonerSpells} limit={MAX_RECOMMENDATION_ROWS} />
            </div>
            {mayhem && recommendation && <div className="sobp-equipment-sort">
              <span>装备排序</span><SonaSegmented value={equipmentOrder} options={EQUIPMENT_SORT_OPTIONS} onChange={setEquipmentOrder} label="装备排序" />
              {recommendation.sourceLabel && <small>核心选取率按全部核心样本统计；成装与鞋子使用单件总体统计。</small>}
            </div>}
            {showEarlyItems && <>
              {!mayhem && <CompactEquipmentSection title="出门装推荐" builds={recommendation?.starterItems} />}
              <CompactEquipmentSection title="鞋子推荐" builds={boots} />
            </>}
              <div className="sobp-core-builds" data-testid="three-item-builds"><ItemSection title="核心出装" builds={coreItems?.filter((build) => build.ids.length === 3 && build.ids.every((id) => Number.isInteger(id) && id > 0) && new Set(build.ids).size === 3)} itemLimit={3} /></div>
            <div className="sobp-trend-wrap">
              <LastItemTrendSection title="后续成装推荐" builds={lastItems} />
            </div>
            {!mayhem && <MatchupSection title={t('opgg.section.matchups')} matchups={recommendation?.matchups} />}
            {showAugments && !mayhem && <AugmentSection title={t('opgg.section.augments')} groups={recommendation?.augments} />}
          </>
        )}

        {isLoading && <PanelMessage>{t('opgg.loading')}</PanelMessage>}
        {loadError && <PanelMessage warning>{t('opgg.loadFailed', { error: loadError })}</PanelMessage>}
        {recommendation?.warning && <PanelMessage warning>{recommendation.warning}</PanelMessage>}
        {!isLoading && !loadError && !recommendation && !koreanMatchups && <PanelMessage>{t('opgg.noData')}</PanelMessage>}
      </main>
    </div></RecommendationAssetContext.Provider></BaselineWinRate.Provider>
  )
}

function PositionFilterSelect({ value, onChange, allowUnselected }: {
  value: OpggPosition
  onChange: (position: OpggPosition) => void
  allowUnselected?: boolean
}) {
  const { t } = useI18n()
  const normalizedValue = OPGG_POSITION_VALUES.includes(value) ? value : allowUnselected ? 'none' : 'mid'

  return (
    <div className="sobp-position-filter" title={t('opgg.position.select')}>
      <SonaSelect
        value={normalizedValue}
        placeholder={allowUnselected ? '选择分路' : undefined}
        onChange={(nextValue) => onChange(nextValue as OpggPosition)}
        options={OPGG_POSITION_VALUES.map((position) => ({
          value: position,
          label: formatPositionText(position),
        }))}
      />
    </div>
  )
}

function TierFilterSelect({ value, onChange }: { value: OpggTier; onChange: (tier: OpggTier) => void }) {
  return (
    <div className="sobp-tier-filter">
      <SonaSelect
        value={value}
        onChange={(nextValue) => onChange(nextValue as OpggTier)}
        options={OPGG_TIER_OPTIONS}
      />
    </div>
  )
}

function isKiwiMode(context: RecommendationContext): boolean {
  return context.gameMode.toLowerCase() === 'kiwi'
}

function supportsPositionFilter(context: RecommendationContext, recommendation: BuildRecommendation | null): boolean {
  if (recommendation) return recommendation.mode === 'ranked'

  const mode = context.gameMode.toLowerCase()
  return !['aram', 'kiwi', 'cherry', 'arena', 'nexusblitz', 'nexus_blitz', 'urf', 'arurf'].includes(mode)
}

function formatPositionText(position: OpggPosition): string {
  switch (position) {
    case 'top':
      return translate('opgg.position.top')
    case 'jungle':
      return translate('opgg.position.jungle')
    case 'mid':
      return translate('opgg.position.mid')
    case 'adc':
      return translate('opgg.position.adc')
    case 'support':
      return translate('opgg.position.support')
    default:
      return ''
  }
}

function SummaryCards({ values }: { values: string[] }) {
  if (values.length === 0) return null

  return (
    <div className="sobp-summary">
      {values.map((value) => {
        const metric = splitSummaryMetric(value)
        return (
          <div className={`sobp-summary-card sobp-summary-card--${metric.kind}`} key={value}>
            {metric.kind === 'tier'
              ? <TierBadge value={metric.metric} />
              : (
                <>
                  {metric.label && <span className="sobp-summary-label">{metric.label}</span>}
                  <span className="sobp-summary-value">{metric.metric}</span>
                </>
              )}
          </div>
        )
      })}
    </div>
  )
}

function TrendMeta({ meta }: { meta?: RecommendationMeta }) {
  const { t } = useI18n()
  if (!meta) return null

  const trend = getRankTrend(meta.rankDelta)
  const rankText = meta.rank && meta.totalRank ? `${meta.rank}/${meta.totalRank}` : meta.rank ? `#${meta.rank}` : ''
  if (trend.kind === 'unknown' && rankText) {
    return (
      <div className="sobp-meta">
        <div className="sobp-meta-trend sobp-meta-trend--flat">
          <span className="sobp-meta-rank">{rankText}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="sobp-meta">
      <div className={`sobp-meta-trend sobp-meta-trend--${trend.kind}`}>
        <span className="sobp-meta-label">{t('opgg.trend')}</span>
        <span className="sobp-meta-value">{trend.text}</span>
        {rankText && <span className="sobp-meta-rank">{rankText}</span>}
      </div>
    </div>
  )
}

function getRankTrend(delta: number | null): { kind: 'up' | 'down' | 'flat' | 'unknown'; text: string } {
  if (delta == null) return { kind: 'unknown', text: '暂无' }
  if (delta > 0) return { kind: 'up', text: `↑ ${delta}` }
  if (delta < 0) return { kind: 'down', text: `↓ ${Math.abs(delta)}` }
  return { kind: 'flat', text: '持平' }
}

function TierBadge({ value }: { value: string }) {
  const tier = Number.parseInt(value.replace(/\D/g, ''), 10)
  const icon = getTierIcon(tier)
  if (!icon) return <span className="sobp-summary-value">{value}</span>

  return <img className="sobp-tier-icon" src={icon} alt={value} title={value} />
}

function getTierIcon(tier: number): string {
  switch (tier) {
    case 1:
      return tier1Icon
    case 2:
      return tier2Icon
    case 3:
      return tier3Icon
    case 4:
      return tier4Icon
    case 5:
      return tier5Icon
    default:
      return ''
  }
}

type SummaryKind = 'win-high' | 'win-low' | 'win-even' | 'pick' | 'tier' | 'rank' | 'default'

function splitSummaryMetric(value: string): { label: string; metric: string; kind: SummaryKind } {
  const parts = value.trim().split(/\s+/)
  if (parts.length < 2) return { label: '', metric: value, kind: getSummaryKind(value) }

  const label = parts.slice(0, -1).join(' ')
  const metric = parts[parts.length - 1]
  if (label.toLowerCase() === 'tier') {
    return { label: '', metric: normalizeTierText(metric), kind: 'tier' }
  }

  return {
    label,
    metric,
    kind: getSummaryKind(value),
  }
}

function normalizeTierText(value: string): string {
  const tier = value.trim().replace(/^tier\s*/i, '')
  if (/^(?:S{1,3}|[ABCDF])[+-]?$/i.test(tier)) return tier.toUpperCase()
  return tier ? `T${tier}` : 'T-'
}

function getSummaryKind(value: string): SummaryKind {
  const text = value.toLowerCase()
  if (value.includes('胜率')) {
    const winRate = Number.parseFloat(value.replace(/[^\d.]/g, ''))
    return Number.isFinite(winRate) && winRate > 50 ? 'win-high' : 'win-low'
  }
  if (value.includes('登场')) return 'pick'
  if (text.includes('tier')) return 'tier'
  if (value.includes('排名')) return 'rank'
  return 'default'
}

function Section({ title, children, empty = false, emptyText, count, toolbar, partialLimit = 8 }: {
  title: string; children: ReactNode | ((limit: number) => ReactNode); empty?: boolean; emptyText?: string; count?: number; toolbar?: ReactNode; partialLimit?: number
}) {
  const { t } = useI18n()
  const [mode,setMode]=useState<'hidden'|'partial'|'all'>('partial')
  const content=useRef<HTMLDivElement>(null)
  const [height,setHeight]=useState<number>()
  const collapsible=count != null && count>0
  const large=(count ?? 0)>partialLimit
  const closed=collapsible && mode==='hidden'
  const limit=large && mode!=='all' ? partialLimit : Infinity
  // Height observations must not rebuild every item, tooltip and image in this section.
  const body=useMemo(()=><div className="sobp-section-card">{toolbar}{empty?<div className="sobp-empty">{emptyText??t('common.noData')}</div>:typeof children==='function'?children(limit):children}</div>,[toolbar,empty,emptyText,t,children,limit])
  useLayoutEffect(()=>{
    if (!collapsible || closed || !content.current) return
    const node=content.current
    const update=(next:number)=>setHeight((old)=>old!=null&&Math.abs(old-next)<.5?old:next)
    const observer=new ResizeObserver(([entry])=>update(entry.borderBoxSize?.[0]?.blockSize??entry.contentRect.height))
    observer.observe(node);update(node.getBoundingClientRect().height)
    return ()=>observer.disconnect()
  },[collapsible,closed])
  const action=(label:string,onClick:()=>void,path:string)=> <HistoryAssetTooltip title={label} compact asChild>
    <button type="button" className="sobp-fold-button" aria-label={`${title}：${label}`} aria-expanded={label==='收起'?true:label==='展开'?false:undefined} onClick={onClick}><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d={path}/></svg></button>
  </HistoryAssetTooltip>
  return <section className={`sobp-section${collapsible?' sobp-section-collapsible':''}`} data-section-title={title}>
    <h3 className="sobp-section-title"><span />{title}
      {collapsible && <div className="sobp-section-actions">
        {large && action(mode==='all'?'部分显示':'展开全部',()=>setMode(mode==='all'?'partial':'all'),mode==='all'?'M3 5h10M3 8h7M3 11h4':'m3 3 5 4 5-4m-10 6 5 4 5-4')}
        {action(closed?'展开':'收起',()=>setMode(closed?(large?'partial':'all'):'hidden'),closed?'m3 6 5 5 5-5':'m3 10 5-5 5 5')}
      </div>}
    </h3>
    <div className="sobp-section-reveal" style={collapsible?{height:closed?0:height??'auto'}:undefined} aria-hidden={closed || undefined} inert={closed || undefined}>
      <div ref={content}>
        {body}
      </div>
    </div>
  </section>
}

function ItemSection({ title, builds, itemLimit }: { title: string; builds?: OpggItemBuild[]; itemLimit: number }) {
  const getItemInfo = useItemInfo()
  const visibleBuilds = builds ?? []
  const maxRate = getMaxPickRate(visibleBuilds, 0.15)

  return (
    <Section title={title} empty={visibleBuilds.length === 0} count={visibleBuilds.length}>
      {(limit)=>visibleBuilds.slice(0,limit).map((build, index) => (
        <div className="sobp-row" key={`${index}-${build.ids.join('-')}`}>
          <div className="sobp-row-main">
            <RankBadge rank={index + 1} />
            <div className="sobp-icons sobp-icons--items">
              {build.ids.slice(0, itemLimit).map((id, itemIndex, ids) => {
                const item = getItemInfo(id)
                return (
                  <span className="sobp-icon-step" key={`${id}-${itemIndex}`}>
                    <BuildIcon src={item.iconPath} title={item.name} description={item.description} price={item.price} size={32} />
                    {itemIndex < ids.length - 1 && <span className="sobp-arrow">▶</span>}
                  </span>
                )
              })}
            </div>
          </div>
          <RecommendationStats build={build} maxRate={maxRate} />
        </div>
      ))}
    </Section>
  )
}

function CompactEquipmentSection({title,builds}:{title:string;builds?:OpggItemBuild[]}) {
  const getItemInfo = useItemInfo()
  const entries=(builds ?? []).filter((build)=>build.ids.length>0 && build.ids.every((id)=>Number.isInteger(id) && id>0))
  return <div className="sobp-compact-equipment">
    <Section title={title} count={entries.length} empty={!entries.length}>
      {(limit)=><div className="sobp-equipment-cards">{entries.slice(0,limit).map((build,index)=><div className="sobp-equipment-card" key={`${index}-${build.ids.join('-')}`}>
        <small className="sobp-equipment-rank">#{index+1}</small>
        <div className="sobp-equipment-icons">{build.ids.map((id,i)=>{const item=getItemInfo(id);return <BuildIcon key={`${id}-${i}`} src={item.iconPath} title={item.name} description={item.description} price={item.price} size={26} />})}</div>
        <RecommendationStats build={build} maxRate={1} />
      </div>)}</div>}
    </Section>
  </div>
}

function LastItemTrendSection({ title, builds }: { title: string; builds?: OpggItemBuild[] }) {
  const getItemInfo = useItemInfo()
  const visibleItems = (builds ?? [])
    .filter((build) => build.ids.length === 1 && !(getItemInfo(build.ids[0]).isBoots ?? /靴|鞋|足具|boots|shoes|treads|greaves/i.test(getItemInfo(build.ids[0]).name)))
    .flatMap((build, buildIndex) => build.ids.map((id, itemIndex) => ({
      id,
      key: `${buildIndex}-${itemIndex}-${id}`,
      pickRate: build.pick_rate,
      winRate: getBuildWinRate(build),
      baselineWinRate: build.baselineWinRate,
    })))


  return (
    <Section title={title} empty={visibleItems.length === 0} count={visibleItems.length} partialLimit={10}>
      {(limit)=><div className="sobp-last-items">
        {visibleItems.slice(0,limit).map((entry, index) => {
          const item = getItemInfo(entry.id)
          return (
            <div className="sobp-last-item" key={entry.key}><RankBadge rank={index + 1} />
              <BuildIcon src={item.iconPath} title={item.name} description={item.description} price={item.price} size={34} />
              <RecommendationRates pickRate={entry.pickRate} winRate={entry.winRate} maxRate={1} baselineWinRate={entry.baselineWinRate} />
            </div>
          )
        })}
      </div>}
    </Section>
  )
}

function SpellSection({ title, builds, limit }: { title: string; builds?: OpggItemBuild[]; limit: number }) {
  const visibleBuilds = builds?.slice(0, limit) ?? []
  const maxRate = getMaxPickRate(visibleBuilds, 1)

  return (
    <Section title={title} empty={visibleBuilds.length === 0}>
      {visibleBuilds.map((build, index) => (
        <div className="sobp-row" key={`${index}-${build.ids.join('-')}`}>
          <div className="sobp-row-main">
            <RankBadge rank={index + 1} />
            <div className="sobp-icons">
              {[...build.ids].reverse().map((id) => {
                const spell = getSpellInfo(id)
                return <BuildIcon key={id} src={spell.iconPath || getSpellIcon(id)} title={spell.name || getSpellName(id)} description={spell.description} size={32} />
              })}
            </div>
          </div>
          <RecommendationStats build={build} maxRate={maxRate} />
        </div>
      ))}
    </Section>
  )
}

function MatchupSection({ title, matchups, koreanView }: { title: string; matchups?: OpggMatchup[]; koreanView?: boolean }) {
  const { t } = useI18n()
  const items = matchups ?? []
  const advantages = (koreanView ? items.filter((item) => item.winRate > 0.5) : [...items])
    .sort((a, b) => b.winRate - a.winRate || b.play - a.play)
    .slice(0, 9)
  const disadvantages = (koreanView ? items.filter((item) => item.winRate < 0.5) : [...items])
    .sort((a, b) => a.winRate - b.winRate || b.play - a.play)
    .slice(0, 9)
  const even = koreanView ? items.filter((item) => item.winRate === 0.5).sort((a, b) => b.play - a.play).slice(0, 9) : []
  const hasData = advantages.length > 0 || disadvantages.length > 0 || even.length > 0

  return (
    <div className="sobp-matchup-wrap">
      <Section title={title} empty={!hasData} emptyText={t('opgg.noMatchups')}>
        <div className="sobp-matchup-columns">
          <MatchupGroup title={koreanView ? '可反制该英雄' : t('opgg.matchup.advantage')} items={koreanView ? disadvantages : advantages} tone={koreanView ? 'bad' : 'good'} />
          <MatchupGroup title={koreanView ? '该英雄表现占优' : t('opgg.matchup.disadvantage')} items={koreanView ? advantages : disadvantages} tone={koreanView ? 'good' : 'bad'} />
          {even.length > 0 && <MatchupGroup title="均势对位" items={even} tone="neutral" />}
        </div>
      </Section>
    </div>
  )
}

function MatchupGroup({ title, items, tone }: { title: string; items: OpggMatchup[]; tone: 'good' | 'bad' | 'neutral' }) {
  return (
    <div className="sobp-matchup-group">
      <div className={`sobp-matchup-heading sobp-matchup-heading--${tone}`}>{title}</div>
      <div className="sobp-matchup-list">
        {items.map((item) => {
          const champion = getChampionById(item.championId)
          const championName = champion ? `${champion.title} ${champion.name}` : `英雄 ${item.championId}`
          return (
            <div className="sobp-matchup" key={`${tone}-${item.championId}`}>
              <img className="sobp-matchup-icon" src={`/lol-game-data/assets/v1/champion-icons/${item.championId}.png`} alt="" />
              <div className="sobp-matchup-info">
                <span className="sobp-matchup-name" title={championName}>{championName}</span>
                <span className="sobp-matchup-detail">
                  <span className={`sobp-matchup-rate sobp-matchup-rate--${tone}`}>{formatPercent(item.winRate)}</span>
                  <span className="sobp-matchup-play">{item.play.toLocaleString()}场</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RuneSection({ title, runes, championName, modeLabel }: { title: string; runes?: OpggRuneBuild[]; championName: string; modeLabel: string }) {
  const { t } = useI18n()
  const visibleRunes = runes?.slice(0, MAX_RECOMMENDATION_ROWS) ?? []
  const maxRate = getMaxRunePickRate(visibleRunes, 0.15)
  const [applyingKey, setApplyingKey] = useState('')
  const [appliedKey, setAppliedKey] = useState('')
  const [applyErrorKey, setApplyErrorKey] = useState('')

  const applyRune = async (rune: OpggRuneBuild, index: number) => {
    const key = `${index}-${rune.id}`
    setApplyingKey(key)
    setAppliedKey('')
    setApplyErrorKey('')

    try {
      const pageName = `${championName} ${modeLabel} - Sona`
      await lcu.applyRunePage({
        name: pageName,
        primaryStyleId: rune.primary_page_id,
        subStyleId: rune.secondary_page_id,
        selectedPerkIds: [
          ...rune.primary_rune_ids,
          ...rune.secondary_rune_ids,
          ...rune.stat_mod_ids,
        ],
      })
      setAppliedKey(key)
      try {
        await lcu.sendChampSelectMessage(t('opgg.chat.runesApplied', { championName, modeLabel }), 'celebration')
      } catch {
        // 非选人阶段或聊天室未就绪时忽略
      }
    } catch {
      setApplyErrorKey(key)
    } finally {
      setApplyingKey('')
    }
  }

  return (
    <Section title={title} empty={visibleRunes.length === 0} emptyText={t('opgg.noCustomRunes')}>
      {visibleRunes.map((rune, index) => {
        const applyKey = `${index}-${rune.id}`
        const keystoneId = rune.primary_rune_ids[0] ?? 0
        const keystone = getPerkInfo(keystoneId)
        return (
          <div className="sobp-row" key={`${index}-${rune.primary_rune_ids.join('-')}-${rune.secondary_rune_ids.join('-')}`}>
            <div className="sobp-row-main">
              <RankBadge rank={index + 1} />
              <div className="sobp-runes">
                <div className="sobp-rune-group">
                  <BuildIcon src={keystone.iconPath || getPerkIcon(keystoneId)} title={keystone.name || getPerkName(keystoneId)} description={keystone.description} size={32} border="#c8aa6e" round />
                  <div className="sobp-small-runes">
                    {rune.primary_rune_ids.slice(1, 4).map((id) => {
                      const perk = getPerkInfo(id)
                      return <BuildIcon key={id} src={perk.iconPath || getPerkIcon(id)} title={perk.name || getPerkName(id)} description={perk.description} size={24} round />
                    })}
                  </div>
                </div>
                <span className="sobp-rune-divider" />
                <div className="sobp-rune-group">
                  <BuildIcon src={getPerkStyleIcon(rune.secondary_page_id)} title={getPerkStyleName(rune.secondary_page_id)} size={24} round />
                  {rune.secondary_rune_ids.slice(0, 2).map((id) => {
                    const perk = getPerkInfo(id)
                    return <BuildIcon key={id} src={perk.iconPath || getPerkIcon(id)} title={perk.name || getPerkName(id)} description={perk.description} size={24} round />
                  })}
                </div>
              </div>
            </div>
            <div className="sobp-rune-actions">
              <RecommendationStats build={rune} maxRate={maxRate} />
              <button
                type="button"
                className={`sobp-apply-rune${appliedKey === applyKey ? ' sobp-apply-rune--done' : ''}${applyErrorKey === applyKey ? ' sobp-apply-rune--error' : ''}`}
                disabled={applyingKey === applyKey}
                onClick={(event) => {
                  event.stopPropagation()
                  void applyRune(rune, index)
                }}
              >
                {applyingKey === applyKey ? t('opgg.applying') : appliedKey === applyKey ? t('opgg.applied') : applyErrorKey === applyKey ? t('common.failed') : t('common.apply')}
              </button>
            </div>
          </div>
        )
      })}
    </Section>
  )
}

const AUGMENT_TYPES = [{value:0,label:'全部'},{value:8,label:'棱彩'},{value:4,label:'黄金'},{value:1,label:'白银'}] as const

function AugmentSection({ title, groups }: { title: string; groups?: BuildRecommendation['augments'] }) {
  const assets = useContext(RecommendationAssetContext)
  const [rarity, setRarity] = useState(0)
  const sorted=useMemo(()=>[...new Map((groups ?? []).flatMap((group) => group.items.map((item) => ({...item, rarity: group.rarity, rarityLabel: group.label ?? getAugmentRarityLabel(group.rarity)}))).map((item) => [item.id,item])).values()]
    .sort((a,b) => (Number.isFinite(b.winRate) ? b.winRate! : -1) - (Number.isFinite(a.winRate) ? a.winRate! : -1) || b.pickRate-a.pickRate || a.id-b.id),[groups])
  const entries=useMemo(()=>rarity?sorted.filter((item)=>item.rarity===rarity):sorted,[sorted,rarity])
  const toolbar=<div className="sobp-augment-filters">
    <SonaSegmented value={rarity} options={AUGMENT_TYPES} onChange={setRarity} label="海克斯类型" className="sobp-augment-switch" thumbClassName="sobp-augment-switch-thumb" />
    <small>{entries.length} 个 · 胜率排序</small>
  </div>
  return <div className="sobp-augment-wrap sobp-augments-compact">
    <Section title={title} empty={!entries.length} count={entries.length} toolbar={toolbar} partialLimit={12}>
      {(limit)=><div className="sobp-augment-grid">
        {entries.slice(0,limit).map((augment,index) => {
          const info=assets.augments[augment.id] ?? getAugmentInfo(augment.id)
          return <div className="sobp-augment" key={augment.id} data-rarity={augment.rarity}>
            <BuildIcon src={info?.iconPath ?? ''} title={info?.name ?? String(augment.id)} description={info?.description ?? ''} subtitle={augment.rarityLabel} size={26} border={getAugmentBorder(info?.rarity)} />
            <div className="sobp-augment-info">
              <div className="sobp-augment-name"><small>#{index+1}</small> {info?.name ?? String(augment.id)} <small>{augment.rarityLabel}</small></div>
              <RecommendationRates pickRate={augment.pickRate} winRate={augment.winRate} maxRate={1} />
              {Number.isFinite(augment.averagePlace) && <div className="sobp-augment-meta">均排 {formatPlace(augment.averagePlace)}</div>}
            </div>
          </div>
        })}
      </div>}
    </Section>
  </div>
}

function RankBadge({ rank }: { rank: number }) {
  return <div className={`sobp-rank${rank === 1 ? ' sobp-rank--first' : ''}`}>#{rank}</div>
}

function getBuildWinRate(build: {win?: number; play?: number; winRate?: number | null}): number | undefined {
  return recommendationWinRate(build)
}

function RecommendationStats({ build, maxRate }: { build: {pick_rate: number; win?: number; play?: number; winRate?: number | null; baselineWinRate?: number | null}; maxRate: number }) {
  return <RecommendationRates pickRate={build.pick_rate} winRate={getBuildWinRate(build)} maxRate={maxRate} baselineWinRate={build.baselineWinRate} />
}

function RecommendationRates({pickRate,winRate,maxRate,baselineWinRate}:{pickRate:number;winRate?:number;maxRate:number;baselineWinRate?:number|null}) {
  const inherited=useContext(BaselineWinRate)
  const delta = recommendationDelta(winRate, baselineWinRate === undefined ? inherited : baselineWinRate)
  return <div className="sobp-recommendation-stats">
    <StatBar value={pickRate} maxRate={maxRate} />
    <div className="sobp-win-rate"><span>胜率</span><span className="sobp-win-value"><strong>{formatPercent(winRate)}</strong>{delta != null && <small className={`sobp-win-delta${delta > 0 ? " is-positive" : delta < 0 ? " is-negative" : ""}`}>({delta > 0 ? "+" : ""}{delta.toFixed(1)}%)</small>}</span></div>
  </div>
}

function StatBar({ value, maxRate }: { value?: number; maxRate: number }) {
  const safeValue = Number.isFinite(value) ? (value ?? 0) : 0
  const safeMax = maxRate > 0 ? maxRate : 1
  const width = Math.max(0, Math.min(100, (safeValue / safeMax) * 100))

  return (
    <div className="sobp-stat">
      <div className="sobp-pick-rate"><span>选取率</span><strong>{formatPercent(value)}</strong></div>
      <div className="sobp-stat-track">
        <div className="sobp-stat-fill" style={{ width: `${width.toFixed(1)}%` }} />
      </div>
    </div>
  )
}

function BuildIcon({
  src,
  title,
  description = '',
  subtitle = '',
  price = 0,
  size,
  border = '#3c2e16',
  round = false,
}: {
  src: string
  title: string
  description?: string
  subtitle?: string
  price?: number
  size: number
  border?: string
  round?: boolean
}) {
  const style = {
    width: size,
    height: size,
    borderColor: border,
    borderRadius: round ? '50%' : 3,
  }

  if (!src) {
    return (
      <IconTooltip title={title} description={description} subtitle={subtitle} price={price} iconSrc={src} border={border}>
        <span className="sobp-icon sobp-icon--missing" style={style}>
          ?
        </span>
      </IconTooltip>
    )
  }

  return (
    <IconTooltip title={title} description={description} subtitle={subtitle} price={price} iconSrc={src} border={border}>
      <img className="sobp-icon" src={src} alt="" style={style} />
    </IconTooltip>
  )
}

interface TooltipPosition {
  left: number
  top: number
  arrowLeft: number
  placement: 'top' | 'bottom'
  ready: boolean
}

function IconTooltip({
  title,
  description,
  subtitle,
  price = 0,
  iconSrc,
  border,
  children,
}: {
  title: string
  description?: string
  subtitle?: string
  price?: number
  iconSrc: string
  border: string
  children: ReactNode
}) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<number | null>(null)
  const activatedRef = useRef(false)
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState<TooltipPosition>({ left: 0, top: 0, arrowLeft: 0, placement: 'top', ready: false })
  const parsedDescription = parseTooltipDescription(description)
  useEffect(() => () => { if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current) }, [])

  useLayoutEffect(() => {
    if (!mounted || !anchorRef.current || !tooltipRef.current) return

    const margin = 8
    const gap = 10
    const anchor = anchorRef.current.getBoundingClientRect()
    const tooltip = tooltipRef.current.getBoundingClientRect()
    const center = anchor.left + anchor.width / 2
    let left = center - tooltip.width / 2
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltip.width - margin))

    let placement: TooltipPosition['placement'] = 'top'
    let top = anchor.top - tooltip.height - gap
    const titlebar = anchorRef.current.closest('.sobp')?.querySelector('.sobp-titlebar')?.getBoundingClientRect()
    if (top < Math.max(margin, (titlebar?.bottom ?? 0) + gap)) {
      placement = 'bottom'
      top = anchor.bottom + gap
    }
    if (top + tooltip.height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - tooltip.height - margin)
    }

    const arrowLeft = Math.max(14, Math.min(center - left, tooltip.width - 14))
    setPosition({ left, top, arrowLeft, placement, ready: true })

    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [mounted, title, description, subtitle, price])

  const showTooltip = () => {
    if (activatedRef.current) return
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setMounted(true)
  }

  const hideTooltip = () => {
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current)
    setVisible(false)
    closeTimerRef.current = window.setTimeout(() => {
      setMounted(false)
      closeTimerRef.current = null
    }, 140)
  }
  const dismissTooltip = () => {
    activatedRef.current = true
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null; setVisible(false); setMounted(false)
  }

  return (
    <span
      ref={anchorRef}
      className="sobp-icon-tooltip-wrap"
      tabIndex={0}
      aria-label={title}
      onMouseEnter={showTooltip}
      onMouseLeave={() => { activatedRef.current = false; hideTooltip() }}
      onFocus={showTooltip}
      onBlur={() => { activatedRef.current = false; hideTooltip() }}
      onPointerDownCapture={dismissTooltip}
      onClickCapture={dismissTooltip}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') dismissTooltip() }}
    >
      {children}
      {mounted && createPortal(
        <div
          ref={tooltipRef}
          className={`sobp-official-tooltip sobp-official-tooltip--${position.placement}${position.ready && visible ? ' sobp-official-tooltip--ready' : ''}`}
          style={{
            left: position.left,
            top: position.top,
            ['--sobp-tooltip-arrow-left' as string]: `${position.arrowLeft}px`,
          }}
        >
          <div className="sobp-official-tooltip-head">
            <span className="sobp-official-tooltip-icon" style={{ borderColor: border }}>
              {iconSrc ? <img src={iconSrc} alt="" /> : '?'}
            </span>
            <div className="sobp-official-tooltip-titlebox">
              <div className="sobp-official-tooltip-title">{title}</div>
              {price > 0
                ? (
                  <div className="sobp-official-tooltip-price">
                    <span className="sobp-gold-icon" aria-hidden="true" />
                    <span>{price}</span>
                  </div>
                )
                : subtitle && <div className="sobp-official-tooltip-subtitle">{subtitle}</div>}
            </div>
          </div>
          {(parsedDescription.stats.length > 0 || parsedDescription.effectTitle || parsedDescription.effectBody) && (
            <div className="sobp-official-tooltip-desc">
              {parsedDescription.stats.length > 0 && (
                <div className="sobp-official-tooltip-stats">
                  {parsedDescription.stats.map((line) => <div key={line}>{line}</div>)}
                </div>
              )}
              {(parsedDescription.stats.length > 0 && (parsedDescription.effectTitle || parsedDescription.effectBody)) && (
                <div className="sobp-official-tooltip-separator" />
              )}
              {parsedDescription.effectTitle && <div className="sobp-official-tooltip-effect-title">{parsedDescription.effectTitle}</div>}
              {parsedDescription.effectBody && <div className="sobp-official-tooltip-effect-body">{parsedDescription.effectBody}</div>}
            </div>
          )}
        </div>,
        document.body,
      )}
    </span>
  )
}

function parseTooltipDescription(description = ''): { stats: string[]; effectTitle: string; effectBody: string } {
  const normalized = description.trim()
  if (!normalized) return { stats: [], effectTitle: '', effectBody: '' }

  const blocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)

  if (blocks.length >= 2) {
    const stats = blocks[0].split('\n').map((line) => line.trim()).filter(Boolean)
    const effectLines = blocks.slice(1).join('\n\n').split('\n').map((line) => line.trim()).filter(Boolean)
    return {
      stats,
      effectTitle: effectLines[0] ?? '',
      effectBody: effectLines.slice(1).join('\n'),
    }
  }

  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length >= 2 && lines.slice(0, -1).every(isStatLine)) {
    return { stats: lines, effectTitle: '', effectBody: '' }
  }

  return {
    stats: [],
    effectTitle: lines.length > 1 ? lines[0] : '',
    effectBody: lines.length > 1 ? lines.slice(1).join('\n') : lines[0] ?? '',
  }
}

function isStatLine(line: string): boolean {
  return /^[+\d]/.test(line)
}

function PanelMessage({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return <div className={`sobp-message${warning ? ' sobp-message--warning' : ''}`}>{children}</div>
}

function getMaxPickRate(builds: OpggItemBuild[], fallback: number): number {
  return Math.max(fallback, ...builds.map((build) => Number.isFinite(build.pick_rate) ? build.pick_rate : 0))
}

function getMaxRunePickRate(runes: OpggRuneBuild[], fallback: number): number {
  return Math.max(fallback, ...runes.map((rune) => Number.isFinite(rune.pick_rate) ? rune.pick_rate : 0))
}

function formatPercent(value: number | undefined): string {
  if (!Number.isFinite(value)) return '—'
  return `${((value ?? 0) * 100).toFixed(1)}%`
}

function formatPlace(value: number | undefined): string {
  if (!Number.isFinite(value)) return '-'
  return `${(value ?? 0).toFixed(2)}名`
}

function getAugmentRarityLabel(rarity: number): string {
  if (rarity === 1) return '银色'
  if (rarity === 4) return '金色'
  if (rarity === 8) return '棱彩'
  return `稀有度 ${rarity}`
}

function getAugmentBorder(rarity: string | undefined): string {
  if (rarity?.toLowerCase().includes('prismatic')) return '#b788ff'
  if (rarity?.toLowerCase().includes('gold')) return '#c8aa6e'
  if (rarity?.toLowerCase().includes('silver')) return '#a09b8c'
  return '#3c2e16'
}
