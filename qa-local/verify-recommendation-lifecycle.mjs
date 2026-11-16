import assert from 'node:assert/strict'

export async function verifyRecommendationLifecycle(page) {
  await page.setViewportSize({ width: 1450, height: 940 })
  await page.evaluate(async () => { (await import('/src/lib/store.ts')).store.set('opggBuildRecommendation', true) })
  await page.getByRole('button', { name: '模拟进游戏', exact: true }).click()
  await page.locator('[data-sona-opgg-ingame-build]').waitFor()
  await page.evaluate(async () => {
    const { opggApi } = await import('/src/lib/opgg-api.ts')
    const feature = await import('/src/lib/features/opgg-build-recommendation.ts')
    const fixture = () => ({ meta: { version: '16.22' }, data: {
      summary: { average_stats: { win_rate: .5, pick_rate: .1, tier: 3 } },
      core_items: [], starter_items: [], boots: [], last_items: [], summoner_spells: [], runes: [], counters: [],
    } })
    const original = opggApi.getChampion
    const realNow = Date.now
    window.qaLifecycle = { feature, original, realNow, fixture, active: 0, peak: 0, aborted: 0, calls: [], releases: [], immediate: false, failNext: false, clockOffset: 0 }
    Date.now = () => realNow() + window.qaLifecycle.clockOffset
    opggApi.getChampion = (options) => {
      const state = window.qaLifecycle
      state.calls.push(options.id)
      if (state.failNext) { state.failNext = false; return Promise.reject(new Error('fixture temporary failure')) }
      if (state.immediate) return Promise.resolve(fixture())
      state.active++; state.peak = Math.max(state.peak, state.active)
      return new Promise((resolve, reject) => {
        let done = false
        const finish = (aborted) => {
          if (done) return
          done = true; state.active--; options.signal?.removeEventListener('abort', abort)
          if (aborted) { state.aborted++; reject(new DOMException('cancelled', 'AbortError')) }
          else resolve(fixture())
        }
        const abort = () => finish(true)
        options.signal?.addEventListener('abort', abort, { once: true })
        state.releases.push(() => finish(false))
      })
    }
    await feature.showOpggBuildRecommendationModal()
  })
  const modal = page.locator('#sona-opgg-ingame-modal-root')
  const close = page.locator('.sona-opgg-modal-content .sobp-close')
  try {
    await close.waitFor()
    await close.click()
    await page.evaluate(() => qaLifecycle.releases.splice(0).forEach((release) => release()))
    await page.waitForTimeout(70)
    assert.equal(await page.locator('.sona-opgg-modal-content').count(), 0, 'late data must not reopen a closing modal')
    await page.evaluate(() => qaLifecycle.feature.showOpggBuildRecommendationModal())
    await close.waitFor()
    await page.waitForTimeout(350)
    assert.equal(await close.isVisible(), true, 'old exit timer must not destroy the reopened modal')
    await close.click(); await modal.waitFor({ state: 'detached' })

    const anchor = await page.evaluateHandle(() => {
      const node = document.createElement('button'); node.id = 'qa-lifecycle-anchor'; node.textContent = 'fixture'
      node.style.cssText = 'position:fixed;bottom:10px;left:10px'; document.body.append(node); return node
    })
    const open = (id) => page.evaluate(async ({ anchor, id }) => qaLifecycle.feature.openOpggBuildRecommendationDebugPanel(anchor, id, { queueId: 440, gameMode: 'CLASSIC', position: 'support' }), { anchor, id })
    await page.evaluate(() => { qaLifecycle.immediate = true; qaLifecycle.failNext = true })
    await open(9001)
    await page.locator('#sona-opgg-build-panel').getByText(/fixture temporary failure/).waitFor()
    await page.locator('#sona-opgg-build-panel .sobp-close').click()
    await page.evaluate(() => { qaLifecycle.clockOffset += 6000 })
    await open(9001)
    await page.waitForFunction(() => !document.querySelector('#sona-opgg-build-panel .sobp-body')?.textContent.includes('加载中'))
    assert.equal(await page.evaluate(() => qaLifecycle.calls.filter((id) => id === 9001).length), 2, 'failed cache must allow retry')
    await page.locator('#sona-opgg-build-panel .sobp-close').click()
    await page.evaluate(() => { qaLifecycle.clockOffset += 600001 })
    await open(9001)
    assert.equal(await page.evaluate(() => qaLifecycle.calls.filter((id) => id === 9001).length), 3, 'successful data must expire')
    await page.locator('#sona-opgg-build-panel .sobp-close').click()
    await page.evaluate(() => { qaLifecycle.immediate = false })
    for (let id = 9100; id < 9110; id++) await open(id)
    await page.waitForTimeout(100)
    const bounded = await page.evaluate(() => ({ peak: qaLifecycle.peak, aborted: qaLifecycle.aborted }))
    assert.ok(bounded.peak <= 3, JSON.stringify(bounded))
    assert.ok(bounded.aborted >= 2, JSON.stringify(bounded))
    await page.locator('#sona-opgg-build-panel .sobp-close').click()
    await page.evaluate(() => { qaLifecycle.immediate = true; qaLifecycle.releases.splice(0).forEach((release) => release()) })
    await page.waitForTimeout(150)
    assert.equal(await page.evaluate(() => qaLifecycle.active), 0)
    assert.equal(await page.locator('#sona-opgg-build-panel').count(), 0)
    console.log('[verify] recommendation close/reopen, late responses, retry, expiry, concurrency and eviction abort passed')
  } finally {
    await page.evaluate(async () => {
      const { opggApi } = await import('/src/lib/opgg-api.ts')
      opggApi.getChampion = qaLifecycle.original
      Date.now = qaLifecycle.realNow
      qaLifecycle.releases.forEach((release) => release())
      document.getElementById('qa-lifecycle-anchor')?.remove()
      delete window.qaLifecycle
    })
  }
}
