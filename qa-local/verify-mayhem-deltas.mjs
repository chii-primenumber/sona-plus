import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

export async function verifyMayhemDeltas(page) {
  const root=path.join(import.meta.dirname,'fixtures/aramkit')
  const [detail,items,augments,archetypes,versions]=await Promise.all(['champion-799','items','augments','archetypes','versions'].map(async(name)=>JSON.parse(await fs.readFile(path.join(root,name+'.json'),'utf8'))))
  const version=versions.versions[0]
  const resources={items,augments,archetypes}
  const parsed=await page.evaluate(async({detail,resources,version})=>(await import('/src/lib/aramkit-api.ts')).parseAramKitRecommendation(detail,resources,version,799),{detail,resources,version})
  assert.equal(parsed.version,'16.22')
  assert.equal(parsed.baselineWinRate,.5282)
  assert.deepEqual(parsed.coreItems[0].ids,[2517,126697,6333])
  assert.equal(parsed.coreItems[0].winRate,.5743)
  assert.equal(parsed.coreItems[0].baselineWinRate,.5282)
  assert.equal(parsed.itemGroups[0].profiles[0].routes[0].lastItems[0].winRate,.6485)
  assert.equal(parsed.itemGroups[0].profiles[0].routes[0].lastItems[0].baselineWinRate,.6031)
  for(const group of parsed.itemGroups)for(const profile of group.profiles)for(const route of profile.routes)for(const build of route.lastItems)assert.equal(parsed.assets.items[build.ids[0]].isBoots,false)
  const invalid=await page.evaluate(async({detail,resources,version})=>{
    const {parseAramKitRecommendation}=await import('/src/lib/aramkit-api.ts')
    try{parseAramKitRecommendation({data:detail},resources,version,799);return false}catch{return true}
  },{detail,resources,version})
  assert.equal(invalid,true)
  const withoutShoes=await page.evaluate(async({detail,resources,version})=>{
    const copy=structuredClone(detail),route=copy.builds.unfiltered.archetypes[0].profiles[0].routes[0]
    route.laterItems.push({rank:99,item:{id:3111},sampleCount:10,winRate:.5,pickRate:.1})
    return (await import('/src/lib/aramkit-api.ts')).parseAramKitRecommendation(copy,resources,version,799).lastItems.map((item)=>item.ids[0])
  },{detail,resources,version})
  assert.equal(withoutShoes.includes(3111),false,'boots are excluded even when present in a later-item source row')
  let detailCalls=0,legacyCalls=0,fail=false
  const source=async(route)=>{
    const url=new URL(route.request().url()),p=url.pathname
    const json=(body,status=200)=>route.fulfill({status,json:body,headers:{'access-control-allow-origin':'*'}}).catch(()=>{})
    if(p==='/data/versions.json')return json(versions)
    if(p.endsWith('/resources/items.json'))return json(items)
    if(p.endsWith('/resources/augments.json'))return json(augments)
    if(p.endsWith('/resources/archetypes.json'))return json(archetypes)
    if(p.includes('/stats/all/champion-details/')){detailCalls++;return json(detail,fail?503:200)}
    if(p.startsWith('/assets/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#234955"/><path d="m8 36 28-28-8 30z" fill="#c8aa6e"/></svg>'}).catch(()=>{})
    return route.abort().catch(()=>{})
  }
  const legacy=(route)=>{legacyCalls++;return route.fulfill({status:503,json:{}}).catch(()=>{})}
  await page.route('https://data.aramkit.cn/**',source)
  await page.route('https://aramgg.com/**',legacy)
  await page.route('https://lol-api-champion.op.gg/api/global/champions/aram/**',legacy)
  const open=(id)=>page.evaluate(async(id)=>{
    let anchor=document.getElementById('qa-kit-anchor')
    if(!anchor){anchor=document.createElement('button');anchor.id='qa-kit-anchor';anchor.style.cssText='position:fixed;bottom:12px;left:12px';document.body.append(anchor)}
    await (await import('/src/lib/features/opgg-build-recommendation.ts')).openOpggBuildRecommendationDebugPanel(anchor,id,{queueId:2400,gameMode:'ARAM',position:'none'})
  },id)
  try{
    await open(799)
    const panel=page.locator('#sona-opgg-build-panel .sobp')
    await panel.locator('.sobp-core-builds .sobp-row').first().waitFor()
    assert.match(await panel.locator('.sobp-mode-tag').textContent(),/ARAMKit.*16\.22.*原始数据/)
    assert.equal(await panel.locator('.sobp-summary-card--tier').textContent(),'A')
    assert.equal(await panel.locator('.sobp-core-builds .sobp-win-delta').first().textContent(),'(+4.6%)')
    assert.equal(await panel.locator('.sobp-last-item').count(),10)
    assert.equal(await panel.locator('.sobp-last-item .sobp-win-delta').first().textContent(),'(+4.5%)')
    assert.equal(await panel.locator('[data-section-title="出门装推荐"]').count(),0)
    const laterIds=await panel.locator('.sobp-last-item img.sobp-icon').evaluateAll((images)=>images.map((image)=>Number(image.src.match(/\/item\/(\d+)-/)[1])))
    assert.ok(laterIds.every((id)=>!items[String(id)].categories.includes('Boots')))
    await panel.getByRole('button',{name:'后续成装推荐：展开全部',exact:true}).click()
    assert.equal(await panel.locator('.sobp-last-item').count(),parsed.itemGroups[0].profiles[0].routes[0].lastItems.length)
    await panel.getByRole('button',{name:'后续成装推荐：部分显示',exact:true}).click()
    assert.equal(await panel.locator('.sobp-last-item').count(),10)
    const tip=panel.locator('.sobp-core-builds .sobp-icon-tooltip-wrap').first()
    await tip.hover();await page.locator('.sobp-official-tooltip--ready').waitFor();await tip.click()
    assert.equal(await page.locator('.sobp-official-tooltip').count(),0)
    const routeSelect=panel.locator('.sobp-build-filter .sona-select').nth(2)
    await routeSelect.locator('.sona-select-trigger').click();await routeSelect.locator('.sona-select-option').nth(1).click()
    const second=parsed.itemGroups[0].profiles[0].routes[1]
    const delta=Math.round((second.lastItems[0].winRate-second.baselineWinRate)*1000)/10
    assert.equal(await panel.locator('.sobp-last-item .sobp-win-delta').first().textContent(),`(${delta>0?'+':''}${delta.toFixed(1)}%)`)
    const profileSelect=panel.locator('.sobp-build-filter .sona-select').nth(1)
    await profileSelect.locator('.sona-select-trigger').click();await profileSelect.locator('.sona-select-option').nth(1).click()
    assert.equal(await panel.locator('.sobp-build-filter .sona-select').nth(2).locator('.sona-select-trigger').textContent().then((text)=>text.replace(/\s+/g,'')),parsed.itemGroups[0].profiles[1].routes[0].label.replace(/\s+/g,''))
    assert.equal(detailCalls,1,'profile/route switches use the same dataset')
    assert.equal(legacyCalls,0,'Mayhem recommendations never read the old providers')
    await panel.screenshot({path:path.join(import.meta.dirname,'../../sona-preview/ARAMKit海斗出装与十件成装_模拟.png')})
    await panel.locator('.sobp-close').click()
    fail=true;await open(800)
    await panel.getByText(/ARAMKit 请求失败/).waitFor()
    assert.equal(await panel.locator('.sobp-core-builds .sobp-row').count(),0)
    assert.equal(legacyCalls,0)
    await panel.locator('.sobp-close').click()
    console.log('[verify] ARAMKit raw versioned Mayhem data, profile/route statistics, ten completed items without boots and no legacy fallback passed')
  }finally{
    await page.unroute('https://data.aramkit.cn/**',source);await page.unroute('https://aramgg.com/**',legacy)
    await page.unroute('https://lol-api-champion.op.gg/api/global/champions/aram/**',legacy)
    await page.evaluate(()=>document.getElementById('qa-kit-anchor')?.remove())
  }
}
