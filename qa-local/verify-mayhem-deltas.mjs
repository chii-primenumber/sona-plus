import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

export async function verifyMayhemDeltas(page) {
  let pages=0,opgg=0,fail=false,failDetails=false,pageHtml
  const icon=(id,kind='item')=>`<img src="https://cdn.dtodo.cn/hextech/${kind}-icons/${id}.png">`
  const html=`<section data-recommendation-group><h2>Summoner Spells</h2><article>${icon(4,'summoner-spell')}${icon(32,'summoner-spell')}Pick Rate: 80% Win Rate: 55%</article></section><section data-champion-builds>
    <button data-build-index="0">AD Bruiser 55%</button><button data-build-index="1">Lethality 45%</button>
    <div data-build-panel="0"><div><h3>Core Items</h3><div><div>${icon(6617)}${icon(3504)}${icon(6621)}Win Rate: 60% Pick Rate: 30%</div></div></div><div><h3>Situational Items (Top 12)</h3><div>${icon(3158)}${icon(3089)}</div></div></div>
    <div data-build-panel="1"><div><h3>Core Items</h3><div><div>${icon(6617)}${icon(3504)}${icon(6621)}Win Rate: 40% Pick Rate: 20%</div></div></div><div><h3>Situational Items (Top 12)</h3><div>${icon(3020)}</div></div></div></section>`
  pageHtml=html
  await page.route('**/data/champions-stats.json',(route)=>route.fulfill({json:[16,799].map((id)=>({championId:String(id),tier:'1',winRate:.5,numWinGames:50,numGames:100,pickRate:.1,version:'fixture',date:'2026-11-16',source:'fixture',region:'CN',rank:1,rankDelta:0}))}))
  await page.route('**/data/champion-details/*.json',(route)=>route.fulfill({status:failDetails?503:200,json:{championId:'16',championAugments:[['16',JSON.stringify({augments:{101:{tier:'1',num_win_games:'55',win_rate:'.55',num_games:'100',pick_rate:'.2'}}}),'fixture','2026-11-16']]}}))
  await page.route('**/en/champion-stats/*',(route)=>{pages++;return route.fulfill({status:fail?503:200,contentType:'text/html',body:pageHtml})})
  await page.route('**/api/global/champions/aram/**',(route)=>{opgg++;return route.fulfill({status:503,json:{}})})
  const open=(id,gameMode='KIWI')=>page.evaluate(async({id,gameMode})=>{
    let anchor=document.getElementById('qa-mayhem-delta-anchor')
    if(!anchor){anchor=document.createElement('button');anchor.id='qa-mayhem-delta-anchor';anchor.style.cssText='position:fixed;bottom:12px;left:12px';document.body.append(anchor)}
    await (await import('/src/lib/features/opgg-build-recommendation.ts')).openOpggBuildRecommendationDebugPanel(anchor,id,{queueId:2400,gameMode,position:'none'})
  },{id,gameMode})
  try {
    const real=await fs.readFile(path.join(import.meta.dirname,'fixtures/aramgg-mayhem-799-builds.html'),'utf8')
    const parsed=await page.evaluate(async(html)=>(await import('/src/lib/aramgg-api.ts')).parseAramggMayhemBuilds(html),real)
    assert.equal(parsed.groups.length,4)
    assert.deepEqual(parsed.groups[0].coreItems[0].ids,[6692,3111,3161])
    assert.equal(parsed.groups[0].coreItems[0].winRate,.491)
    assert.equal(parsed.groups[0].winRate,.496)
    assert.ok(parsed.groups.every((group)=>group.items.length===12&&group.items.every((item)=>item.winRate===null&&item.pickRate===null)))
    assert.ok(parsed.spells.length>=3)
    await open(16)
    const panel=page.locator('#sona-opgg-build-panel'),core=panel.locator('.sobp-core-builds .sobp-win-delta')
    await core.waitFor()
    const iconTip=panel.locator('.sobp-core-builds .sobp-icon-tooltip-wrap').first()
    await iconTip.hover();await page.locator('.sobp-official-tooltip--ready').waitFor()
    await iconTip.click()
    assert.equal(await page.locator('.sobp-official-tooltip').count(),0)
    await iconTip.evaluate((node)=>node.blur());await page.mouse.move(4,4);await iconTip.focus()
    await page.locator('.sobp-official-tooltip--ready').waitFor()
    await iconTip.press('Enter')
    assert.equal(await page.locator('.sobp-official-tooltip').count(),0)
    assert.equal(await core.textContent(),'(+5.0%)')
    assert.equal(await panel.locator('.sobp-grid .sobp-win-delta').textContent(),'(+5.0%)')
    assert.equal(await panel.locator('.sobp-augment .sobp-win-delta').textContent(),'(+5.0%)')
    assert.equal(await panel.locator('.sobp-last-item .sobp-win-delta').count(),0)
    assert.equal(await panel.locator('.sobp-last-item .sobp-win-rate strong').first().textContent(),'—')
    assert.equal(await panel.locator('[data-section-title="出门装推荐"]').count(),0)
    await panel.locator('.sobp-build-filter .sona-select-trigger').click()
    await panel.getByRole('button',{name:'穿甲',exact:true}).click()
    assert.equal(await core.textContent(),'(-5.0%)')
    assert.equal(pages,1)
    assert.equal(opgg,0)
    await panel.locator('.sobp-close').click()
    fail=true;await open(17,'ARAM')
    await panel.getByText('海斗装备数据暂不可用。',{exact:true}).waitFor()
    assert.equal(await panel.locator('.sobp-core-builds .sobp-row').count(),0)
    assert.equal(opgg,0,'queue 2400 never falls back to ordinary ARAM')
    await panel.locator('.sobp-close').click()
    fail=false;failDetails=true;pageHtml=real
    await open(799,'ARAM')
    await panel.locator('.sobp-core-builds .sobp-row').first().waitFor()
    assert.equal(await panel.locator('.sobp-core-builds .sobp-row').count(),3)
    assert.equal(await panel.locator('.sobp-core-builds .sobp-win-delta').first().textContent(),'(-0.5%)')
    assert.equal(opgg,0)
    await panel.locator('.sobp').screenshot({path:path.join(import.meta.dirname,'../../sona-preview/海斗公开出装_流派数据_模拟.png')})
    await panel.locator('.sobp-close').click()
    console.log('[verify] public Mayhem builds, archetype baselines, missing individual rates, queue detection and no ordinary ARAM fallback passed')
  } finally {
    await page.unroute('**/data/champions-stats.json');await page.unroute('**/data/champion-details/*.json')
    await page.unroute('**/en/champion-stats/*');await page.unroute('**/api/global/champions/aram/**')
    await page.evaluate(()=>document.getElementById('qa-mayhem-delta-anchor')?.remove())
  }
}
