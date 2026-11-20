import type { SgpGameSummaryLol } from '@/types/sgp'

export type TimelineMilestoneKind =
  | 'first-blood'
  | 'first-tower'
  | 'grubs'
  | 'herald'
  | 'dragon'
  | 'atakhan'
  | 'baron'

export interface TimelineGoldPoint {
  minute: number
  timestampMs: number
  blueGold: number
  redGold: number
  /** blueGold - redGold，正值蓝色方领先，负值红色方领先 */
  diff: number
}

export interface TimelineMilestone {
  id: string
  kind: TimelineMilestoneKind
  teamId: 100 | 200
  timestampMs: number
  minute: number
  label: string
  shortLabel: string
  detail?: string
}

export interface ParsedMatchTimeline {
  points: TimelineGoldPoint[]
  milestones: TimelineMilestone[]
  maxAbsDiff: number
  maxBlueLead: { diff: number; minute: number } | null
  maxRedLead: { diff: number; minute: number } | null
  finalDiff: number
  winningTeamId: 100 | 200 | null
  comeback: { teamId: 100 | 200; maxDeficit: number; atMinute: number } | null
}

interface RawParticipantFrame {
  participantId?: number
  totalGold?: number
}

interface RawTimelineEvent {
  type?: string
  timestamp?: number
  killerId?: number
  killerTeamId?: number
  teamId?: number
  monsterType?: string
  monsterSubType?: string
  buildingType?: string
  laneType?: string
}

interface RawTimelineFrame {
  timestamp?: number
  participantFrames?: Record<string, RawParticipantFrame> | RawParticipantFrame[]
  events?: RawTimelineEvent[]
}

interface RawTimelinePayload {
  frames?: RawTimelineFrame[]
  info?: { frames?: RawTimelineFrame[] }
}

const DRAGON_SUBTYPE_LABELS: Record<string, [string, string]> = {
  FIRE_DRAGON: ['炼狱亚龙', '火龙'],
  WATER_DRAGON: ['海洋亚龙', '水龙'],
  AIR_DRAGON: ['云端亚龙', '风龙'],
  EARTH_DRAGON: ['山脉亚龙', '土龙'],
  HEXTECH_DRAGON: ['海克斯科技亚龙', '海龙'],
  CHEMTECH_DRAGON: ['炼金科技亚龙', '炼金龙'],
  ELDER_DRAGON: ['远古巨龙', '远古龙'],
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function buildParticipantTeamMap(game?: SgpGameSummaryLol): Map<number, 100 | 200> {
  const map = new Map<number, 100 | 200>()
  const participants = game?.json?.participants ?? []
  participants.forEach((participant, index) => {
    const pid = finiteNumber(participant.participantId) ?? (index + 1)
    if (participant.teamId === 100 || participant.teamId === 200) {
      map.set(pid, participant.teamId)
    }
  })
  return map
}

function resolveParticipantTeam(participantId: number, teamMap: Map<number, 100 | 200>): 100 | 200 | null {
  const mapped = teamMap.get(participantId)
  if (mapped) return mapped
  if (participantId >= 1 && participantId <= 5) return 100
  if (participantId >= 6 && participantId <= 10) return 200
  return null
}

function resolveEventTeam(event: RawTimelineEvent, teamMap: Map<number, 100 | 200>, invertTeamId = false): 100 | 200 | null {
  if (event.killerTeamId === 100 || event.killerTeamId === 200) return event.killerTeamId
  if (typeof event.killerId === 'number' && event.killerId > 0) {
    const team = resolveParticipantTeam(event.killerId, teamMap)
    if (team) return team
  }
  if (event.teamId === 100 || event.teamId === 200) {
    return invertTeamId ? (event.teamId === 100 ? 200 : 100) : event.teamId
  }
  return null
}

function resolveWinningTeam(game?: SgpGameSummaryLol): 100 | 200 | null {
  const teams = game?.json?.teams ?? []
  const winner = teams.find((team) => team.win === true && (team.teamId === 100 || team.teamId === 200))
  if (winner?.teamId === 100 || winner?.teamId === 200) return winner.teamId
  const winningParticipant = game?.json?.participants?.find((p) => p.win === true && (p.teamId === 100 || p.teamId === 200))
  return winningParticipant?.teamId === 100 || winningParticipant?.teamId === 200 ? winningParticipant.teamId : null
}

export function formatTimelineClock(timestampMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(timestampMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatGoldDiff(diff: number): string {
  const abs = Math.abs(diff)
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : ''
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}k`
  return `${sign}${Math.round(abs)}`
}

export function parseMatchTimeline(raw: unknown, game?: SgpGameSummaryLol): ParsedMatchTimeline | null {
  if (game?.json?.gameMode === 'CHERRY') return null
  if (!raw || typeof raw !== 'object') return null

  const payload = raw as RawTimelinePayload
  const frames = Array.isArray(payload.frames)
    ? payload.frames
    : Array.isArray(payload.info?.frames)
      ? payload.info.frames
      : null
  if (!frames || frames.length < 2) return null

  const teamMap = buildParticipantTeamMap(game)
  const points: TimelineGoldPoint[] = []
  const milestones: TimelineMilestone[] = []

  let hasFirstBlood = false
  let hasFirstTower = false
  let grubCluster: { teamId: 100 | 200; timestampMs: number; count: number; index: number } | null = null

  frames.forEach((frame, frameIndex) => {
    const timestampMs = finiteNumber(frame.timestamp) ?? frameIndex * 60_000
    const minute = Math.round(timestampMs / 60_000)
    const rawFrames = frame.participantFrames
    const entries: RawParticipantFrame[] = Array.isArray(rawFrames)
      ? rawFrames
      : rawFrames && typeof rawFrames === 'object'
        ? Object.values(rawFrames)
        : []

    let blueGold = 0
    let redGold = 0
    let seenBlue = false
    let seenRed = false

    for (const pf of entries) {
      const pid = finiteNumber(pf?.participantId)
      const gold = finiteNumber(pf?.totalGold)
      if (pid == null || gold == null) continue
      const teamId = resolveParticipantTeam(pid, teamMap)
      if (teamId === 100) {
        blueGold += gold
        seenBlue = true
      } else if (teamId === 200) {
        redGold += gold
        seenRed = true
      }
    }

    if (seenBlue && seenRed) {
      points.push({
        minute,
        timestampMs,
        blueGold,
        redGold,
        diff: blueGold - redGold,
      })
    }

    const events = Array.isArray(frame.events) ? frame.events : []
    for (const event of events) {
      const eventTs = finiteNumber(event?.timestamp) ?? timestampMs
      const eventMinute = Math.round(eventTs / 60_000)

      if (event.type === 'CHAMPION_KILL' && !hasFirstBlood) {
        const teamId = resolveEventTeam(event, teamMap)
        if (teamId) {
          hasFirstBlood = true
          milestones.push({
            id: `fb-${eventTs}`,
            kind: 'first-blood',
            teamId,
            timestampMs: eventTs,
            minute: eventMinute,
            label: '第一滴血',
            shortLabel: '一血',
          })
        }
        continue
      }

      if (event.type === 'BUILDING_KILL' && event.buildingType === 'TOWER_BUILDING' && !hasFirstTower) {
        // BUILDING_KILL 的 teamId 是被摧毁防御塔所属方，因此摧毁方为其反方
        const teamId = resolveEventTeam(event, teamMap, true)
        if (teamId) {
          hasFirstTower = true
          milestones.push({
            id: `ft-${eventTs}`,
            kind: 'first-tower',
            teamId,
            timestampMs: eventTs,
            minute: eventMinute,
            label: '一血防御塔',
            shortLabel: '一血塔',
          })
        }
        continue
      }

      if (event.type === 'ELITE_MONSTER_KILL') {
        const teamId = resolveEventTeam(event, teamMap)
        if (!teamId) continue
        const monster = String(event.monsterType || '').toUpperCase()
        const subType = String(event.monsterSubType || '').toUpperCase()

        if (monster === 'HORDE') {
          if (grubCluster && grubCluster.teamId === teamId && Math.abs(eventTs - grubCluster.timestampMs) <= 35_000) {
            grubCluster.count += 1
            const target = milestones[grubCluster.index]
            if (target) {
              target.shortLabel = `巢虫×${grubCluster.count}`
              target.label = `虚空巢虫 ×${grubCluster.count}`
            }
          } else {
            const index = milestones.length
            milestones.push({
              id: `grubs-${eventTs}-${index}`,
              kind: 'grubs',
              teamId,
              timestampMs: eventTs,
              minute: eventMinute,
              label: '虚空巢虫',
              shortLabel: '巢虫',
            })
            grubCluster = { teamId, timestampMs: eventTs, count: 1, index }
          }
        } else if (monster === 'RIFTHERALD') {
          milestones.push({
            id: `herald-${eventTs}-${milestones.length}`,
            kind: 'herald',
            teamId,
            timestampMs: eventTs,
            minute: eventMinute,
            label: '峡谷先锋',
            shortLabel: '先锋',
          })
        } else if (monster === 'DRAGON') {
          const [full, short] = DRAGON_SUBTYPE_LABELS[subType] ?? ['元素亚龙', '小龙']
          milestones.push({
            id: `dragon-${eventTs}-${milestones.length}`,
            kind: 'dragon',
            teamId,
            timestampMs: eventTs,
            minute: eventMinute,
            label: full,
            shortLabel: short,
          })
        } else if (monster === 'ATAKHAN') {
          milestones.push({
            id: `atakhan-${eventTs}-${milestones.length}`,
            kind: 'atakhan',
            teamId,
            timestampMs: eventTs,
            minute: eventMinute,
            label: '厄塔汗',
            shortLabel: '厄塔汗',
          })
        } else if (monster === 'BARON_NASHOR') {
          milestones.push({
            id: `baron-${eventTs}-${milestones.length}`,
            kind: 'baron',
            teamId,
            timestampMs: eventTs,
            minute: eventMinute,
            label: '纳什男爵',
            shortLabel: '大龙',
          })
        }
      }
    }
  })

  if (points.length < 2) return null

  let maxAbsDiff = 0
  let maxBlueLead: { diff: number; minute: number } | null = null
  let maxRedLead: { diff: number; minute: number } | null = null

  for (const point of points) {
    const abs = Math.abs(point.diff)
    if (abs > maxAbsDiff) maxAbsDiff = abs
    if (point.diff > 0 && (!maxBlueLead || point.diff > maxBlueLead.diff)) {
      maxBlueLead = { diff: point.diff, minute: point.minute }
    }
    if (point.diff < 0 && (!maxRedLead || Math.abs(point.diff) > maxRedLead.diff)) {
      maxRedLead = { diff: Math.abs(point.diff), minute: point.minute }
    }
  }

  const winningTeamId = resolveWinningTeam(game)
  let comeback: ParsedMatchTimeline['comeback'] = null
  if (winningTeamId === 100 && maxRedLead && maxRedLead.diff >= 2500) {
    comeback = { teamId: 100, maxDeficit: maxRedLead.diff, atMinute: maxRedLead.minute }
  } else if (winningTeamId === 200 && maxBlueLead && maxBlueLead.diff >= 2500) {
    comeback = { teamId: 200, maxDeficit: maxBlueLead.diff, atMinute: maxBlueLead.minute }
  }

  milestones.sort((a, b) => a.timestampMs - b.timestampMs)

  return {
    points,
    milestones,
    maxAbsDiff: Math.max(maxAbsDiff, 1000),
    maxBlueLead,
    maxRedLead,
    finalDiff: points[points.length - 1].diff,
    winningTeamId,
    comeback,
  }
}
