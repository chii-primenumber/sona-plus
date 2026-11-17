import assert from 'node:assert/strict'
import path from 'node:path'
export async function verifyRoomWorkspace(page,out,games){
 const tiers=await page.evaluate(async()=>{
  const {AramKitDataApi}=await import('/src/lib/aramkit-api.ts')
  const original=window.fetch
  window.fetch=async url=>new Response(JSON.stringify(String(url).includes('versions.json')?{latest:'16.22',versions:[{version:'16.22',dataPath:'data/fixture',resourcePath:'resources/fixture'}]}:{rows:['S','A','B','C','D','unknown'].map((tier,i)=>({id:i+1,tier,winRate:.5}))}),{status:200})
  try{return [...await new AramKitDataApi().getChampionTiers()]}finally{window.fetch=original}
 })
 assert.deepEqual(tiers.map(([id,data])=>[id,data.tier]),[[1,1],[2,2],[3,3],[4,4],[5,5]])
 await page.evaluate(async games=>{
  const {lcu}=await import('/src/lib/lcu.ts'),{store}=await import('/src/lib/store.ts')
  const team=await import('/src/lib/features/team-history-overview.ts'),build=await import('/src/lib/features/opgg-build-recommendation.ts')
  const old={getLobby:lcu.getLobby,getPhase:lcu.getGameflowPhase,observe:lcu.observe,enabled:store.get('teamHistoryOverview')}
  team.updateTeamHistoryOverview(false)
  const players=games[0].json.participants.map((p,i)=>({puuid:p.puuid,summonerId:i+100,summonerName:p.riotIdGameName,teamId:i<5?100:200,isBot:false,isSpectator:false}))
  const lobby={gameConfig:{isCustom:true,queueId:2400,customTeam100:[...players.slice(0,5),{puuid:'bot-player',isBot:true}],customTeam200:players.slice(5),customSpectators:[{puuid:'spectator'}]},members:[...players,{puuid:'spectator',isSpectator:true,teamId:100}]}
  const listeners=new Map();let calls=0
  lcu.getLobby=async()=>{calls++;return lobby};lcu.getGameflowPhase=async()=> 'Lobby'
  lcu.observe=(uri,callback)=>{const callbacks=listeners.get(uri)||new Set();callbacks.add(callback);listeners.set(uri,callbacks);return()=>callbacks.delete(callback)}
  const host=document.createElement('div');host.id='qa-custom-room';host.style.cssText='position:fixed;top:130px;left:600px;width:230px;height:150px;z-index:15000;background:#010a13'
  host.innerHTML='<lol-uikit-flat-button disabled class="qa-native-spectate disabled" style="display:block;position:relative;width:192px;height:42px;border:2px solid #987c42;background:#1e2328;color:#cdbe91;box-sizing:border-box">观战</lol-uikit-flat-button>'
  document.body.append(host)
  team.updateTeamHistoryOverview(true)
  window.qaRoom={old,team,build,lcu,host,listeners,lobby,getCalls:()=>calls}
 },games)
 const native=page.locator('#qa-custom-room .qa-native-spectate').first(),entry=page.locator('#qa-custom-room').getByRole('button',{name:'战绩总览',exact:true})
 await entry.waitFor()
 assert.equal(await entry.getAttribute('disabled'),null)
 const a=await native.boundingBox(),b=await entry.boundingBox();assert.equal(a.width,b.width);assert.ok(Math.abs(b.y-a.y-a.height-8)<1)
 assert.equal(await entry.evaluate(el=>getComputedStyle(el).backgroundColor),await native.evaluate(el=>getComputedStyle(el).backgroundColor))
 await page.locator('#qa-custom-room').screenshot({path:path.join(out,'自定义房间_战绩总览入口_模拟.png')})
 await entry.click()
 const view=page.getByTestId('game-history');await view.locator('.rh-team-card').nth(9).waitFor()
 assert.equal(await view.locator('.rh-team-card').count(),10)
 assert.equal(await page.getByTestId('hex-mayhem-score').count(),0)
 await page.evaluate(()=>{window.qaRoom.card=document.querySelector('[data-testid="game-history"] .rh-team-card');window.qaRoom.beforeCalls=window.qaRoom.getCalls()})
 await page.getByRole('group',{name:'对局工具切换',exact:true}).getByRole('button',{name:'配装推荐',exact:true}).click()
 await page.getByText('自定义房间尚未选定英雄，进入英雄选择后可查看配装推荐。',{exact:false}).waitFor()
 assert.equal(await page.locator('.sona-game-tools .sobp-close').count(),0)
 assert.equal(await page.getByRole('button',{name:'关闭对局工具',exact:true}).count(),1)
 assert.equal(await page.getByRole('button',{name:'关闭对局工具',exact:true}).isVisible(),true)
 assert.equal(await view.isVisible(),false)
 assert.equal(await page.locator('.sona-modal-overlay:visible').count(),1)
 await page.getByRole('group',{name:'对局工具切换',exact:true}).getByRole('button',{name:'战绩总览',exact:true}).click()
 assert.equal(await view.isVisible(),true)
 assert.equal(await page.evaluate(()=>window.qaRoom.card===document.querySelector('[data-testid="game-history"] .rh-team-card')),true)
 assert.equal(await page.evaluate(()=>window.qaRoom.getCalls()===window.qaRoom.beforeCalls),true)
 await page.locator('.sona-game-tools').screenshot({path:path.join(out,'自定义房间_双队战绩与直接切换_模拟.png')})
 await page.evaluate(async()=>{
  const {team,build,lcu,old,listeners,host}=window.qaRoom
  // Native reconstruction must recreate one entry, and leaving the room must remove it.
  const native=host.querySelector('lol-uikit-flat-button');native.replaceWith(native.cloneNode(true))
 })
 await entry.waitFor();assert.equal(await entry.count(),1)
 await page.evaluate(async()=>{
  const state=window.qaRoom;state.build.closeGameToolsWorkspace()
  const popup=await import('/src/lib/features/game-analysis-popup.ts')
  state.oldSession=state.lcu.getGameflowSession
  const session=await state.oldSession.call(state.lcu)
  state.lcu.getGameflowSession=async()=>({...session,gameData:{...session.gameData,gameId:987654321}})
  const uri='/lol-gameflow/v1/gameflow-phase',before=new Set(state.listeners.get(uri)||[])
  popup.updateGameAnalysisPopup(true)
  state.popup=popup;state.popupCallback=[...state.listeners.get(uri)].find(callback=>!before.has(callback))
  state.popupCallback({data:'InProgress'})
 })
 await page.getByRole('group',{name:'对局工具切换',exact:true}).waitFor()
 assert.equal(await page.locator('#sona-game-analysis-root').count(),0)
 assert.equal(await page.getByRole('button',{name:'配装推荐',exact:true}).count(),1)
 await page.getByRole('button',{name:'关闭对局工具',exact:true}).click()
 await page.evaluate(async()=>{const state=window.qaRoom;state.popupCallback({data:'Reconnect'});state.popupCallback({data:'InProgress'});await new Promise(resolve=>setTimeout(resolve,50))})
 assert.equal(await page.locator('.sona-game-tools').count(),0)
 await page.evaluate(()=>{window.qaRoom.popup.updateGameAnalysisPopup(false);window.qaRoom.lcu.getGameflowSession=window.qaRoom.oldSession})
 await page.evaluate(()=>{
  const {team,build,lcu,old,listeners,host}=window.qaRoom
  for(const callback of listeners.get('/lol-lobby/v2/lobby')||[])callback({eventType:'Delete',data:null})
  team.updateTeamHistoryOverview(false);build.closeGameToolsWorkspace();host.remove()
  lcu.getLobby=old.getLobby;lcu.getGameflowPhase=old.getPhase;lcu.observe=old.observe
  team.updateTeamHistoryOverview(old.enabled)
 })
 assert.equal(await page.locator('[data-sona-custom-overview]').count(),0)
 console.log('[verify] native custom-room entry, two teams without bots/spectators, retained tab contents, single overlay, no refetch and phase cleanup passed')
}
