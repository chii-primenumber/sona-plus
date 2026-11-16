import assert from 'node:assert/strict'
import path from 'node:path'
import { selectOption } from './select-option.mjs'

export async function verifyClientSurfaces(page,profile,out) {
  const circles=await profile.locator('.rh-header-actions .rh-icon-button').evaluateAll((nodes)=>nodes.map((node)=>{
    const style=getComputedStyle(node),box=node.getBoundingClientRect();return {radius:style.borderRadius,width:box.width,height:box.height,bg:style.backgroundColor}
  }))
  assert.ok(circles.length>=3)
  for(const row of circles){assert.equal(row.radius,'50%');assert.equal(row.width,row.height);assert.match(row.bg,/rgba/)}
  const load=profile.locator('.rh-load-more button')
  assert.equal((await load.textContent()).trim(),'')
  assert.equal(await load.locator('svg circle').count(),3)
  const position=profile.getByLabel('筛选位置',{exact:true})
  assert.equal(await position.locator('svg.sona-position-icon').count(),1)
  assert.equal((await position.textContent()).trim(),'')
  for(let i=0;i<4;i++){
    await position.click();await page.getByRole('listbox').waitFor()
    await page.keyboard.press('Escape');await page.getByRole('listbox').waitFor({state:'hidden'})
    await profile.waitFor()
  }
  await position.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter')
  assert.equal(await position.getAttribute('data-value'),'TOP')
  await selectOption(page,position,'')
  const heroes=profile.getByLabel('筛选英雄',{exact:true})
  await heroes.click()
  const list=page.getByRole('listbox')
  assert.ok((await list.getByRole('option').count())>5)
  const state=await list.evaluate((node)=>({bg:getComputedStyle(node).backgroundColor,box:node.getBoundingClientRect().toJSON()}))
  assert.match(state.bg,/rgba/)
  assert.ok(state.box.left>=0&&state.box.right<=1450)
  await profile.screenshot({path:path.join(out,'黑金半透明卡片与下拉_模拟.png')})
  await page.keyboard.press('Escape')
  await page.setViewportSize({width:560,height:720})
  await heroes.click();await list.waitFor()
  assert.ok(await list.evaluate((node)=>node.getBoundingClientRect().right<=window.innerWidth))
  await page.keyboard.press('Escape');await page.setViewportSize({width:1450,height:940})
  assert.equal(await page.locator('.sona-select-dropdown').count(),0)
  assert.equal(await profile.locator('select').count(),0)
  console.log('[verify] translucent cards/portal menus, circular icons, ellipsis pagination, icon-only positions, keyboard selection, nested Escape and narrow-window menu bounds passed')
}
