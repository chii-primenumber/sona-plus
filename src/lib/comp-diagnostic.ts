import { getChampionById } from '@/lib/assets'
import type { ChampSelectSession } from '@/types/lcu'

export interface ChampionCombatProfile {
  /** 物理伤害占比权重 (0..1) */
  ad: number
  /** 魔法伤害占比权重 (0..1) */
  ap: number
  /** 真实伤害占比权重 (0..1) */
  trueDmg: number
  /** 团队常规伤害贡献系数（C位=1.0, 战士=0.85, 坦克=0.48, 软辅=0.32） */
  outputWeight: number
  /** 前排承伤/坦度评分 (0..1) */
  frontline: number
  /** 稳定硬控/先手开团评分 (0..1) */
  cc: number
  /** 远程清线/守塔评分 (0..1) */
  waveclear: number
  /** 简短定位标签 */
  tag: string
}

export type CompTagSeverity = 'danger' | 'warn' | 'good' | 'info'

export interface CompDiagnosticTag {
  id: string
  label: string
  severity: CompTagSeverity
  detail: string
}

export interface CompMemberBreakdown {
  floor: number
  cellId: number
  championId: number
  championName: string
  isIntent: boolean
  adPct: number
  apPct: number
  truePct: number
  roleTag: string
  isFrontline: boolean
  hasHardCc: boolean
}

export interface TeamCompDiagnostic {
  totalSlots: number
  pickedCount: number
  lockedCount: number
  intentCount: number
  physicalPct: number
  magicPct: number
  truePct: number
  frontlineScore: number
  ccScore: number
  waveclearScore: number
  tags: CompDiagnosticTag[]
  members: CompMemberBreakdown[]
}

export interface CompSlotInput {
  floor: number
  cellId: number
  championId: number
  isIntent: boolean
  roles?: string[]
  championName?: string
}

type ArchetypeKey =
  | 'TANK_AP_CC'
  | 'TANK_AD_CC'
  | 'TANK_WARDEN'
  | 'BRUISER_AD'
  | 'BRUISER_AD_CC'
  | 'BRUISER_TRUE'
  | 'BRUISER_HYBRID'
  | 'BRUISER_AP'
  | 'ASSASSIN_AD'
  | 'ASSASSIN_AP'
  | 'SKIRMISHER_AD'
  | 'MAGE_BURST'
  | 'MAGE_CONTROL'
  | 'MAGE_ARTILLERY'
  | 'MAGE_BATTLE'
  | 'MARKSMAN_AD'
  | 'MARKSMAN_HYBRID'
  | 'ENCHANTER'
  | 'CATCHER_TANK'

const ARCHETYPES: Record<ArchetypeKey, ChampionCombatProfile> = {
  TANK_AP_CC: { ad: 0.16, ap: 0.79, trueDmg: 0.05, outputWeight: 0.48, frontline: 1.0, cc: 1.0, waveclear: 0.45, tag: '法坦开团' },
  TANK_AD_CC: { ad: 0.72, ap: 0.23, trueDmg: 0.05, outputWeight: 0.52, frontline: 1.0, cc: 0.95, waveclear: 0.5, tag: '物坦前排' },
  TANK_WARDEN: { ad: 0.20, ap: 0.75, trueDmg: 0.05, outputWeight: 0.42, frontline: 0.95, cc: 0.85, waveclear: 0.35, tag: '守护前排' },
  BRUISER_AD: { ad: 0.86, ap: 0.08, trueDmg: 0.06, outputWeight: 0.86, frontline: 0.6, cc: 0.35, waveclear: 0.5, tag: '物理战士' },
  BRUISER_AD_CC: { ad: 0.84, ap: 0.11, trueDmg: 0.05, outputWeight: 0.82, frontline: 0.68, cc: 0.85, waveclear: 0.45, tag: '开团战士' },
  BRUISER_TRUE: { ad: 0.68, ap: 0.04, trueDmg: 0.28, outputWeight: 0.9, frontline: 0.62, cc: 0.45, waveclear: 0.45, tag: '真伤重装' },
  BRUISER_HYBRID: { ad: 0.52, ap: 0.42, trueDmg: 0.06, outputWeight: 0.85, frontline: 0.62, cc: 0.55, waveclear: 0.45, tag: '混伤战士' },
  BRUISER_AP: { ad: 0.12, ap: 0.82, trueDmg: 0.06, outputWeight: 0.86, frontline: 0.62, cc: 0.55, waveclear: 0.65, tag: '法系战士' },
  ASSASSIN_AD: { ad: 0.90, ap: 0.04, trueDmg: 0.06, outputWeight: 0.96, frontline: 0.1, cc: 0.1, waveclear: 0.55, tag: '物理刺客' },
  ASSASSIN_AP: { ad: 0.10, ap: 0.85, trueDmg: 0.05, outputWeight: 0.96, frontline: 0.12, cc: 0.12, waveclear: 0.55, tag: '法系刺客' },
  SKIRMISHER_AD: { ad: 0.84, ap: 0.08, trueDmg: 0.08, outputWeight: 1.0, frontline: 0.28, cc: 0.3, waveclear: 0.65, tag: '物理近战C' },
  MAGE_BURST: { ad: 0.06, ap: 0.89, trueDmg: 0.05, outputWeight: 0.98, frontline: 0.1, cc: 0.72, waveclear: 0.85, tag: '爆发法师' },
  MAGE_CONTROL: { ad: 0.05, ap: 0.91, trueDmg: 0.04, outputWeight: 0.98, frontline: 0.12, cc: 0.85, waveclear: 0.95, tag: '控制法师' },
  MAGE_ARTILLERY: { ad: 0.04, ap: 0.92, trueDmg: 0.04, outputWeight: 1.0, frontline: 0.05, cc: 0.45, waveclear: 1.0, tag: '远程消耗AP' },
  MAGE_BATTLE: { ad: 0.06, ap: 0.89, trueDmg: 0.05, outputWeight: 0.98, frontline: 0.35, cc: 0.25, waveclear: 0.88, tag: '持续法核' },
  MARKSMAN_AD: { ad: 0.90, ap: 0.06, trueDmg: 0.04, outputWeight: 1.0, frontline: 0.05, cc: 0.15, waveclear: 0.8, tag: '物理射手' },
  MARKSMAN_HYBRID: { ad: 0.56, ap: 0.39, trueDmg: 0.05, outputWeight: 1.0, frontline: 0.05, cc: 0.1, waveclear: 0.78, tag: '混伤射手' },
  ENCHANTER: { ad: 0.12, ap: 0.84, trueDmg: 0.04, outputWeight: 0.32, frontline: 0.05, cc: 0.35, waveclear: 0.35, tag: '软辅增益' },
  CATCHER_TANK: { ad: 0.18, ap: 0.74, trueDmg: 0.08, outputWeight: 0.38, frontline: 0.72, cc: 1.0, waveclear: 0.2, tag: '硬辅开团' },
}

const CHAMPION_ARCHETYPE_GROUPS: Array<[ArchetypeKey, number[]]> = [
  ['TANK_AP_CC', [3, 20, 32, 33, 54, 57, 79, 89, 111, 113, 154, 516, 526]],
  ['TANK_AD_CC', [14, 72, 78]],
  ['TANK_WARDEN', [12, 44, 98, 201, 223]],
  ['CATCHER_TANK', [53, 412, 497]],
  ['BRUISER_AD', [6, 48, 56, 75, 83, 104, 141, 233, 234, 240, 266, 420, 799, 904]],
  ['BRUISER_AD_CC', [5, 58, 59, 62, 64, 80, 92, 120, 150, 254, 421]],
  ['BRUISER_TRUE', [2, 86, 114, 122, 164, 200, 875, 897]],
  ['BRUISER_HYBRID', [19, 24, 39, 77, 102, 106]],
  ['BRUISER_AP', [27, 50, 68, 82, 131, 517]],
  ['ASSASSIN_AD', [91, 107, 121, 238, 246, 805, 950]],
  ['ASSASSIN_AP', [7, 28, 38, 55, 60, 76, 84, 105, 245]],
  ['SKIRMISHER_AD', [11, 23, 35, 41, 126, 157, 777, 895]],
  ['MAGE_BURST', [1, 45, 63, 85, 99, 103, 127, 134, 142, 518, 711, 893]],
  ['MAGE_CONTROL', [4, 9, 25, 34, 61, 74, 90, 112, 143, 163, 268]],
  ['MAGE_ARTILLERY', [101, 115, 161, 800, 910]],
  ['MAGE_BATTLE', [8, 13, 17, 30, 69, 136]],
  ['MARKSMAN_AD', [15, 18, 21, 22, 51, 119, 133, 166, 202, 203, 222, 235, 236, 360, 429, 498, 523, 804]],
  ['MARKSMAN_HYBRID', [10, 29, 42, 81, 96, 110, 145, 221, 901]],
  ['ENCHANTER', [16, 26, 37, 40, 43, 117, 147, 267, 350, 427, 432, 888, 902]],
]

const CHAMPION_OVERRIDES: Record<number, Partial<ChampionCombatProfile>> = {
  // 特殊真伤/机制与控制强度微调
  7: { cc: 0.5 }, // 乐芙兰
  8: { cc: 0.05 }, // 弗拉基米尔
  11: { ad: 0.66, ap: 0.02, trueDmg: 0.32, frontline: 0.15, cc: 0, tag: '真伤收割' }, // 易
  13: { cc: 0.65 }, // 瑞兹
  16: { cc: 0.2 }, // 索拉卡
  17: { cc: 0.1 }, // 提莫
  22: { cc: 0.85, tag: '功能射手' }, // 艾希
  29: { ad: 0.70, ap: 0.12, trueDmg: 0.18, tag: '混伤射手' }, // 图奇
  30: { cc: 0.1 }, // 卡尔萨斯
  31: { ...ARCHETYPES.TANK_AP_CC, ad: 0.14, ap: 0.56, trueDmg: 0.30, cc: 0.8, tag: '真伤巨坦' }, // 科加斯
  35: { ad: 0.52, ap: 0.44, trueDmg: 0.04, frontline: 0.08, cc: 0.35, tag: '诡术刺客' }, // 萨科
  36: { ad: 0.44, ap: 0.52, trueDmg: 0.04, outputWeight: 0.65, frontline: 1.0, cc: 0.1, waveclear: 0.45, tag: '重装坦克' }, // 蒙多
  37: { cc: 0.65 }, // 娑娜
  40: { cc: 0.7 }, // 迦娜
  41: { ad: 0.72, ap: 0.08, trueDmg: 0.20, frontline: 0.25, cc: 0.15, waveclear: 1.0, tag: '爆发混真伤' }, // 普朗克
  42: { ad: 0.60, ap: 0.22, trueDmg: 0.18, waveclear: 0.85, tag: '真伤射手' }, // 库奇
  60: { cc: 0.7 }, // 伊莉丝
  67: { ...ARCHETYPES.MARKSMAN_AD, ad: 0.64, ap: 0.02, trueDmg: 0.34, waveclear: 0.35, tag: '真伤猎手' }, // 薇恩
  69: { cc: 0.7 }, // 卡西奥佩娅
  103: { ad: 0.06, ap: 0.74, trueDmg: 0.20, cc: 0.75, waveclear: 0.9, tag: '机动法师' }, // 阿狸
  105: { cc: 0.55 }, // 菲兹
  110: { cc: 0.75, waveclear: 0.85 }, // 韦鲁斯
  114: { frontline: 0.38, cc: 0.2, tag: '真伤单带' }, // 菲奥娜
  117: { cc: 0.65 }, // 璐璐
  126: { ad: 0.85, ap: 0.12, trueDmg: 0.03, frontline: 0.25, cc: 0.2, waveclear: 0.85, tag: '物理消耗' }, // 杰斯
  136: { cc: 0.65 }, // 奥瑞利安索尔
  147: { outputWeight: 0.58, cc: 0.88, waveclear: 0.88, tag: '团控软辅/法核' }, // 萨勒芬妮
  157: { cc: 0.6, waveclear: 0.8 }, // 亚索
  161: { ad: 0.03, ap: 0.65, trueDmg: 0.32, cc: 0.55, waveclear: 0.95, tag: '真伤炮台' }, // 维克兹
  235: { outputWeight: 0.72, cc: 0.55 }, // 赛娜
  245: { cc: 0.45 }, // 艾克
  246: { cc: 0.85 }, // 奇亚娜
  267: { cc: 0.8 }, // 娜美
  350: { cc: 0.2 }, // 悠米
  427: { cc: 0.7 }, // 艾翁
  432: { cc: 0.8 }, // 巴德
  497: { frontline: 0.52, cc: 1.0 }, // 洛
  555: { ad: 0.68, ap: 0.02, trueDmg: 0.30, outputWeight: 0.68, frontline: 0.2, cc: 0.9, waveclear: 0.25, tag: '斩杀游走' }, // 派克
  777: { ad: 0.62, ap: 0.25, trueDmg: 0.13, cc: 0.8, waveclear: 0.8, tag: '混伤近战C' }, // 永恩
  876: { ad: 0.04, ap: 0.70, trueDmg: 0.26, outputWeight: 0.88, frontline: 0.42, cc: 0.8, waveclear: 0.8, tag: '真伤法战' }, // 莉莉娅
  887: { ad: 0.08, ap: 0.62, trueDmg: 0.30, outputWeight: 0.92, frontline: 0.52, cc: 0.1, waveclear: 0.65, tag: '真伤法战' }, // 格温
  888: { cc: 0.8 }, // 烈娜塔
  897: { ad: 0.65, ap: 0.10, trueDmg: 0.25, outputWeight: 0.65, frontline: 1.0, cc: 0.9, waveclear: 0.55, tag: '全能坦克' }, // 奎桑提
  901: { ad: 0.58, ap: 0.24, trueDmg: 0.18, waveclear: 0.9, tag: '成长龙C' }, // 斯莫德
}

const PROFILE_MAP: Map<number, ChampionCombatProfile> = (() => {
  const map = new Map<number, ChampionCombatProfile>()
  for (const [archetype, ids] of CHAMPION_ARCHETYPE_GROUPS) {
    const base = ARCHETYPES[archetype]
    for (const id of ids) {
      map.set(id, base)
    }
  }
  for (const [idStr, override] of Object.entries(CHAMPION_OVERRIDES)) {
    const id = Number(idStr)
    const base = map.get(id) ?? ARCHETYPES.BRUISER_AD
    map.set(id, { ...base, ...override })
  }
  return map
})()

export function getChampionCombatProfile(championId: number, fallbackRoles?: string[]): ChampionCombatProfile {
  const known = PROFILE_MAP.get(championId)
  if (known) return known

  const roles = (fallbackRoles ?? getChampionById(championId)?.roles ?? []).map((r) => r.toLowerCase())
  if (roles.includes('tank')) {
    return roles.includes('fighter') ? ARCHETYPES.TANK_AD_CC : ARCHETYPES.TANK_AP_CC
  }
  if (roles.includes('marksman')) {
    return roles.includes('mage') ? ARCHETYPES.MARKSMAN_HYBRID : ARCHETYPES.MARKSMAN_AD
  }
  if (roles.includes('support') && !roles.includes('mage') && !roles.includes('assassin')) {
    return ARCHETYPES.ENCHANTER
  }
  if (roles.includes('mage')) {
    return roles.includes('assassin') ? ARCHETYPES.ASSASSIN_AP : ARCHETYPES.MAGE_BURST
  }
  if (roles.includes('assassin')) {
    return ARCHETYPES.ASSASSIN_AD
  }
  if (roles.includes('fighter')) {
    return ARCHETYPES.BRUISER_AD
  }
  return { ad: 0.50, ap: 0.42, trueDmg: 0.08, outputWeight: 0.8, frontline: 0.4, cc: 0.5, waveclear: 0.5, tag: '均衡英雄' }
}

function normalizeTriplet(ad: number, ap: number, trueDmg: number): [number, number, number] {
  const sum = ad + ap + trueDmg
  if (sum <= 0) return [34, 33, 33]
  const rawAd = (ad / sum) * 100
  const rawAp = (ap / sum) * 100
  const pAd = Math.round(rawAd)
  const pAp = Math.round(rawAp)
  const pTrue = Math.max(0, 100 - pAd - pAp)
  return [pAd, pAp, pTrue]
}

export function isArenaQueue(queueId: number, myTeamLength = 0): boolean {
  return queueId === 1700 || queueId === 1710 || myTeamLength > 5
}

export function extractChampSelectSlots(session: ChampSelectSession): CompSlotInput[] {
  const rawTeam = Array.isArray(session.myTeam) ? session.myTeam : []
  if (isArenaQueue(session.queueId, rawTeam.length)) return []

  const picks = (session.actions || []).flat(2).filter((action) => action && action.type === 'pick')

  return rawTeam.slice(0, 5).map((player, index) => {
    const playerPicks = picks.filter((action) => action.actorCellId === player.cellId)
    const activePick = playerPicks.find((action) => !action.completed && action.championId > 0)
    const hasCompletedPick = playerPicks.length === 0 || playerPicks.some((action) => action.completed)

    let championId = 0
    let isIntent = false

    if (player.championId > 0 && hasCompletedPick) {
      championId = player.championId
      isIntent = false
    } else if (player.championId > 0) {
      championId = player.championId
      isIntent = true
    } else if (activePick && activePick.championId > 0) {
      championId = activePick.championId
      isIntent = true
    } else if (player.championPickIntent > 0) {
      championId = player.championPickIntent
      isIntent = true
    }

    const info = championId > 0 ? getChampionById(championId) : undefined
    return {
      floor: index + 1,
      cellId: player.cellId,
      championId,
      isIntent,
      roles: info?.roles,
      championName: info?.name || info?.title || (championId > 0 ? `英雄#${championId}` : ''),
    }
  })
}

export function analyzeTeamComposition(slots: CompSlotInput[]): TeamCompDiagnostic {
  const picked = slots.filter((slot) => slot.championId > 0)
  const lockedCount = picked.filter((slot) => !slot.isIntent).length
  const intentCount = picked.filter((slot) => slot.isIntent).length

  if (picked.length === 0) {
    return {
      totalSlots: slots.length,
      pickedCount: 0,
      lockedCount: 0,
      intentCount: 0,
      physicalPct: 0,
      magicPct: 0,
      truePct: 0,
      frontlineScore: 0,
      ccScore: 0,
      waveclearScore: 0,
      tags: [{
        id: 'waiting',
        label: '等待选人',
        severity: 'info',
        detail: '队友预选或锁定英雄后，将实时计算团队伤害结构与阵容短板',
      }],
      members: [],
    }
  }

  let totalAd = 0
  let totalAp = 0
  let totalTrue = 0
  let frontlineScore = 0
  let ccScore = 0
  let waveclearScore = 0

  const members: CompMemberBreakdown[] = picked.map((slot) => {
    const profile = getChampionCombatProfile(slot.championId, slot.roles)
    const w = profile.outputWeight
    totalAd += profile.ad * w
    totalAp += profile.ap * w
    totalTrue += profile.trueDmg * w
    frontlineScore += profile.frontline
    ccScore += profile.cc
    waveclearScore += profile.waveclear

    const [adPct, apPct, truePct] = normalizeTriplet(profile.ad, profile.ap, profile.trueDmg)
    const champInfo = getChampionById(slot.championId)
    return {
      floor: slot.floor,
      cellId: slot.cellId,
      championId: slot.championId,
      championName: slot.championName || champInfo?.name || champInfo?.title || `英雄#${slot.championId}`,
      isIntent: slot.isIntent,
      adPct,
      apPct,
      truePct,
      roleTag: profile.tag,
      isFrontline: profile.frontline >= 0.55,
      hasHardCc: profile.cc >= 0.7,
    }
  })

  const [physicalPct, magicPct, truePct] = normalizeTriplet(totalAd, totalAp, totalTrue)
  const tags: CompDiagnosticTag[] = []

  if (picked.length < 3) {
    tags.push({
      id: 'picking',
      label: `选人中 ${picked.length}/${Math.max(slots.length, 5)}`,
      severity: 'info',
      detail: '已根据当前亮出/锁定英雄预估伤害占比，满 3 人后开启阵容短板预警',
    })
  } else {
    if (physicalPct >= 75 && magicPct <= 19) {
      tags.push({
        id: 'all-ad',
        label: '菜刀队预警',
        severity: 'danger',
        detail: `物理伤害预计高达 ${physicalPct}%（魔法仅 ${magicPct}%），敌方叠护甲（铁板靴/兰顿/反甲）收益极高，建议补 AP 或真伤英雄`,
      })
    } else if (magicPct >= 75 && physicalPct <= 19) {
      tags.push({
        id: 'all-ap',
        label: '纯 AP 预警',
        severity: 'danger',
        detail: `魔法伤害预计高达 ${magicPct}%（物理仅 ${physicalPct}%），敌方出魔抗（水银鞋/自然之力/败魔）极易针对，建议补射手或物理战士`,
      })
    } else if (truePct >= 18) {
      tags.push({
        id: 'high-true',
        label: '高真伤破坦',
        severity: 'good',
        detail: `真实伤害占比约 ${truePct}%，中后期处理敌方坦克前排能力优秀`,
      })
    }

    if (picked.length >= 4) {
      if (frontlineScore < 0.75) {
        tags.push({
          id: 'no-frontline',
          label: '缺乏前排',
          severity: 'warn',
          detail: '队伍缺少坦克或重装战士承伤探视野，中期团战阵型容错率偏低',
        })
      } else if (frontlineScore >= 1.55) {
        tags.push({
          id: 'solid-frontline',
          label: '前排扎实',
          severity: 'good',
          detail: '拥有充足的前排坦度与团战拉扯空间',
        })
      }

      if (ccScore < 1.15) {
        tags.push({
          id: 'low-cc',
          label: '缺乏硬控',
          severity: 'warn',
          detail: '稳定先手开团或硬控留人手段偏少，面对高机动刺客/冲阵阵容较难限制',
        })
      }

      if (waveclearScore < 1.25) {
        tags.push({
          id: 'low-waveclear',
          label: '清线偏弱',
          severity: 'warn',
          detail: '远程清兵守塔能力偏弱，逆风局较难防守敌方推进与大龙逼团',
        })
      }

      const hasProblem = tags.some((tag) => tag.severity === 'danger' || tag.severity === 'warn')
      if (!hasProblem) {
        tags.unshift({
          id: 'balanced',
          label: '阵容均衡',
          severity: 'good',
          detail: '物理/魔法混合输出健康，兼具前排承伤、硬控留人与清线能力',
        })
      }
    }
  }

  return {
    totalSlots: slots.length,
    pickedCount: picked.length,
    lockedCount,
    intentCount,
    physicalPct,
    magicPct,
    truePct,
    frontlineScore: Math.round(frontlineScore * 100) / 100,
    ccScore: Math.round(ccScore * 100) / 100,
    waveclearScore: Math.round(waveclearScore * 100) / 100,
    tags,
    members,
  }
}

export function analyzeChampSelectSession(session: ChampSelectSession | null | undefined): TeamCompDiagnostic | null {
  if (!session || !Array.isArray(session.myTeam) || session.myTeam.length === 0) return null
  const slots = extractChampSelectSlots(session)
  if (slots.length === 0) return null
  return analyzeTeamComposition(slots)
}
