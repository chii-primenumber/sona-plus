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
  assert.ok(Math.abs(parsed.coreItems[0].pick_rate-450898/1825685)<1e-12)
  assert.equal(parsed.coreItems.length,detail.builds.unfiltered.archetypes.reduce((sum,group)=>sum+group.profiles.length,0))
  assert.equal(parsed.itemGroups,undefined)
  assert.equal(parsed.lastItems[0].ids[0],6333)
  assert.equal(parsed.lastItems[0].winRate,.5485)
  assert.equal(parsed.lastItems[0].baselineWinRate,.5282)
  for(const build of parsed.lastItems)assert.equal(parsed.assets.items[build.ids[0]].isBoots,false)
  const merged=await page.evaluate(async({detail,resources,version})=>{
    const copy=structuredClone(detail),original=copy.builds.unfiltered.archetypes[0].profiles[0]
    copy.builds.unfiltered.archetypes[1].profiles.push({...original,itemSet:[...original.itemSet].reverse(),sampleCount:1000,winRate:.2})
    return (await import('/src/lib/aramkit-api.ts')).parseAramKitRecommendation(copy,resources,version,799).coreItems[0]
  },{detail,resources,version})
  assert.equal(merged.play,451898)
  assert.ok(Math.abs(merged.pick_rate-451898/1825685)<1e-12)
  assert.ok(Math.abs(merged.winRate-(450898*.5743+1000*.2)/451898)<1e-12)
  const invalid=await page.evaluate(async({detail,resources,version})=>{
    const {parseAramKitRecommendation}=await import('/src/lib/aramkit-api.ts')
    try{parseAramKitRecommendation({data:detail},resources,version,799);return false}catch{return true}
  },{detail,resources,version})
  assert.equal(invalid,true)
  const withoutShoes=await page.evaluate(async({detail,resources,version})=>{
    const copy=structuredClone(detail)
    copy.items.unfiltered.all.push({rank:99,id:3111,sampleCount:10,winRate:1,pickRate:1})
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
    const shoeLayout=await panel.locator('[data-section-title="鞋子推荐"] .sobp-equipment-card').evaluateAll((nodes)=>nodes.map((node)=>{const box=node.getBoundingClientRect();return {top:box.top,width:box.width,height:box.height}}))
    assert.ok(shoeLayout.length>1)
    assert.ok(shoeLayout.every((box)=>box.height<100&&box.width<350),JSON.stringify(shoeLayout))
    assert.ok(shoeLayout.filter((box)=>Math.abs(box.top-shoeLayout[0].top)<2).length>=2,JSON.stringify(shoeLayout))
    assert.equal(await panel.locator('.sobp-last-item').count(),10)
    const completedLayout=await panel.locator('.sobp-last-item').evaluateAll((nodes)=>nodes.map((node)=>{const box=node.getBoundingClientRect();return {top:box.top,scroll:node.scrollWidth,client:node.clientWidth}}))
    assert.equal(completedLayout.filter((box)=>Math.abs(box.top-completedLayout[0].top)<2).length,5)
    assert.equal(new Set(completedLayout.map((box)=>Math.round(box.top))).size,2)
    assert.ok(completedLayout.every((box)=>box.scroll<=box.client+1))
    assert.equal(await panel.locator('.sobp-last-item .sobp-win-delta').first().textContent(),'(+2.0%)')
    assert.equal(await panel.locator('[data-section-title="出门装推荐"]').count(),0)
    const laterIds=await panel.locator('.sobp-last-item img.sobp-icon').evaluateAll((images)=>images.map((image)=>Number(image.src.match(/\/item\/(\d+)-/)[1])))
    assert.ok(laterIds.every((id)=>!items[String(id)].categories.includes('Boots')))
    await panel.getByRole('button',{name:'后续成装推荐：展开全部',exact:true}).click()
    assert.equal(await panel.locator('.sobp-last-item').count(),parsed.lastItems.length)
    await panel.getByRole('button',{name:'后续成装推荐：部分显示',exact:true}).click()
    assert.equal(await panel.locator('.sobp-last-item').count(),10)
    const tip=panel.locator('.sobp-core-builds .sobp-icon-tooltip-wrap').first()
    await tip.hover();await page.locator('.sobp-official-tooltip--ready').waitFor();await tip.click()
    assert.equal(await page.locator('.sobp-official-tooltip').count(),0)
    assert.equal(await panel.locator('.sobp-build-filter').count(),0)
    const sort=panel.getByRole('group',{name:'装备排序',exact:true})
    await sort.getByRole('button',{name:'胜率优先',exact:true}).click()
    const expectedWin=[...parsed.lastItems].sort((a,b)=>b.winRate-a.winRate||b.pick_rate-a.pick_rate)
    assert.equal(await panel.locator('.sobp-last-item img.sobp-icon').first().getAttribute('src'),parsed.assets.items[expectedWin[0].ids[0]].iconPath)
    await sort.getByRole('button',{name:'选取率优先',exact:true}).click()
    assert.equal(await panel.locator('.sobp-last-item img.sobp-icon').first().getAttribute('src'),parsed.assets.items[parsed.lastItems[0].ids[0]].iconPath)
    assert.equal(await sort.locator('[aria-pressed="true"]').count(),1)
    assert.equal(await sort.locator('.sona-segmented-thumb').count(),1)
    assert.equal(detailCalls,1,'sorting reuses loaded overall data')
    assert.equal(legacyCalls,0,'Mayhem recommendations never read the old providers')
    await panel.screenshot({path:path.join(import.meta.dirname,'../../sona-preview/ARAMKit全部出装与滑块排序_模拟.png')})
    await panel.locator('.sobp-close').click()
    fail=true;await open(800)
    await panel.getByText(/ARAMKit 请求失败/).waitFor()
    assert.equal(await panel.locator('.sobp-core-builds .sobp-row').count(),0)
    assert.equal(legacyCalls,0)
    await panel.locator('.sobp-close').click()
    console.log('[verify] ARAMKit pooled core rates, overall items, pick/win slider sorting, ten items without boots and no legacy fallback passed')
  }finally{
    await page.unroute('https://data.aramkit.cn/**',source);await page.unroute('https://aramgg.com/**',legacy)
    await page.unroute('https://lol-api-champion.op.gg/api/global/champions/aram/**',legacy)
    await page.evaluate(()=>document.getElementById('qa-kit-anchor')?.remove())
  }
}
