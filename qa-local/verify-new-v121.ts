import assert from 'node:assert/strict'
import { findHighlightRange, getPinyinInitials, matchesSmartSearch } from '../src/lib/pinyin-search.ts'
import { formatGoldDiff, formatTimelineClock, parseMatchTimeline } from '../src/lib/match-timeline.ts'
import { selectOpggSkillRecommendations } from '../src/lib/opgg-api.ts'
import { buildItemSetBlocks, type ItemSetBuildSource } from '../src/lib/item-set-builder.ts'
import type { SgpGameSummaryLol } from '../src/types/sgp.ts'

// 1. Pinyin & smart search
assert.equal(getPinyinInitials('炼狱导管'), 'lydg')
assert.equal(getPinyinInitials('以战养战'), 'yzyz')
assert.equal(getPinyinInitials('疾风剑豪 亚索'), 'jfjhys')
assert.equal(matchesSmartSearch('lydg', ['炼狱导管', '灼烧目标']), true)
assert.equal(matchesSmartSearch('炼狱', ['炼狱导管']), true)
assert.equal(matchesSmartSearch('ys', ['亚索', '疾风剑豪', 'Yasuo']), true)
assert.equal(matchesSmartSearch('yz', ['以战养战']), true)
assert.equal(matchesSmartSearch('ly 灼烧', ['炼狱导管', '技能会灼烧目标']), true)
assert.equal(matchesSmartSearch('xyz', ['炼狱导管']), false)
assert.deepEqual(findHighlightRange('炼狱导管', 'ly'), [0, 2])
assert.deepEqual(findHighlightRange('炼狱导管', '导管'), [2, 4])

// 2. Match timeline gold curve, comeback & milestones
const sampleGame = {
  json: {
    gameId: 9001,
    gameMode: 'CLASSIC',
    teams: [
      { teamId: 100, win: true },
      { teamId: 200, win: false },
    ],
    participants: Array.from({ length: 10 }, (_, idx) => ({
      participantId: idx + 1,
      teamId: idx < 5 ? 100 : 200,
      win: idx < 5,
    })),
  },
} as unknown as SgpGameSummaryLol

const makeFrame = (minute: number, bluePerPlayer: number, redPerPlayer: number, events: unknown[] = []) => ({
  timestamp: minute * 60_000,
  participantFrames: Object.fromEntries(
    Array.from({ length: 10 }, (_, idx) => [
      String(idx + 1),
      { participantId: idx + 1, totalGold: idx < 5 ? bluePerPlayer : redPerPlayer },
    ]),
  ),
  events,
})

const parsed = parseMatchTimeline({
  frames: [
    makeFrame(0, 500, 500),
    makeFrame(3, 1200, 1400, [
      { type: 'CHAMPION_KILL', timestamp: 192_000, killerId: 7 },
    ]),
    makeFrame(6, 2000, 2700, [
      { type: 'ELITE_MONSTER_KILL', timestamp: 365_000, killerId: 2, monsterType: 'HORDE' },
      { type: 'ELITE_MONSTER_KILL', timestamp: 372_000, killerId: 2, monsterType: 'HORDE' },
      { type: 'ELITE_MONSTER_KILL', timestamp: 378_000, killerId: 2, monsterType: 'HORDE' },
    ]),
    makeFrame(12, 4000, 4800, [
      { type: 'BUILDING_KILL', timestamp: 710_000, buildingType: 'TOWER_BUILDING', teamId: 100, killerId: 8 },
      { type: 'ELITE_MONSTER_KILL', timestamp: 725_000, killerId: 7, monsterType: 'DRAGON', monsterSubType: 'FIRE_DRAGON' },
    ]),
    makeFrame(20, 8200, 8100, [
      { type: 'ELITE_MONSTER_KILL', timestamp: 1_210_000, killerId: 1, monsterType: 'ATAKHAN' },
    ]),
    makeFrame(26, 12500, 11400, [
      { type: 'ELITE_MONSTER_KILL', timestamp: 1_550_000, killerId: 3, monsterType: 'BARON_NASHOR' },
    ]),
  ],
}, sampleGame)

assert.ok(parsed, 'parsed timeline should not be null')
assert.equal(parsed.points.length, 6)
assert.equal(parsed.points[3].diff, -4000)
assert.equal(parsed.finalDiff, 5500)
assert.deepEqual(parsed.maxRedLead, { diff: 4000, minute: 12 })
assert.deepEqual(parsed.maxBlueLead, { diff: 5500, minute: 26 })
assert.deepEqual(parsed.comeback, { teamId: 100, maxDeficit: 4000, atMinute: 12 })
assert.equal(parsed.milestones.length, 6)
assert.equal(parsed.milestones[0].shortLabel, '一血')
assert.equal(parsed.milestones[0].teamId, 200)
assert.equal(parsed.milestones[1].shortLabel, '巢虫×3')
assert.equal(parsed.milestones[1].teamId, 100)
assert.equal(parsed.milestones[2].shortLabel, '一血塔')
assert.equal(parsed.milestones[2].teamId, 200)
assert.equal(parsed.milestones[3].shortLabel, '火龙')
assert.equal(parsed.milestones[4].shortLabel, '厄塔汗')
assert.equal(parsed.milestones[5].shortLabel, '大龙')
assert.equal(formatTimelineClock(192_000), '03:12')
assert.equal(formatGoldDiff(-3450), '-3.5k')
assert.equal(formatGoldDiff(850), '+850')

// CHERRY / malformed gracefully return null
assert.equal(parseMatchTimeline({ frames: [makeFrame(0, 500, 500), makeFrame(1, 600, 600)] }, { json: { gameMode: 'CHERRY', participants: [] } } as unknown as SgpGameSummaryLol), null)
assert.equal(parseMatchTimeline({ frames: [] }, sampleGame), null)

// 3. OP.GG skill priority & order consistency + Arena averagePlace merge + Udyr 4-key normalization
const skillsArena = selectOpggSkillRecommendations({
  skill_masteries: [
    {
      ids: ['q', 'w', 'e'],
      play: 400,
      win: 230,
      pick_rate: 0.65,
      builds: [
        { order: ['q', 'w', 'e', 'q', 'q', 'r'], play: 300, win: 180, pick_rate: 0.5 },
      ],
    },
  ],
  skills: [
    { order: ['Q', 'W', 'E', 'Q', 'Q', 'R'], play: 300, win: 180, total_place: 870, pick_rate: 0.5 },
  ],
})
assert.deepEqual(skillsArena?.priority?.keys, ['Q', 'W', 'E'])
assert.deepEqual(skillsArena?.order?.keys, ['Q', 'W', 'E', 'Q', 'Q', 'R'])
assert.equal(skillsArena?.order?.averagePlace, 2.9)

const skillsUdyr = selectOpggSkillRecommendations({
  skill_masteries: [
    {
      ids: ['q', 'e', 'w', 'r'],
      play: 120,
      win: 65,
      pick_rate: 0.4,
      builds: [{ order: ['Q', 'R', 'W', 'E'], play: 90, win: 50, pick_rate: 0.3 }],
    },
  ],
})
assert.deepEqual(skillsUdyr?.priority?.keys, ['Q', 'E', 'W', 'R'])

// 4. buildItemSetBlocks promotes preferred core build & deduplicates
const mockRec: ItemSetBuildSource = {
  starterItems: [{ ids: [1055, 2003], play: 100, win: 55, pick_rate: 0.8 }],
  boots: [{ ids: [3006], play: 100, win: 55, pick_rate: 0.8 }],
  prismItems: [],
  coreItems: [
    { ids: [3070, 3078, 3004, 6694], play: 200, win: 104, pick_rate: 0.4 },
    { ids: [3078, 3004, 3036], play: 150, win: 84, pick_rate: 0.3 },
  ],
  lastItems: [{ ids: [3026], play: 100, win: 58, pick_rate: 0.2 }],
}
const blocks = buildItemSetBlocks(mockRec, mockRec.coreItems[0])
const coreBlocks = blocks.filter((b) => b.type.includes('核心装'))
assert.equal(coreBlocks.length, 2)
assert.match(coreBlocks[0].type, /精选核心装/)
assert.deepEqual(coreBlocks[0].items.map((item) => item.id), ['3070', '3078', '3004', '6694'])
assert.deepEqual(coreBlocks[1].items.map((item) => item.id), ['3078', '3004', '3036'])

console.log(JSON.stringify({
  result: 'passed',
  checks: [
    'pinyin initials and smart highlight',
    'match timeline gold diff curve, comeback and objective milestones',
    'opgg skill priority/order binding and arena averagePlace merge',
    '4-item core builds and preferred core item set promotion',
  ],
}))
