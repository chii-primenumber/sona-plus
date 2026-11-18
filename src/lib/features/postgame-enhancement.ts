/**
 * E2（下）：赛后结算原生计分板增强（本局 MVP / SVP + Akari 评分胶囊 + 一键记入小本本）
 */

import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PlayerTagEditorModal, type PlayerTagTarget } from '@/components/ui/PlayerTagWidgets'
import { injector } from '@/lib/InjectorManager'
import { lcu, LcuEventUri, type GameflowPhase, type LCUEventMessage } from '@/lib/lcu'
import { logger } from '@/lib/logger'
import {
  evaluateMatchMvpAndScores,
  normalizeEogStatsToGameSummary,
  type LcuEogPlayer,
  type LcuEogStatsBlock,
  type MatchPlayerPerformanceBadge,
} from '@/lib/postgame-intel'
import { store } from '@/lib/store'
import { sleep } from '@/lib/utils'

const STYLE_ID = 'sona-postgame-enhancement-style'
const BADGE_HOST_ATTR = 'data-sona-postgame-badge'
const POSTGAME_SELECTOR = '.rcp-fe-lol-postgame, .scoreboard-row, .postgame-scoreboard-row'

let unsubAll: (() => void) | null = null
let injectRegistered = false
let currentPhase: GameflowPhase = 'None'
let eogBlock: LcuEogStatsBlock | null = null
let perfByKey = new Map<string, MatchPlayerPerformanceBadge>()
let playersFlat: LcuEogPlayer[] = []
let tagModalRoot: Root | null = null
let tagModalHost: HTMLDivElement | null = null
let loadToken = 0

function ensurePostgameStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    [${BADGE_HOST_ATTR}] {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: 6px;
      vertical-align: middle;
      font: 600 10.5px/1.3 "Microsoft YaHei UI", sans-serif;
    }
    .sona-pg-award {
      padding: 0 5px;
      height: 15px;
      line-height: 14px;
      border-radius: 2px;
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: 0.03em;
      box-sizing: border-box;
      white-space: nowrap;
    }
    .sona-pg-award--mvp {
      color: #1c1304;
      background: linear-gradient(135deg, #ffe89e 0%, #dca434 100%);
      border: 1px solid rgba(255, 244, 206, 0.85);
    }
    .sona-pg-award--svp {
      color: #f4ecff;
      background: linear-gradient(135deg, #8b5cf6 0%, #5b34b5 100%);
      border: 1px solid rgba(214, 194, 255, 0.72);
    }
    .sona-pg-score {
      padding: 0 4px;
      height: 15px;
      line-height: 14px;
      border-radius: 2px;
      font-size: 10px;
      color: #cdbe91;
      background: rgba(14, 20, 30, 0.78);
      border: 1px solid rgba(200, 170, 110, 0.34);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .sona-pg-tag-btn {
      padding: 0 5px;
      height: 16px;
      line-height: 14px;
      border-radius: 2px;
      border: 1px solid rgba(200, 170, 110, 0.38);
      background: rgba(16, 23, 34, 0.82);
      color: #e6cfa0;
      font: 600 10px "Microsoft YaHei UI", sans-serif;
      cursor: pointer;
      white-space: nowrap;
    }
    .sona-pg-tag-btn:hover {
      border-color: #c8aa6e;
      background: rgba(200, 170, 110, 0.22);
      color: #fff;
    }
  `
  document.head.appendChild(style)
}

function openPostgameTagEditor(target: PlayerTagTarget) {
  if (!tagModalHost) {
    tagModalHost = document.createElement('div')
    tagModalHost.dataset.sonaOwned = 'true'
    document.body.appendChild(tagModalHost)
    tagModalRoot = createRoot(tagModalHost)
  }
  const close = () => {
    tagModalRoot?.render(createElement(PlayerTagEditorModal, { open: false, target: null, onClose: close }))
  }
  tagModalRoot?.render(createElement(PlayerTagEditorModal, { open: true, target, onClose: close }))
}

function findMatchingPlayerForRow(rowEl: Element, indexFallback: number): LcuEogPlayer | undefined {
  const puuidAttr = rowEl.getAttribute('data-puuid') || rowEl.querySelector('[puuid]')?.getAttribute('puuid') || ''
  if (puuidAttr) {
    const byPuuid = playersFlat.find((p) => p.puuid === puuidAttr)
    if (byPuuid) return byPuuid
  }
  const text = rowEl.textContent || ''
  for (const p of playersFlat) {
    const gName = (p.riotIdGameName || p.summonerName || '').trim()
    if (gName && text.includes(gName)) return p
  }
  return playersFlat[indexFallback]
}

function syncPostgameScoreboardDom(): boolean {
  if (!store.get('postgameEnhancement') || playersFlat.length === 0) return true

  const rows = document.querySelectorAll(
    '.rcp-fe-lol-postgame .scoreboard-row, .rcp-fe-lol-postgame .postgame-scoreboard-row, [data-testid="qa-postgame-scoreboard"] .scoreboard-row',
  )
  if (rows.length === 0) return true

  ensurePostgameStyle()
  const tagEnabled = store.get('playerTagEnabled')
  const tagsMap = store.get('playerTags')

  rows.forEach((row, idx) => {
    const player = findMatchingPlayerForRow(row, idx)
    if (!player || player.botPlayer) return

    const perf = (player.puuid && perfByKey.get(player.puuid))
      || (player.summonerId ? perfByKey.get(`sid:${player.summonerId}`) : undefined)
    if (!perf) return

    const nameAnchor = row.querySelector('.summoner-name, .player-name, .riot-id-name, [data-postgame-name]') ?? row
    const existingTag = player.puuid ? tagsMap[player.puuid] : undefined
    const sig = `${perf.award || ''}:${perf.score}|${tagEnabled ? 1 : 0}:${existingTag?.label || ''}`

    let host = row.querySelector(`[${BADGE_HOST_ATTR}]`) as HTMLElement | null
    if (host && host.getAttribute(BADGE_HOST_ATTR) === sig) return

    if (!host) {
      host = document.createElement('span')
      nameAnchor.appendChild(host)
    }
    host.setAttribute(BADGE_HOST_ATTR, sig)
    host.replaceChildren()

    if (perf.award) {
      const awardEl = document.createElement('span')
      awardEl.className = `sona-pg-award sona-pg-award--${perf.award.toLowerCase()}`
      awardEl.textContent = perf.award
      host.appendChild(awardEl)
    }

    const scoreEl = document.createElement('span')
    scoreEl.className = 'sona-pg-score'
    scoreEl.textContent = `${perf.score.toFixed(1)}分`
    host.appendChild(scoreEl)

    if (tagEnabled && player.puuid && !player.isLocalPlayer) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'sona-pg-tag-btn'
      const displayName = player.riotIdGameName
        ? `${player.riotIdGameName}${player.riotIdTagLine ? `#${player.riotIdTagLine}` : ''}`
        : (player.summonerName || '玩家')
      btn.textContent = existingTag ? existingTag.label : '记本'
      btn.title = existingTag ? `编辑标记：${existingTag.label}` : `标记 ${displayName} 到小本本`
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        e.preventDefault()
        openPostgameTagEditor({
          puuid: player.puuid!,
          name: displayName,
          matchId: String(eogBlock?.gameId || ''),
        })
      })
      host.appendChild(btn)
    }
  })

  return true
}

function cleanupPostgameDom() {
  document.querySelectorAll(`[${BADGE_HOST_ATTR}]`).forEach((el) => el.remove())
}

async function loadPostgameData() {
  const token = ++loadToken
  let block = await lcu.getEogStatsBlock()
  if (!block && token === loadToken) {
    await sleep(450)
    if (token !== loadToken) return
    block = await lcu.getEogStatsBlock()
  }
  if (!block || token !== loadToken) return

  eogBlock = block
  playersFlat = (block.teams ?? []).flatMap((t) => t.players ?? [])
  perfByKey = evaluateMatchMvpAndScores(normalizeEogStatsToGameSummary(block))
  syncPostgameScoreboardDom()
}

function resetPostgameState() {
  loadToken++
  eogBlock = null
  playersFlat = []
  perfByKey = new Map()
  if (injectRegistered) {
    injector.unregister(syncPostgameScoreboardDom)
    injectRegistered = false
  }
  cleanupPostgameDom()
}

function handlePhaseChange(nextPhase: GameflowPhase) {
  if (nextPhase === currentPhase) return
  currentPhase = nextPhase

  if (nextPhase !== 'EndOfGame' && nextPhase !== 'PreEndOfGame') {
    resetPostgameState()
    return
  }

  if (!injectRegistered) {
    injector.register(syncPostgameScoreboardDom, { selector: POSTGAME_SELECTOR })
    injectRegistered = true
  }
  void loadPostgameData()
}

export function refreshPostgameEnhancement() {
  const enabled = store.get('postgameEnhancement')
  updatePostgameEnhancement(enabled)
  if (enabled && (currentPhase === 'EndOfGame' || currentPhase === 'PreEndOfGame')) {
    syncPostgameScoreboardDom()
  }
}

export function updatePostgameEnhancement(enabled: boolean) {
  if (enabled && !unsubAll) {
    const stopPhase = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      handlePhaseChange(event.data as GameflowPhase)
    })
    const stopGameflow = lcu.observe(LcuEventUri.GAMEFLOW_PHASE, (event: LCUEventMessage) => {
      const payload = event.data as { phase?: unknown } | null
      if (typeof payload?.phase === 'string') {
        handlePhaseChange(payload.phase as GameflowPhase)
      }
    })
    const stopTags = store.onChange('playerTags', () => {
      if (playersFlat.length > 0) syncPostgameScoreboardDom()
    })
    const stopTagSwitch = store.onChange('playerTagEnabled', () => {
      if (playersFlat.length > 0) syncPostgameScoreboardDom()
    })

    unsubAll = () => {
      stopPhase()
      stopGameflow()
      stopTags()
      stopTagSwitch()
    }

    void lcu.getGameflowPhase().then((phase) => {
      if (unsubAll) handlePhaseChange(phase)
    }).catch(() => { /* ignore */ })

    logger.info('[PostGame] 赛后结算 MVP/SVP 评分徽章与快捷记本已启用 ✓')
  } else if (!enabled && unsubAll) {
    unsubAll()
    unsubAll = null
    currentPhase = 'None'
    resetPostgameState()
    logger.info('[PostGame] 赛后结算 MVP/SVP 评分徽章与快捷记本已禁用')
  }
}
