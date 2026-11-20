import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { OpggBuildRecommendationPanel, type BuildRecommendation, type RecommendationContext } from '@/components/ui/OpggBuildRecommendationPanel'
import { SonaSegmented } from '@/components/ui/SonaSegmented'
import { SearchIcon } from '@/components/ui/icons'
import { getAllChampions, getChampionBalance, getChampionById, getChampIcon, type BalanceMode, type ChampionBalanceStats, type ChampionInfo } from '@/lib/assets'
import {
  applyManagedItemSetBuild,
  fetchStandaloneRecommendation,
  getStoredOpggTier,
  resolveMostCommonPosition,
  setStoredOpggTier,
} from '@/lib/features/opgg-build-recommendation'
import { createSearchIndex, findHighlightRange, matchesSearchIndex, tokenizeSearchQuery, type SmartSearchIndex } from '@/lib/pinyin-search'
import { bindScrollbarHighlight } from '@/lib/scrollbar-highlight'
import type { OpggItemBuild, OpggPosition, OpggTier } from '@/lib/opgg-api'
import '@/styles/BuildLookupPage.css'

type LookupModeKey = 'ranked' | 'aram' | 'kiwi' | 'arena' | 'urf'

interface BalancePill {
  key: string
  glyph: string
  value: string
  tooltip: string
  tone: 'buff' | 'nerf'
}

interface IndexedChampion {
  champ: ChampionInfo
  index: SmartSearchIndex
}

const LOOKUP_MODES: ReadonlyArray<{
  value: LookupModeKey
  label: string
  queueId: number
  gameMode: string
  balanceMode?: BalanceMode
}> = [
  { value: 'ranked', label: '峡谷', queueId: 420, gameMode: 'CLASSIC' },
  { value: 'aram', label: '大乱斗', queueId: 450, gameMode: 'ARAM', balanceMode: 'aram' },
  { value: 'kiwi', label: '海斗', queueId: 2400, gameMode: 'KIWI', balanceMode: 'aram' },
  { value: 'arena', label: '斗魂', queueId: 1700, gameMode: 'CHERRY' },
  { value: 'urf', label: '无限火力', queueId: 900, gameMode: 'URF', balanceMode: 'urf' },
]

let lastLookupChampionId = 0
let lastLookupMode: LookupModeKey = 'ranked'
let recentLookupIds: number[] = []

function formatBalancePills(stats: ChampionBalanceStats | undefined): BalancePill[] {
  if (!stats) return []
  const pills: BalancePill[] = []
  const pushRatio = (key: string, glyph: string, title: string, value: number | undefined, lowerIsBetter = false) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value - 1) < 0.005) return
    const pct = Math.round((value - 1) * 100)
    const signValue = pct > 0 ? `+${pct}%` : `${pct}%`
    const isBuff = lowerIsBetter ? pct < 0 : pct > 0
    pills.push({ key, glyph, value: signValue, tooltip: `${title} ${signValue}`, tone: isBuff ? 'buff' : 'nerf' })
  }
  pushRatio('dmg_dealt', '⚔', '造成伤害', stats.dmg_dealt)
  pushRatio('dmg_taken', '🛡', '承受伤害', stats.dmg_taken, true)
  pushRatio('healing', '♥', '治疗效果', stats.healing)
  pushRatio('shielding', '◈', '护盾效果', stats.shielding)
  pushRatio('attack_speed', '➶', '攻速收益', stats.attack_speed)
  pushRatio('movement_speed', '»', '移速', stats.movement_speed)
  pushRatio('tenacity', '✦', '韧性', stats.tenacity)
  pushRatio('mana_regen', '💧', '回蓝', stats.mana_regen)
  pushRatio('energy_regen', '⚡', '回能', stats.energy_regen)
  if (typeof stats.ability_haste === 'number' && Number.isFinite(stats.ability_haste) && stats.ability_haste !== 0) {
    const signValue = stats.ability_haste > 0 ? `+${stats.ability_haste}` : `${stats.ability_haste}`
    pills.push({
      key: 'ability_haste',
      glyph: '⚡',
      value: signValue,
      tooltip: `技能急速 ${signValue}`,
      tone: stats.ability_haste > 0 ? 'buff' : 'nerf',
    })
  }
  return pills
}

function renderHit(text: string, query: string): ReactNode {
  if (!query) return text
  const range = findHighlightRange(text, query)
  if (!range) return text
  return (
    <>
      {text.slice(0, range[0])}
      <mark className="sobp-search-hit">{text.slice(range[0], range[1])}</mark>
      {text.slice(range[1])}
    </>
  )
}

const HeroGridCard = memo(function HeroGridCard({
  champ,
  query,
  balanceMode,
  onSelect,
}: {
  champ: ChampionInfo
  query: string
  balanceMode?: BalanceMode
  onSelect: (id: number) => void
}) {
  const miniPills = useMemo(() => {
    if (!balanceMode) return null
    const pills = formatBalancePills(getChampionBalance(champ.id)?.stats[balanceMode])
    return pills.length > 0 ? pills.slice(0, 2) : null
  }, [champ.id, balanceMode])

  return (
    <button
      type="button"
      className="sbl-hero-card"
      data-champion-id={champ.id}
      onClick={() => onSelect(champ.id)}
    >
      <img src={getChampIcon(champ.id)} alt="" loading="lazy" />
      <strong>{renderHit(champ.name, query)}</strong>
      {miniPills ? (
        <span className="sbl-card-buffs">
          {miniPills.map((pill) => (
            <span key={pill.key} className={`sbl-mini-pill sbl-mini-pill--${pill.tone}`} data-sona-tooltip={pill.tooltip}>
              {pill.glyph}{pill.value}
            </span>
          ))}
        </span>
      ) : (
        <small>{renderHit(champ.title, query)}</small>
      )}
    </button>
  )
})

export function BuildLookupPage() {
  const [selectedChampionId, setSelectedChampionId] = useState<number>(lastLookupChampionId)
  const [modeKey, setModeKey] = useState<LookupModeKey>(lastLookupMode)
  const [position, setPosition] = useState<OpggPosition>('mid')
  const [tier, setTier] = useState<OpggTier>(() => getStoredOpggTier())
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [recentIds, setRecentIds] = useState<number[]>(() => [...recentLookupIds])
  const [recommendation, setRecommendation] = useState<BuildRecommendation | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const searchWrapRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const autoPositionDoneRef = useRef<string>('')

  const indexedChampions = useMemo<IndexedChampion[]>(
    () => getAllChampions()
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
      .map((champ) => ({
        champ,
        index: createSearchIndex([champ.name, champ.title, champ.alias, String(champ.id)]),
      })),
    [],
  )

  const trimmedDeferred = search.trim() ? deferredSearch.trim() : ''
  const filteredChampions = useMemo(() => {
    if (!trimmedDeferred) return indexedChampions
    const tokens = tokenizeSearchQuery(trimmedDeferred)
    return indexedChampions.filter((entry) => matchesSearchIndex(tokens, entry.index))
  }, [indexedChampions, trimmedDeferred])

  const modeSpec = LOOKUP_MODES.find((item) => item.value === modeKey) ?? LOOKUP_MODES[0]
  const effectivePosition: OpggPosition = modeKey === 'ranked' ? position : 'none'

  const context = useMemo<RecommendationContext>(() => ({
    championId: selectedChampionId,
    queueId: modeSpec.queueId,
    gameVersion: '',
    gameMode: modeSpec.gameMode,
    position: effectivePosition,
  }), [selectedChampionId, modeSpec.queueId, modeSpec.gameMode, effectivePosition])

  useEffect(() => {
    lastLookupChampionId = selectedChampionId
    lastLookupMode = modeKey
  }, [selectedChampionId, modeKey])

  // 统一接入滚动条边缘金色高亮与自动隐藏规范
  useEffect(() => {
    if (selectedChampionId > 0 || !pickerRef.current) return
    return bindScrollbarHighlight(pickerRef.current)
  }, [selectedChampionId])

  useEffect(() => {
    if (!dropdownOpen || !dropdownRef.current) return
    return bindScrollbarHighlight(dropdownRef.current)
  }, [dropdownOpen])

  useEffect(() => {
    if (!dropdownOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!searchWrapRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown, true)
    return () => document.removeEventListener('mousedown', onPointerDown, true)
  }, [dropdownOpen])

  const selectChampion = useCallback((championId: number) => {
    setSelectedChampionId(championId)
    setSearch('')
    setDropdownOpen(false)
    setActiveIndex(0)
    autoPositionDoneRef.current = ''
    recentLookupIds = [championId, ...recentLookupIds.filter((id) => id !== championId)].slice(0, 8)
    setRecentIds([...recentLookupIds])
  }, [])

  // 峡谷模式下切换新英雄时自动解析最常见分路
  useEffect(() => {
    if (selectedChampionId <= 0 || modeKey !== 'ranked') return
    const autoKey = `${selectedChampionId}:${tier}`
    if (autoPositionDoneRef.current === autoKey) return
    let cancelled = false
    autoPositionDoneRef.current = autoKey

    resolveMostCommonPosition(selectedChampionId, tier)
      .then((best) => {
        if (!cancelled && best && best !== 'none') {
          setPosition(best)
        }
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [selectedChampionId, modeKey, tier])

  // 拉取配装推荐（与 BP/局内共享缓存和去重）
  useEffect(() => {
    if (selectedChampionId <= 0) {
      setRecommendation(null)
      setLoadError('')
      setIsLoading(false)
      return
    }
    const controller = new AbortController()
    setIsLoading(true)
    setLoadError('')

    fetchStandaloneRecommendation(context, tier, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setRecommendation(data)
        setIsLoading(false)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setRecommendation(null)
        setLoadError(error instanceof Error ? error.message : '加载失败')
        setIsLoading(false)
      })

    return () => controller.abort()
  }, [selectedChampionId, context, tier])

  const balancePills = useMemo(() => {
    if (selectedChampionId <= 0 || !modeSpec.balanceMode) return []
    return formatBalancePills(getChampionBalance(selectedChampionId)?.stats[modeSpec.balanceMode])
  }, [selectedChampionId, modeSpec.balanceMode])

  const handleTierChange = useCallback((nextTier: OpggTier) => {
    setTier(setStoredOpggTier(nextTier))
  }, [])

  const handlePositionChange = useCallback((nextPosition: OpggPosition) => {
    if (nextPosition !== 'none') {
      autoPositionDoneRef.current = `${selectedChampionId}:${tier}`
      setPosition(nextPosition)
    }
  }, [selectedChampionId, tier])

  const handleApplyCoreBuild = useCallback(async (build: OpggItemBuild) => {
    if (!recommendation) return
    await applyManagedItemSetBuild(context, recommendation, build)
  }, [context, recommendation])

  const dropdownList = filteredChampions.slice(0, 12)

  return (
    <div className="sbl-page" data-testid="build-lookup-page">
      <div className="sbl-bar">
        <div className="sbl-search-wrap" ref={searchWrapRef}>
          <span className="sbl-search-icon" aria-hidden="true"><SearchIcon /></span>
          <input
            type="search"
            className="sbl-search-input"
            aria-label="搜索查询配装的英雄"
            placeholder="搜英雄 / 拼音"
            value={search}
            onFocus={() => { if (selectedChampionId > 0) setDropdownOpen(true) }}
            onChange={(event) => {
              setSearch(event.target.value)
              setActiveIndex(0)
              if (selectedChampionId > 0) setDropdownOpen(true)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                if (search) {
                  event.stopPropagation()
                  setSearch('')
                } else if (dropdownOpen) {
                  event.stopPropagation()
                  setDropdownOpen(false)
                }
                return
              }
              if (event.key === 'ArrowDown' && dropdownList.length > 0) {
                event.preventDefault()
                if (selectedChampionId > 0) setDropdownOpen(true)
                setActiveIndex((idx) => (idx + 1) % dropdownList.length)
                return
              }
              if (event.key === 'ArrowUp' && dropdownList.length > 0) {
                event.preventDefault()
                setActiveIndex((idx) => (idx - 1 + dropdownList.length) % dropdownList.length)
                return
              }
              if (event.key === 'Enter' && dropdownList.length > 0) {
                event.preventDefault()
                selectChampion(dropdownList[Math.min(activeIndex, dropdownList.length - 1)].champ.id)
              }
            }}
          />
          {search && (
            <button type="button" className="sbl-search-clear" aria-label="清空英雄搜索" onClick={() => setSearch('')}>
              ×
            </button>
          )}
          {selectedChampionId > 0 && dropdownOpen && (
            <div ref={dropdownRef} className="sbl-dropdown" role="listbox" aria-label="英雄搜索结果">
              {dropdownList.length === 0 ? (
                <div className="sbl-dropdown-empty">无匹配</div>
              ) : (
                dropdownList.map(({ champ }, index) => (
                  <button
                    key={champ.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`sbl-dropdown-item${index === activeIndex ? ' is-active' : ''}`}
                    onClick={() => selectChampion(champ.id)}
                  >
                    <img src={getChampIcon(champ.id)} alt="" loading="lazy" />
                    <span className="sbl-dropdown-meta">
                      <strong>{renderHit(champ.title, trimmedDeferred)} {renderHit(champ.name, trimmedDeferred)}</strong>
                      <small>{champ.alias}</small>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <SonaSegmented
          label="配装查询模式"
          value={modeKey}
          onChange={(next) => setModeKey(next)}
          className="sbl-mode-switch"
          options={LOOKUP_MODES.map((m) => ({ value: m.value, label: m.label }))}
        />

        {selectedChampionId > 0 ? (
          <button
            type="button"
            className="sbl-back-grid"
            data-sona-tooltip="返回英雄选择网格"
            onClick={() => {
              setSelectedChampionId(0)
              setDropdownOpen(false)
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="2" y="2" width="5" height="5" rx="1" />
              <rect x="9" y="2" width="5" height="5" rx="1" />
              <rect x="2" y="9" width="5" height="5" rx="1" />
              <rect x="9" y="9" width="5" height="5" rx="1" />
            </svg>
            英雄库
          </button>
        ) : (
          <span className="sbl-count-pill">
            <b>{filteredChampions.length}</b>/{indexedChampions.length}
          </span>
        )}
      </div>

      {selectedChampionId > 0 && balancePills.length > 0 && (
        <div className="sbl-balance-bar" data-testid="lookup-balance-bar">
          <span className="sbl-balance-label">{modeSpec.balanceMode === 'urf' ? '无限火力' : '大乱斗'}</span>
          {balancePills.map((pill) => (
            <span
              key={pill.key}
              className={`sbl-balance-pill sbl-balance-pill--${pill.tone}`}
              data-sona-tooltip={pill.tooltip}
            >
              <i aria-hidden="true">{pill.glyph}</i>
              <b>{pill.value}</b>
            </span>
          ))}
        </div>
      )}

      {selectedChampionId > 0 ? (
        <div className="sbl-panel-host">
          <OpggBuildRecommendationPanel
            context={context}
            recommendation={recommendation}
            loadError={loadError}
            isLoading={isLoading}
            selectedTier={tier}
            onTierChange={handleTierChange}
            onPositionChange={handlePositionChange}
            onApplyCoreBuild={handleApplyCoreBuild}
            onClose={() => setSelectedChampionId(0)}
            hideClose
            embedded
          />
        </div>
      ) : (
        <div ref={pickerRef} className="sbl-picker">
          {recentIds.length > 0 && !trimmedDeferred && (
            <div className="sbl-recent">
              <span className="sbl-recent-label" data-sona-tooltip="最近查看">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <circle cx="8" cy="8" r="6" />
                  <path d="M8 4.5V8l2.5 1.5" />
                </svg>
              </span>
              {recentIds.map((id) => {
                const champ = getChampionById(id)
                if (!champ) return null
                return (
                  <button key={id} type="button" className="sbl-recent-chip" onClick={() => selectChampion(id)}>
                    <img src={getChampIcon(id)} alt="" />
                    <span>{champ.name}</span>
                  </button>
                )
              })}
            </div>
          )}

          {filteredChampions.length === 0 ? (
            <div className="sbl-empty">
              {indexedChampions.length === 0 ? '加载中…' : `无匹配「${trimmedDeferred}」`}
            </div>
          ) : (
            <div className="sbl-grid">
              {filteredChampions.map(({ champ }) => (
                <HeroGridCard
                  key={champ.id}
                  champ={champ}
                  query={trimmedDeferred}
                  balanceMode={modeSpec.balanceMode}
                  onSelect={selectChampion}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
