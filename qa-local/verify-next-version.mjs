import assert from 'node:assert/strict'
import path from 'node:path'
export async function verifyNextVersion(page,out,games) {
  await page.evaluate(async (games)=>{
    const react=await import('/node_modules/.vite/deps/react.js'),dom=await import('/node_modules/.vite/deps/react-dom_client.js')
    const {store}=await import('/src/lib/store.ts')
    const {OpggBuildRecommendationPanel}=await import('/src/components/ui/OpggBuildRecommendationPanel.tsx')
    const {SettingsPage}=await import('/src/components/pages/SettingsPage.tsx')
    const {UpdatePage}=await import('/src/components/pages/UpdatePage.tsx')
    const {DEFAULT_RECOMMENDATION_PREFERENCES,normalizeRecommendationPreferences,hasEnoughSamples}=await import('/src/lib/recommendation-filter.ts')
    const saved=store.getAll();window.qaNextSaved=saved
    store.set('recommendationPreferences',normalizeRecommendationPreferences(DEFAULT_RECOMMENDATION_PREFERENCES))
    if(!hasEnoughSamples(NaN,500)||!hasEnoughSamples(undefined,500)||hasEnoughSamples(0,500)||!hasEnoughSamples(500,500))throw Error('Missing/zero/boundary sample filtering')
    const host=document.createElement('div');host.id='qa-next';host.style.cssText='position:fixed;inset:0;z-index:200000;background:#010a13;overflow:auto'
    document.body.append(host);const root=(dom.default??dom).createRoot(host),React=react.default??react
    const counts=[50,100,500,20000,NaN]
    const builds=counts.map((play,i)=>({ids:[6617,3504,3089+i],play,win:play*.5,winRate:.5+i*.03,pick_rate:.5-i*.08}))
    const recommendation={mode:'aram',modeLabel:'海克斯大乱斗',position:'none',version:'16.22',sourceLabel:'离线测试',summary:['总体胜率 50.0%','登场 7.2%','Tier C'],meta:{rank:1,previousRank:null,rankDelta:null,totalRank:null,matchCount:10000,version:'16.22',updatedAt:''},baselineWinRate:.5,coreItems:builds,starterItems:builds,boots:builds,lastItems:builds,prismItems:builds,summonerSpells:[],runePages:counts.map((play,i)=>({id:i,play,win:play*.5,pick_rate:.5,primary_page_id:8200,primary_rune_ids:[8214,8234,8210,8237],secondary_page_id:8400,secondary_rune_ids:[8453,8444],stat_mod_ids:[5008,5008,5002]})),augments:[{rarity:4,items:counts.map((sampleCount,i)=>({id:101+i,sampleCount,pickRate:.5-i*.08,winRate:.4+i*.08}))}]}
    const render=(kind='build',mode='mayhem')=>root.render(React.createElement(kind==='settings'?SettingsPage:kind==='update'?UpdatePage:OpggBuildRecommendationPanel,kind==='build'?{context:{championId:76,queueId:mode==='mayhem'?2400:mode==='ranked'?420:mode==='arena'?1700:450,gameVersion:'16.22',gameMode:mode==='ranked'?'CLASSIC':'ARAM',position:'none'},recommendation:{...recommendation,mode:mode==='ranked'?'ranked':mode==='arena'?'arena':'aram'},loadError:'',isLoading:false,selectedTier:'all',onTierChange(){},onPositionChange(){},onClose(){}}:{}))
    window.qaNext={render,root,store};render()
  },games)
  const host=page.locator('#qa-next')
  await host.getByRole('group',{name:'装备最低场数',exact:true}).waitFor()
  assert.equal(await host.locator('.sobp-overview .sobp-summary-card').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)')
  assert.equal(await host.getByRole('group',{name:'装备最低场数',exact:true}).evaluate(el=>Boolean(el.closest('.sobp-equipment-sort'))),true)
  assert.equal(await host.getByRole('group',{name:'海克斯最低场数',exact:true}).evaluate(el=>Boolean(el.closest('.sobp-augment-filters'))),true)
  const titleBox=await host.locator('.sobp-title-name').boundingBox(),statsBox=await host.locator('.sobp-overview').boundingBox(),headerBox=await host.locator('.sobp-titlebar').boundingBox()
  assert.ok(Math.abs(titleBox.y+titleBox.height/2-statsBox.y-statsBox.height/2)<12)
  assert.ok(statsBox.x>titleBox.x+titleBox.width+60)
  assert.ok(statsBox.x+statsBox.width>headerBox.x+headerBox.width-90)
  assert.ok(headerBox.height<95)
  await host.locator('.sobp-titlebar').screenshot({path:path.join(out,'配装标题_右侧统计同行_模拟.png')})
  for(const width of [1000,560]) {
    await page.setViewportSize({width,height:720})
    assert.equal(await host.locator('.sobp-titlebar').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true)
    if(width===560)await host.locator('.sobp-titlebar').screenshot({path:path.join(out,'配装标题_窄窗口_模拟.png')})
  }
  await page.setViewportSize({width:1450,height:940})
  const core=host.getByTestId('three-item-builds')
  assert.equal(await core.locator('.sobp-row').count(),5)
  await host.getByRole('group',{name:'装备最低场数',exact:true}).getByRole('button',{name:'≥500场',exact:true}).click()
  assert.equal(await core.locator('.sobp-row').count(),3)
  await host.getByRole('group',{name:'海克斯最低场数',exact:true}).getByRole('button',{name:'≥20000场',exact:true}).click()
  assert.equal(await host.locator('.sobp-augment').count(),2)
  await host.getByRole('group',{name:'海克斯排序',exact:true}).getByRole('button',{name:'选取率优先',exact:true}).click()
  await host.getByRole('group',{name:'装备排序',exact:true}).getByRole('button',{name:'胜率优先',exact:true}).click()
  await host.screenshot({path:path.join(out,'下一版本_样本过滤与排序_模拟.png')})
  for(const mode of ['ranked','aram','arena','mayhem']){
    await page.evaluate(mode=>window.qaNext.render('build',mode),mode)
    await host.getByRole('group',{name:'装备排序',exact:true}).getByRole('button',{name:'胜率优先',exact:true}).waitFor()
    assert.equal(await host.getByRole('group',{name:'装备排序',exact:true}).getByRole('button',{name:'胜率优先',exact:true}).getAttribute('aria-pressed'),'true')
    assert.equal(await core.locator('.sobp-row').count(),3)
    if(mode==='ranked'){
      await host.getByRole('group',{name:'符文最低场数',exact:true}).getByRole('button',{name:'≥2000场',exact:true}).click()
      assert.equal(await host.locator('.sobp-rune-actions').count(),2)
    }
  }
  const persisted=await page.evaluate(async()=>{const {normalizeRecommendationPreferences}=await import('/src/lib/recommendation-filter.ts');const fresh=new window.qaNext.store.constructor();return normalizeRecommendationPreferences(fresh.get('recommendationPreferences'))});
  assert.equal(persisted.equipmentOrder,'win');assert.equal(persisted.augmentOrder,'pick');assert.equal(persisted.levels.items,2)
  await page.evaluate(()=>window.qaNext.render('settings'))
  await host.getByRole('spinbutton',{name:'装备第2档场数',exact:true}).fill('700')
  await host.getByRole('button',{name:'保存装备档位',exact:true}).click()
  assert.equal(await page.evaluate(()=>window.qaNext.store.get('recommendationPreferences').presets.items[1]),700)
  await page.evaluate(()=>window.qaNext.render())
  await host.getByRole('group',{name:'装备最低场数',exact:true}).getByRole('button',{name:'≥700场',exact:true}).waitFor()
  assert.equal(await host.getByRole('group',{name:'海克斯排序',exact:true}).getByRole('button',{name:'选取率优先',exact:true}).getAttribute('aria-pressed'),'true')
  await page.evaluate(()=>{window.qaNext.store.set('releaseAnnouncement',{currentVersion:'1.0.0',latestVersion:'1.0.0',releaseName:'Sona Plus v1.0.0',releaseBody:'离线公告测试',releaseUrl:'https://github.com/chii-primenumber/sona-plus/releases/tag/v1.0.0',publishedAt:''});window.qaNext.render('update')})
  await host.getByText('离线公告测试',{exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>window.qaNext.store.get('readAnnouncementVersion')),'1.0.0')
  await host.screenshot({path:path.join(out,'下一版本_更新公告_模拟.png')})
  await page.evaluate(()=>{window.qaNext.root.unmount();document.getElementById('qa-next').remove();for(const key of ['recommendationPreferences','releaseAnnouncement','readAnnouncementVersion'])window.qaNext.store.set(key,window.qaNextSaved[key])})
  console.log('[verify] header transparency, all-mode sample filters, missing/zero/boundary counts, editable presets, remembered sorting and cached announcement passed')
}
