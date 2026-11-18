import { useState, useEffect, useRef } from 'react'
import { SettingCard, SettingGroup } from '@/components/ui/SettingCard'
import { SonaButton } from '@/components/ui/SonaButton'
import { SonaInput } from '@/components/ui/SonaInput'
import { SonaSwitch } from '@/components/ui/SonaSwitch'
import { SonaSelect } from '@/components/ui/SonaSelect'
import { SonaCheckbox } from '@/components/ui/SonaCheckbox'
import { MatchHistoryModal } from '@/components/ui/MatchHistoryModal'
import { PlayerTagBookModal } from '@/components/ui/PlayerTagWidgets'
import {
  CHAMP_SELECT_PRESET_SCOPES,
  type AutoSwapStrategy,
  type ChampSelectPresetScope,
} from '@/lib/champselect-enhancements'
import { requestReplay } from '@/lib/replay'
import { searchChampions, getChampionById, getPlayableQueues, type ChampionInfo } from '@/lib/assets'
import { lcu } from '@/lib/lcu'
import { logger } from '@/lib/logger'
import { store } from '@/lib/store'
import { useI18n } from '@/i18n'
import '@/styles/SettingsPage.css'

function BackupManager() {
  const { t } = useI18n()
  const [backupName, setBackupName] = useState('')
  const [backups, setBackups] = useState<{ name: string; timestamp: number }[]>([])
  const [status, setStatus] = useState('')

  const refreshList = async () => {
    const list = await lcu.listBackups()
    setBackups(list)
  }

  useEffect(() => { refreshList() }, [])

  const handleBackup = async () => {
    const name = backupName.trim()
    if (!name) { setStatus(t('tools.backup.nameRequired')); return }
    setStatus(t('tools.backup.saving'))
    const ok = await lcu.backupSettings(name)
    setStatus(ok ? t('tools.backup.success') : t('tools.backup.failed'))
    if (ok) { setBackupName(''); refreshList() }
  }

  const handleRestore = async (name: string) => {
    setStatus(t('tools.backup.restoring', { name }))
    const ok = await lcu.restoreSettings(name)
    setStatus(ok ? t('tools.backup.restored', { name }) : t('tools.backup.restoreFailed'))
  }

  const handleDelete = async (name: string) => {
    const ok = await lcu.deleteBackup(name)
    if (ok) {
      setStatus(t('tools.backup.deleted', { name }))
      refreshList()
    }
  }

  const formatTime = (ts: number) => {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  }

  return (
    <>
      <div className="sona-debug-actions" style={{ alignItems: 'flex-end', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <SonaInput
            value={backupName}
            onChange={(v) => { setBackupName(v); setStatus('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleBackup() }}
            placeholder={t('tools.backup.placeholder')}
          />
        </div>
        <SonaButton variant="primary" onClick={handleBackup}>
          {t('tools.backup.save')}
        </SonaButton>
      </div>
      {status && <p className="sona-subtitle" style={{ marginTop: 6 }}>{status}</p>}
      {backups.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {backups.map((b) => (
            <div key={b.name} className="sona-backup-item">
              <div className="sona-backup-info">
                <span className="sona-backup-name">{b.name}</span>
                <span className="sona-backup-time">{formatTime(b.timestamp)}</span>
              </div>
              <div className="sona-backup-actions">
                <SonaButton onClick={() => handleRestore(b.name)}>{t('common.restore')}</SonaButton>
                <SonaButton onClick={() => handleDelete(b.name)}>{t('common.delete')}</SonaButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function ChampionPriorityCards({
  championIds,
  emptyText,
  onMoveUp,
  onRemove,
}: {
  championIds: number[]
  emptyText: string
  onMoveUp?: (championId: number) => void
  onRemove: (championId: number) => void
}) {
  if (championIds.length === 0) {
    return <p className="sona-subtitle" style={{ margin: 0 }}>{emptyText}</p>
  }

  return (
    <div className="sona-champ-priority-list">
      {championIds.map((championId, index) => {
        const champion = getChampionById(championId)
        return (
          <div className="sona-champ-priority-card" key={championId}>
            <span className="sona-champ-priority-index">{index + 1}</span>
            <img
              className="sona-champ-priority-icon"
              src={`/lol-game-data/assets/v1/champion-icons/${championId}.png`}
              alt=""
            />
            <span className="sona-champ-priority-name">
              {champion ? `${champion.title} ${champion.name}` : `英雄#${championId}`}
            </span>
            {onMoveUp && index > 0 && (
              <button
                className="sona-champ-priority-move"
                type="button"
                onClick={() => onMoveUp(championId)}
                aria-label="提高顺位"
                title="前移顺位"
              >
                ↑
              </button>
            )}
            <button
              className="sona-champ-priority-remove"
              type="button"
              onClick={() => onRemove(championId)}
              aria-label="移除"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function ToolsPage() {
  const { t } = useI18n()
  const [autoAccept, setAutoAccept] = useState(store.get('autoAcceptMatch'))
  const [allowDeclineAfterAccept, setAllowDeclineAfterAccept] = useState(store.get('allowDeclineAfterAccept'))
  // 延迟值在 UI 里用字符串存，避免"删到空 → 变 NaN"、"输到一半"等中间态被推回 store
  const [autoAcceptDelayMin, setAutoAcceptDelayMin] = useState(String(store.get('autoAcceptDelayMin')))
  const [autoAcceptDelayMax, setAutoAcceptDelayMax] = useState(String(store.get('autoAcceptDelayMax')))
  const [unlockStatus, setUnlockStatus] = useState(store.get('unlockStatus'))
  const [unlockAvailability, setUnlockAvailability] = useState(store.get('unlockAvailability'))
  const [unlockChromas, setUnlockChromas] = useState(store.get('unlockChromas'))
  const [ignoreProfilePrivacy, setIgnoreProfilePrivacy] = useState(store.get('ignoreProfilePrivacy'))
  const [benchNoCooldown, setBenchNoCooldown] = useState(store.get('benchNoCooldown'))
  const [hideTFT, setHideTFT] = useState(store.get('hideTFT'))
  const [hideClassicMode, setHideClassicMode] = useState(store.get('hideClassicMode'))
  const [hideRightNavText, setHideRightNavText] = useState(store.get('hideRightNavText'))
  const [hideEsportsPopup, setHideEsportsPopup] = useState(store.get('hideEsportsPopup'))
  const [gameModeFilter, setGameModeFilter] = useState(store.get('gameModeFilter'))
  const [quickLobbyMode, setQuickLobbyMode] = useState(store.get('quickLobbyMode'))
  const [quickLobbyQueueId, setQuickLobbyQueueId] = useState(store.get('quickLobbyQueueId'))
  const [quickLobbyQueueOptions, setQuickLobbyQueueOptions] = useState<{ value: string; label: string }[]>([])
  const [windowEffect, setWindowEffect] = useState(store.get('windowEffect'))
  const [champSelectAssist, setChampSelectAssist] = useState(store.get('champSelectAssist'))
  const [teamHistoryOverview, setTeamHistoryOverview] = useState(store.get('teamHistoryOverview'))
  const [opggBuildRecommendation, setOpggBuildRecommendation] = useState(store.get('opggBuildRecommendation'))
  const [smartBuildRecommendation, setSmartBuildRecommendation] = useState(store.get('smartBuildRecommendation'))
  const [smartItemSetBuild, setSmartItemSetBuild] = useState(store.get('smartItemSetBuild'))
  const [balanceBuffTooltip, setBalanceBuffTooltip] = useState(store.get('balanceBuffTooltip'))
  const [champSelectQuitButton, setChampSelectQuitButton] = useState(store.get('champSelectQuitButton'))
  const [gameAnalysisPopup, setGameAnalysisPopup] = useState(store.get('gameAnalysisPopup'))
  const [autoReturnToLobby, setAutoReturnToLobby] = useState(store.get('autoReturnToLobby'))
  const [autoReturnMode, setAutoReturnMode] = useState(store.get('autoReturnMode'))
  const [analyzeTeamPower, setAnalyzeTeamPower] = useState(store.get('analyzeTeamPower'))
  const [analyzeTeamPowerMsgType, setAnalyzeTeamPowerMsgType] = useState(store.get('analyzeTeamPowerMsgType'))
  const [analyzeTeamPowerFetchCount, setAnalyzeTeamPowerFetchCount] = useState(store.get('analyzeTeamPowerFetchCount'))
  const [champSelectAssistFetchCount, setChampSelectAssistFetchCount] = useState(store.get('champSelectAssistFetchCount'))
  const [gameAnalysisFetchCount, setGameAnalysisFetchCount] = useState(store.get('gameAnalysisFetchCount'))
  const [sideIndicator, setSideIndicator] = useState(store.get('sideIndicator'))
  const [sideIndicatorMsgType, setSideIndicatorMsgType] = useState(store.get('sideIndicatorMsgType'))
  const [friendSmartGroup, setFriendSmartGroup] = useState(store.get('friendSmartGroup'))
  const [enhancedFriendGameStatus, setEnhancedFriendGameStatus] = useState(store.get('enhancedFriendGameStatus'))
  const [lobbyEnhancement, setLobbyEnhancement] = useState(store.get('lobbyEnhancement'))
  const [lobbyEnhancementFetchCount, setLobbyEnhancementFetchCount] = useState(store.get('lobbyEnhancementFetchCount'))
  const [customProfileBg, setCustomProfileBg] = useState(store.get('customProfileBg'))
  const [customBanner, setCustomBanner] = useState(store.get('customBanner'))
  const [isRemovingCrest, setIsRemovingCrest] = useState(false)
  const [isRemovingChallengeBadges, setIsRemovingChallengeBadges] = useState(false)
  const [rankQueue, setRankQueue] = useState(store.get('rankQueue'))
  const [rankTier, setRankTier] = useState(store.get('rankTier'))
  const [rankDivision, setRankDivision] = useState(store.get('rankDivision'))
  const [autoHonor, setAutoHonor] = useState(store.get('autoHonor'))
  const [autoLockChampion, setAutoLockChampion] = useState(store.get('autoLockChampion'))
  const [autoLockChampionIds, setAutoLockChampionIds] = useState(store.get('autoLockChampionIds'))
  const [champSearchText, setChampSearchText] = useState('')
  const [champSuggestions, setChampSuggestions] = useState<ChampionInfo[]>([])
  const [showChampSuggestions, setShowChampSuggestions] = useState(false)
  const [autoLockInstant, setAutoLockInstant] = useState(store.get('autoLockInstant'))
  const champSuggestRef = useRef<HTMLDivElement>(null)
  const [autoBanChampion, setAutoBanChampion] = useState(store.get('autoBanChampion'))
  const [autoBanChampionIds, setAutoBanChampionIds] = useState(store.get('autoBanChampionIds'))
  const [banChampSearchText, setBanChampSearchText] = useState('')
  const [banChampSuggestions, setBanChampSuggestions] = useState<ChampionInfo[]>([])
  const [showBanChampSuggestions, setShowBanChampSuggestions] = useState(false)
  const banChampSuggestRef = useRef<HTMLDivElement>(null)
  const [playerTagEnabled, setPlayerTagEnabled] = useState(store.get('playerTagEnabled'))
  const [champSelectTagAlert, setChampSelectTagAlert] = useState(store.get('champSelectTagAlert'))
  const [encounterAlertEnabled, setEncounterAlertEnabled] = useState(store.get('encounterAlertEnabled'))
  const [postgameEnhancement, setPostgameEnhancement] = useState(store.get('postgameEnhancement'))
  const [autoHonorStrategy, setAutoHonorStrategy] = useState(store.get('autoHonorStrategy'))
  const [autoRandomSkin, setAutoRandomSkin] = useState(store.get('autoRandomSkin'))
  const [autoRandomSkinExcludeBase, setAutoRandomSkinExcludeBase] = useState(store.get('autoRandomSkinExcludeBase'))
  const [autoAcceptSwap, setAutoAcceptSwap] = useState(store.get('autoAcceptSwap'))
  const [autoAcceptSwapStrategy, setAutoAcceptSwapStrategy] = useState(store.get('autoAcceptSwapStrategy'))
  const [champSelectPresetSwitch, setChampSelectPresetSwitch] = useState(store.get('champSelectPresetSwitch'))
  const [champSelectPresets, setChampSelectPresets] = useState(store.get('champSelectPresets'))
  const [selectedLockScope, setSelectedLockScope] = useState<'default' | ChampSelectPresetScope>('default')
  const [selectedBanScope, setSelectedBanScope] = useState<'default' | ChampSelectPresetScope>('default')
  const [champSelectCompDiagnostic, setChampSelectCompDiagnostic] = useState(store.get('champSelectCompDiagnostic'))
  const [aramBenchTeammateHint, setAramBenchTeammateHint] = useState(store.get('aramBenchTeammateHint'))
  const [aramWishlistEnabled, setAramWishlistEnabled] = useState(store.get('aramWishlistEnabled'))
  const [aramWishlistChampionIds, setAramWishlistChampionIds] = useState(store.get('aramWishlistChampionIds'))
  const [aramWishlistAutoSwap, setAramWishlistAutoSwap] = useState(store.get('aramWishlistAutoSwap'))
  const [wishChampSearchText, setWishChampSearchText] = useState('')
  const [wishChampSuggestions, setWishChampSuggestions] = useState<ChampionInfo[]>([])
  const [showWishChampSuggestions, setShowWishChampSuggestions] = useState(false)
  const wishChampSuggestRef = useRef<HTMLDivElement>(null)
  const [replayGameId, setReplayGameId] = useState('')
  const [replayState, setReplayState] = useState<'idle' | 'downloading' | 'ready' | 'launching' | 'error'>('idle')
  const [searchRiotId, setSearchRiotId] = useState('')
  const [searchError, setSearchError] = useState('')
  const [matchModalOpen, setMatchModalOpen] = useState(false)
  const [matchModalPuuid, setMatchModalPuuid] = useState('')
  const [matchModalName, setMatchModalName] = useState('')
  const [tagBookOpen, setTagBookOpen] = useState(false)
  const recentOptions = [
    { value: '20', label: t('option.recent.20') },
    { value: '50', label: t('option.recent.50') },
    { value: '100', label: t('option.recent.100') },
  ]
  const visibilityOptions = [
    { value: 'celebration', label: t('option.visibility.self') },
    { value: 'chat', label: t('option.visibility.team') },
  ]
  const effectOptions = [
    { value: 'none', label: t('option.windowEffect.none') },
    { value: 'blurbehind', label: t('option.windowEffect.blurbehind') },
    { value: 'acrylic', label: t('option.windowEffect.acrylic') },
    { value: 'unified', label: t('option.windowEffect.unified') },
    { value: 'mica', label: t('option.windowEffect.mica') },
    { value: 'transparent', label: t('option.windowEffect.transparent') },
  ]

  useEffect(() => {
    const unsubs = [
      store.onChange('autoAcceptMatch', setAutoAccept),
      store.onChange('allowDeclineAfterAccept', setAllowDeclineAfterAccept),
      store.onChange('autoAcceptDelayMin', (v) => setAutoAcceptDelayMin(String(v))),
      store.onChange('autoAcceptDelayMax', (v) => setAutoAcceptDelayMax(String(v))),
      store.onChange('unlockStatus', setUnlockStatus),
      store.onChange('unlockAvailability', setUnlockAvailability),
      store.onChange('unlockChromas', setUnlockChromas),
      store.onChange('ignoreProfilePrivacy', setIgnoreProfilePrivacy),
      store.onChange('benchNoCooldown', setBenchNoCooldown),
      store.onChange('hideTFT', setHideTFT),
      store.onChange('hideClassicMode', setHideClassicMode),
      store.onChange('hideRightNavText', setHideRightNavText),
      store.onChange('hideEsportsPopup', setHideEsportsPopup),
      store.onChange('gameModeFilter', setGameModeFilter),
      store.onChange('quickLobbyMode', setQuickLobbyMode),
      store.onChange('quickLobbyQueueId', setQuickLobbyQueueId),
      store.onChange('windowEffect', setWindowEffect),
      store.onChange('champSelectAssist', setChampSelectAssist),
      store.onChange('teamHistoryOverview', setTeamHistoryOverview),
      store.onChange('opggBuildRecommendation', setOpggBuildRecommendation),
      store.onChange('smartBuildRecommendation', setSmartBuildRecommendation),
      store.onChange('smartItemSetBuild', setSmartItemSetBuild),
      store.onChange('balanceBuffTooltip', setBalanceBuffTooltip),
      store.onChange('champSelectQuitButton', setChampSelectQuitButton),
      store.onChange('gameAnalysisPopup', setGameAnalysisPopup),
      store.onChange('autoReturnToLobby', setAutoReturnToLobby),
      store.onChange('autoReturnMode', setAutoReturnMode),
      store.onChange('analyzeTeamPower', setAnalyzeTeamPower),
      store.onChange('analyzeTeamPowerMsgType', setAnalyzeTeamPowerMsgType),
      store.onChange('analyzeTeamPowerFetchCount', setAnalyzeTeamPowerFetchCount),
      store.onChange('champSelectAssistFetchCount', setChampSelectAssistFetchCount),
      store.onChange('gameAnalysisFetchCount', setGameAnalysisFetchCount),
      store.onChange('sideIndicator', setSideIndicator),
      store.onChange('sideIndicatorMsgType', setSideIndicatorMsgType),
      store.onChange('friendSmartGroup', setFriendSmartGroup),
      store.onChange('enhancedFriendGameStatus', setEnhancedFriendGameStatus),
      store.onChange('lobbyEnhancement', setLobbyEnhancement),
      store.onChange('lobbyEnhancementFetchCount', setLobbyEnhancementFetchCount),
      store.onChange('customProfileBg', setCustomProfileBg),
      store.onChange('customBanner', setCustomBanner),
      store.onChange('autoHonor', setAutoHonor),
      store.onChange('autoLockChampion', setAutoLockChampion),
      store.onChange('autoLockChampionIds', setAutoLockChampionIds),
      store.onChange('autoLockInstant', setAutoLockInstant),
      store.onChange('autoBanChampion', setAutoBanChampion),
      store.onChange('autoBanChampionIds', setAutoBanChampionIds),
      store.onChange('playerTagEnabled', setPlayerTagEnabled),
      store.onChange('champSelectTagAlert', setChampSelectTagAlert),
      store.onChange('encounterAlertEnabled', setEncounterAlertEnabled),
      store.onChange('postgameEnhancement', setPostgameEnhancement),
      store.onChange('autoHonorStrategy', setAutoHonorStrategy),
      store.onChange('autoRandomSkin', setAutoRandomSkin),
      store.onChange('autoRandomSkinExcludeBase', setAutoRandomSkinExcludeBase),
      store.onChange('autoAcceptSwap', setAutoAcceptSwap),
      store.onChange('autoAcceptSwapStrategy', setAutoAcceptSwapStrategy),
      store.onChange('champSelectPresetSwitch', setChampSelectPresetSwitch),
      store.onChange('champSelectPresets', setChampSelectPresets),
      store.onChange('champSelectCompDiagnostic', setChampSelectCompDiagnostic),
      store.onChange('aramBenchTeammateHint', setAramBenchTeammateHint),
      store.onChange('aramWishlistEnabled', setAramWishlistEnabled),
      store.onChange('aramWishlistChampionIds', setAramWishlistChampionIds),
      store.onChange('aramWishlistAutoSwap', setAramWishlistAutoSwap),
      store.onChange('rankQueue', setRankQueue),
      store.onChange('rankTier', setRankTier),
      store.onChange('rankDivision', setRankDivision),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  // 拉取可用队列列表供「快速大厅模式」下拉使用（assets 初始化可能稍晚，未就绪时轮询重试）
  useEffect(() => {
    const load = () => {
      const queues = getPlayableQueues()
      if (queues.length === 0) return false
      setQuickLobbyQueueOptions(queues.map((q) => ({ value: String(q.id), label: q.name })))
      return true
    }
    if (load()) return
    const timer = window.setInterval(() => {
      if (load()) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  // 点击外部关闭英雄联想下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (champSuggestRef.current && !champSuggestRef.current.contains(e.target as Node)) {
        setShowChampSuggestions(false)
      }
      if (banChampSuggestRef.current && !banChampSuggestRef.current.contains(e.target as Node)) {
        setShowBanChampSuggestions(false)
      }
      if (wishChampSuggestRef.current && !wishChampSuggestRef.current.contains(e.target as Node)) {
        setShowWishChampSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])


  const handleEffectChange = (value: string) => {
    setWindowEffect(value)
    store.set('windowEffect', value)
    if (value === 'none') {
      Effect.clear()
      logger.info('Window effect cleared')
    } else {
      Effect.apply(value as 'acrylic', { color: '#0006' })
      logger.info('Window effect applied: %s', value)
    }
  }

  const handleSearchMatch = async () => {
    const parts = searchRiotId.trim().split('#')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setSearchError(t('tools.matchQuery.invalid'))
      return
    }
    setSearchError('')
    try {
      const puuid = await lcu.resolveSummonerPuuidByRiotId(parts[0], parts[1])
      if (!puuid) {
        setSearchError(t('tools.matchQuery.notFound'))
        return
      }
      setMatchModalPuuid(puuid)
      setMatchModalName(`${parts[0]}#${parts[1]}`)
      setMatchModalOpen(true)
    } catch {
      setSearchError(t('tools.matchQuery.failed'))
    }
  }

  const activeLockIds = selectedLockScope === 'default'
    ? autoLockChampionIds
    : (champSelectPresets[selectedLockScope]?.lockIds ?? [])

  const activeBanIds = selectedBanScope === 'default'
    ? autoBanChampionIds
    : (champSelectPresets[selectedBanScope]?.banIds ?? [])

  const updateScopedIds = (
    kind: 'lock' | 'ban',
    scope: 'default' | ChampSelectPresetScope,
    nextIds: number[],
  ) => {
    if (scope === 'default') {
      if (kind === 'lock') {
        setAutoLockChampionIds(nextIds)
        store.set('autoLockChampionIds', nextIds)
      } else {
        setAutoBanChampionIds(nextIds)
        store.set('autoBanChampionIds', nextIds)
      }
      return
    }
    const prevEntry = champSelectPresets[scope] ?? { lockIds: [], banIds: [] }
    const nextEntry = {
      lockIds: kind === 'lock' ? nextIds : prevEntry.lockIds,
      banIds: kind === 'ban' ? nextIds : prevEntry.banIds,
    }
    const nextPresets = { ...champSelectPresets }
    if (nextEntry.lockIds.length === 0 && nextEntry.banIds.length === 0) {
      delete nextPresets[scope]
    } else {
      nextPresets[scope] = nextEntry
    }
    setChampSelectPresets(nextPresets)
    store.set('champSelectPresets', nextPresets)
  }

  const addAutoLockChampion = (champion: ChampionInfo) => {
    if (activeLockIds.includes(champion.id)) {
      setChampSearchText('')
      setShowChampSuggestions(false)
      return
    }

    const next = [...activeLockIds, champion.id]
    updateScopedIds('lock', selectedLockScope, next)
    setChampSearchText('')
    setShowChampSuggestions(false)
    logger.info('[AutoLock] 已加入目标英雄队列 (%s): %s %s (ID: %d)', selectedLockScope, champion.title, champion.name, champion.id)
  }

  const removeAutoLockChampion = (championId: number) => {
    updateScopedIds('lock', selectedLockScope, activeLockIds.filter((id) => id !== championId))
  }

  const addAutoBanChampion = (champion: ChampionInfo) => {
    if (activeBanIds.includes(champion.id)) {
      setBanChampSearchText('')
      setShowBanChampSuggestions(false)
      return
    }

    const next = [...activeBanIds, champion.id]
    updateScopedIds('ban', selectedBanScope, next)
    setBanChampSearchText('')
    setShowBanChampSuggestions(false)
    logger.info('[AutoBan] 已加入目标英雄队列 (%s): %s %s (ID: %d)', selectedBanScope, champion.title, champion.name, champion.id)
  }

  const removeAutoBanChampion = (championId: number) => {
    updateScopedIds('ban', selectedBanScope, activeBanIds.filter((id) => id !== championId))
  }

  const moveScopedPriorityUp = (
    kind: 'lock' | 'ban',
    scope: 'default' | ChampSelectPresetScope,
    ids: number[],
    championId: number,
  ) => {
    const idx = ids.indexOf(championId)
    if (idx <= 0) return
    const next = [...ids]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    updateScopedIds(kind, scope, next)
  }

  const movePriorityUp = (
    ids: number[],
    championId: number,
    setter: (next: number[]) => void,
    key: 'autoLockChampionIds' | 'autoBanChampionIds' | 'aramWishlistChampionIds',
  ) => {
    const idx = ids.indexOf(championId)
    if (idx <= 0) return
    const next = [...ids]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setter(next)
    store.set(key, next)
  }

  const addWishlistChampion = (champion: ChampionInfo) => {
    if (aramWishlistChampionIds.includes(champion.id)) {
      setWishChampSearchText('')
      setShowWishChampSuggestions(false)
      return
    }
    const next = [...aramWishlistChampionIds, champion.id]
    setAramWishlistChampionIds(next)
    store.set('aramWishlistChampionIds', next)
    setWishChampSearchText('')
    setShowWishChampSuggestions(false)
    logger.info('[AramWishlist] 已加入大乱斗心愿单: %s %s (ID: %d)', champion.title, champion.name, champion.id)
  }

  const removeWishlistChampion = (championId: number) => {
    const next = aramWishlistChampionIds.filter((id) => id !== championId)
    setAramWishlistChampionIds(next)
    store.set('aramWishlistChampionIds', next)
  }

  const handleRemoveCrest = async () => {
    if (isRemovingCrest) return

    try {
      setIsRemovingCrest(true)
      const current = await lcu.getRegalia()
      await lcu.updateRegalia({
        preferredCrestType: 'prestige',
        preferredBannerType: current.bannerType,
        selectedPrestigeCrest: 22,
      })
      logger.info('头像边框已卸下 ✓')
    } catch (err) {
      logger.error('卸下头像边框失败:', err)
    } finally {
      setIsRemovingCrest(false)
    }
  }

  const handleRemoveChallengeBadges = async () => {
    if (isRemovingChallengeBadges) return

    try {
      setIsRemovingChallengeBadges(true)
      await lcu.updateChallengePlayerPreferences({ challengeIds: [] })
      logger.info('身份徽章已全部卸下 ✓')
    } catch (err) {
      logger.error('卸下身份徽章失败:', err)
    } finally {
      setIsRemovingChallengeBadges(false)
    }
  }

  return (
    <div className="sona-settings">
      <h2 className="sona-settings-title">{t('tools.title')}</h2>

      <SettingGroup title={t('tools.group.matchQuery')}>
        <p className="sona-subtitle" style={{ marginBottom: 10 }}>{t('tools.matchQuery.description')}</p>
        <div className="sona-debug-actions" style={{ alignItems: 'flex-end', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <SonaInput
              value={searchRiotId}
              onChange={(v) => { setSearchRiotId(v); setSearchError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearchMatch() }}
              placeholder={t('tools.matchQuery.placeholder')}
            />
          </div>
          <SonaButton variant="primary" onClick={handleSearchMatch}>
            {t('tools.matchQuery.search')}
          </SonaButton>
          {playerTagEnabled && (
            <SonaButton variant="secondary" onClick={() => setTagBookOpen(true)}>
              玩家小本本
            </SonaButton>
          )}
        </div>
        {searchError && <p className="sona-subtitle" style={{ color: '#e74c3c', marginTop: 6 }}>{searchError}</p>}
      </SettingGroup>

      <MatchHistoryModal
        open={matchModalOpen}
        onClose={() => setMatchModalOpen(false)}
        puuid={matchModalPuuid}
        playerName={matchModalName}
      />
      <PlayerTagBookModal
        open={playerTagEnabled && tagBookOpen}
        onClose={() => setTagBookOpen(false)}
        onInspectPlayer={(puuid, name) => {
          setMatchModalPuuid(puuid)
          setMatchModalName(name)
          setMatchModalOpen(true)
        }}
      />

      <SettingGroup title="实战情报与增强">
        <SettingCard
          title="玩家标记（小本本）"
          description="支持在个人战绩、对局详情与单场战报中标记大腿、好评或避雷玩家，并随时翻阅本地小本本（关闭后仅隐藏入口与角标，不删除已存记录）。"
        >
          <SonaSwitch
            checked={playerTagEnabled}
            onChange={(v) => { setPlayerTagEnabled(v); store.set('playerTagEnabled', v) }}
          />
        </SettingCard>
        <SettingCard
          title="选人阶段小本本避雷预警"
          description="进入选人阶段自动检测同队队友（支持匿名排位），一旦命中「避雷 / 注意」标记立即弹出醒目预警条并支持当场查战绩。"
        >
          <SonaSwitch
            checked={champSelectTagAlert}
            onChange={(v) => { setChampSelectTagAlert(v); store.set('champSelectTagAlert', v) }}
          />
        </SettingCard>
        <SettingCard
          title="历史撞车自动提醒"
          description="打开五人 / 十人对局详情时，自动比对近期对局并提示是否与路人同队或交手过及历史胜负。"
        >
          <SonaSwitch
            checked={encounterAlertEnabled}
            onChange={(v) => { setEncounterAlertEnabled(v); store.set('encounterAlertEnabled', v) }}
          />
        </SettingCard>
        <SettingCard
          title="赛后结算与战报 MVP/SVP 徽章"
          description="在单场详细战报与赛后原生结算计分板上展示本局 MVP / SVP、表现评分及一键记入小本本按钮。"
        >
          <SonaSwitch
            checked={postgameEnhancement}
            onChange={(v) => { setPostgameEnhancement(v); store.set('postgameEnhancement', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.compDiagnostic.title')}
          description={t('tools.compDiagnostic.description')}
        >
          <SonaSwitch
            checked={champSelectCompDiagnostic}
            onChange={(v) => { setChampSelectCompDiagnostic(v); store.set('champSelectCompDiagnostic', v) }}
          />
        </SettingCard>
        <SettingCard
          title="锁定英雄自动随机皮肤 / 炫彩"
          description="选人阶段英雄锁定后，自动在该英雄已拥有的皮肤与炫彩中随机挑选一款切换（手动切换皮肤不会被覆盖）。"
        >
          <SonaCheckbox
            checked={autoRandomSkinExcludeBase}
            onChange={(v) => { setAutoRandomSkinExcludeBase(v); store.set('autoRandomSkinExcludeBase', v) }}
            label="排除原皮"
          />
          <SonaSwitch
            checked={autoRandomSkin}
            onChange={(v) => { setAutoRandomSkin(v); store.set('autoRandomSkin', v) }}
          />
        </SettingCard>
        <SettingCard
          title="自动处理楼层互换 / 英雄交换请求"
          description="选人阶段收到换楼层或换英雄请求时按策略自动同意（自动拦截小本本避雷玩家，并保护手上的心愿单英雄）。"
        >
          <SonaSelect
            value={autoAcceptSwapStrategy}
            onChange={(v) => {
              const next = v as AutoSwapStrategy
              setAutoAcceptSwapStrategy(next)
              store.set('autoAcceptSwapStrategy', next)
            }}
            options={[
              { value: 'friends_only', label: '仅好友与好评队友' },
              { value: 'favorable_or_friends', label: '好友 + 换至后手楼层' },
              { value: 'all', label: '全部同意（排除避雷）' },
            ]}
          />
          <SonaSwitch
            checked={autoAcceptSwap}
            onChange={(v) => { setAutoAcceptSwap(v); store.set('autoAcceptSwap', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.aramBenchTeammateHint.title')}
          description={t('tools.aramBenchTeammateHint.description')}
        >
          <SonaSwitch
            checked={aramBenchTeammateHint}
            onChange={(v) => { setAramBenchTeammateHint(v); store.set('aramBenchTeammateHint', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.aramWishlist.title')}
          description={t('tools.aramWishlist.description')}
        >
          <SonaSwitch
            checked={aramWishlistEnabled}
            onChange={(v) => { setAramWishlistEnabled(v); store.set('aramWishlistEnabled', v) }}
          />
        </SettingCard>
        {aramWishlistEnabled && (
          <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="sona-debug-actions" style={{ alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }} ref={wishChampSuggestRef}>
                <SonaInput
                  value={wishChampSearchText}
                  onChange={(v) => {
                    setWishChampSearchText(v)
                    const results = searchChampions(v)
                    setWishChampSuggestions(results)
                    setShowWishChampSuggestions(results.length > 0)
                  }}
                  placeholder={t('tools.aramWishlist.searchPlaceholder')}
                />
                {showWishChampSuggestions && wishChampSuggestions.length > 0 && (
                  <div className="sona-champ-suggest">
                    {wishChampSuggestions.map((c) => (
                      <button
                        key={c.id}
                        className="sona-champ-suggest-item"
                        type="button"
                        onClick={() => addWishlistChampion(c)}
                      >
                        <img className="sona-champ-suggest-icon" src={`/lol-game-data/assets/v1/champion-icons/${c.id}.png`} alt="" />
                        <span className="sona-champ-suggest-title">{c.title}</span>
                        <span className="sona-champ-suggest-name">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <SonaButton
                variant={aramWishlistAutoSwap ? 'primary' : undefined}
                onClick={() => { setAramWishlistAutoSwap(true); store.set('aramWishlistAutoSwap', true) }}
              >
                {t('tools.aramWishlist.autoSwap')}{aramWishlistAutoSwap ? ' ✓' : ''}
              </SonaButton>
              <SonaButton
                variant={!aramWishlistAutoSwap ? 'primary' : undefined}
                onClick={() => { setAramWishlistAutoSwap(false); store.set('aramWishlistAutoSwap', false) }}
              >
                {t('tools.aramWishlist.highlightOnly')}{!aramWishlistAutoSwap ? ' ✓' : ''}
              </SonaButton>
            </div>
            <ChampionPriorityCards
              championIds={aramWishlistChampionIds}
              emptyText={t('tools.aramWishlist.empty')}
              onMoveUp={(cid) => movePriorityUp(aramWishlistChampionIds, cid, setAramWishlistChampionIds, 'aramWishlistChampionIds')}
              onRemove={removeWishlistChampion}
            />
          </div>
        )}
        <SettingCard
          title="分模式 / 分路独立秒选禁用预设"
          description="开启后，下方的「秒抢英雄」与「自动禁用英雄」支持按上中下野辅或无限乱斗/斗魂竞技场保存多套预设并随本局自动切换。"
        >
          <SonaSwitch
            checked={champSelectPresetSwitch}
            onChange={(v) => { setChampSelectPresetSwitch(v); store.set('champSelectPresetSwitch', v) }}
          />
        </SettingCard>
      </SettingGroup>

      <SettingGroup title={t('tools.group.match')}>
        <SettingCard
          title={t('tools.autoAccept.title')}
          description={t('tools.autoAccept.description')}
        >
          <SonaSwitch
            checked={autoAccept}
            onChange={(v) => { setAutoAccept(v); store.set('autoAcceptMatch', v) }}
          />
        </SettingCard>
        {autoAccept && (
          <SettingCard
            title={t('tools.autoAcceptDelay.title')}
            description={t('tools.autoAcceptDelay.description')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 80 }}>
                <SonaInput
                  value={autoAcceptDelayMin}
                  onChange={(v) => {
                    // 毫秒只收整数
                    const cleaned = v.replace(/[^\d]/g, '')
                    setAutoAcceptDelayMin(cleaned)
                    const n = parseInt(cleaned, 10)
                    store.set('autoAcceptDelayMin', Number.isFinite(n) ? n : 0)
                  }}
                  placeholder="最小"
                />
              </div>
              <span style={{ color: '#a09b8c', fontSize: 13 }}>—</span>
              <div style={{ width: 80 }}>
                <SonaInput
                  value={autoAcceptDelayMax}
                  onChange={(v) => {
                    const cleaned = v.replace(/[^\d]/g, '')
                    setAutoAcceptDelayMax(cleaned)
                    const n = parseInt(cleaned, 10)
                    store.set('autoAcceptDelayMax', Number.isFinite(n) ? n : 0)
                  }}
                  placeholder="最大"
                />
              </div>
              <span style={{ color: '#a09b8c', fontSize: 13 }}>毫秒</span>
            </div>
          </SettingCard>
        )}
        <SettingCard
          title={t('tools.allowDeclineAfterAccept.title')}
          description={t('tools.allowDeclineAfterAccept.description')}
        >
          <SonaSwitch
            checked={allowDeclineAfterAccept}
            onChange={(v) => { setAllowDeclineAfterAccept(v); store.set('allowDeclineAfterAccept', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.quickLobby.title')}
          description={t('tools.quickLobby.description')}
        >
          <SonaSelect
            value={String(quickLobbyQueueId)}
            onChange={(v) => { const id = Number(v); setQuickLobbyQueueId(id); store.set('quickLobbyQueueId', id) }}
            options={quickLobbyQueueOptions}
            placeholder={t('tools.quickLobby.placeholder')}
          />
          <SonaSwitch
            checked={quickLobbyMode}
            onChange={(v) => { setQuickLobbyMode(v); store.set('quickLobbyMode', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.benchNoCooldown.title')}
          description={t('tools.benchNoCooldown.description')}
        >
          <SonaSwitch
            checked={benchNoCooldown}
            onChange={(v) => { setBenchNoCooldown(v); store.set('benchNoCooldown', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.analyzeTeamPower.title')}
          description={t('tools.analyzeTeamPower.description')}
        >
          <SonaSelect
            value={String(analyzeTeamPowerFetchCount)}
            onChange={(v) => { setAnalyzeTeamPowerFetchCount(Number(v)); store.set('analyzeTeamPowerFetchCount', Number(v)) }}
            options={recentOptions}
          />
          <SonaSelect
            value={analyzeTeamPowerMsgType}
            onChange={(v) => { setAnalyzeTeamPowerMsgType(v); store.set('analyzeTeamPowerMsgType', v) }}
            options={visibilityOptions}
          />
          <SonaSwitch
            checked={analyzeTeamPower}
            onChange={(v) => { setAnalyzeTeamPower(v); store.set('analyzeTeamPower', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.sideIndicator.title')}
          description={t('tools.sideIndicator.description')}
        >
          <SonaSelect
            value={sideIndicatorMsgType}
            onChange={(v) => { setSideIndicatorMsgType(v); store.set('sideIndicatorMsgType', v) }}
            options={visibilityOptions}
          />
          <SonaSwitch
            checked={sideIndicator}
            onChange={(v) => { setSideIndicator(v); store.set('sideIndicator', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.champSelectAssist.title')}
          description={t('tools.champSelectAssist.description')}
        >
          <SonaSelect
            value={String(champSelectAssistFetchCount)}
            onChange={(v) => { setChampSelectAssistFetchCount(Number(v)); store.set('champSelectAssistFetchCount', Number(v)) }}
            options={recentOptions}
          />
          <SonaSwitch
            checked={champSelectAssist}
            onChange={(v) => { setChampSelectAssist(v); store.set('champSelectAssist', v) }}
          />
        </SettingCard>
        <SettingCard
          title="五人 / 十人战绩总览"
          description="在英雄选择界面添加己方五人战绩按钮；进入游戏后可从客户端查看双方近期战绩。"
        >
          <SonaSwitch checked={teamHistoryOverview} onChange={(v) => { setTeamHistoryOverview(v); store.set('teamHistoryOverview', v) }} />
        </SettingCard>
        <SettingCard
          title={t('tools.opggBuildRecommendation.title')}
          description={t('tools.opggBuildRecommendation.description')}
        >
          <SonaSwitch
            checked={opggBuildRecommendation}
            onChange={(v) => { setOpggBuildRecommendation(v); store.set('opggBuildRecommendation', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.smartBuildRecommendation.title')}
          description={t('tools.smartBuildRecommendation.description')}
        >
          <SonaSwitch
            checked={smartBuildRecommendation}
            onChange={(v) => { setSmartBuildRecommendation(v); store.set('smartBuildRecommendation', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.smartItemSetBuild.title')}
          description={t('tools.smartItemSetBuild.description')}
        >
          <SonaSwitch
            checked={smartItemSetBuild}
            onChange={(v) => { setSmartItemSetBuild(v); store.set('smartItemSetBuild', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.balanceBuffTooltip.title')}
          description={t('tools.balanceBuffTooltip.description')}
        >
          <SonaSwitch
            checked={balanceBuffTooltip}
            onChange={(v) => { setBalanceBuffTooltip(v); store.set('balanceBuffTooltip', v) }}
          />
        </SettingCard>
        {/* 秒退的接口用不了 */}
        {/* <SettingCard
          title={t('tools.champSelectQuitButton.title')}
          description={t('tools.champSelectQuitButton.description')}
        >
          <SonaSwitch
            checked={champSelectQuitButton}
            onChange={(v) => { setChampSelectQuitButton(v); store.set('champSelectQuitButton', v) }}
          />
        </SettingCard> */}
        <SettingCard
          title={t('tools.gameAnalysisPopup.title')}
          description={t('tools.gameAnalysisPopup.description')}
        >
          <SonaSelect
            value={String(gameAnalysisFetchCount)}
            onChange={(v) => { setGameAnalysisFetchCount(Number(v)); store.set('gameAnalysisFetchCount', Number(v)) }}
            options={recentOptions}
          />
          <SonaSwitch
            checked={gameAnalysisPopup}
            onChange={(v) => { setGameAnalysisPopup(v); store.set('gameAnalysisPopup', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.autoReturn.title')}
          description={t('tools.autoReturn.description')}
        >
          <SonaSelect
            value={autoReturnMode}
            onChange={(v) => { setAutoReturnMode(v); store.set('autoReturnMode', v) }}
            options={[
              { value: 'queue', label: t('option.autoReturn.queue') },
              { value: 'lobby', label: t('option.autoReturn.lobby') },
            ]}
          />
          <SonaSwitch
            checked={autoReturnToLobby}
            onChange={(v) => { setAutoReturnToLobby(v); store.set('autoReturnToLobby', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.autoHonor.title')}
          description={t('tools.autoHonor.description')}
        >
          <SonaSelect
            value={autoHonorStrategy}
            onChange={(v) => {
              const next = v === 'friends_only' || v === 'random' ? v : 'smart'
              setAutoHonorStrategy(next)
              store.set('autoHonorStrategy', next)
            }}
            options={[
              { value: 'smart', label: '智能点赞（好友/MVP·跳避雷）' },
              { value: 'friends_only', label: '仅好友' },
              { value: 'random', label: '随机分配给票' },
            ]}
          />
          <SonaSwitch
            checked={autoHonor}
            onChange={(v) => { setAutoHonor(v); store.set('autoHonor', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.autoLock.title')}
          description={t('tools.autoLock.description')}
        >
          <SonaSwitch
            checked={autoLockChampion}
            onChange={(v) => { setAutoLockChampion(v); store.set('autoLockChampion', v) }}
          />
        </SettingCard>
        {autoLockChampion && (
          <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {champSelectPresetSwitch && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} data-testid="autolock-preset-tabs">
                {CHAMP_SELECT_PRESET_SCOPES.map(({ scope, label }) => {
                  const cnt = scope === 'default'
                    ? autoLockChampionIds.length
                    : (champSelectPresets[scope]?.lockIds?.length ?? 0)
                  const active = selectedLockScope === scope
                  return (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => setSelectedLockScope(scope)}
                      style={{
                        padding: '3px 9px',
                        borderRadius: 3,
                        fontSize: 11.5,
                        cursor: 'pointer',
                        border: active ? '1px solid #c8aa6e' : '1px solid rgba(200,170,110,0.25)',
                        background: active ? 'rgba(200,170,110,0.22)' : 'rgba(14,20,30,0.55)',
                        color: active ? '#f8ecc9' : '#b8afa0',
                      }}
                    >
                      {label}{cnt > 0 ? ` (${cnt})` : ''}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="sona-debug-actions" style={{ alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }} ref={champSuggestRef}>
                <SonaInput
                  value={champSearchText}
                  onChange={(v) => {
                    setChampSearchText(v)
                    const results = searchChampions(v)
                    setChampSuggestions(results)
                    setShowChampSuggestions(results.length > 0)
                  }}
                  placeholder={t('tools.autoLock.searchPlaceholder')}
                />
                {showChampSuggestions && champSuggestions.length > 0 && (
                  <div className="sona-champ-suggest">
                    {champSuggestions.map((c) => (
                      <button
                        key={c.id}
                        className="sona-champ-suggest-item"
                        type="button"
                        onClick={() => addAutoLockChampion(c)}
                      >
                        <img className="sona-champ-suggest-icon" src={`/lol-game-data/assets/v1/champion-icons/${c.id}.png`} alt="" />
                        <span className="sona-champ-suggest-title">{c.title}</span>
                        <span className="sona-champ-suggest-name">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <SonaButton
                variant={autoLockInstant ? 'primary' : undefined}
                onClick={() => { setAutoLockInstant(true); store.set('autoLockInstant', true) }}
              >
                {t('tools.autoLock.lock')}{autoLockInstant ? ' ✓' : ''}
              </SonaButton>
              <SonaButton
                variant={!autoLockInstant ? 'primary' : undefined}
                onClick={() => { setAutoLockInstant(false); store.set('autoLockInstant', false) }}
              >
                {t('tools.autoLock.preselect')}{!autoLockInstant ? ' ✓' : ''}
              </SonaButton>
            </div>
            <ChampionPriorityCards
              championIds={activeLockIds}
              emptyText={selectedLockScope === 'default' ? t('tools.autoLock.empty') : '当前分路/模式未单独配置，将自动回退使用「通用默认」列表'}
              onMoveUp={(cid) => moveScopedPriorityUp('lock', selectedLockScope, activeLockIds, cid)}
              onRemove={removeAutoLockChampion}
            />
          </div>
        )}
        <SettingCard
          title={t('tools.autoBan.title')}
          description={t('tools.autoBan.description')}
        >
          <SonaSwitch
            checked={autoBanChampion}
            onChange={(v) => { setAutoBanChampion(v); store.set('autoBanChampion', v) }}
          />
        </SettingCard>
        {autoBanChampion && (
          <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {champSelectPresetSwitch && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} data-testid="autoban-preset-tabs">
                {CHAMP_SELECT_PRESET_SCOPES.map(({ scope, label }) => {
                  const cnt = scope === 'default'
                    ? autoBanChampionIds.length
                    : (champSelectPresets[scope]?.banIds?.length ?? 0)
                  const active = selectedBanScope === scope
                  return (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => setSelectedBanScope(scope)}
                      style={{
                        padding: '3px 9px',
                        borderRadius: 3,
                        fontSize: 11.5,
                        cursor: 'pointer',
                        border: active ? '1px solid #c8aa6e' : '1px solid rgba(200,170,110,0.25)',
                        background: active ? 'rgba(200,170,110,0.22)' : 'rgba(14,20,30,0.55)',
                        color: active ? '#f8ecc9' : '#b8afa0',
                      }}
                    >
                      {label}{cnt > 0 ? ` (${cnt})` : ''}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="sona-debug-actions" style={{ alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }} ref={banChampSuggestRef}>
                <SonaInput
                  value={banChampSearchText}
                  onChange={(v) => {
                    setBanChampSearchText(v)
                    const results = searchChampions(v)
                    setBanChampSuggestions(results)
                    setShowBanChampSuggestions(results.length > 0)
                  }}
                  placeholder={t('tools.autoBan.searchPlaceholder')}
                />
                {showBanChampSuggestions && (
                  <div className="sona-champ-suggest">
                    {banChampSuggestions.map((c) => (
                      <button
                        key={c.id}
                        className="sona-champ-suggest-item"
                        type="button"
                        onClick={() => addAutoBanChampion(c)}
                      >
                        <img className="sona-champ-suggest-icon" src={`/lol-game-data/assets/v1/champion-icons/${c.id}.png`} alt="" />
                        <span className="sona-champ-suggest-title">{c.title}</span>
                        <span className="sona-champ-suggest-name">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <ChampionPriorityCards
              championIds={activeBanIds}
              emptyText={selectedBanScope === 'default' ? t('tools.autoBan.empty') : '当前分路/模式未单独配置，将自动回退使用「通用默认」列表'}
              onMoveUp={(cid) => moveScopedPriorityUp('ban', selectedBanScope, activeBanIds, cid)}
              onRemove={removeAutoBanChampion}
            />
          </div>
        )}
      </SettingGroup>

      <SettingGroup title={t('tools.group.social')}>
        <SettingCard
          title={t('tools.ignoreProfilePrivacy.title')}
          description={t('tools.ignoreProfilePrivacy.description')}
        >
          <SonaSwitch
            checked={ignoreProfilePrivacy}
            onChange={(value) => store.set('ignoreProfilePrivacy', value)}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.unlockStatus.title')}
          description={t('tools.unlockStatus.description')}
        >
          <SonaSwitch
            checked={unlockStatus}
            onChange={(v) => { setUnlockStatus(v); store.set('unlockStatus', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.unlockAvailability.title')}
          description={t('tools.unlockAvailability.description')}
        >
          <SonaSwitch
            checked={unlockAvailability}
            onChange={(v) => { setUnlockAvailability(v); store.set('unlockAvailability', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.unlockChromas.title')}
          description={t('tools.unlockChromas.description')}
        >
          <SonaSwitch
            checked={unlockChromas}
            onChange={(v) => { setUnlockChromas(v); store.set('unlockChromas', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.removeCrest.title')}
          description={t('tools.removeCrest.description')}
        >
          <SonaButton onClick={handleRemoveCrest} disabled={isRemovingCrest}>
            {t('tools.unequip')}
          </SonaButton>
        </SettingCard>
        <SettingCard
          title={t('tools.removeChallengeBadges.title')}
          description={t('tools.removeChallengeBadges.description')}
        >
          <SonaButton onClick={handleRemoveChallengeBadges} disabled={isRemovingChallengeBadges}>
            {t('tools.unequip')}
          </SonaButton>
        </SettingCard>
        <SettingCard
          title={t('tools.removeIcon.title')}
          description={t('tools.removeIcon.description')}
        >
          <SonaButton onClick={async () => {
            try {
              await lcu.setProfileIcon(29)
              logger.info('头像已恢复为默认头像 ✓')
            } catch (err) {
              logger.error('恢复默认头像失败:', err)
            }
          }}>
            {t('tools.unequip')}
          </SonaButton>
        </SettingCard>
        <SettingCard
          title={t('tools.customProfileBg.title')}
          description={t('tools.customProfileBg.description')}
        >
          <SonaSwitch
            checked={customProfileBg}
            onChange={(v) => { setCustomProfileBg(v); store.set('customProfileBg', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.customBanner.title')}
          description={t('tools.customBanner.description')}
        >
          <SonaSwitch
            checked={customBanner}
            onChange={(v) => { setCustomBanner(v); store.set('customBanner', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.friendSmartGroup.title')}
          description={t('tools.friendSmartGroup.description')}
        >
          <SonaSwitch
            checked={friendSmartGroup}
            onChange={(v) => { setFriendSmartGroup(v); store.set('friendSmartGroup', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.enhancedFriendStatus.title')}
          description={t('tools.enhancedFriendStatus.description')}
        >
          <SonaSwitch
            checked={enhancedFriendGameStatus}
            onChange={(v) => { setEnhancedFriendGameStatus(v); store.set('enhancedFriendGameStatus', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.lobbyEnhancement.title')}
          description={t('tools.lobbyEnhancement.description')}
        >
          <SonaSelect
            value={String(lobbyEnhancementFetchCount)}
            onChange={(v) => { setLobbyEnhancementFetchCount(Number(v)); store.set('lobbyEnhancementFetchCount', Number(v)) }}
            options={recentOptions}
          />
          <SonaSwitch
            checked={lobbyEnhancement}
            onChange={(v) => { setLobbyEnhancement(v); store.set('lobbyEnhancement', v) }}
          />
        </SettingCard>
      </SettingGroup>

      <SettingGroup title={t('tools.group.interface')}>
        <SettingCard
          title={t('tools.gameModeFilter.title')}
          description={t('tools.gameModeFilter.description')}
        >
          <SonaSwitch
            checked={gameModeFilter}
            onChange={(v) => { setGameModeFilter(v); store.set('gameModeFilter', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.hideTFT.title')}
          description={t('tools.hideTFT.description')}
        >
          <SonaSwitch
            checked={hideTFT}
            onChange={(v) => { setHideTFT(v); store.set('hideTFT', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.hideClassicMode.title')}
          description={t('tools.hideClassicMode.description')}
        >
          <SonaSwitch
            checked={hideClassicMode}
            onChange={(v) => { setHideClassicMode(v); store.set('hideClassicMode', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.hideRightNavText.title')}
          description={t('tools.hideRightNavText.description')}
        >
          <SonaSwitch
            checked={hideRightNavText}
            onChange={(v) => { setHideRightNavText(v); store.set('hideRightNavText', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.hideEsportsPopup.title')}
          description={t('tools.hideEsportsPopup.description')}
        >
          <SonaSwitch
            checked={hideEsportsPopup}
            onChange={(v) => { setHideEsportsPopup(v); store.set('hideEsportsPopup', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.windowEffect.title')}
          description={t('tools.windowEffect.description')}
        >
          <div style={{ minWidth: 130 }}>
            <SonaSelect
              options={effectOptions}
              value={windowEffect}
              onChange={handleEffectChange}
            />
          </div>
        </SettingCard>
      </SettingGroup>

      <SettingGroup title={t('tools.group.rankDisguise')}>
        <p className="sona-subtitle" style={{ marginBottom: 10 }}>{t('tools.rankDisguise.description')}</p>
        <div className="sona-debug-actions" style={{ alignItems: 'center' }}>
          <div style={{ minWidth: 140 }}>
            <SonaSelect
              options={[
                { value: 'RANKED_SOLO_5x5', label: t('rank.queue.RANKED_SOLO_5x5') },
                { value: 'RANKED_FLEX_SR', label: t('rank.queue.RANKED_FLEX_SR') },
                { value: 'RANKED_FLEX_TT', label: t('rank.queue.RANKED_FLEX_TT') },
                { value: 'RANKED_TFT', label: t('rank.queue.RANKED_TFT') },
                { value: 'RANKED_TFT_DOUBLE_UP', label: t('rank.queue.RANKED_TFT_DOUBLE_UP') },
                { value: 'RANKED_TFT_TURBO', label: t('rank.queue.RANKED_TFT_TURBO') },
              ]}
              value={rankQueue}
              onChange={setRankQueue}
            />
          </div>
          <div style={{ minWidth: 130 }}>
            <SonaSelect
              options={[
                { value: 'CHALLENGER', label: t('rank.CHALLENGER') },
                { value: 'GRANDMASTER', label: t('rank.GRANDMASTER') },
                { value: 'MASTER', label: t('rank.MASTER') },
                { value: 'DIAMOND', label: t('rank.DIAMOND') },
                { value: 'EMERALD', label: t('rank.EMERALD') },
                { value: 'PLATINUM', label: t('rank.PLATINUM') },
                { value: 'GOLD', label: t('rank.GOLD') },
                { value: 'SILVER', label: t('rank.SILVER') },
                { value: 'BRONZE', label: t('rank.BRONZE') },
                { value: 'IRON', label: t('rank.IRON') },
              ]}
              value={rankTier}
              onChange={setRankTier}
            />
          </div>
          <div style={{ minWidth: 80 }}>
            <SonaSelect
              options={[
                { value: 'I', label: 'I' },
                { value: 'II', label: 'II' },
                { value: 'III', label: 'III' },
                { value: 'IV', label: 'IV' },
              ]}
              value={rankDivision}
              onChange={setRankDivision}
            />
          </div>
          <SonaButton onClick={() => {
            store.set('rankQueue', rankQueue)
            store.set('rankTier', rankTier)
            store.set('rankDivision', rankDivision)
            store.set('rankDisguise', true)
          }}>
            {t('common.apply')}
          </SonaButton>
          <SonaButton onClick={() => {
            store.set('rankDisguise', false)
          }}>
            {t('common.restore')}
          </SonaButton>
        </div>
      </SettingGroup>

      <SettingGroup title={t('tools.group.replay')}>
        <p className="sona-subtitle" style={{ marginBottom: 10 }}>{t('tools.replay.description')}</p>
        <div className="sona-debug-actions" style={{ alignItems: 'flex-end', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <SonaInput
              value={replayGameId}
              onChange={(v) => { setReplayGameId(v); setReplayState('idle') }}
              placeholder={t('tools.replay.placeholder')}
            />
          </div>
          <SonaButton
            onClick={async () => {
              const id = Number(replayGameId)
              if (!id) return

              setReplayState('downloading')
              try {
                // 1. 查元数据
                const metaRes = await fetch(`/lol-replays/v1/metadata/${id}`)
                if (!metaRes.ok) {
                  logger.error('[Replay] 获取元数据失败:', metaRes.status)
                  setReplayState('error')
                  return
                }
                const meta = await metaRes.json() as { state: string; downloadProgress: number; gameId: number }

                // 2. 已就绪 → 直接观看
                if (meta.state === 'watch') {
                  setReplayState('launching')
                  const res = await requestReplay(id, 'watch')
                  setReplayState(res.ok ? 'ready' : 'error')
                  if (res.ok) logger.info('[Replay] 开始播放 #%d ✓', id)
                  else logger.error('[Replay] 播放失败:', await res.text())
                  return
                }

                // 3. 未下载 → 触发下载
                if (meta.state !== 'downloading') {
                  await requestReplay(id, 'download')
                }

                // 4. 轮询 metadata 等待下载完成
                for (let i = 0; i < 30; i++) {
                  await new Promise((r) => setTimeout(r, 2000))
                  const checkRes = await fetch(`/lol-replays/v1/metadata/${id}`)
                  if (!checkRes.ok) continue
                  const checkMeta = await checkRes.json() as { state: string; downloadProgress: number }
                  logger.info('[Replay] 下载中... %d%%', checkMeta.downloadProgress)

                  if (checkMeta.state === 'watch') {
                    setReplayState('launching')
                    const res = await requestReplay(id, 'watch')
                    setReplayState(res.ok ? 'ready' : 'error')
                    if (res.ok) logger.info('[Replay] 下载完成，开始播放 #%d ✓', id)
                    else logger.error('[Replay] 播放失败:', await res.text())
                    return
                  }
                }
                logger.warn('[Replay] 等待超时')
                setReplayState('error')
              } catch (err) {
                logger.error('[Replay] 异常:', err)
                setReplayState('error')
              }
            }}
          >
            {{ idle: t('tools.replay.watch'), downloading: t('tools.replay.status.downloading'), ready: t('tools.replay.status.ready'), launching: t('tools.replay.status.launching'), error: t('tools.replay.status.error') }[replayState]}
          </SonaButton>
        </div>
      </SettingGroup>

      <SettingGroup title={t('tools.group.backup')}>
        <p className="sona-subtitle" style={{ marginBottom: 10 }}>{t('tools.backup.placeholder')}</p>
        <BackupManager />
      </SettingGroup>
    </div>
  )
}
