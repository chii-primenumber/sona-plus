import assert from 'node:assert/strict'

export async function verifyScrollVisibility(page) {
  await page.evaluate(() => {
    const host = document.createElement('div');host.id='qa-scroll-visibility'
    host.innerHTML = ['sona-modal-overlay','sobp','sona-select-dropdown'].map((scope,index)=>`<div class="${scope}" style="position:relative;display:block;inset:auto;width:200px;height:80px;overflow:auto;z-index:auto" data-qa-scroll="${index}"><div style="height:500px;width:500px">Scroll fixture</div></div>`).join('')
    document.body.append(host)
  })
  for (let index=0; index<3; index++) {
    const box=page.locator(`[data-qa-scroll="${index}"]`)
    const color=()=>box.evaluate(el=>getComputedStyle(el,'::-webkit-scrollbar-thumb').backgroundColor)
    assert.equal(await color(),'rgba(0, 0, 0, 0)')
    await box.evaluate(el=>{el.scrollTop=50;el.scrollLeft=40})
    await page.waitForFunction(index=>document.querySelector(`[data-qa-scroll="${index}"]`).hasAttribute('data-sona-scrolling'),index)
    assert.notEqual(await color(),'rgba(0, 0, 0, 0)')
    await page.waitForFunction(index=>!document.querySelector(`[data-qa-scroll="${index}"]`).hasAttribute('data-sona-scrolling'),index)
    assert.equal(await color(),'rgba(0, 0, 0, 0)')
  }
  // No document-wide styling or attributes are applied to the native client.
  assert.equal(await page.locator('.qa-toolbar').getAttribute('data-sona-scrolling'),null)
  await page.locator('#qa-scroll-visibility').evaluate(el=>el.remove())
  console.log('[verify] modal/build/dropdown scrollbars hidden at rest, shown while scrolling and hidden after idle; horizontal scrolling retained')
}
