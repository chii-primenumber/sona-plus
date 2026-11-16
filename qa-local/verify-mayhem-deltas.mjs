import assert from 'node:assert/strict'

export async function verifyMayhemDeltas(page) {
  let startingPageRequests = 0
  const watch = (request) => { if (request.url().includes('/en/champion-stats/')) startingPageRequests++ }
  page.on('request', watch)
  await page.route('**/data/champions-stats.json', (route) => route.fulfill({ json: [{ championId:'16', tier:'1', winRate:.5, numWinGames:50, numGames:100, pickRate:.1, version:'fixture', date:'2026-11-16', source:'fixture', region:'CN', rank:1, rankDelta:0 }] }))
  await page.route('**/data/champion-details/*.json', (route) => route.fulfill({ json: { championId:'16', championAugments:[['16',JSON.stringify({ augments:{101:{tier:'1',num_win_games:'55',win_rate:'.55',num_games:'100',pick_rate:'.2'}} }),'fixture','2026-11-16']] } }))
  await page.route('**/api/global/champions/aram/**', (route) => route.fulfill({ json: { meta:{version:'fixture'}, data:{
    summary:{average_stats:{win_rate:.45,pick_rate:.1,tier:1,rank:1}}, rune_pages:[], runes:[], counters:[],
    starter_items:[{ids:[2003],win:50,play:100,pick_rate:.1}],
    summoner_spells:[{ids:[4,32],win:50,play:100,pick_rate:.5}],
    boots:[{ids:[3158],win:55,play:100,pick_rate:.6}],
    core_items:[{ids:[6617,3504,6621],win:60,play:100,pick_rate:.3}],
    last_items:[{ids:[6617],win:40,play:100,pick_rate:.2}],
  } } }))
  try {
    await page.evaluate(async () => {
      const anchor=document.createElement('button');anchor.id='qa-mayhem-delta-anchor'
      anchor.style.cssText='position:fixed;bottom:12px;left:12px';document.body.append(anchor)
      const feature=await import('/src/lib/features/opgg-build-recommendation.ts')
      await feature.openOpggBuildRecommendationDebugPanel(anchor,16,{queueId:2400,gameMode:'KIWI',position:'none'})
    })
    const panel=page.locator('#sona-opgg-build-panel')
    const core=panel.locator('.sobp-core-builds .sobp-win-delta')
    await core.waitFor()
    assert.equal(await core.textContent(),'(+15.0%)')
    assert.equal(await panel.locator('[data-section-title="鞋子推荐"] .sobp-win-delta').textContent(),'(+10.0%)')
    assert.equal(await panel.locator('.sobp-grid .sobp-win-delta').textContent(),'(+5.0%)')
    assert.equal(await panel.locator('.sobp-last-item .sobp-win-delta.is-negative').textContent(),'(-5.0%)')
    assert.equal(await panel.locator('.sobp-augment .sobp-win-delta').textContent(),'(+5.0%)')
    assert.equal(await panel.locator('[data-section-title="出门装推荐"]').count(),0)
    assert.equal(startingPageRequests,0)
    await panel.locator('.sobp-close').click()
    console.log('[verify] Mayhem spells, boots and fallback equipment use their own baseline; augments retain Mayhem baseline; no starting section or page request')
  } finally {
    page.off('request',watch)
    await page.unroute('**/data/champions-stats.json')
    await page.unroute('**/data/champion-details/*.json')
    await page.unroute('**/api/global/champions/aram/**')
    await page.evaluate(()=>document.getElementById('qa-mayhem-delta-anchor')?.remove())
  }
}
