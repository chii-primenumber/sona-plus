import assert from 'node:assert/strict'

const disk = new Map<string, unknown>()
let diskSetCalls = 0

;(globalThis as Record<string, unknown>).DataStore = {
  has: (k: string) => disk.has(String(k)),
  get: (k: string, fb?: unknown) => (disk.has(String(k)) ? disk.get(String(k)) : fb),
  set: (k: string, v: unknown) => {
    diskSetCalls += 1
    disk.set(String(k), v)
    return true
  },
  remove: (k: string) => disk.delete(String(k)),
}
;(globalThis as Record<string, unknown>).__PLUGIN_VERSION__ = '1.2.0'

const { store } = await import('@/lib/store')
const { getCorsProxyCandidates, normalizeCorsProxyBaseUrl, DEFAULT_CORS_PROXY_URL } = await import('@/lib/cors-proxy')
const { serializeSonaConfig, applyImportedSonaConfig } = await import('@/lib/config-transfer')
const { upsertPlayerTag, removePlayerTag, getPlayerTag, buildEncounterLookup } = await import('@/lib/player-tags')
const { normalizeLootShards, planShardDisenchants } = await import('@/lib/loot-helper')
const { getChampionBalance, syncRemoteChampionBalance } = await import('@/lib/assets')
const { analyzeTeamComposition, extractChampSelectSlots, getChampionCombatProfile } = await import('@/lib/comp-diagnostic')
const { createWishlistSwapState, planWishlistBenchSwap, buildTeammateProficiencyIndex, formatBenchTeammateBadge } = await import('@/lib/aram-bench-assist')
const {
  detectTeammateTagAlerts,
  collectSelectableOwnedSkins,
  pickRandomOwnedSkin,
  evaluateIncomingSwapsAndTrades,
  resolvePresetChampionIds,
  normalizeChampSelectPresetsMap,
} = await import('@/lib/champselect-enhancements')
const {
  evaluateMatchMvpAndScores,
  normalizeEogStatsToGameSummary,
  planSmartHonorTargets,
} = await import('@/lib/postgame-intel')
const { lcu } = await import('@/lib/lcu')
import balanceJson from '@/data/champion-balance.json'
import type { SgpGameSummaryLol } from '@/types/sgp'

const checks: string[] = []

// A1: SonaStore leading+trailing coalesced disk writes + immediate memory & listener updates
{
  store.flush()
  diskSetCalls = 0
  let listenerCount = 0
  const unsub = store.onChange('beautifyGlassBlur', () => { listenerCount += 1 })
  for (let i = 1; i <= 50; i += 1) {
    store.set('beautifyGlassBlur', i)
  }
  assert.equal(store.get('beautifyGlassBlur'), 50)
  assert.equal(listenerCount, 50)
  assert.equal(diskSetCalls, 1, 'First write persists immediately (leading edge); subsequent 49 burst updates coalesce')
  assert.equal(disk.get('sona:beautifyGlassBlur'), 1)
  store.flush()
  assert.equal(diskSetCalls, 2, '50 rapid slider updates result in only 2 total disk writes (leading + trailing)')
  assert.equal(disk.get('sona:beautifyGlassBlur'), 50)
  unsub()
  checks.push('coalesced leading+trailing store writes and synchronous memory updates')
}

// A4: Custom CORS proxy priority + fallback + header forwarding + URL validation
{
  assert.equal(normalizeCorsProxyBaseUrl('javascript:alert(1)'), '')
  assert.equal(normalizeCorsProxyBaseUrl('http://evil.example.com/'), '')
  assert.equal(normalizeCorsProxyBaseUrl('https://my-worker.workers.dev'), 'https://my-worker.workers.dev/')
  store.set('customCorsProxyUrl', 'https://my-worker.workers.dev/')
  const candidates = getCorsProxyCandidates('https://api.github.com/repos/chii-primenumber/sona-plus/releases/latest')
  assert.equal(candidates.length, 2)
  assert.ok(candidates[0].startsWith('https://my-worker.workers.dev/?url='))
  assert.ok(candidates[1].startsWith(DEFAULT_CORS_PROXY_URL))
  const withHeaders = getCorsProxyCandidates('https://example.com/upload', { Referer: 'https://ref.test/' })
  assert.ok(withHeaders[0].includes('reqHeaders=Referer%3Ahttps%3A%2F%2Fref.test%2F'))
  store.set('customCorsProxyUrl', '')
  checks.push('custom CORS proxy validation, headers and fallback')
}

// C2: Player tags CRUD + Recent Encounter Lookup
{
  const saved = upsertPlayerTag({
    puuid: 'puuid-ally-1',
    name: 'Faker#KR1',
    label: '大腿',
    tone: 'carry',
    note: '中单很稳',
    matchId: '1001',
  })
  assert.ok(saved)
  assert.equal(getPlayerTag('puuid-ally-1')?.label, '大腿')

  const makeGame = (gameId: number, duration: number, earlySurrender: boolean, selfWin: boolean, otherTeamId: number, champId: number): SgpGameSummaryLol => ({
    metadata: { product: 'lol', tags: [], participants: ['self-puuid', 'puuid-ally-1'] },
    json: {
      gameCreation: 1700000000000 + gameId * 1000,
      gameDuration: duration,
      gameId,
      gameMode: 'CLASSIC',
      gameType: 'MATCHED_GAME',
      gameVersion: '16.22',
      mapId: 11,
      queueId: 420,
      platformId: 'HN1',
      teams: [],
      participants: [
        { puuid: 'self-puuid', teamId: 100, championId: 1, kills: 5, deaths: 2, assists: 8, win: selfWin, gameEndedInEarlySurrender: earlySurrender } as never,
        { puuid: 'puuid-ally-1', teamId: otherTeamId, championId: champId, kills: 10, deaths: 1, assists: 6, win: otherTeamId === 100 ? selfWin : !selfWin, gameEndedInEarlySurrender: earlySurrender } as never,
      ],
    },
  })

  const games = [
    makeGame(1, 1800, false, true, 100, 238),   // ally, self won
    makeGame(2, 1900, false, false, 200, 157),  // enemy, self lost
    makeGame(3, 180, true, false, 100, 99),     // remake -> must be ignored
    makeGame(1, 1800, false, true, 100, 238),   // duplicate gameId -> must be deduplicated
  ]
  const lookup = buildEncounterLookup(games, 'self-puuid')
  const enc = lookup.get('puuid-ally-1')
  assert.ok(enc)
  assert.equal(enc.total, 2)
  assert.equal(enc.allyCount, 1)
  assert.equal(enc.enemyCount, 1)
  assert.equal(enc.selfWins, 1)
  assert.equal(enc.selfLosses, 1)

  assert.equal(removePlayerTag('puuid-ally-1'), true)
  assert.equal(getPlayerTag('puuid-ally-1'), null)
  checks.push('player tag book CRUD and deduplicated encounter lookup')
}

// C1: Sona Plus config export & import
{
  upsertPlayerTag({ puuid: 'p-export', name: 'Test#001', label: '绝活', tone: 'good', note: '保留' })
  store.set('statusMessage', { 'acc-1': 'private-status' })
  const exportedNoAcc = serializeSonaConfig({ includeAccountData: false })
  const parsedPayload = JSON.parse(exportedNoAcc) as { config: Record<string, unknown> }
  assert.equal('statusMessage' in parsedPayload.config, false)
  assert.equal('lastUpdateCheckAt' in parsedPayload.config, false)
  assert.ok(parsedPayload.config.playerTags)

  removePlayerTag('p-export')
  assert.equal(getPlayerTag('p-export'), null)
  const injected = JSON.stringify({
    ...parsedPayload,
    config: {
      ...parsedPayload.config,
      unknownFutureKey: 123,
      beautifyGlassBlur: 'invalid-type-should-skip',
      hotkey: 'F3',
    },
  })
  const result = applyImportedSonaConfig(injected)
  assert.ok(result.appliedKeys > 20)
  assert.equal(result.skippedKeys, 2)
  assert.equal(store.get('hotkey'), 'F3')
  assert.equal(getPlayerTag('p-export')?.label, '绝活')
  store.set('hotkey', 'F1')
  removePlayerTag('p-export')
  checks.push('config export/import validation and account-data filtering')
}

// C6: Loot disenchant helper strategies
{
  const rawLootMap = {
    CHAMPION_RENTAL_103: {
      lootId: 'CHAMPION_RENTAL_103',
      type: 'CHAMPION_RENTAL',
      displayCategories: 'CHAMPION',
      count: 3,
      disenchantValue: 960,
      disenchantLootName: 'CURRENCY_champion',
      itemDesc: '阿狸',
      itemStatus: 'OWNED',
      storeItemId: 103,
    },
    CHAMPION_RENTAL_799: {
      lootId: 'CHAMPION_RENTAL_799',
      type: 'CHAMPION_RENTAL',
      displayCategories: 'CHAMPION',
      count: 2,
      disenchantValue: 1260,
      disenchantLootName: 'CURRENCY_champion',
      itemDesc: '安蓓萨',
      itemStatus: 'NONE',
      storeItemId: 799,
    },
    CHAMPION_TOKEN_6: {
      lootId: 'CHAMPION_TOKEN_6',
      type: 'CHAMPION_TOKEN',
      displayCategories: 'CHAMPION',
      count: 2,
      disenchantValue: 100,
    },
  }
  const shards = normalizeLootShards(rawLootMap)
  assert.equal(shards.length, 2, 'Mastery tokens must be excluded')

  const ownedOnly = planShardDisenchants(shards, 'owned_all', 'champion')
  assert.equal(ownedOnly.find((x) => x.shard.championId === 103)?.disenchantCount, 3)
  assert.equal(ownedOnly.find((x) => x.shard.championId === 799)?.disenchantCount, 0)

  const keepUnowned = planShardDisenchants(shards, 'keep_one_unowned', 'champion')
  assert.equal(keepUnowned.find((x) => x.shard.championId === 103)?.disenchantCount, 3)
  assert.equal(keepUnowned.find((x) => x.shard.championId === 799)?.disenchantCount, 1)

  const keepAll = planShardDisenchants(shards, 'keep_one_all', 'champion')
  assert.equal(keepAll.find((x) => x.shard.championId === 103)?.disenchantCount, 2)
  assert.equal(keepAll.find((x) => x.shard.championId === 799)?.disenchantCount, 1)

  const all = planShardDisenchants(shards, 'all', 'champion')
  assert.equal(all.reduce((s, x) => s + x.totalEssence, 0), 3 * 960 + 2 * 1260)
  checks.push('loot shard normalization and 4 disenchant strategies')
}

// A3: Remote champion balance hot-cache sync
{
  const origFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      _meta: { updatedAt: '2099-01-01T00:00:00.000Z' },
      champions: {
        '1': { id: 1, alias: 'Annie', stats: { aram: { dmg_dealt: 1.12 } } },
      },
    }), { status: 200 })) as typeof fetch
    const updated = await syncRemoteChampionBalance(true)
    assert.equal(updated, true)
    assert.equal(getChampionBalance(1)?.stats.aram?.dmg_dealt, 1.12)
    store.set('cachedChampionBalance', null)
  } finally {
    globalThis.fetch = origFetch
  }
  checks.push('remote champion balance hot-cache sync')
}

// C3: BP composition damage share & weakness diagnostic (all 173 integer IDs + fallback + comps)
{
  const integerIds = Object.keys(balanceJson.champions)
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0)
  assert.ok(integerIds.length >= 170)
  for (const id of integerIds) {
    const prof = getChampionCombatProfile(id)
    assert.notEqual(prof.tag, '均衡英雄', `Champion ID ${id} should have an explicit combat profile`)
    const sum = prof.ad + prof.ap + prof.trueDmg
    assert.ok(Math.abs(sum - 1) < 0.001, `Champion ID ${id} damage weights must sum to 1`)
  }
  const futureMage = getChampionCombatProfile(9999, ['mage'])
  assert.ok(futureMage.ap > 0.8)

  // All-AD warning even with 1 enchanter support (weighted output)
  const allAd = analyzeTeamComposition([
    { floor: 1, cellId: 0, championId: 122, isIntent: false }, // Darius
    { floor: 2, cellId: 1, championId: 64, isIntent: false },  // LeeSin
    { floor: 3, cellId: 2, championId: 238, isIntent: true },  // Zed (intent)
    { floor: 4, cellId: 3, championId: 51, isIntent: false },  // Caitlyn
    { floor: 5, cellId: 4, championId: 117, isIntent: false }, // Lulu
  ])
  assert.equal(allAd.pickedCount, 5)
  assert.equal(allAd.intentCount, 1)
  assert.equal(allAd.physicalPct + allAd.magicPct + allAd.truePct, 100)
  assert.ok(allAd.physicalPct >= 75, `Expected physicalPct >= 75, got ${allAd.physicalPct}`)
  assert.ok(allAd.tags.some((t) => t.id === 'all-ad'))

  // All-AP warning
  const allAp = analyzeTeamComposition([
    { floor: 1, cellId: 0, championId: 82, isIntent: false },  // Mordekaiser
    { floor: 2, cellId: 1, championId: 60, isIntent: false },  // Elise
    { floor: 3, cellId: 2, championId: 103, isIntent: false }, // Ahri
    { floor: 4, cellId: 3, championId: 115, isIntent: false }, // Ziggs
    { floor: 5, cellId: 4, championId: 89, isIntent: false },  // Leona
  ])
  assert.ok(allAp.magicPct >= 75, `Expected magicPct >= 75, got ${allAp.magicPct}`)
  assert.ok(allAp.tags.some((t) => t.id === 'all-ap'))

  // Squishy comp lacking frontline and hard CC
  const squishy = analyzeTeamComposition([
    { floor: 1, cellId: 0, championId: 17, isIntent: false },  // Teemo
    { floor: 2, cellId: 1, championId: 11, isIntent: false },  // MasterYi
    { floor: 3, cellId: 2, championId: 55, isIntent: false },  // Katarina
    { floor: 4, cellId: 3, championId: 222, isIntent: false }, // Jinx
    { floor: 5, cellId: 4, championId: 16, isIntent: false },  // Soraka
  ])
  assert.ok(squishy.tags.some((t) => t.id === 'no-frontline'))
  assert.ok(squishy.tags.some((t) => t.id === 'low-cc'))

  // Balanced comp
  const balanced = analyzeTeamComposition([
    { floor: 1, cellId: 0, championId: 516, isIntent: false }, // Ornn
    { floor: 2, cellId: 1, championId: 64, isIntent: false },  // LeeSin
    { floor: 3, cellId: 2, championId: 103, isIntent: false }, // Ahri
    { floor: 4, cellId: 3, championId: 222, isIntent: false }, // Jinx
    { floor: 5, cellId: 4, championId: 412, isIntent: false }, // Thresh
  ])
  assert.equal(balanced.tags[0]?.id, 'balanced')

  const extracted = extractChampSelectSlots({
    queueId: 420,
    localPlayerCellId: 0,
    myTeam: [
      { cellId: 0, championId: 0, championPickIntent: 157 } as never,
      { cellId: 1, championId: 54, championPickIntent: 0 } as never,
    ],
    actions: [[{ actorCellId: 0, type: 'pick', championId: 157, completed: false } as never]],
  } as never)
  assert.equal(extracted[0]?.championId, 157)
  assert.equal(extracted[0]?.isIntent, true)
  assert.equal(extracted[1]?.championId, 54)
  assert.equal(extracted[1]?.isIntent, false)
  checks.push('BP composition damage share & weakness diagnostic across all champions')
}

// C4: ARAM wishlist priority anti-ping-pong + manual drop suppression + teammate ace hints
{
  const state = createWishlistSwapState()
  const wishlist = [103, 222, 99] // #1 Ahri, #2 Jinx, #3 Lux

  // Step 1: Hold Malphite (54), bench has Jinx (#2) & Lux (#3) -> swap to Jinx (#2)
  const step1 = planWishlistBenchSwap({
    benchEnabled: true,
    wishlistEnabled: true,
    autoSwapEnabled: true,
    wishlistIds: wishlist,
    myChampionId: 54,
    benchChampionIds: [99, 222],
    state,
    now: 10000,
  })
  assert.equal(step1.autoSwapTargetId, 222)
  assert.equal(step1.autoSwapTargetRank, 2)
  state.lastAutoSwapTargetId = 222
  state.lastAutoSwapAt = 10000

  // Step 2: Now holding Jinx (#2), bench has Malphite (54) & Lux (#3) -> MUST NOT ping-pong to Lux (#3)
  const step2 = planWishlistBenchSwap({
    benchEnabled: true,
    wishlistEnabled: true,
    autoSwapEnabled: true,
    wishlistIds: wishlist,
    myChampionId: 222,
    benchChampionIds: [54, 99],
    state,
    now: 12000,
  })
  assert.equal(step2.autoSwapTargetId, null)

  // Step 3: Teammate rerolls Ahri (#1) onto bench -> upgrades from #2 Jinx to #1 Ahri!
  const step3 = planWishlistBenchSwap({
    benchEnabled: true,
    wishlistEnabled: true,
    autoSwapEnabled: true,
    wishlistIds: wishlist,
    myChampionId: 222,
    benchChampionIds: [54, 99, 103],
    state,
    now: 14000,
  })
  assert.equal(step3.autoSwapTargetId, 103)
  state.lastAutoSwapTargetId = 103
  state.lastAutoSwapAt = 14000

  // Step 4: Holding Ahri (#1), bench has Jinx (#2) & Lux (#3) -> stays on Ahri (#1)
  const step4 = planWishlistBenchSwap({
    benchEnabled: true,
    wishlistEnabled: true,
    autoSwapEnabled: true,
    wishlistIds: wishlist,
    myChampionId: 103,
    benchChampionIds: [54, 99, 222],
    state,
    now: 16000,
  })
  assert.equal(step4.autoSwapTargetId, null)

  // Step 5: User manually swaps off Ahri (#1) to Malphite (54) -> Ahri (#1) goes to bench and MUST be suppressed!
  const step5 = planWishlistBenchSwap({
    benchEnabled: true,
    wishlistEnabled: true,
    autoSwapEnabled: true,
    wishlistIds: wishlist,
    myChampionId: 54,
    benchChampionIds: [103],
    state,
    now: 18000,
  })
  assert.equal(step5.autoSwapTargetId, null, 'Manually dropped wishlist hero must not be auto-grabbed back')
  assert.equal(step5.benchMatches[0]?.isSuppressed, true)

  // Teammate proficiency evaluation
  const makeMateGame = (gameId: number, champId: number, win: boolean, duration = 1200, early = false): SgpGameSummaryLol => ({
    metadata: { product: 'lol', tags: [], participants: ['mate-2'] },
    json: {
      gameCreation: 1700000000000 + gameId * 1000,
      gameDuration: duration,
      gameId,
      gameMode: 'ARAM',
      gameType: 'MATCHED_GAME',
      gameVersion: '16.22',
      mapId: 12,
      queueId: 450,
      platformId: 'HN1',
      teams: [],
      participants: [
        { puuid: 'mate-2', teamId: 100, championId: champId, kills: 12, deaths: 4, assists: 18, win, gameEndedInEarlySurrender: early } as never,
      ],
    },
  })
  const profIndex = buildTeammateProficiencyIndex([
    {
      floor: 2,
      puuid: 'mate-2',
      name: '薄荷汽水',
      games: [
        makeMateGame(1, 64, true),
        makeMateGame(2, 64, true),
        makeMateGame(3, 64, true),
        makeMateGame(4, 64, false),
        makeMateGame(5, 99, false, 150, true), // remake ignored
      ],
      masteries: [{ championId: 64, championLevel: 18, championPoints: 165000 }],
    },
    {
      floor: 4,
      puuid: 'mate-4',
      name: '微光纸船',
      games: [],
      masteries: [{ championId: 99, championLevel: 8, championPoints: 42000 }],
    },
  ])
  assert.equal(formatBenchTeammateBadge(profIndex.get(64) ?? [])?.label, '2楼绝活')
  assert.equal(formatBenchTeammateBadge(profIndex.get(64) ?? [])?.tier, 'ace')
  assert.equal(formatBenchTeammateBadge(profIndex.get(99) ?? [])?.label, '4楼熟练')

  // Veteran high-level account: only Top 6 mastery champions qualify via mastery alone (preventing bench spam)
  const veteranIndex = buildTeammateProficiencyIndex([
    {
      floor: 3,
      puuid: 'vet-3',
      name: '千场老兵',
      games: [],
      masteries: Array.from({ length: 15 }, (_, idx) => ({
        championId: 500 + idx,
        championLevel: 15,
        championPoints: 200000 - idx * 5000,
      })),
    },
    {
      floor: 5,
      puuid: 'vet-5',
      name: '双排搭档',
      games: [],
      masteries: [{ championId: 500, championLevel: 20, championPoints: 300000 }],
    },
  ])
  assert.equal(formatBenchTeammateBadge(veteranIndex.get(500) ?? [])?.label, '5楼绝活+', 'Multi-teammate badge must stay concise within 42px portrait')
  assert.equal(veteranIndex.has(505), true, 'Rank #6 mastery qualifies as skilled')
  assert.equal(veteranIndex.has(506), false, 'Rank #7+ mastery without recent games must be excluded to prevent bench clutter')
  checks.push('ARAM bench wishlist anti-ping-pong, manual drop suppression & teammate ace index')
}

// SGP ignored-tag auto-top-up (e.g. q_2400 returning mixed modes in first 20 games)
{
  const origFetch = globalThis.fetch
  const origGetToken = lcu.getEntitlementsToken.bind(lcu)
  const origGetServerId = lcu.getSgpServerId.bind(lcu)
  try {
    lcu.getEntitlementsToken = async () => ({ accessToken: 'tok', token: 'tok', entitlements: [], issuer: 'http://hn1-k8s-bcs-internal.lol.qq.com:28088', subject: 'p1' })
    lcu.getSgpServerId = async () => 'TENCENT_HN1'

    const allMixedGames = Array.from({ length: 60 }, (_, idx) => ({
      metadata: { product: 'lol', tags: [], participants: ['p1'] },
      json: {
        gameId: 5000 + idx,
        queueId: idx % 2 === 0 ? 2400 : 450, // only half of the games are 2400!
        gameDuration: 1100,
        participants: [{ puuid: 'p1', championId: 103, win: true }],
      },
    }))

    let fetchCalls = 0
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchCalls += 1
      const u = new URL(String(input))
      const start = Number(u.searchParams.get('startIndex') || '0')
      const cnt = Number(u.searchParams.get('count') || '20')
      // Simulate an SGP node that ignores ?tag=q_2400 and returns mixed queues
      return new Response(JSON.stringify({ games: allMixedGames.slice(start, start + cnt) }), { status: 200 })
    }) as typeof fetch

    const res = await lcu.getSgpMatchHistory('p1', { startIndex: 0, count: 20, tag: 'q_2400' })
    assert.equal(res.games.length, 20, 'Should auto-scan next SGP batch to top up 20 matching q_2400 games instead of stopping at 10')
    assert.ok(res.games.every((g) => g.json.queueId === 2400))
    assert.equal(fetchCalls, 2)
  } finally {
    globalThis.fetch = origFetch
    lcu.getEntitlementsToken = origGetToken
    lcu.getSgpServerId = origGetServerId
    ;(lcu as unknown as { _entitlementsToken: unknown })._entitlementsToken = null
  }
  checks.push('SGP ignored-tag auto-top-up for rotating/mode queues')
}

// E1, E2, E4, E5, E6 comprehensive model tests
{
  // E1: Teammate tag alert detection (including anonymous Ranked obfuscatedPuuid)
  const mockTags = {
    'puuid-troll': { puuid: 'puuid-troll', name: '摆烂王#111', tone: 'avoid' as const, label: '避雷', note: '0-12挂机送塔', updatedAt: 100 },
    'puuid-warn': { puuid: 'puuid-warn', name: '暴躁哥#222', tone: 'warn' as const, label: '心态差', note: '逆风爱点投降', updatedAt: 101 },
    'puuid-carry': { puuid: 'puuid-carry', name: '野核大腿#333', tone: 'carry' as const, label: '大腿', note: '节奏极好', updatedAt: 102 },
  }
  const e1Session = {
    id: 'cs-session-1',
    localPlayerCellId: 0,
    myTeam: [
      { cellId: 0, puuid: 'puuid-self', gameName: '自己', tagLine: '000', nameVisibilityType: 'PUBLIC', obfuscatedPuuid: '', championId: 103, championPickIntent: 0 },
      { cellId: 1, puuid: 'puuid-warn', gameName: '暴躁哥', tagLine: '222', nameVisibilityType: 'PUBLIC', obfuscatedPuuid: '', championId: 54, championPickIntent: 0 },
      { cellId: 2, puuid: '', gameName: '', tagLine: '', playerAlias: '隐身排位路人', nameVisibilityType: 'HIDDEN', obfuscatedPuuid: 'obf-troll', championId: 0, championPickIntent: 157 },
      { cellId: 3, puuid: 'puuid-carry', gameName: '野核大腿', tagLine: '333', nameVisibilityType: 'PUBLIC', obfuscatedPuuid: '', championId: 64, championPickIntent: 0 },
    ],
  } as never
  const e1Res = detectTeammateTagAlerts(e1Session, mockTags, (obf) => (obf === 'obf-troll' ? 'puuid-troll' : ''))
  assert.equal(e1Res.warnings.length, 2)
  assert.equal(e1Res.warnings[0]?.puuid, 'puuid-troll', 'Avoid tag must sort ahead of warn tag even when anonymous')
  assert.equal(e1Res.warnings[0]?.floor, 3)
  assert.equal(e1Res.positives.length, 1)
  assert.ok(e1Res.alertKey.includes('puuid-troll:avoid'))

  // E4: Owned skin & chroma randomizer (excludes base skin, includes owned chromas, avoids repeating current skin)
  const sampleSkins = [
    { id: 103000, championId: 103, name: '九尾妖狐', isBase: true, unlocked: true },
    {
      id: 103027,
      championId: 103,
      name: '灵魂莲华 阿狸',
      unlocked: true,
      childSkins: [
        { id: 103028, name: '灵魂莲华 阿狸 炫彩·夜樱', unlocked: true },
        { id: 103029, name: '未解锁炫彩', unlocked: false },
      ],
    },
    { id: 103042, championId: 103, name: '未拥有皮肤', unlocked: false },
  ]
  const selectable = collectSelectableOwnedSkins(sampleSkins, { excludeBase: true, includeChromas: true })
  assert.deepEqual(selectable.map((s) => s.id), [103027, 103028])
  const chosenSkin = pickRandomOwnedSkin(sampleSkins, {
    excludeBase: true,
    includeChromas: true,
    currentSkinId: 103027,
    rng: () => 0,
  })
  assert.equal(chosenSkin?.id, 103028, 'Should prefer a fresh owned skin/chroma different from currentSkinId')
  assert.equal(
    pickRandomOwnedSkin([{ id: 103000, championId: 103, isBase: true, unlocked: true }], { excludeBase: true }),
    null,
    'Base-only champion must return null when excludeBase is true',
  )

  // E5: Incoming Pick-Order Swap & Champion Trade evaluation
  const handled = new Set<string>()
  const swapSession = {
    localPlayerCellId: 0, // 1楼 (index 0)
    benchEnabled: true,
    myTeam: [
      { cellId: 0, puuid: 'puuid-self', gameName: '我', championId: 222, nameVisibilityType: 'PUBLIC', obfuscatedPuuid: '' },
      { cellId: 1, puuid: 'puuid-troll', gameName: '摆烂王', championId: 54, nameVisibilityType: 'PUBLIC', obfuscatedPuuid: '' },
      { cellId: 2, puuid: 'puuid-stranger', gameName: '四楼路人', championId: 99, nameVisibilityType: 'PUBLIC', obfuscatedPuuid: '' },
      { cellId: 3, puuid: 'puuid-friend', gameName: '开黑队友', championId: 64, nameVisibilityType: 'PUBLIC', obfuscatedPuuid: '' },
    ],
    pickOrderSwaps: [
      { id: 11, cellId: 1, state: 'RECEIVED' }, // avoid player -> MUST REJECT
      { id: 12, cellId: 2, state: 'RECEIVED' }, // stranger at later floor -> ACCEPT under favorable_or_friends
    ],
    trades: [
      { id: 21, cellId: 2, state: 'RECEIVED' }, // stranger trying to trade for my wishlist Jinx (222) -> MUST PROTECT
      { id: 22, cellId: 3, state: 'RECEIVED' }, // premade friend trading -> ACCEPT
    ],
  } as never
  const swapActions = evaluateIncomingSwapsAndTrades({
    session: swapSession,
    strategy: 'favorable_or_friends',
    premadePuuids: new Set(['puuid-friend']),
    friendPuuids: new Set(),
    tagsMap: mockTags,
    wishlistIds: [222],
    wishlistEnabled: true,
    handledKeys: handled,
  })
  assert.deepEqual(
    swapActions.map((a) => `${a.kind}:${a.id}`),
    ['pick_order:12', 'trade:22'],
  )

  // E6: Per-mode & per-lane preset resolution with default fallback
  const presets = normalizeChampSelectPresetsMap({
    'pos:top': { lockIds: [122, 86], banIds: [114] },
    'mode:urf': { lockIds: [55, 238], banIds: [350] },
  })
  assert.deepEqual(
    resolvePresetChampionIds('lock', {
      presetEnabled: true,
      presets,
      defaultIds: [103],
      gameMode: 'CLASSIC',
      queueId: 420,
      assignedPosition: 'top',
    }),
    { ids: [122, 86], matchedScope: 'pos:top' },
  )
  assert.deepEqual(
    resolvePresetChampionIds('lock', {
      presetEnabled: true,
      presets,
      defaultIds: [103],
      gameMode: 'CLASSIC',
      queueId: 420,
      assignedPosition: 'middle', // empty preset -> falls back to defaultIds!
    }),
    { ids: [103], matchedScope: null },
  )
  assert.deepEqual(
    resolvePresetChampionIds('ban', {
      presetEnabled: true,
      presets,
      defaultIds: [157],
      gameMode: 'URF',
      queueId: 900,
      assignedPosition: '',
    }),
    { ids: [350], matchedScope: 'mode:urf' },
  )

  // E2: EOG normalization, MVP/SVP scoring, and Smart Auto-Honor skipping avoid players
  const eogSample = {
    gameId: 9988,
    gameLength: 1500,
    gameMode: 'CLASSIC',
    teams: [
      {
        teamId: 100,
        isWinningTeam: true,
        players: [
          {
            puuid: 'puuid-self',
            summonerId: 1,
            riotIdGameName: '我',
            championId: 103,
            isLocalPlayer: true,
            stats: { CHAMPIONS_KILLED: 5, NUM_DEATHS: 3, ASSISTS: 8, TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: 18000, TOTAL_DAMAGE_TAKEN: 14000, GOLD_EARNED: 11000, MINIONS_KILLED: 180, NEUTRAL_MINIONS_KILLED: 0, TOTAL_HEAL: 2000, VISION_SCORE: 22, WIN: 1 },
          },
          {
            puuid: 'puuid-troll',
            summonerId: 2,
            riotIdGameName: '摆烂王',
            championId: 157,
            stats: { CHAMPIONS_KILLED: 1, NUM_DEATHS: 11, ASSISTS: 2, TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: 6000, TOTAL_DAMAGE_TAKEN: 22000, GOLD_EARNED: 7500, MINIONS_KILLED: 90, NEUTRAL_MINIONS_KILLED: 0, TOTAL_HEAL: 500, VISION_SCORE: 6, WIN: 1 },
          },
          {
            puuid: 'puuid-mvp',
            summonerId: 3,
            riotIdGameName: '凯瑞王',
            championId: 64,
            stats: { CHAMPIONS_KILLED: 16, NUM_DEATHS: 2, ASSISTS: 12, TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: 38000, TOTAL_DAMAGE_TAKEN: 28000, GOLD_EARNED: 16800, MINIONS_KILLED: 40, NEUTRAL_MINIONS_KILLED: 165, TOTAL_HEAL: 9500, VISION_SCORE: 38, WIN: 1 },
          },
        ],
      },
      {
        teamId: 200,
        isWinningTeam: false,
        players: [
          {
            puuid: 'enemy-svp',
            summonerId: 4,
            riotIdGameName: '对面尽力哥',
            championId: 222,
            stats: { CHAMPIONS_KILLED: 12, NUM_DEATHS: 4, ASSISTS: 6, TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: 34000, TOTAL_DAMAGE_TAKEN: 16000, GOLD_EARNED: 14500, MINIONS_KILLED: 210, NEUTRAL_MINIONS_KILLED: 8, TOTAL_HEAL: 3100, VISION_SCORE: 24, WIN: 0 },
          },
          {
            puuid: 'enemy-2',
            summonerId: 5,
            riotIdGameName: '对面路人',
            championId: 54,
            stats: { CHAMPIONS_KILLED: 2, NUM_DEATHS: 9, ASSISTS: 5, TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: 11000, TOTAL_DAMAGE_TAKEN: 29000, GOLD_EARNED: 9200, MINIONS_KILLED: 110, NEUTRAL_MINIONS_KILLED: 0, TOTAL_HEAL: 1800, VISION_SCORE: 15, WIN: 0 },
          },
        ],
      },
    ],
  }
  const normalizedEog = normalizeEogStatsToGameSummary(eogSample)
  const perfBadges = evaluateMatchMvpAndScores(normalizedEog)
  assert.equal(perfBadges.get('puuid-mvp')?.award, 'MVP')
  assert.equal(perfBadges.get('enemy-svp')?.award, 'SVP')

  const honorPlan = planSmartHonorTargets({
    votes: 2,
    allies: [
      { puuid: 'puuid-troll', summonerId: 2, championId: 157, championName: '亚索' },
      { puuid: 'puuid-mvp', summonerId: 3, championId: 64, championName: '李青' },
    ],
    opponents: [
      { puuid: 'enemy-svp', summonerId: 4, championId: 222, championName: '金克丝' },
    ],
    tagsMap: mockTags,
    performanceByPuuid: perfBadges,
  })
  assert.deepEqual(
    honorPlan.map((v) => v.puuid),
    ['puuid-mvp', 'enemy-svp'],
    'Smart honor must honor MVP ally first, skip avoid ally, and give remaining vote to SVP opponent',
  )

  const friendsOnlyPlan = planSmartHonorTargets({
    votes: 3,
    allies: [
      { puuid: 'puuid-friend', summonerId: 10, championId: 103, championName: '阿狸' },
      { puuid: 'puuid-mvp', summonerId: 3, championId: 64, championName: '李青' },
    ],
    opponents: [
      { puuid: 'enemy-svp', summonerId: 4, championId: 222, championName: '金克丝' },
    ],
    tagsMap: mockTags,
    friendPuuids: new Set(['puuid-friend']),
    performanceByPuuid: perfBadges,
    onlyFriends: true,
  })
  assert.deepEqual(
    friendsOnlyPlan.map((v) => v.puuid),
    ['puuid-friend'],
    'friends_only honor strategy must strictly honor friends/premades and never vote for non-friend strangers',
  )
  assert.equal(
    planSmartHonorTargets({
      votes: 3,
      allies: [{ puuid: 'puuid-mvp', summonerId: 3, championId: 64, championName: '李青' }],
      opponents: [],
      tagsMap: mockTags,
      onlyFriends: true,
    }).length,
    0,
    'friends_only honor strategy must return 0 votes when solo queuing with no friends in the match',
  )
  checks.push('E1 tag alert, E2 MVP/SVP & smart honor, E4 random skin/chroma, E5 smart swap/trade & E6 mode/lane presets')
}

store.flush()
console.log(JSON.stringify({ result: 'passed', checks }))
