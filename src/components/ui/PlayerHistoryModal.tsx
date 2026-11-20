import { HistorySelect } from './HistorySelect'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Modal } from './Modal'
import { HistoryDisplaySettings } from './HistoryDisplaySettings'
import { HistoryTrendPanel } from './HistoryTrendPanel'
import { HistoryCompareModal } from './HistoryCompareModal'
import { HistoryCopyId } from './HistoryCopyId'
import { HistoryEncounterButton, HistoryEncounterPreview, type EncounterTarget } from './HistoryEncounterPreview'
import { PlayerSearchModal } from './PlayerSearchModal'
import { HistoryPlayerName } from './HistoryPlayerName'
import { HistoryAssetTooltip } from './HistoryAssetTooltip'
import { HistoryPerformanceStats } from './HistoryPerformanceStats'
import { HistoryScrollTop } from './HistoryScrollTop'
import { ChevronLeftIcon, RefreshIcon, SettingsIcon, SearchIcon } from './icons'
import { PlayerTagBadge, PlayerTagBookModal, PlayerTagEditorModal, TagBookIcon, TagBookmarkIcon } from './PlayerTagWidgets'
import { usePlayerTag, usePlayerTagFeatureEnabled } from '@/lib/player-tags'
import { ChampionStrip, HistoryImage, MatchReport, RankCards, SummaryStats, championName } from './HistoryWidgets'
import { HistoryMatchList } from './HistoryMatchList'
import { HistoryChampionTable } from './HistoryChampionTable'
import { getChampIcon, getPlayableQueues, getQueueName, getQueue, resolveCanonicalQueueId } from '@/lib/assets'
import { deadline, fetchHistoryMastery, fetchHistoryRanks, fetchHistorySummoner, type HistoryMastery, type HistoryRank } from '@/lib/history-api'
import { lcu, isMatchingQueue } from '@/lib/lcu'
import { historyPlayerFromSummoner, historyServerName, rememberHistoryPlayer, type HistoryPlayer } from '@/lib/history-search'
import { championStats, encounters, numberText, POSITION_NAMES, profileIconUrl, splitRiotId, summarize, toHistoryMatches, validMatches, type HistoryMatch } from '@/lib/history-model'
import { calculatePlayerScore, playerScoreLabel, playerScoreRange, formatPlayerScore } from '@/lib/player-score'
import { usePlayerScoreSystem } from '@/lib/use-player-score'
import { useHistoryPages } from '@/lib/use-history-pages'
import { useHistoryHiddenFields } from '@/lib/use-history-display'
import { isHistoryFieldVisible, type HistoryDisplayField } from '@/lib/history-display'
import { getHistoryEpoch, historyRequests } from '@/lib/shared-requests'
import { store } from '@/lib/store'
import '@/styles/PersonalHistory.css'

export interface PlayerHistoryModalProps { open: boolean; onClose: () => void; puuid: string; playerName: string; queueId?: number }
const LANE_POSITIONS = ['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY']
type SidebarPanelKey = 'scope' | 'summary' | 'champions' | 'mastery' | 'teammates' | 'opponents'
const subscribeCollapsedPanels = (listener: () => void) => store.onChange('historyCollapsedPanels', listener)
const getCollapsedPanels = () => store.get('historyCollapsedPanels')

interface HistoryView {
  queueId: number; batchSize: number; championId: number; position: string; result: string; hideAborted: boolean
  tab: 'matches' | 'champions' | 'trend'; showAllMastery: boolean; expanded: string[]; sidebarTop: number; contentTop: number
  championSort: string; championDirection?: 'asc' | 'desc'; championMin: number
  encounterFilter: EncounterTarget | null
}

function HistorySidebarPanel({ title, collapsed, onToggle, extra, children }: {
  title: string; collapsed: boolean; onToggle: () => void; extra?: ReactNode; children: ReactNode
}) {
  const bodyId = useId()
  return <section className="rh-panel">
    <header className={`rh-panel-header${collapsed ? ' is-collapsed' : ''}`}>
      <h3>{title}</h3>
      {extra}
      <button type="button" className="rh-panel-toggle" aria-label={`${collapsed ? '展开' : '收起'}${title}`}
        aria-expanded={!collapsed} aria-controls={bodyId} onClick={onToggle}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </button>
    </header>
    <div id={bodyId} className="rh-panel-body" hidden={collapsed}>{!collapsed && children}</div>
  </section>
}

export function PlayerHistoryModal({ open, onClose, puuid, playerName, queueId }: PlayerHistoryModalProps) {
  const views = useRef(new Map<string, HistoryView>())
  const [navigation, setNavigation] = useState<{ base: string; current: HistoryPlayer; trail: HistoryPlayer[] }>({ base: puuid, current: { puuid, name: playerName }, trail: [] })
  useEffect(() => { if (open) setNavigation({ base: puuid, current: { puuid, name: playerName }, trail: [] }) }, [open, puuid, playerName])
  const current = navigation.base === puuid ? navigation.current : { puuid, name: playerName }
  const inspect = useCallback((player: HistoryPlayer) => {
    if (!player.puuid || (player.puuid === current.puuid && player.serverId === current.serverId)) return
    setNavigation((nav) => ({ ...nav, current: player, trail: [...nav.trail, nav.current].slice(-20) }))
  }, [current.puuid, current.serverId])
  const viewKey = `${getHistoryEpoch()}:${current.serverId ?? ''}:${current.puuid}`
  return <Modal open={open} onClose={onClose} careerBackground width="min(1320px, 95vw)" height="min(940px, 92vh)">
    {current.puuid
      ? <PlayerHistoryContent key={viewKey} open={open} target={current}
          savedView={views.current.get(viewKey)} rememberView={(view) => {
            views.current.delete(viewKey); views.current.set(viewKey, view)
            while (views.current.size > 12) views.current.delete(views.current.keys().next().value!)
          }}
          defaultQueueId={queueId || 0} onSelectPlayer={inspect}
          onBack={navigation.trail.length ? () => setNavigation((nav) => ({ ...nav, current: nav.trail[nav.trail.length - 1], trail: nav.trail.slice(0, -1) })) : undefined} />
      : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#c8aa6e', fontSize: 13 }}>正在查询召唤师资料…</div>}
  </Modal>
}

function PlayerHistoryContent({ open, target, defaultQueueId, onSelectPlayer, onBack, savedView, rememberView }: {
  open: boolean; target: HistoryPlayer; defaultQueueId: number; onSelectPlayer: (player: HistoryPlayer) => void; onBack?: () => void
  savedView?: HistoryView; rememberView: (view: HistoryView) => void
}) {
  const [queueId, setQueueId] = useState(savedView?.queueId ?? defaultQueueId)
  const [batchSize, setBatchSize] = useState(savedView?.batchSize ?? 50)
  const [championId, setChampionId] = useState(savedView?.championId ?? 0)
  const [position, setPosition] = useState(savedView?.position ?? '')
  const [result, setResult] = useState(savedView?.result ?? '')
  const [hideAborted, setHideAborted] = useState(savedView?.hideAborted ?? true)
  const [tab, setTab] = useState<'matches' | 'champions' | 'trend'>(savedView?.tab ?? 'matches')
  const [expanded, setExpanded] = useState(() => new Set(savedView?.expanded ?? []))
  const storedCollapsedPanels = useSyncExternalStore(subscribeCollapsedPanels, getCollapsedPanels)
  const collapsedPanels = useMemo(() => new Set(storedCollapsedPanels as SidebarPanelKey[]), [storedCollapsedPanels])
  const [championSort, setChampionSort] = useState(savedView?.championSort ?? 'total')
  const [championDirection, setChampionDirection] = useState<'asc'|'desc'>(savedView?.championDirection ?? 'desc')
  const [championMin, setChampionMin] = useState(savedView?.championMin ?? 1)
  const [profile, setProfile] = useState<HistoryPlayer | null>(null)
  const [ranks, setRanks] = useState<HistoryRank[] | null>(null)
  const [rankStatus, setRankStatus] = useState('正在查询…')
  const [mastery, setMastery] = useState<HistoryMastery[] | null>(null)
  const [masteryStatus, setMasteryStatus] = useState('正在查询英雄点数…')
  const [showAllMastery, setShowAllMastery] = useState(savedView?.showAllMastery ?? false)
  const [profileRevision, setProfileRevision] = useState(0)
  const [searchText, setSearchText] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showCompare, setShowCompare] = useState(false)
  const [showTagEditor, setShowTagEditor] = useState(false)
  const [showTagBook, setShowTagBook] = useState(false)
  const [pinnedEncounter, setPinnedEncounter] = useState<{ target: EncounterTarget; left: number; top: number; keyboard: boolean } | null>(null)
  const [encounterFilter, setEncounterFilter] = useState(savedView?.encounterFilter ?? null)
  const [encounterMatch, setEncounterMatch] = useState<HistoryMatch | null>(null)
  const encounterMatchTrigger = useRef<HTMLButtonElement | null>(null)
  const focusEncounterReport = useCallback((node: HTMLDivElement | null) => node?.focus({ preventScroll: true }), [])
  const tagFeatureEnabled = usePlayerTagFeatureEnabled()
  const playerTag = usePlayerTag(target.puuid)
  const sidebarRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const scrollTargets = useMemo(()=>[sidebarRef,contentRef],[])
  const pages = useHistoryPages(target.puuid, queueId, batchSize, open, target.serverId)
  const hidden = useHistoryHiddenFields()
  const scoreSystem = usePlayerScoreSystem()
  const show = (field: HistoryDisplayField<'history'>) => isHistoryFieldVisible(hidden, 'history', field)
  const showRanks = show('ranks'), showMastery = show('mastery')
  const viewRef = useRef<HistoryView>(null!)
  viewRef.current = { queueId, batchSize, championId, position, result, hideAborted, tab, showAllMastery, expanded: [...expanded], sidebarTop: 0, contentTop: 0, championSort, championDirection, championMin, encounterFilter }
  useLayoutEffect(() => {
    const sidebar = sidebarRef.current, content = contentRef.current
    return () => rememberView({ ...viewRef.current, sidebarTop: sidebar?.scrollTop ?? 0, contentTop: content?.scrollTop ?? 0 })
  }, [])
  const contentMounted = useRef(false)
  useLayoutEffect(() => {
    if (contentMounted.current && contentRef.current) contentRef.current.scrollTop = 0
    contentMounted.current = true
  }, [queueId, tab, encounterFilter])
  const restored = useRef(false)
  useLayoutEffect(() => {
    if (pages.loading || restored.current) return
    restored.current = true
    if (savedView) {
      if (sidebarRef.current) sidebarRef.current.scrollTop = savedView.sidebarTop
      if (contentRef.current) contentRef.current.scrollTop = savedView.contentTop
    }
  }, [pages.loading, savedView])

  useEffect(() => {
    if (open) rememberHistoryPlayer(target)
    else { setShowSettings(false); setShowSearch(false); setPinnedEncounter(null); setEncounterMatch(null) }
  }, [open, target])
  useEffect(() => {
    const sidebar = sidebarRef.current
    if (!pinnedEncounter || !sidebar) return
    const closeOnScroll = () => setPinnedEncounter(null)
    sidebar.addEventListener('scroll', closeOnScroll, { passive: true })
    return () => sidebar.removeEventListener('scroll', closeOnScroll)
  }, [pinnedEncounter])

  const onInspect = useCallback((puuid: string, name: string) => onSelectPlayer({ puuid, name, serverId: target.serverId }), [onSelectPlayer, target.serverId])
  const changeExpanded = useCallback((id: string, value: boolean) => setExpanded((previous) => {
    const next = new Set(previous); if (value) next.add(id); else next.delete(id); return next
  }), [])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setProfile(null); setRanks(null); setRankStatus('正在查询…'); setMastery(null); setMasteryStatus('正在查询英雄点数…')
    const serverId = target.serverId
    const profileRequest = serverId
      ? historyRequests.run(`profile:${serverId}:${target.puuid}`, (sharedSignal) => deadline((signal) => lcu.getHistorySgpSummoner(serverId, target.puuid, signal), sharedSignal, 10000), { signal: controller.signal, ttlMs: 60000, fresh: profileRevision > 0 })
      : fetchHistorySummoner(target.puuid, controller.signal, profileRevision > 0)
    void profileRequest.then((value) => {
      if (!value || controller.signal.aborted) return
      const player = historyPlayerFromSummoner(value, serverId, target.name)
      if (player) {
        if (target.name.includes('#') && !value.tagLine) player.name = target.name
        setProfile(player)
        rememberHistoryPlayer(player)
      }
    }).catch(() => {})
    if (showRanks) void fetchHistoryRanks(target.puuid, controller.signal, serverId, profileRevision > 0).then((value) => {
      if (!controller.signal.aborted) setRanks(value)
    }).catch(() => { if (!controller.signal.aborted) setRankStatus('暂不可用') })
    if (serverId) setMasteryStatus('跨大区的英雄点数暂不可用')
    else if (showMastery) void fetchHistoryMastery(target.puuid, controller.signal, profileRevision > 0).then((value) => {
      if (!controller.signal.aborted) setMastery(value)
    }).catch(() => { if (!controller.signal.aborted) setMasteryStatus('该玩家的英雄点数暂不可用') })
    return () => controller.abort()
  }, [open, target, profileRevision, showRanks, showMastery])

  const allMatches = useMemo(() => toHistoryMatches(pages.games, target.puuid).filter((m) => !queueId || isMatchingQueue(m.game, queueId)), [pages.games, target.puuid, queueId])
  const showPositionFilter = queueId ? getQueue(queueId)?.mapId === 11 || (!getQueue(queueId)?.mapId && allMatches.some((match)=>match.game.json.mapId===11)) : allMatches.some((match)=>match.game.json.mapId===11)
  const activePosition = showPositionFilter && LANE_POSITIONS.includes(position) ? position : ''
  const knownNonRift = queueId ? Boolean(getQueue(queueId)?.mapId && getQueue(queueId)?.mapId !== 11) : allMatches.length > 0 && !showPositionFilter
  useEffect(()=>{if(position && (!LANE_POSITIONS.includes(position) || knownNonRift))setPosition('')},[position,knownNonRift])
  const filtered = useMemo(() => allMatches.filter((m) => (!championId || m.player.championId === championId) && (!activePosition || m.position === activePosition) && (!result || m.outcome === result) && (!hideAborted || (m.outcome !== 'remake' && m.outcome !== 'abort'))), [allMatches, championId, activePosition, result, hideAborted])
  const stats = useMemo(() => summarize(filtered), [filtered])
  const champions = useMemo(() => championStats(allMatches), [allMatches])
  const sameAsAll = filtered.length === allMatches.length
  const filteredChampionCount = useMemo(() => sameAsAll ? champions.length : new Set(validMatches(filtered).map((m) => m.player.championId)).size, [sameAsAll, champions.length, filtered])
  const filteredChampions = useMemo(() => tab !== 'champions' ? [] : sameAsAll ? champions : championStats(filtered), [tab, sameAsAll, champions, filtered])
  const teammates = useMemo(() => encounters(filtered, 'ally'), [filtered])
  const opponents = useMemo(() => encounters(filtered, 'enemy'), [filtered])
  const findEncounter = (encounter: EncounterTarget) =>
    (encounter.relation === 'ally' ? teammates : opponents).find((person) => person.puuid === encounter.puuid)
  const filteredEncounter = encounterFilter ? findEncounter(encounterFilter) : undefined
  const matchRows = useMemo(() => encounterFilter
    ? filteredEncounter?.meetings.map(({ match }) => match) ?? []
    : filtered, [encounterFilter, filteredEncounter, filtered])
  const visibleMatches = tab === 'matches' ? matchRows : filtered
  const filteredGames = useMemo(() => filtered.map((match) => match.game), [filtered])
  const compareCandidates = useMemo(() => {
    const map = new Map<string, { puuid: string; name: string }>()
    for (const person of [...teammates, ...opponents]) {
      if (person.puuid && person.puuid !== target.puuid) map.set(person.puuid, { puuid: person.puuid, name: person.name })
    }
    return [...map.values()]
  }, [teammates, opponents, target.puuid])
  const strength = useMemo(() => {
    try { const score = calculatePlayerScore(filtered.filter((m) => m.outcome === 'win' || m.outcome === 'loss').map((m) => m.game), target.puuid, scoreSystem); return score && Number.isFinite(score.score) ? score : null } catch { return null }
  }, [filtered, target.puuid, scoreSystem])
  const queues = useMemo(() => {
    const map = new Map(getPlayableQueues().map((q) => [q.id, q.name]))
    const seenNames = new Set([...map.values()].map((n) => n.trim()))
    for (const rawId of [420, 440, 430, 450, 2400, defaultQueueId, ...pages.games.map((g) => g.json.queueId)]) {
      const id = resolveCanonicalQueueId(rawId)
      if (id > 0 && !map.has(id)) {
        const qName = getQueueName(id).trim()
        if (!seenNames.has(qName)) {
          seenNames.add(qName)
          map.set(id, qName)
        }
      }
    }
    return [...map].map(([id, name]) => ({ id, name }))
  }, [pages.games, defaultQueueId])
  const name = profile?.name || target.name || '玩家战绩'
  const identity = splitRiotId(name)
  const level = profile?.level ?? target.level
  const resetLocalFilters = () => { setChampionId(0); setPosition(''); setResult(''); setHideAborted(true); setEncounterFilter(null) }
  const refresh = () => { pages.refresh(); setProfileRevision((n) => n + 1) }
  const panel = (key: SidebarPanelKey) => ({
    collapsed: collapsedPanels.has(key),
    onToggle: () => {
      const next = new Set(store.get('historyCollapsedPanels'))
      if (next.has(key)) next.delete(key)
      else next.add(key)
      store.set('historyCollapsedPanels', [...next])
    },
  })
  const pinEncounter = (encounter: EncounterTarget, anchor: HTMLButtonElement, keyboard: boolean) => {
    const shell = anchor.closest('.rh-history-shell')
    if (!shell) return
    const bounds = shell.getBoundingClientRect()
    const card = anchor.getBoundingClientRect()
    setPinnedEncounter((current) => (!keyboard && current) ? current : {
      target: encounter, left: card.right - bounds.left + 8, top: card.top - bounds.top, keyboard,
    })
  }

  return <div className="rh-shell rh-history-shell" data-testid="player-history"
    onClickCapture={pinnedEncounter ? (event) => {
      const clicked = event.target
      if (clicked instanceof Element && event.currentTarget.contains(clicked) && !clicked.closest('.rh-encounter-preview')) {
        if (clicked.closest('.rh-encounters button')) {
          event.preventDefault()
          event.stopPropagation()
        }
        setPinnedEncounter(null)
      }
    } : undefined}>
    <header className={`rh-header rh-profile-header${show('ranks') ? '' : ' rh-header-no-ranks'}`}>
      <div className="rh-profile">{onBack && <HistoryAssetTooltip title="返回" compact asChild>
        <button className="rh-button rh-icon-button rh-profile-back" type="button" aria-label="返回" onClick={onBack}><ChevronLeftIcon /></button>
      </HistoryAssetTooltip>}
        <span className="rh-profile-portrait"><HistoryImage src={profileIconUrl(profile?.iconId ?? target.iconId)} label={name} className="rh-profile-icon" nativeTooltip={false} />
          {level != null && <small className="rh-profile-level">{level}</small>}
        </span>
        <div className="rh-profile-details">
          <div className="rh-profile-name">
            <h2 aria-label={name}>{identity.name}</h2>
            {name !== '玩家战绩' && name !== '未知玩家' && <HistoryCopyId key={name} name={name} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {identity.tag && <span className="rh-profile-tag">{identity.tag}</span>}
            {playerTag && <PlayerTagBadge puuid={target.puuid} record={playerTag} onClick={() => setShowTagEditor(true)} />}
          </div>
          {target.serverId && <span className="rh-muted">{historyServerName(target.serverId)}</span>}</div>
      </div>
      {show('ranks') && <RankCards ranks={ranks} status={rankStatus} />}
      <div className="rh-header-actions">
        {tagFeatureEnabled && <HistoryAssetTooltip title={playerTag ? `编辑标记：${playerTag.label}` : '标记该玩家'} compact asChild><button type="button" className="rh-button rh-icon-button" aria-label="标记该玩家" onClick={() => setShowTagEditor(true)}><span aria-hidden="true"><TagBookmarkIcon filled={Boolean(playerTag)} /></span></button></HistoryAssetTooltip>}
        {tagFeatureEnabled && <HistoryAssetTooltip title="玩家小本本" compact asChild><button type="button" className="rh-button rh-icon-button" aria-label="玩家小本本" onClick={() => setShowTagBook(true)}><span aria-hidden="true"><TagBookIcon /></span></button></HistoryAssetTooltip>}
        <HistoryAssetTooltip title="玩家对比" compact asChild><button type="button" className="rh-button rh-icon-button" aria-label="玩家对比" onClick={() => setShowCompare(true)}><span aria-hidden="true"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="1.5" y="3" width="5.5" height="10" rx="1" /><rect x="9" y="3" width="5.5" height="10" rx="1" /></svg></span></button></HistoryAssetTooltip>
        <HistoryAssetTooltip title="刷新" compact asChild><button type="button" className="rh-button rh-icon-button" aria-label="刷新" onClick={refresh} disabled={pages.loading}><span aria-hidden="true"><RefreshIcon /></span></button></HistoryAssetTooltip>
        <HistoryAssetTooltip title="显示设置" compact asChild><button type="button" className="rh-button rh-icon-button" aria-label="显示设置" onClick={() => setShowSettings(true)}><span aria-hidden="true"><SettingsIcon /></span></button></HistoryAssetTooltip>
      </div>
    </header>
    <div className="rh-workspace">
      <aside className="rh-sidebar rh-scroll-area" ref={sidebarRef}>
        <HistorySidebarPanel title="查询范围" {...panel('scope')}>
          <label>游戏模式<HistorySelect aria-label="游戏模式" value={queueId} onChangeValue={(value) => { setQueueId(Number(value)); resetLocalFilters() }}><option value={0}>全部模式</option>{queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</HistorySelect></label>
          <label>每次加载<HistorySelect aria-label="每次加载场次" value={batchSize} onChangeValue={(value) => setBatchSize(Number(value))}>{[20, 50, 100].map((count) => <option value={count} key={count}>{count} 场</option>)}</HistorySelect></label>
        </HistorySidebarPanel>
        {show('summary') && <HistorySidebarPanel title="近期总览" {...panel('summary')} extra={<small className="rh-muted">{stats.total} 场</small>}>
          {strength && <HistoryAssetTooltip title={`${playerScoreLabel(scoreSystem)} · ${playerScoreRange(scoreSystem)} 分`} compact focusable={false} asChild><div className="rh-score" data-score-system={scoreSystem}><span>{playerScoreLabel(scoreSystem)}</span><strong>{formatPlayerScore(strength.score,scoreSystem)}</strong></div></HistoryAssetTooltip>}
          <SummaryStats matches={filtered} />
          <HistoryPerformanceStats matches={filtered} section="history" />
          {stats.total > 0 && <div className="rh-summary-extra"><span>{stats.streak}</span><span>蓝方 {stats.blue} / 红方 {stats.red}</span></div>}
        </HistorySidebarPanel>}
        {show('champions') && <HistorySidebarPanel title="近期常玩英雄" {...panel('champions')}>
          <ChampionStrip matches={allMatches} selectedId={championId} limit={12}
            onSelect={(id) => {
              setChampionId((current) => current === id ? 0 : id)
              setEncounterFilter(null)
              setTab('matches')
            }}
          />
          <p className="rh-footnote">再次点击当前英雄可显示全部英雄的战绩</p>
        </HistorySidebarPanel>}
        {show('mastery') && <HistorySidebarPanel title="英雄点数" {...panel('mastery')}
          extra={!collapsedPanels.has('mastery') && <button type="button" className="rh-text-button" onClick={() => setShowAllMastery(!showAllMastery)}>{showAllMastery ? '只看前 6' : '更多'}</button>}>
          {mastery ? mastery.length ? <div className="rh-mastery">{mastery.slice(0, showAllMastery ? 60 : 6).map((m) => <button type="button" key={m.championId} onClick={() => { setChampionId(m.championId); setEncounterFilter(null); setTab('matches') }} aria-label="查看该英雄战绩"><HistoryImage src={getChampIcon(m.championId)} label={championName(m.championId)} nativeTooltip={false} /><span><strong data-sona-overflow-tooltip={championName(m.championId)}>{championName(m.championId)}</strong><small>{m.championLevel} 级</small></span><b>{numberText(m.championPoints)}</b></button>)}</div> : <p className="rh-muted">暂无英雄点数记录</p> : <p className="rh-muted">{masteryStatus}</p>}
        </HistorySidebarPanel>}
        {([['teammates', '最近队友', teammates, 'ally'], ['opponents', '最近对手', opponents, 'enemy']] as const).filter(([field]) => show(field)).map(([field, title, people, relation]) => (
          <HistorySidebarPanel title={title} key={title} {...panel(field)}>
            <div className="rh-encounters">
              {people.slice(0, 8).map((person) => (
                <HistoryEncounterButton key={person.puuid} person={person} blocked={!open || Boolean(pinnedEncounter)}
                  selected={pinnedEncounter?.target.puuid === person.puuid && pinnedEncounter.target.relation === relation}
                  onPreview={(anchor, keyboard) => pinEncounter({ puuid: person.puuid, name: person.name, relation }, anchor, keyboard)}
                  onInspect={() => onInspect(person.puuid, person.name)} />
              ))}
            </div>
            {!people.length && <p className="rh-muted">暂无可用记录</p>}
          </HistorySidebarPanel>
        ))}
      </aside>
      <main className="rh-main">
        <div className="rh-main-toolbar">
          <div className="rh-tabs">
            <button type="button" className={tab === 'matches' ? 'is-active' : ''} onClick={() => setTab('matches')}>战绩明细 <small>{matchRows.length}</small></button>
            <button type="button" className={tab === 'champions' ? 'is-active' : ''} onClick={() => setTab('champions')}>英雄统计 <small>{filteredChampionCount}</small></button>
            <button type="button" className={tab === 'trend' ? 'is-active' : ''} onClick={() => setTab('trend')}>趋势分析 <small>{filtered.length}</small></button>
          </div>
          <form className="rh-player-search" onSubmit={(event) => { event.preventDefault(); setShowSearch(true) }} role="search">
            <input type="search" aria-label="搜索玩家" placeholder="名字 / 名字#编号 / PUUID" maxLength={120}
              autoComplete="off" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
            <HistoryAssetTooltip title="搜索玩家" compact asChild><button type="submit" className="rh-button rh-icon-button" aria-label="搜索玩家"><SearchIcon /></button></HistoryAssetTooltip>
          </form>
          <span className="rh-muted">{pages.updatedAt ? `更新于 ${new Date(pages.updatedAt).toLocaleTimeString('zh-CN')}` : '正在查询'}</span>
        </div>
        <div className="rh-local-filters"><HistorySelect aria-label="筛选英雄" value={championId} onChangeValue={(value) => setChampionId(Number(value))}><option value={0}>全部英雄</option>{champions.map((c) => <option key={c.id} value={c.id}>{championName(c.id)} · {c.total} 场</option>)}{championId > 0 && !champions.some((c) => c.id === championId) && <option value={championId}>{championName(championId)} · 当前未加载</option>}</HistorySelect>{showPositionFilter && <HistorySelect positions aria-label="筛选位置" value={activePosition} onChangeValue={(value) => setPosition(value)}><option value="">全部分路</option>{LANE_POSITIONS.map((key) => <option key={key} value={key}>{POSITION_NAMES[key]}</option>)}</HistorySelect>}<HistorySelect aria-label="筛选胜负" value={result} onChangeValue={(value) => setResult(value)}><option value="">全部胜负</option><option value="win">胜利</option><option value="loss">失败</option></HistorySelect><label><input type="checkbox" checked={hideAborted} onChange={(e) => setHideAborted(e.target.checked)} />隐藏重开 / 终止</label><button type="button" className="rh-text-button" onClick={resetLocalFilters}>重置筛选</button></div>
        {encounterFilter && <div className="rh-encounter-filter">
          <span>{encounterFilter.relation === 'ally' ? '同队' : '交手'} · <HistoryPlayerName name={encounterFilter.name} showTag /> · <b>{matchRows.length}</b> 场{tab !== 'matches' && <em className="rh-filter-scope" data-sona-tooltip="交手筛选仅作用于战绩明细页">仅明细</em>}</span>
          <button type="button" className="rh-text-button" onClick={() => setEncounterFilter(null)}>清除交手筛选</button>
        </div>}
        {pages.scanLimit && <div className="rh-notice">当前范围为最近 {pages.scanLimit} 场。</div>}
        {pages.error && <div className="rh-error" role="alert">{pages.error}<button type="button" onClick={allMatches.length && pages.hasMore ? () => void pages.loadMore() : refresh}>重试</button></div>}
        <div className="rh-content rh-scroll-area" ref={contentRef}>
          {pages.loading ? <div className="rh-empty"><span className="rh-spinner" />正在加载战绩…<span className="rh-kaomoji" aria-hidden="true">(｡･ω･｡)</span></div> : !visibleMatches.length ? <div className="rh-empty"><span>{allMatches.length ? '当前筛选下没有已加载对局。可重置筛选或继续加载。' : pages.error ? '战绩查询未完成，请重试。' : '当前查询范围没有对局记录。'}</span>{!pages.error && <span className="rh-kaomoji" aria-hidden="true">(・ω・)</span>}</div> : tab === 'matches' ? <HistoryMatchList matches={matchRows} hidden={hidden} onInspect={onInspect} scrollRef={contentRef} expanded={expanded} onExpandedChange={changeExpanded} /> : tab === 'trend' ? <HistoryTrendPanel matches={filtered} games={filteredGames} puuid={target.puuid} system={scoreSystem} score={strength} /> : <div className="rh-champion-results"><div className="rh-champion-controls">
            <label>最低场次<HistorySelect aria-label="英雄统计最低场次" value={championMin} onChangeValue={(value) => setChampionMin(Number(value))}>{[1,3,5,10,20].map((count) => <option key={count} value={count}>{count} 场</option>)}</HistorySelect></label>
            <span className="rh-muted">{filteredChampions.filter((champion) => champion.total >= championMin).length} 位英雄</span>
          </div>
            <HistoryChampionTable champions={filteredChampions} minimum={championMin} hidden={hidden}
              sort={championSort} direction={championDirection}
              onSort={(key, direction) => { setChampionSort(key); setChampionDirection(direction) }}
              onSelect={(id) => { setChampionId(id); setEncounterFilter(null); setTab('matches') }} />
          </div>}
          {!pages.loading && <div className="rh-load-more"><HistoryAssetTooltip title={pages.loadingMore ? '正在加载…' : pages.hasMore ? `继续加载 ${batchSize} 场` : '已加载完毕'} compact focusable={false}><button type="button" className="rh-button rh-icon-button" aria-label={pages.loadingMore ? '正在加载…' : pages.hasMore ? `继续加载 ${batchSize} 场` : '已加载完毕'} disabled={!pages.hasMore || pages.loadingMore} onClick={() => void pages.loadMore()}>{pages.loadingMore ? <span className="rh-spinner" /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>}</button></HistoryAssetTooltip></div>}
        </div>
      </main>
    </div>
    <HistoryScrollTop targets={scrollTargets} resetKey={`${open}:${target.puuid}:${queueId}:${tab}:${championId}:${position}:${result}:${hideAborted}:${encounterFilter?.puuid}:${encounterFilter?.relation}:${pages.loading}`} />
    {open && pinnedEncounter && <HistoryEncounterPreview {...pinnedEncounter} person={findEncounter(pinnedEncounter.target)}
      escapeDisabled={Boolean(encounterMatch)}
      onClose={() => setPinnedEncounter(null)}
      onExpand={() => { setEncounterFilter(pinnedEncounter.target); setTab('matches'); setPinnedEncounter(null) }}
      onInspect={() => onInspect(pinnedEncounter.target.puuid, pinnedEncounter.target.name)}
      onMatch={(match, trigger) => { encounterMatchTrigger.current = trigger; setEncounterMatch(match) }} />}
    <Modal open={open && Boolean(encounterMatch)} onClose={() => {
      setEncounterMatch(null)
      encounterMatchTrigger.current?.focus({ preventScroll: true })
    }} careerBackground
      width="min(1200px, 95vw)" height="min(720px, 88vh)">
      {encounterMatch && <div className="rh-shell rh-team-match-detail" ref={focusEncounterReport} tabIndex={-1}
        data-testid="encounter-match-report" data-match-id={encounterMatch.id}>
        <h2>{getQueueName(encounterMatch.game.json.queueId)} · 单场战报</h2>
        <MatchReport game={encounterMatch.game} focusPuuid={encounterMatch.player.puuid} onInspect={onInspect} />
      </div>}
    </Modal>
    <HistoryDisplaySettings open={open && showSettings} onClose={() => setShowSettings(false)} initialSection={tab === 'champions' ? 'champions' : 'history'} />
    <PlayerSearchModal open={open && showSearch} initialQuery={searchText} onClose={() => setShowSearch(false)} onSelect={(player) => {
      setShowSearch(false)
      setSearchText('')
      onSelectPlayer(player)
    }} />
    <HistoryCompareModal open={open && showCompare} onClose={() => setShowCompare(false)} games={filteredGames} puuid={target.puuid} system={scoreSystem} candidates={compareCandidates} serverId={target.serverId} queueId={queueId} count={batchSize} filters={{championId,position:activePosition,outcome:result,hideAborted}} sourceLoading={pages.loading} onRefresh={refresh} />
    <PlayerTagEditorModal open={open && tagFeatureEnabled && showTagEditor} target={{ puuid: target.puuid, name, serverId: target.serverId }} onClose={() => setShowTagEditor(false)} />
    <PlayerTagBookModal open={open && tagFeatureEnabled && showTagBook} onClose={() => setShowTagBook(false)} onInspectPlayer={(nextPuuid, nextName, nextServer) => onSelectPlayer({ puuid: nextPuuid, name: nextName, serverId: nextServer ?? target.serverId })} />
  </div>
}
