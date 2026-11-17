import assert from 'node:assert/strict'
import path from 'node:path'

export async function verifyBrand(page, out) {
  await page.locator('.sona-sidebar-logo-text').waitFor()
  assert.equal(await page.locator('.sona-sidebar-logo-text').textContent(), 'Sona Plus')
  assert.match(await page.locator('.sona-sidebar-logo-version').textContent(), /^v\d+\.\d+\.\d+$/)
  await page.evaluate(async () => {
    const reactModule = await import('/node_modules/.vite/deps/react.js')
    const React = reactModule.default ?? reactModule
    const domModule = await import('/node_modules/.vite/deps/react-dom_client.js')
    const { createRoot } = domModule.default ?? domModule
    const { AboutPage } = await import('/src/components/pages/AboutPage.tsx')
    const host = document.createElement('div')
    host.id = 'qa-brand-about'
    host.style.cssText = 'position:relative;width:850px;height:760px;background:#010a13;margin:20px;box-sizing:border-box'
    document.body.append(host)
    window.qaBrandRoot = createRoot(host)
    window.qaBrandRoot.render(React.createElement(AboutPage))
  })
  const about = page.locator('#qa-brand-about')
  await about.getByRole('heading', {name:'Sona Plus', exact:true}).waitFor()
  assert.match(await about.innerText(), /Original Project by WJZ_P/)
  assert.match(await about.innerText(), /Modified & Maintained by chii-primenumber/)
  assert.match(await about.innerText(), /新增和修改的功能由 chii-primenumber/)
  assert.equal(await about.locator('a.sona-hex-card-link').getAttribute('href'), 'https://github.com/chii-primenumber/sona-plus')
  assert.equal(await about.getByRole('link',{name:'WJZ_P',exact:true}).getAttribute('href'), 'https://github.com/WJZ-P/sona')
  await about.locator('.sona-about').evaluate(el => { el.style.boxSizing='border-box' })
  await about.getByText('Made with love by chii-primenumber ❤',{exact:true}).scrollIntoViewIfNeeded()
  await about.screenshot({path:path.join(out,'SonaPlus_v1.0.0_About_模拟预览.png')})
  const checks = await page.evaluate(async () => {
    const { store } = await import('/src/lib/store.ts')
    const { lcu } = await import('/src/lib/lcu.ts')
    const update = await import('/src/lib/update-checker.ts')
    const old = {fetch:window.fetch,notify:lcu.sendNotification,get:lcu.getRunePages,put:lcu.updateRunePage,del:lcu.deleteRunePage,locale:store.get('locale'),skip:store.get('skippedUpdateVersion'),announcement:store.get('releaseAnnouncement'),lastCheck:store.get('lastUpdateCheckAt')}
    const checks = []
    try {
      lcu.sendNotification = async () => ({})
      let latest = {tag_name:'v1.10.0-personal.44',prerelease:true}
      let releases = [latest,{tag_name:'v1.2.0',draft:true},{tag_name:'v1.1.0',prerelease:true},{tag_name:'v1.0.0'}]
      window.fetch = async (url,...args) => (String(url).startsWith('https://corsproxy.io/')||String(url).startsWith('https://api.github.com/repos/chii-primenumber/sona-plus/')) ? new Response(JSON.stringify(decodeURIComponent(String(url)).includes('/latest') ? latest : releases),{status:200}) : old.fetch(url,...args)
      store.set('skippedUpdateVersion','1.10.0-personal.99')
      if ((await update.checkForUpdates()).status !== 'latest') throw Error('Legacy release must not be offered')
      checks.push('legacy release filtering')
      latest = {tag_name:'v1.1.3',html_url:'https://github.com/chii-primenumber/sona-plus/releases/tag/v1.0.1'}
      const first = update.checkForUpdates(), second = update.checkForUpdates()
      if (first !== second) throw Error('Concurrent update checks must share a request')
      const next = await first
      if (next.status !== 'available' || next.info.latestVersion !== '1.1.3') throw Error('Plus update missing')
      checks.push('Plus update with legacy skip preference and request sharing')
      update.skipUpdateVersion('1.1.3')
      if ((await update.checkForUpdates()).status !== 'latest') throw Error('Skipped Plus release should stay skipped')
      checks.push('Plus skip preference')
      latest = {tag_name:'v1.10.0-personal.44',prerelease:true}; releases = [latest]
      if ((await update.checkForUpdates()).status !== 'error') throw Error('Old-only feed must not offer an update')
      checks.push('old-only feed has no false update')
      for (const suffix of ['Sona','Sona Plus']) {
        const writes = []
        lcu.getRunePages = async () => [{id:123,name:'旧符文 - '+suffix,isEditable:true,isDeletable:true}]
        lcu.updateRunePage = async (id,payload) => { writes.push(id);return {...payload,id} }
        lcu.deleteRunePage = async () => { throw Error('Single managed page must be reused') }
        await lcu.applyRunePage({name:'新符文 - Sona Plus',primaryStyleId:8000,subStyleId:8100,selectedPerkIds:[]})
        if (writes.join() !== '123') throw Error('Managed rune page not reused: '+suffix)
      }
      checks.push('old and new managed rune page reuse')
      store.set('locale','en-US')
    } finally {
      window.fetch=old.fetch;lcu.sendNotification=old.notify;lcu.getRunePages=old.get;lcu.updateRunePage=old.put;lcu.deleteRunePage=old.del
      store.set('skippedUpdateVersion',old.skip);store.set('releaseAnnouncement',old.announcement);store.set('lastUpdateCheckAt',old.lastCheck)
    }
    window.qaBrandLocale = old.locale
    return checks
  })
  await page.waitForFunction(() => document.querySelector('#qa-brand-about').textContent.includes('Original authorship'))
  await page.evaluate(async () => {
    const {store} = await import('/src/lib/store.ts')
    store.set('locale', window.qaBrandLocale)
    window.qaBrandRoot.unmount()
    document.getElementById('qa-brand-about').remove()
  })
  console.log('[verify] Sona Plus branding, bilingual credits, repository links and ' + checks.join(', ') + ' passed')
}
