import assert from 'node:assert/strict'
import path from 'node:path'

export async function verifyHistoryTheme(page, profile, out) {
  const savedTheme=await page.evaluate(()=>document.documentElement.dataset.sonaTheme)
  const samples=async()=>profile.evaluate((node)=>({
    kda:[...node.querySelectorAll('.rh-kda')].map((item)=>item.textContent),
    font:getComputedStyle(node.querySelector('.rh-kda')).fontSize,
    count:node.querySelector('.rh-tabs small').textContent,
  }))
  const before=await samples()
  await page.mouse.move(4,4)
  await page.evaluate(async()=>(await import('/src/lib/store.ts')).store.set('theme','client'))
  await page.waitForFunction(()=>{
    const style=getComputedStyle(document.querySelector('.sona-setting-card'))
    return style.backgroundColor==='rgba(1, 10, 19, 0.4)'&&style.borderTopColor==='rgba(60, 46, 22, 0.6)'
  })
  const client=await profile.evaluate((node)=>{
    const main=getComputedStyle(document.querySelector('.sona-setting-card'))
    const card=getComputedStyle(node.querySelector('.rh-panel'))
    const root=getComputedStyle(node)
    const win=getComputedStyle(node.querySelector('.rh-match-win'))
    const loss=getComputedStyle(node.querySelector('.rh-match-loss'))
    const select=getComputedStyle(node.querySelector('select'))
    return {main:{background:main.backgroundColor,border:main.borderColor,radius:main.borderRadius},card:{background:card.backgroundColor,border:card.borderColor,radius:card.borderRadius},root:{background:root.backgroundColor,image:root.backgroundImage},win:win.backgroundColor,loss:loss.backgroundColor,winLine:win.borderLeftWidth,lossLine:loss.borderLeftWidth,rowRadius:win.borderRadius,winText:getComputedStyle(node.querySelector('.rh-match-win .rh-match-hero > strong')).color,lossText:getComputedStyle(node.querySelector('.rh-match-loss .rh-match-hero > strong')).color,select:select.backgroundColor}
  })
  assert.deepEqual(client.card,client.main)
  assert.deepEqual(client.root,{background:'rgba(0, 0, 0, 0)',image:'none'})
  assert.equal(client.win,'rgba(0, 0, 0, 0)')
  assert.equal(client.win,client.loss)
  assert.equal(client.winLine,'0px')
  assert.equal(client.lossLine,'0px')
  assert.equal(client.rowRadius,'0px')
  assert.equal(client.winText,'rgb(0, 199, 217)')
  assert.equal(client.lossText,'rgb(255, 70, 85)')
  assert.equal(client.select,'rgba(1, 10, 19, 0.6)')
  const art=profile.locator('..').locator('..').locator('.sona-career-backdrop img.is-loaded')
  await art.waitFor()
  assert.match(await art.getAttribute('src'),/qa-career\/103000\.jpg$/)
  assert.deepEqual(await samples(),before)
  await profile.screenshot({path:path.join(out,'详细战绩_主菜单黑金同步_模拟.png')})
  await page.evaluate(async()=>(await import('/src/lib/store.ts')).store.set('theme','slate'))
  const slate=await profile.evaluate((node)=>({header:getComputedStyle(node.querySelector('.rh-header')).backgroundColor,panel:getComputedStyle(node.querySelector('.rh-panel')).backgroundColor,radius:getComputedStyle(node.querySelector('.rh-panel')).borderRadius}))
  assert.deepEqual(slate,{header:'rgb(32, 46, 64)',panel:'rgb(20, 32, 46)',radius:'7px'})
  assert.deepEqual(await samples(),before)
  await profile.screenshot({path:path.join(out,'详细战绩_深色蓝灰保留_模拟.png')})
  await page.evaluate(async(theme)=>(await import('/src/lib/store.ts')).store.set('theme',theme),savedTheme)
  console.log('[verify] history matches main-menu black/gold; neutral rows, bright outcome text, font/data and slate palette verified')
}
