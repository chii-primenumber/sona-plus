import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

// Installed before application imports. Component calls are inserted by the QA-only Vite transform.
export function installPerformanceProbe() {
  performance.setResourceTimingBufferSize(10000)
  const probe = window.sonaPerf = { commits: 0, renderCalls: {}, rectReads: 0, resizeCallbacks: 0, fetches: 0, longTasks: [], observers: new Set() }
  const nativeFetch = window.fetch
  window.fetch = function (...args) { probe.fetches++; return nativeFetch.apply(this, args) }
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, inject: () => 1, onCommitFiberUnmount() {},
    onCommitFiberRoot(_id, root) {
      probe.commits++
    },
  }
  const rect = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function (...args) { probe.rectReads++; return rect.apply(this, args) }
  const NativeResizeObserver = window.ResizeObserver
  window.ResizeObserver = class extends NativeResizeObserver {
    constructor(callback) {
      super((...args) => { probe.resizeCallbacks++; callback(...args) })
    }
    observe(...args) { probe.observers.add(this); return super.observe(...args) }
    disconnect() { probe.observers.delete(this); return super.disconnect() }
  }
  new PerformanceObserver((list) => probe.longTasks.push(...list.getEntries().map(({ duration, startTime }) => ({ duration, startTime })))).observe({ type: 'longtask', buffered: true })
}

export async function measurePerformance({ page, context, origin, output, version, setLongHistory, counts, errors }) {
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  const rows = []
  const read = async () => {
    const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((entry) => [entry.name, entry.value]))
    return page.evaluate((metrics) => ({
      ...metrics, commits: sonaPerf.commits, renders: { ...sonaPerf.renderCalls }, rectReads: sonaPerf.rectReads,
      resizeCallbacks: sonaPerf.resizeCallbacks, fetches: sonaPerf.fetches, observers: sonaPerf.observers.size,
      longTasks: sonaPerf.longTasks.slice(), resources: performance.getEntriesByType('resource').length,
      elements: document.querySelectorAll('*').length,
    }), metrics)
  }
  const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const measure = async (name, action) => {
    await settle()
    const before = await read(), requestStart = counts.length, started = performance.now()
    await action(); await settle()
    const elapsedMs = performance.now() - started
    const after = await read()
    const tasks = after.longTasks.slice(before.longTasks.length)
    rows.push({ name, elapsedMs: +elapsedMs.toFixed(1), historyRequests: counts.length - requestStart, fetches: after.fetches - before.fetches,
      resources: after.resources - before.resources, commits: after.commits - before.commits,
      matchCardRenders: (after.renders.HistoryMatchCard || 0) - (before.renders.HistoryMatchCard || 0),
      teamCardRenders: (after.renders.TeamPlayerCard || 0) - (before.renders.TeamPlayerCard || 0),
      rectReads: after.rectReads - before.rectReads, resizeCallbacks: after.resizeCallbacks - before.resizeCallbacks,
      layoutMs: +((after.LayoutDuration - before.LayoutDuration) * 1000).toFixed(2),
      scriptMs: +((after.ScriptDuration - before.ScriptDuration) * 1000).toFixed(2),
      longTasks: tasks.length, longestTaskMs: +Math.max(0, ...tasks.map((entry) => entry.duration)).toFixed(1),
      heapMiB: +(after.JSHeapUsedSize / 1048576).toFixed(2), elements: after.elements, observers: after.observers })
    console.log('[performance]', JSON.stringify(rows.at(-1)))
    await fs.writeFile(output, JSON.stringify({ version, partial: true, rows }, null, 2) + '\n')
  }
  const profile = page.getByTestId('player-history')
  const close = async () => { await page.keyboard.press('Escape'); await page.locator('.sona-modal-overlay').last().waitFor({ state: 'detached' }) }
  const scroll = async (selector, frames = 60) => {
    await page.locator(selector).evaluate(async (node, frames) => {
      const max = node.scrollHeight - node.clientHeight
      for (let i = 0; i < frames; i++) {
        node.scrollTop = Math.min(max, (i < frames / 2 ? i : frames - i) * 70)
        await new Promise(requestAnimationFrame)
      }
    }, frames)
  }
  await measure('startup-ready', async () => {
    await page.getByRole('button', { name: '查询战绩', exact: true }).waitFor()
    await page.waitForTimeout(500)
  })
  await measure('lobby-idle-1500ms', () => page.waitForTimeout(1500))
  await page.getByPlaceholder(/名字#Tag/).fill('练习星轨#DEMO')
  const lifecycleBefore = await read()
  await measure('personal-open-cold', async () => {
    await page.getByRole('button', { name: '查询战绩', exact: true }).click()
    await profile.locator('.rh-match').first().waitFor()
    await page.waitForTimeout(150)
  })
  await measure('personal-50-scroll-60frames', () => scroll('[data-testid="player-history"] .rh-content'))
  await measure('nested-settings-5cycles', async () => {
    for (let i = 0; i < 5; i++) {
      await profile.getByRole('button', { name: '显示设置', exact: true }).click()
      await page.locator('.sona-modal-overlay').nth(1).waitFor()
      await page.keyboard.press('Escape')
      await page.locator('.sona-modal-overlay').nth(1).waitFor({ state: 'detached' })
    }
  })
  setLongHistory(true)
  await measure('personal-100-load', async () => {
    await profile.getByLabel('每次加载场次').selectOption('100')
    await profile.locator('[data-virtualized="true"]').waitFor()
    await page.waitForTimeout(150)
  })
  await measure('personal-100-scroll-60frames', () => scroll('[data-testid="player-history"] .rh-content'))
  await measure('expand-report-scroll', async () => {
    await profile.locator('.rh-content').evaluate((node) => { node.scrollTop = 0 })
    await profile.locator('.rh-expand').first().click()
    await profile.locator('.rh-report').first().waitFor()
    await scroll('[data-testid="player-history"] .rh-content', 30)
  })
  await close()
  await measure('personal-open-close-10cycles', async () => {
    for (let i = 0; i < 10; i++) {
      await page.getByRole('button', { name: '查询战绩', exact: true }).click()
      await profile.locator('.rh-match').first().waitFor()
      await close()
    }
  })
  await cdp.send('HeapProfiler.collectGarbage')
  const lifecycleAfter = await read()
  for (const [phase, title] of [['模拟 BP', 'team-five-open'], ['模拟进游戏', 'team-ten-open']]) {
    await page.getByRole('button', { name: phase, exact: true }).click()
    const entry = page.locator('[data-sona-team-history]')
    await entry.waitFor()
    await measure(title, async () => { await entry.click(); await page.locator('.rh-team-card').last().waitFor(); await page.waitForTimeout(500) })
    await measure(title + '-idle-700ms', () => page.waitForTimeout(700))
    await close()
  }
  await page.getByRole('button', { name: '模拟回大厅', exact: true }).click()
  // Real production recommendation components with a deterministic large fixture.
  await measure('recommendation-mount', async () => {
    await page.evaluate(async () => {
      const React = await import('/node_modules/.vite/deps/react.js')
      const ReactDOM = await import('/node_modules/.vite/deps/react-dom_client.js')
      const createRoot = ReactDOM.createRoot ?? ReactDOM.default.createRoot
      const { OpggBuildRecommendationPanel } = await import('/src/components/ui/OpggBuildRecommendationPanel.tsx')
      const host = document.createElement('div'); host.id = 'perf-build'
      host.style.cssText = 'position:fixed;inset:12px;z-index:2147483647;background:#111;height:calc(100vh - 24px)'
      document.body.append(host)
      const build = (ids) => ({ ids, play: 100, win: 51, pick_rate: .1 })
      window.perfBuildRoot = createRoot(host)
      window.perfBuildRoot.render((React.createElement ?? React.default.createElement)(OpggBuildRecommendationPanel, {
        context: { championId: 157, queueId: 2400, gameVersion: '16.22', gameMode: 'KIWI', position: 'none' },
        recommendation: { mode: 'aram', modeLabel: '海克斯大乱斗', version: '16.22', position: 'none', baselineWinRate: .5,
          summary: [], summonerSpells: [build([4,32])], starterItems: [{ ids: [2051,2003,2003] }], boots: [{ ...build([3158]), compareBaseline: false }],
          coreItems: [build([6617,3504,6621])], lastItems: Array.from({ length: 48 }, (_, i) => build([6600+i])), runePages: [], matchups: [],
          augments: [8,4,1].map((rarity, g) => ({ rarity, items: Array.from({ length: 40 }, (_, i) => ({ id: 1000+g*100+i, pickRate: .1, winRate: .5+(i+g)/100 })) })) },
        loadError: '', isLoading: false, selectedTier: 'all', onTierChange() {}, onPositionChange() {}, onClose() {},
      }))
    })
    await page.locator('#perf-build .sobp-augment').first().waitFor()
  })
  await measure('augment-filter-fold-5cycles', async () => {
    const panel = page.locator('#perf-build')
    for (let i = 0; i < 5; i++) {
      for (const name of ['棱彩', '黄金', '白银', '全部']) await panel.getByRole('button', { name, exact: true }).click()
      await panel.getByRole('button', { name: '海克斯推荐：展开全部', exact: true }).click()
      await panel.getByRole('button', { name: '海克斯推荐：收起', exact: true }).click()
      await page.waitForTimeout(220)
      await panel.getByRole('button', { name: '海克斯推荐：展开', exact: true }).click()
    }
  })
  await measure('recommendation-scroll-60frames', () => scroll('#perf-build .sobp-body'))
  await page.evaluate(() => { window.perfBuildRoot.unmount(); delete window.perfBuildRoot; document.querySelector('#perf-build').remove() })
  await measure('closed-idle-1500ms', () => page.waitForTimeout(1500))
  assert.equal(errors.length, 0, errors.join('\n'))
  const result = { version, environment: 'Playwright Chromium headless, development React, deterministic offline fixtures; elapsed includes browser automation and waiting', viewport: '1450x940', rows,
    lifecycle: { before: { observers: lifecycleBefore.observers, elements: lifecycleBefore.elements }, after: { observers: lifecycleAfter.observers, elements: lifecycleAfter.elements, heapMiB: +(lifecycleAfter.JSHeapUsedSize/1048576).toFixed(2) } }, errors }
  await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n')
}
