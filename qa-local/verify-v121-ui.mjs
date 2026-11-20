import assert from 'node:assert/strict'

export async function verifyV121Ui(page, games) {
  await page.setViewportSize({ width: 1450, height: 940 })

  // 1. Verify 4-item Rift core builds, sample threshold hint, one-click core apply, Arena prism items, and 30s augment pinyin search
  await page.evaluate(async () => {
    const [react, dom, { OpggBuildRecommendationPanel }, { MatchReport }, { store }, { DEFAULT_RECOMMENDATION_PREFERENCES, normalizeRecommendationPreferences }] = await Promise.all([
      import('/node_modules/.vite/deps/react.js'),
      import('/node_modules/.vite/deps/react-dom_client.js'),
      import('/src/components/ui/OpggBuildRecommendationPanel.tsx'),
      import('/src/components/ui/HistoryWidgets.tsx'),
      import('/src/lib/store.ts'),
      import('/src/lib/recommendation-filter.ts'),
    ])
    const React = react.default ?? react
    const createRoot = (dom.default ?? dom).createRoot

    const host = document.createElement('div')
    host.id = 'qa-v121-host'
    host.style.cssText = 'position:fixed;inset:16px;z-index:2147483647;background:#0a1018;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:14px;'
    document.body.append(host)

    const appliedCores = []
    const recommendation = {
      mode: 'ranked',
      modeLabel: '单双排',
      version: '16.23',
      position: 'adc',
      baselineWinRate: 0.5,
      summary: ['总体胜率 51.2%', '登场 14.0%', 'Tier 1'],
      summonerSpells: [{ ids: [4, 7], play: 1000, win: 520, pick_rate: 0.7 }],
      starterItems: [{ ids: [1055, 2003], play: 1000, win: 510, pick_rate: 0.8 }],
      boots: [{ ids: [3158], play: 900, win: 470, pick_rate: 0.6 }],
      prismItems: [{ ids: [3089], play: 500, win: 280, pick_rate: 0.35 }],
      coreItems: [
        { ids: [3070, 3078, 3004, 6694], play: 320, win: 176, pick_rate: 0.32 },
        { ids: [3078, 3004, 3036], play: 220, win: 118, pick_rate: 0.22 },
      ],
      lastItems: [{ ids: [3026], play: 400, win: 228, pick_rate: 0.24 }],
      runePages: [],
      skills: {
        priority: { keys: ['Q', 'E', 'W'], play: 600, win: 318, pickRate: 0.72 },
        order: { keys: ['Q', 'E', 'W', 'Q', 'Q', 'R'], play: 500, win: 270, pickRate: 0.55 },
      },
      matchups: [],
      assets: {
        items: {},
        augments: {
          9001: { name: '炼狱导管', iconPath: '', description: '技能施加灼烧效果', rarity: 'Prismatic' },
          9002: { name: '以战养战', iconPath: '', description: '获得额外生命偷取', rarity: 'Gold' },
          9003: { name: '疾风步', iconPath: '', description: '提升移动速度', rarity: 'Silver' },
        },
      },
      augments: [
        { rarity: 8, label: '棱彩', items: [{ id: 9001, pickRate: 0.12, sampleCount: 800, winRate: 0.58 }] },
        { rarity: 4, label: '黄金', items: [{ id: 9002, pickRate: 0.18, sampleCount: 900, winRate: 0.54 }] },
        { rarity: 1, label: '白银', items: [{ id: 9003, pickRate: 0.22, sampleCount: 1100, winRate: 0.51 }] },
      ],
    }

    const root = createRoot(host)
    const renderMode = (mode) => {
      const ctx = mode === 'arena'
        ? { championId: 103, queueId: 1700, gameVersion: '16.23', gameMode: 'CHERRY', position: 'none' }
        : mode === 'kiwi'
          ? { championId: 81, queueId: 2400, gameVersion: '16.23', gameMode: 'KIWI', position: 'none' }
          : { championId: 81, queueId: 420, gameVersion: '16.23', gameMode: 'CLASSIC', position: 'adc' }
      root.render(React.createElement(OpggBuildRecommendationPanel, {
        context: ctx,
        recommendation: { ...recommendation, mode: mode === 'arena' ? 'arena' : mode === 'kiwi' ? 'aram' : 'ranked' },
        loadError: '',
        isLoading: false,
        selectedTier: 'emerald_plus',
        onTierChange() {},
        onPositionChange() {},
        onClose() {},
        onApplyCoreBuild: async (build) => { appliedCores.push(build.ids) },
      }))
    }
    const savedFilter = store.get('recommendationPreferences')
    store.set('recommendationPreferences', normalizeRecommendationPreferences(DEFAULT_RECOMMENDATION_PREFERENCES))
    renderMode('ranked')
    window.qaV121 = { host, root, renderMode, appliedCores, savedFilter, store, MatchReport, React, createRoot }
  })

  const host = page.locator('#qa-v121-host')
  // 4-item Rift core build renders all 4 icons + apply button works
  const firstCoreRow = host.getByTestId('three-item-builds').locator('.sobp-row').first()
  await firstCoreRow.waitFor()
  assert.equal(await firstCoreRow.locator('.sobp-icon-step').count(), 4)
  await firstCoreRow.getByTestId('apply-core-build').click()
  await firstCoreRow.getByTestId('apply-core-build').filter({ hasText: '已写入' }).waitFor()
  const applied = await page.evaluate(() => window.qaV121.appliedCores)
  assert.deepEqual(applied, [[3070, 3078, 3004, 6694]])

  // High sample filter triggers clear hint instead of bare 暂无数据
  await host.getByRole('group', { name: '装备最低场数', exact: true }).getByRole('button', { name: '≥500场', exact: true }).click()
  await host.getByText('≥500场 无核心装 · 点「全部」查看').waitFor()
  await host.getByRole('group', { name: '装备最低场数', exact: true }).getByRole('button', { name: '全部', exact: true }).click()

  // Arena renders prism items section
  await page.evaluate(() => window.qaV121.renderMode('arena'))
  await host.locator('[data-section-title="棱彩装备推荐"]').waitFor()

  // 30s instant augment search (Chinese + pinyin initials + clear)
  await page.evaluate(() => window.qaV121.renderMode('kiwi'))
  const augInput = host.getByLabel('搜索海克斯强化')
  await augInput.waitFor()
  assert.equal(await host.locator('.sobp-augment').count(), 3)
  await augInput.fill('lydg')
  await page.waitForFunction(() => document.querySelectorAll('#qa-v121-host .sobp-augment').length === 1)
  assert.match(await host.locator('.sobp-augment').first().textContent(), /炼狱导管/)
  assert.equal(await host.locator('.sobp-search-hit').count(), 1)
  await host.getByLabel('清空海克斯搜索').click()
  await page.waitForFunction(() => document.querySelectorAll('#qa-v121-host .sobp-augment').length === 3)

  // 2. MatchReport on-demand gold diff curve & milestones
  await page.evaluate((sampleGame) => {
    const { host, root, MatchReport, React } = window.qaV121
    const origFetch = window.fetch
    let timelineFetches = 0
    window.fetch = async (url, init) => {
      if (String(url).includes('/lol-match-history/v1/game-timelines/')) {
        timelineFetches += 1
        const makeFrame = (minute, blue, red, events = []) => ({
          timestamp: minute * 60000,
          participantFrames: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), { participantId: i + 1, totalGold: i < 5 ? blue : red }])),
          events,
        })
        return new Response(JSON.stringify({
          frames: [
            makeFrame(0, 500, 500),
            makeFrame(5, 1600, 2200, [{ type: 'CHAMPION_KILL', timestamp: 295000, killerId: 6 }]),
            makeFrame(15, 5800, 5200, [{ type: 'ELITE_MONSTER_KILL', timestamp: 890000, killerId: 2, monsterType: 'DRAGON', monsterSubType: 'FIRE_DRAGON' }]),
            makeFrame(24, 11200, 9800, [{ type: 'ELITE_MONSTER_KILL', timestamp: 1410000, killerId: 1, monsterType: 'BARON_NASHOR' }]),
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return origFetch(url, init)
    }
    window.qaV121.origFetch = origFetch
    window.qaV121.getTimelineFetches = () => timelineFetches
    root.render(React.createElement(MatchReport, {
      game: sampleGame,
      focusPuuid: sampleGame.json.participants[0].puuid,
    }))
  }, games[0])

  // Timeline must NOT fetch until user clicks 经济曲线
  assert.equal(await page.evaluate(() => window.qaV121.getTimelineFetches()), 0)
  await host.getByRole('button', { name: '经济曲线', exact: true }).click()
  await host.getByTestId('match-timeline-panel').locator('svg.rh-timeline-svg').waitFor()
  assert.equal(await page.evaluate(() => window.qaV121.getTimelineFetches()), 1)
  const milestoneText = await host.getByTestId('timeline-milestones').textContent()
  assert.match(milestoneText, /一血/)
  assert.match(milestoneText, /火龙/)
  assert.match(milestoneText, /大龙/)

  // 3. Standalone BuildLookupPage hero search & mode switch
  await page.evaluate(async () => {
    const { root, React } = window.qaV121
    const { BuildLookupPage } = await import('/src/components/pages/BuildLookupPage.tsx')
    root.render(React.createElement(BuildLookupPage))
  })
  const lookup = host.getByTestId('build-lookup-page')
  await lookup.waitFor()
  const heroSearch = lookup.getByLabel('搜索查询配装的英雄')
  await heroSearch.fill('ys')
  await lookup.locator('.sbl-hero-card').filter({ hasText: '亚索' }).waitFor()
  await heroSearch.fill('')

  // Cleanup
  await page.evaluate(() => {
    const { host, root, savedFilter, store, origFetch } = window.qaV121
    if (origFetch) window.fetch = origFetch
    store.set('recommendationPreferences', savedFilter)
    root.unmount()
    host.remove()
    delete window.qaV121
  })

  console.log('[verify] v1.2.1 build lookup, 30s augment pinyin search, one-click core build apply, 4-item Rift core/sample hint, Arena prism items, and on-demand match timeline curve passed')
}
