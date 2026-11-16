import assert from 'node:assert/strict'
import path from 'node:path'

export async function verifyAugmentSwitch(page, panel, out) {
  const track=panel.getByRole('group',{name:'海克斯类型',exact:true})
  assert.equal(await panel.locator('.sobp-augment').count(),12)
  await page.emulateMedia({reducedMotion:'no-preference'})
  const motion=await track.evaluate(async(node)=>{
    const ReactDOM=await import('/node_modules/.vite/deps/react-dom.js')
    const flushSync=ReactDOM.flushSync??ReactDOM.default.flushSync
    const thumb=node.querySelector('.sobp-augment-switch-thumb')
    const start=new DOMMatrix(getComputedStyle(thumb).transform).m41
    flushSync(()=>node.querySelectorAll('button')[2].click())
    const animation=thumb.getAnimations().find((item)=>item.transitionProperty==='transform')
    if(!animation)return {animated:false}
    await animation.ready;animation.pause();animation.currentTime=120
    const middle=new DOMMatrix(getComputedStyle(thumb).transform).m41
    animation.finish()
    const end=new DOMMatrix(getComputedStyle(thumb).transform).m41
    return {animated:true,start,middle,end}
  })
  assert.equal(motion.animated,true)
  assert.ok(motion.start<motion.middle&&motion.middle<motion.end,JSON.stringify(motion))
  await page.emulateMedia({reducedMotion:'reduce'})
  assert.equal(await track.locator('.sobp-augment-switch-thumb').evaluate((node)=>getComputedStyle(node).transitionDuration),'0s')
  await track.getByRole('button',{name:'黄金',exact:true}).focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await track.getByRole('button',{name:'白银',exact:true}).getAttribute('aria-pressed'),'true')
  await page.keyboard.press('Home')
  assert.equal(await track.getByRole('button',{name:'全部',exact:true}).getAttribute('aria-pressed'),'true')
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowRight')
  assert.equal(await track.getByRole('button',{name:'全部',exact:true}).getAttribute('aria-pressed'),'true')
  assert.equal(await track.locator('[aria-pressed="true"]').count(),1)
  const savedTheme=await page.evaluate(()=>document.documentElement.dataset.sonaTheme)
  for(const theme of ['client']) {
    await page.evaluate(async(theme)=>(await import('/src/lib/store.ts')).store.set('theme',theme),theme)
    await panel.screenshot({path:path.join(out,`海克斯12个与滑动筛选_${theme}.png`)})
  }
  await page.setViewportSize({width:560,height:720})
  const bounds=await track.evaluate((node)=>({box:node.getBoundingClientRect().toJSON(),scroll:node.scrollWidth,client:node.clientWidth,buttons:[...node.querySelectorAll('button')].map((button)=>button.getBoundingClientRect().toJSON())}))
  assert.ok(bounds.scroll<=bounds.client+1,JSON.stringify(bounds))
  assert.ok(bounds.buttons.every((button)=>button.left>=bounds.box.left&&button.right<=bounds.box.right),JSON.stringify(bounds))
  await page.setViewportSize({width:1450,height:940})
  await page.evaluate(async(theme)=>(await import('/src/lib/store.ts')).store.set('theme',theme),savedTheme)
  console.log('[verify] 12-item augment preview, interpolated sliding thumb, keyboard, reduced motion, themes and narrow width passed')
}
