import { HistorySelect } from './HistorySelect'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import { HistoryDisplaySettings } from './HistoryDisplaySettings'
import { HistoryTrendPanel } from './HistoryTrendPanel'
import { HistoryCompareModal } from './HistoryCompareModal'
import { PlayerSearchModal } from './PlayerSearchModal'
import { HistoryPlayerName } from './HistoryPlayerName'
import { HistoryAssetTooltip } from './HistoryAssetTooltip'
import { HistoryPerformanceStats } from './HistoryPerformanceStats'
import { HistoryScrollTop } from './HistoryScrollTop'
import { RefreshIcon, SettingsIcon, SearchIcon } from './icons'
import { PlayerTagBadge, PlayerTagBookModal, PlayerTagEditorModal, TagBookIcon, TagBookmarkIcon } from './PlayerTagWidgets'
import { usePlayerTag, usePlayerTagFeatureEnabled } from '@/lib/player-tags'
import { ChampionStrip, HistoryImage, RankCards, SummaryStats, championName } from './HistoryWidgets'
import { HistoryMatchList } from './HistoryMatchList'
import { getChampIcon, getPlayableQueues, getQueueName, getQueue, resolveCanonicalQueueId } from '@/lib/assets'
import { deadline, fetchHistoryMastery, fetchHistoryRanks, fetchHistorySummoner, type HistoryMastery, type HistoryRank } from '@/lib/history-api'
import { lcu, isMatchingQueue } from '@/lib/lcu'
import { historyPlayerFromSummoner, historyServerName, rememberHistoryPlayer, type HistoryPlayer } from '@/lib/history-search'
import { championStats, encounters, numberText, percentText, POSITION_NAMES, profileIconUrl, splitRiotId, summarize, toHistoryMatches } from '@/lib/history-model'
import { calculatePlayerScore, playerScoreLabel, playerScoreRange, formatPlayerScore } from '@/lib/player-score'
import { usePlayerScoreSystem } from '@/lib/use-player-score'
import { useHistoryPages } from '@/lib/use-history-pages'
import { useHistoryHiddenFields } from '@/lib/use-history-display'
import { isHistoryFieldVisible, type HistoryDisplayField } from '@/lib/history-display'
import { getHistoryEpoch, historyRequests } from '@/lib/shared-requests'
import '@/styles/PersonalHistory.css'

export interface PlayerHistoryModalProps { open: boolean; onClose: () => void; puuid: string; playerName: string; queueId?: number }
const LANE_POSITIONS = ['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY']

interface HistoryView {
  queueId: number; batchSize: number; championId: number; position: string; result: string; hideAborted: boolean
  tab: 'matches' | 'champions' | 'trend'; showAllMastery: boolean; expanded: string[]; sidebarTop: number; contentTop: number
  championSort: string; championDirection?: 'asc' | 'desc'; championMin: number
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
  const [copyStatus, setCopyStatus] = useState('')
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
  viewRef.current = { queueId, batchSize, championId, position, result, hideAborted, tab, showAllMastery, expanded: [...expanded], sidebarTop: 0, contentTop: 0, championSort, championDirection, championMin }
  useLayoutEffect(() => {
    const sidebar = sidebarRef.current, content = contentRef.current
    return () => rememberView({ ...viewRef.current, sidebarTop: sidebar?.scrollTop ?? 0, contentTop: content?.scrollTop ?? 0 })
  }, [])
  const contentMounted = useRef(false)
  useLayoutEffect(() => {
    if (contentMounted.current && contentRef.current) contentRef.current.scrollTop = 0
    contentMounted.current = true
  }, [queueId, tab])
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
    else { setShowSettings(false); setShowSearch(false) }
  }, [open, target])

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
  const filteredChampions = useMemo(() => championStats(filtered), [filtered])
  const sortedChampions = useMemo(() => filteredChampions.filter((item) => item.total >= championMin).sort((a, b) => {
    if (championSort === 'name') return championName(a.id).localeCompare(championName(b.id), 'zh-CN') * (championDirection === 'asc' ? 1 : -1)
    const field = championSort as 'total' | 'winRate' | 'kda' | 'participation' | 'damageShare' | 'takenShare' | 'csPerMinute'
    const left = a[field], right = b[field]
    if (left == null || !Number.isFinite(left)) return right == null || !Number.isFinite(right) ? a.id-b.id : 1
    if (right == null || !Number.isFinite(right)) return -1
    return (right-left) * (championDirection === 'desc' ? 1 : -1) || b.total - a.total || a.id - b.id
  }), [filteredChampions, championSort, championDirection, championMin])
  const teammates = useMemo(() => encounters(filtered, 'ally'), [filtered])
  const opponents = useMemo(() => encounters(filtered, 'enemy'), [filtered])
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
  useEffect(() => setCopyStatus(''), [name])
  const resetLocalFilters = () => { setChampionId(0); setPosition(''); setResult(''); setHideAborted(true) }
  const refresh = () => { pages.refresh(); setProfileRevision((n) => n + 1) }

  return <div className="rh-shell rh-history-shell" data-testid="player-history">
    <header className={`rh-header rh-profile-header${show('ranks') ? '' : ' rh-header-no-ranks'}`}>
      <div className="rh-profile">{onBack && <button className="rh-back" type="button" onClick={onBack}>‹ 返回</button>}
        <span className="rh-profile-portrait"><HistoryImage src={profileIconUrl(profile?.iconId ?? target.iconId)} label={name} className="rh-profile-icon" />
          {level != null && <small className="rh-profile-level">{level}</small>}
        </span>
        <div className="rh-profile-details">
          <div className="rh-profile-name">
            <HistoryAssetTooltip title={name} compact focusable={false} asChild><h2 aria-label={name}>{identity.name}</h2></HistoryAssetTooltip>
            {name !== '玩家战绩' && name !== '未知玩家' && <button type="button" className="rh-copy-id" aria-label="复制玩家 ID"
              aria-description={copyStatus || undefined} onClick={async () => {
                try { await navigator.clipboard.writeText(name); setCopyStatus('已复制') }
                catch { setCopyStatus('复制失败') }
              }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
                {copyStatus === '已复制' ? <path d="m3 8 3 3 7-7" /> : <><rect x="5" y="2" width="8" height="10" rx="1" /><path d="M3 5v8a1 1 0 0 0 1 1h6" /></>}
              </svg>
            </button>}
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
        <section className="rh-panel"><h3>查询范围</h3><label>游戏模式<HistorySelect aria-label="游戏模式" value={queueId} onChangeValue={(value) => { setQueueId(Number(value)); resetLocalFilters() }}><option value={0}>全部模式</option>{queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</HistorySelect></label><label>每次加载<HistorySelect aria-label="每次加载场次" value={batchSize} onChangeValue={(value) => setBatchSize(Number(value))}>{[20, 50, 100].map((count) => <option value={count} key={count}>{count} 场</option>)}</HistorySelect></label></section>
        {show('summary') && <section className="rh-panel"><h3>近期总览 <small>{stats.total} 场</small></h3>{strength && <HistoryAssetTooltip title={`${playerScoreLabel(scoreSystem)} · ${playerScoreRange(scoreSystem)} 分`} compact focusable={false} asChild><div className="rh-score" data-score-system={scoreSystem}><span>{playerScoreLabel(scoreSystem)}</span><strong>{formatPlayerScore(strength.score,scoreSystem)}</strong></div></HistoryAssetTooltip>}<SummaryStats matches={filtered} /><HistoryPerformanceStats matches={filtered} section="history" />{stats.total > 0 && <div className="rh-summary-extra"><span>{stats.streak}</span><span>蓝方 {stats.blue} / 红方 {stats.red}</span></div>}</section>}
        {show('champions') && <section className="rh-panel">
          <h3>近期常玩英雄</h3>
          <ChampionStrip matches={allMatches} selectedId={championId} limit={12}
            onSelect={(id) => {
              setChampionId((current) => current === id ? 0 : id)
              setTab('matches')
            }}
          />
          <p className="rh-footnote">再次点击当前英雄可显示全部英雄的战绩</p>
        </section>}
        {show('mastery') && <section className="rh-panel"><h3>英雄点数 <button type="button" className="rh-text-button" onClick={() => setShowAllMastery(!showAllMastery)}>{showAllMastery ? '收起' : '更多'}</button></h3>{mastery ? mastery.length ? <div className="rh-mastery">{mastery.slice(0, showAllMastery ? 60 : 6).map((m) => <button type="button" key={m.championId} onClick={() => { setChampionId(m.championId); setTab('matches') }} aria-label="查看该英雄战绩"><HistoryImage src={getChampIcon(m.championId)} label={championName(m.championId)} /><span><strong>{championName(m.championId)}</strong><small>{m.championLevel} 级</small></span><b>{numberText(m.championPoints)}</b></button>)}</div> : <p className="rh-muted">暂无英雄点数记录</p> : <p className="rh-muted">{masteryStatus}</p>}</section>}
        {([['teammates', '最近队友', teammates], ['opponents', '最近对手', opponents]] as const).filter(([field]) => show(field)).map(([, title, people]) => (
          <section className="rh-panel" key={title}>
            <h3>{title}</h3>
            <div className="rh-encounters">
              {people.slice(0, 8).map((person) => (
                <button type="button" key={person.puuid} onClick={() => onInspect(person.puuid, person.name)} aria-label={person.name}>
                  <HistoryImage src={profileIconUrl(person.profileIcon)} label={person.name} nativeTooltip={false} />
                  <HistoryPlayerName name={person.name} showTag />
                  <small>{person.count} 场 · {person.wins} 胜 {person.losses} 负</small>
                </button>
              ))}
            </div>
            {!people.length && <p className="rh-muted">暂无可用记录</p>}
          </section>
        ))}
      </aside>
      <main className="rh-main">
        <div className="rh-main-toolbar">
          <div className="rh-tabs">
            <button type="button" className={tab === 'matches' ? 'is-active' : ''} onClick={() => setTab('matches')}>战绩明细 <small>{filtered.length}</small></button>
            <button type="button" className={tab === 'champions' ? 'is-active' : ''} onClick={() => setTab('champions')}>英雄统计 <small>{filteredChampions.length}</small></button>
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
        {pages.scanLimit && <div className="rh-notice">当前范围为最近 {pages.scanLimit} 场。</div>}
        {pages.error && <div className="rh-error" role="alert">{pages.error}<button type="button" onClick={allMatches.length && pages.hasMore ? () => void pages.loadMore() : refresh}>重试</button></div>}
        <div className="rh-content rh-scroll-area" ref={contentRef}>
          {pages.loading ? <div className="rh-empty"><span className="rh-spinner" />正在加载战绩…<span className="rh-kaomoji" aria-hidden="true">(｡･ω･｡)</span></div> : !filtered.length ? <div className="rh-empty"><span>{allMatches.length ? '当前筛选下没有已加载对局。可重置筛选或继续加载。' : pages.error ? '战绩查询未完成，请重试。' : '当前查询范围没有对局记录。'}</span>{!pages.error && <span className="rh-kaomoji" aria-hidden="true">(・ω・)</span>}</div> : tab === 'matches' ? <HistoryMatchList matches={filtered} hidden={hidden} onInspect={onInspect} scrollRef={contentRef} expanded={expanded} onExpandedChange={changeExpanded} /> : tab === 'trend' ? <HistoryTrendPanel matches={filtered} games={filteredGames} puuid={target.puuid} system={scoreSystem} score={strength} /> : <div className="rh-champion-results"><div className="rh-champion-controls">
            <label>最低场次<HistorySelect aria-label="英雄统计最低场次" value={championMin} onChangeValue={(value) => setChampionMin(Number(value))}>{[1,3,5,10,20].map((count) => <option key={count} value={count}>{count} 场</option>)}</HistorySelect></label>
            <span className="rh-muted">{sortedChampions.length} 位英雄</span>
          </div><div className="rh-table-scroll"><table className="rh-champion-table"><thead><tr>{[['name','英雄'],['total','场次'],['winRate','胜率'],['kda','KDA'],['participation','参团'],['damageShare','伤害占比'],['takenShare','承伤占比'],['csPerMinute','补刀 / 分']].map(([key,label]) => <th key={key} aria-sort={championSort===key ? championDirection==='asc'?'ascending':'descending' : 'none'}><button type="button" className="rh-column-sort" data-sort-key={key} aria-label={`${label}排序`} onClick={()=>{if(championSort===key)setChampionDirection((value)=>value==='desc'?'asc':'desc');else {setChampionSort(key);setChampionDirection(key==='name'?'asc':'desc')}}}>{label}<svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true" fill="currentColor"><path opacity={championSort===key&&championDirection==='asc'?1:.3} d="m5 1 4 4H1z"/><path opacity={championSort===key&&championDirection==='desc'?1:.3} d="m5 11 4-4H1z"/></svg></button></th>)}</tr></thead><tbody>{sortedChampions.map((c) => <tr key={c.id}><td><button type="button" className="rh-player-link" onClick={() => { setChampionId(c.id); setTab('matches') }}><HistoryImage src={getChampIcon(c.id)} label={championName(c.id)} /><span>{championName(c.id)}</span></button></td><td>{c.total}</td><td>{percentText(c.winRate)}</td><td>{numberText(c.kda, 2)}</td><td>{percentText(c.participation)}</td><td>{percentText(c.damageShare)}</td><td>{percentText(c.takenShare)}</td><td>{numberText(c.csPerMinute, 1)}</td></tr>)}</tbody></table></div>{!sortedChampions.length && <div className="rh-empty">没有达到最低场次的英雄</div>}</div>}
          {!pages.loading && <div className="rh-load-more"><HistoryAssetTooltip title={pages.loadingMore ? '正在加载…' : pages.hasMore ? `继续加载 ${batchSize} 场` : '已加载完毕'} compact asChild><button type="button" className="rh-button rh-icon-button" aria-label={pages.loadingMore ? '正在加载…' : pages.hasMore ? `继续加载 ${batchSize} 场` : '已加载完毕'} disabled={!pages.hasMore || pages.loadingMore} onClick={() => void pages.loadMore()}>{pages.loadingMore ? <span className="rh-spinner" /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>}</button></HistoryAssetTooltip></div>}
        </div>
      </main>
    </div>
    <HistoryScrollTop targets={scrollTargets} resetKey={`${open}:${target.puuid}:${queueId}:${tab}:${championId}:${position}:${result}:${hideAborted}:${pages.loading}`} />
    <HistoryDisplaySettings open={open && showSettings} onClose={() => setShowSettings(false)} initialSection="history" />
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
