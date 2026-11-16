import { selectOption } from './select-option.mjs'
import assert from 'node:assert/strict'
import path from 'node:path'

export async function verifyCompareAndTooltip(page, profile, games, out) {
  await profile.locator('.rh-header-actions').evaluate((node)=>{
    const button=document.createElement('button');button.id='qa-click-tooltip';button.title='原生入口提示';button.textContent='提示测试';node.append(button)
  })
  const legacy=profile.locator('#qa-click-tooltip')
  await legacy.hover();await page.getByRole('tooltip').getByText('原生入口提示',{exact:true}).waitFor()
  await legacy.click();await page.waitForTimeout(80)
  assert.equal(await page.getByRole('tooltip').filter({hasText:'原生入口提示'}).count(),0)
  await legacy.evaluate((node)=>node.blur());await page.mouse.move(4,4);await legacy.focus()
  await page.getByRole('tooltip').getByText('原生入口提示',{exact:true}).waitFor()
  await legacy.press('Enter');await page.waitForTimeout(80)
  assert.equal(await page.getByRole('tooltip').filter({hasText:'原生入口提示'}).count(),0)
  await page.mouse.move(4,4);await legacy.hover()
  await page.getByRole('tooltip').getByText('原生入口提示',{exact:true}).waitFor()
  await legacy.evaluate((node)=>node.remove());await page.mouse.move(4,4)
  const refresh=profile.getByRole('button',{name:'刷新',exact:true})
  await refresh.hover()
  await page.getByRole('tooltip').getByText('刷新',{exact:true}).waitFor()
  await refresh.click()
  await profile.locator('.rh-match').first().waitFor()
  await page.waitForTimeout(120)
  assert.equal(await page.getByRole('tooltip').filter({hasText:/^刷新$/}).count(),0,'clicked refresh tooltip must stay hidden without moving the mouse')
  await refresh.evaluate((node)=>node.blur())
  await page.mouse.move(4,4);await refresh.focus()
  await page.getByRole('tooltip').getByText('刷新',{exact:true}).waitFor()
  await refresh.press('Enter')
  await profile.locator('.rh-match').first().waitFor()
  assert.equal(await page.getByRole('tooltip').filter({hasText:/^刷新$/}).count(),0)

  const manualId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  const manual={puuid:manualId,gameName:'手动玩家',tagLine:'DEMO',summonerId:9001,profileIconId:1,summonerLevel:100}
  const other=games.slice(0,3).map((entry)=>({...entry,json:{...entry.json,gameId:entry.json.gameId+100000,
    participants:entry.json.participants.map((player,index)=>index===2?{...player,puuid:manualId,riotIdGameName:'手动玩家',riotIdTagline:'DEMO'}:player),
  }}))
  let reads=0,slow=false
  const alias=async(route)=>{
    const name=new URL(route.request().url()).searchParams.get('gameName')
    if(name==='手动玩家'||name==='慢速玩家'){
      if(name==='慢速玩家'){slow=true;await new Promise((resolve)=>setTimeout(resolve,350))}
      return route.fulfill({json:manual}).catch(()=>{})
    }
    return route.fallback()
  }
  const puuid=(route)=>route.fulfill({json:manual})
  const matches=(route)=>{
    if(route.request().method()!=='GET'||!route.request().url().includes(manualId))return route.fallback()
    reads++;return route.fulfill({json:{games:other},headers:{'access-control-allow-origin':'*'}})
  }
  await page.route('**/lol-summoner/v1/alias/lookup?*',alias)
  await page.route(`**/lol-summoner/v2/summoners/puuid/${manualId}`,puuid)
  await page.route('**/match-history-query/**',matches)
  const compare=page.getByTestId('player-compare')
  try {
    await profile.getByRole('button',{name:'玩家对比',exact:true}).click()
    await compare.locator('.rh-compare-table').waitFor()
    assert.equal(await compare.locator('.rh-chart-hint').count(),0)
    assert.equal(await compare.getByRole('button',{name:'刷新',exact:true}).textContent(),'')
    await compare.getByLabel('选择对比玩家').click()
    const candidate=await page.getByRole('listbox').getByRole('option').nth(2).getAttribute('data-value')
    await page.keyboard.press('Escape')
    await selectOption(page,compare.getByLabel('选择对比玩家'),candidate)
    await compare.getByRole('button',{name:'刷新',exact:true}).click()
    await compare.locator('.rh-compare-table').waitFor()
    assert.equal(await compare.getByLabel('选择对比玩家').getAttribute('data-value'),candidate,'refresh preserves selected loaded candidate')
    const input=compare.getByRole('searchbox',{name:'输入对比玩家 ID',exact:true})
    await input.fill('手动玩家＃DEMO');await input.press('Enter')
    await compare.getByRole('columnheader',{name:'手动玩家#DEMO',exact:true}).waitFor()
    assert.equal(reads,1)
    assert.match(await compare.locator('.rh-compare-samples').textContent(),/各自近期对局.*\/ 3/)
    assert.equal(await compare.locator('.rh-compare-table tbody tr').count(),9)
    await input.fill(manualId);await input.press('Enter')
    await compare.getByRole('columnheader',{name:'手动玩家#DEMO',exact:true}).waitFor()
    await page.waitForFunction(()=>!document.querySelector('[data-testid="player-compare"] .rh-spinner'))
    assert.equal(reads,1,'reselecting a cached manual player does not refetch history')
    await compare.getByRole('button',{name:'刷新',exact:true}).click()
    await compare.getByRole('columnheader',{name:'手动玩家#DEMO',exact:true}).waitFor()
    assert.ok(reads>=2)
    await compare.screenshot({path:path.join(out,'玩家对比_手动ID与图标刷新_模拟.png')})
    await input.fill('练习星轨#DEMO');await input.press('Enter')
    await compare.getByRole('alert').getByText('请选择其他玩家进行对比。',{exact:true}).waitFor()
    assert.equal(await compare.locator('.rh-spinner').count(),0)
    await input.fill('慢速玩家#DEMO');await input.press('Enter')
    for(let i=0;i<100&&!slow;i++)await page.waitForTimeout(10)
    assert.equal(slow,true)
    await input.fill('手动玩家#DEMO');await input.press('Enter')
    await compare.getByRole('columnheader',{name:'手动玩家#DEMO',exact:true}).waitFor()
    await page.waitForTimeout(400)
    assert.equal(await compare.getByLabel('选择对比玩家').getAttribute('data-value'),manualId)
    await page.setViewportSize({width:700,height:720})
    assert.equal(await compare.evaluate((node)=>node.scrollWidth<=node.clientWidth+1),true)
    await page.setViewportSize({width:1450,height:940})
    await input.fill('慢速玩家#DEMO');await input.press('Enter')
    await page.keyboard.press('Escape');await compare.waitFor({state:'hidden'})
    await page.waitForTimeout(400)
    assert.equal(await compare.isVisible(),false,'closed lookup cannot reopen compare')
    console.log('[verify] manual Riot ID/PUUID comparison, independent samples, refresh, cancellation and mouse/keyboard tooltip dismissal passed')
  } finally {
    await page.unroute('**/lol-summoner/v1/alias/lookup?*',alias)
    await page.unroute(`**/lol-summoner/v2/summoners/puuid/${manualId}`,puuid)
    await page.unroute('**/match-history-query/**',matches)
  }
}
