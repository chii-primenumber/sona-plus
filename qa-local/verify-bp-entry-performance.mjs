import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
export async function verifyBpEntryPerformance(page,out,bp){
 await page.evaluate(async base=>{
  const {lcu}=await import('/src/lib/lcu.ts'),{store}=await import('/src/lib/store.ts'),{opggApi}=await import('/src/lib/opgg-api.ts')
  const old={session:lcu.getChampSelectSession,phase:lcu.getGameflowPhase,champion:opggApi.getChampion,enabled:store.get('opggBuildRecommendation')}
  const session=structuredClone(base);session.queueId=440;session.actions=[];session.myTeam[0].championId=0;session.myTeam[0].championPickIntent=157;session.myTeam[0].assignedPosition='support'
  const calls=[];window.qaBpFix={old,lcu,store,opggApi,session,calls}
  lcu.getChampSelectSession=async()=>structuredClone(window.qaBpFix.session);lcu.getGameflowPhase=async()=> 'ChampSelect'
  opggApi.getChampion=options=>{calls.push(options.id);return old.champion.call(opggApi,options)}
  store.set('opggBuildRecommendation',true)
 },bp)
 await page.getByRole('button',{name:'模拟 BP',exact:true}).click()
 const native=page.locator('.toggle-ability-previews-button')
 await native.getByText('配装推荐',{exact:true}).waitFor()
 assert.equal(await page.locator('[data-sona-opgg-preselect-build]').count(),0)
 const view=page.locator('.sona-game-tools'),tabs=page.getByRole('group',{name:'对局工具切换',exact:true}),close=page.getByRole('button',{name:'关闭对局工具',exact:true})
 const open=async id=>{await native.click();await view.locator(`.sobp-champion-ring img[src$="/${id}.png"]`).waitFor();await page.waitForFunction(()=>!document.querySelector('.sona-game-tools .sobp-body')?.textContent.includes('加载中'))}
 await open(157);assert.equal(await page.locator('#sona-opgg-build-panel').count(),0);await close.click();await view.waitFor({state:'detached'})
 // A click must read the current session even if a change event was missed.
 await page.evaluate(()=>{window.qaBpFix.session.myTeam[0].championPickIntent=103})
 await open(103)
 // An already-open panel must also follow subsequent hero changes.
 await page.evaluate(()=>{window.qaBpFix.session.myTeam[0].championPickIntent=157;window.qaEmit('/lol-champ-select/v1/session',structuredClone(window.qaBpFix.session))})
 await view.locator('.sobp-champion-ring img[src$="/157.png"]').waitFor()
 await tabs.getByRole('button',{name:'对局详情',exact:true}).click()
 await view.getByTestId('bp-history').locator('.rh-team-card-stats').nth(4).waitFor()
 await tabs.getByRole('button',{name:'配装推荐',exact:true}).click()
 await view.screenshot({path:path.join(out,'BP原生配装入口_同步滑块_模拟.png')})
 await close.click();await view.waitFor({state:'detached'});await page.waitForTimeout(450)
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable')
 const read=async()=>{await cdp.send('HeapProfiler.collectGarbage');const {metrics}=await cdp.send('Performance.getMetrics');const metricsObject=Object.fromEntries(metrics.map(row=>[row.name,row.value]));return {...metricsObject,...await page.evaluate(()=>({elements:document.querySelectorAll('*').length,overlays:document.querySelectorAll('.sona-modal-overlay').length,workspaces:document.querySelectorAll('.sona-game-tools').length,legacy:document.querySelectorAll('#sona-opgg-build-panel,[data-sona-opgg-preselect-build]').length,fetches:window.sonaPerf?.fetches??0,longTasks:window.sonaPerf?.longTasks.length??0,calls:window.qaBpFix.calls.length}))}}
 const before=await read(),timings=[],snapshots=[]
 for(let index=0;index<10;index++){
  const started=Date.now();await open(157)
  for(let turn=0;turn<2;turn++){
   await tabs.getByRole('button',{name:'对局详情',exact:true}).click()
   await tabs.getByRole('button',{name:'配装推荐',exact:true}).click()
  }
  await close.click();await view.waitFor({state:'detached'});await page.waitForTimeout(450)
  timings.push(Date.now()-started);if(index===4||index===9)snapshots.push(await read())
 }
 const after=await read(),result={scenario:'10 opens/closes, 40 warm tab switches; simulated BP with five players',before,after,snapshots,requestIncrease:after.calls-before.calls,heapChangeMiB:(after.JSHeapUsedSize-before.JSHeapUsedSize)/1048576,scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000,taskMs:(after.TaskDuration-before.TaskDuration)*1000,layoutMs:(after.LayoutDuration-before.LayoutDuration)*1000,cycleMs:timings}
 assert.equal(after.legacy,0);assert.equal(after.workspaces,0);assert.equal(after.overlays,before.overlays);assert.equal(result.requestIncrease,0)
 assert.ok(after.elements<=before.elements+5,JSON.stringify({before:before.elements,after:after.elements}))
 await fs.writeFile(path.join(out,'BP入口修复_性能检查.json'),JSON.stringify(result,null,2))
 console.log('[performance-bp]',JSON.stringify(result))
 await cdp.detach()
 await page.evaluate(()=>{const {old,lcu,store,opggApi}=window.qaBpFix;opggApi.getChampion=old.champion;lcu.getChampSelectSession=old.session;lcu.getGameflowPhase=old.phase;store.set('opggBuildRecommendation',old.enabled)})
}
