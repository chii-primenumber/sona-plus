import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

export async function verifyEnhancements(page, out, ids = [], names = []) {
  const shotDir = process.env.SONA_SHOT_DIR || out
  fs.mkdirSync(shotDir, { recursive: true })

  // Verify production code-split entry & chunks resolve in real Chromium
  const distCheck = await page.evaluate(async () => {
    const prodEntry = await import('/dist/index.js')
    return {
      hasInit: typeof prodEntry.init === 'function',
      hasLoad: typeof prodEntry.load === 'function',
    }
  })
  assert.equal(distCheck.hasInit, true)
  assert.equal(distCheck.hasLoad, true)

  await page.evaluate(async () => {
    const ReactMod = await import('/node_modules/.vite/deps/react.js')
    const DomMod = await import('/node_modules/.vite/deps/react-dom_client.js')
    const { UpdatePage } = await import('/src/components/pages/UpdatePage.tsx')
    const { RewardsPage } = await import('/src/components/pages/RewardsPage.tsx')
    const { SettingsPage } = await import('/src/components/pages/SettingsPage.tsx')
    const { ToolsPage } = await import('/src/components/pages/ToolsPage.tsx')
    const { TeamHistoryModal } = await import('/src/components/ui/TeamHistoryModal.tsx')
    const { lcu } = await import('/src/lib/lcu.ts')
    const { store } = await import('/src/lib/store.ts')
    const React = ReactMod.default ?? ReactMod
    const createRoot = (DomMod.default ?? DomMod).createRoot

    const saved = {
      openFolder: window.openPluginsFolder,
      reloadClient: window.reloadClient,
      getLootMap: lcu.getPlayerLootMap,
      craftLoot: lcu.craftLootRecipe,
      benchSwap: lcu.benchSwap,
      getChampSelect: lcu.getChampSelectSession,
      getPhase: lcu.getGameflowPhase,
      proxy: store.get('customCorsProxyUrl'),
      tags: store.get('playerTags'),
      tagEnabled: store.get('playerTagEnabled'),
      tagAlert: store.get('champSelectTagAlert'),
      encounterEnabled: store.get('encounterAlertEnabled'),
      postgameEnh: store.get('postgameEnhancement'),
      honorStrat: store.get('autoHonorStrategy'),
      randomSkin: store.get('autoRandomSkin'),
      acceptSwap: store.get('autoAcceptSwap'),
      swapStrat: store.get('autoAcceptSwapStrategy'),
      presetSwitch: store.get('champSelectPresetSwitch'),
      presets: store.get('champSelectPresets'),
      getSkins: lcu.getSkinCarouselSkins,
      setSkin: lcu.setSelectedSkinId,
      acceptOrderSwap: lcu.acceptPickOrderSwap,
      getEog: lcu.getEogStatsBlock,
      getSummonerById: lcu.getSummonerById,
      hotkey: store.get('hotkey'),
      compDiag: store.get('champSelectCompDiagnostic'),
      wishEnabled: store.get('aramWishlistEnabled'),
      wishIds: store.get('aramWishlistChampionIds'),
      wishAuto: store.get('aramWishlistAutoSwap'),
      mateHint: store.get('aramBenchTeammateHint'),
      autoLock: store.get('autoLockChampion'),
      autoLockIds: store.get('autoLockChampionIds'),
      recentPlayers: store.get('historyRecentPlayers'),
    }

    let openedFolderArg = null
    let reloadCount = 0
    window.openPluginsFolder = (subPath) => { openedFolderArg = subPath ?? '' }
    window.reloadClient = () => { reloadCount += 1 }

    const swappedIds = []
    lcu.benchSwap = async (champId) => {
      swappedIds.push(champId)
    }

    let lootItems = {
      CHAMPION_RENTAL_103: {
        lootId: 'CHAMPION_RENTAL_103',
        type: 'CHAMPION_RENTAL',
        displayCategories: 'CHAMPION',
        count: 3,
        disenchantValue: 960,
        disenchantLootName: 'CURRENCY_champion',
        itemDesc: '九尾妖狐',
        itemStatus: 'OWNED',
        storeItemId: 103,
      },
      CHAMPION_RENTAL_238: {
        lootId: 'CHAMPION_RENTAL_238',
        type: 'CHAMPION_RENTAL',
        displayCategories: 'CHAMPION',
        count: 2,
        disenchantValue: 960,
        disenchantLootName: 'CURRENCY_champion',
        itemDesc: '影流之主',
        itemStatus: 'OWNED',
        storeItemId: 238,
      },
      CHAMPION_RENTAL_799: {
        lootId: 'CHAMPION_RENTAL_799',
        type: 'CHAMPION_RENTAL',
        displayCategories: 'CHAMPION',
        count: 2,
        disenchantValue: 1260,
        disenchantLootName: 'CURRENCY_champion',
        itemDesc: '铁血狼母',
        itemStatus: 'NONE',
        storeItemId: 799,
      },
    }
    const craftedCalls = []
    lcu.getPlayerLootMap = async () => lootItems
    lcu.craftLootRecipe = async (recipe, targetIds, repeat) => {
      craftedCalls.push({ recipe, ids: targetIds, repeat })
      for (const id of targetIds) {
        if (lootItems[id]) {
          const left = lootItems[id].count - repeat
          if (left <= 0) delete lootItems[id]
          else lootItems = { ...lootItems, [id]: { ...lootItems[id], count: left } }
        }
      }
      return {}
    }

    const host = document.createElement('div')
    host.id = 'qa-enhancements'
    host.style.cssText = 'position:fixed;inset:0;z-index:210000;background:#010a13;overflow:auto;padding:20px;box-sizing:border-box'
    document.body.append(host)
    const root = createRoot(host)
    const render = (which) => {
      if (which === 'team') {
        root.render(React.createElement(TeamHistoryModal, { open: true, mode: 'game', onClose() {} }))
        return
      }
      if (which === 'team-bp') {
        root.render(React.createElement(TeamHistoryModal, { open: true, mode: 'bp', onClose() {} }))
        return
      }
      const Comp = which === 'update' ? UpdatePage : which === 'rewards' ? RewardsPage : which === 'tools' ? ToolsPage : SettingsPage
      root.render(React.createElement(Comp))
    }
    render('update')
    window.qaEnh = {
      host,
      root,
      render,
      store,
      lcu,
      saved,
      getOpenedFolder: () => openedFolderArg,
      getReloadCount: () => reloadCount,
      getCraftedCalls: () => craftedCalls,
      getSwappedIds: () => swappedIds,
    }
  })

  try {
    const host = page.locator('#qa-enhancements')

    // 1. B1: UpdatePage open plugin folder + hot reload button (no client exit needed)
    await host.getByRole('button', { name: '打开目录一键更新', exact: true }).click()
    assert.equal(await page.evaluate(() => window.qaEnh.getOpenedFolder()), 'sona')
    await host.getByText(/无需退出客户端/).waitFor()
    await host.getByText(/Ctrl\+Enter/).waitFor()
    await host.getByRole('button', { name: '重载客户端生效', exact: true }).click()
    assert.equal(await page.evaluate(() => window.qaEnh.getReloadCount()), 1)
    await host.screenshot({ path: path.join(shotDir, '浏览器实测_1_更新页一键打开目录.png') })

    // 2. C6: RewardsPage -> LootHelperSection batch disenchant
    await page.evaluate(() => window.qaEnh.render('rewards'))
    await host.getByRole('group', { name: '奖励与战利品切换', exact: true }).getByRole('button', { name: '战利品分解', exact: true }).click()
    const lootView = host.getByTestId('loot-helper')
    await lootView.getByText('九尾妖狐', { exact: true }).waitFor()
    await lootView.getByText('+4,800 蓝色精粹', { exact: true }).waitFor()
    await host.screenshot({ path: path.join(shotDir, '浏览器实测_2_战利品分解助手.png') })
    // Uncheck 影流之主 to verify individual toggle
    await lootView.getByRole('button', { name: /影流之主/ }).click()
    await lootView.getByText('+2,880 蓝色精粹', { exact: true }).waitFor()
    await lootView.getByRole('button', { name: '一键分解 (3)', exact: true }).click()
    await lootView.getByRole('button', { name: '确认分解 +2,880', exact: true }).click()
    await lootView.getByText(/批量分解完成：共处理 1 种、3 个碎片/).waitFor()
    const crafted = await page.evaluate(() => window.qaEnh.getCraftedCalls())
    assert.equal(crafted.length, 1)
    assert.deepEqual(crafted[0], { recipe: 'CHAMPION_RENTAL_disenchant', ids: ['CHAMPION_RENTAL_103'], repeat: 3 })

    // 3. A4 + C1: SettingsPage custom proxy + real file input JSON import
    await page.evaluate(() => window.qaEnh.render('settings'))
    await host.getByPlaceholder('https://your-worker.workers.dev/').fill('https://sona-proxy.example.workers.dev')
    await host.getByRole('button', { name: '保存代理', exact: true }).click()
    await host.getByText('已保存自定义跨域代理地址。', { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => window.qaEnh.store.get('customCorsProxyUrl')), 'https://sona-proxy.example.workers.dev/')

    const importJson = JSON.stringify({
      schema: 1,
      app: 'sona-plus',
      version: '1.2.0',
      config: { hotkey: 'F4', unknownExtraField: true },
    })
    await host.locator('input[type="file"][aria-label="选择配置文件导入"]').setInputFiles({
      name: 'test-sona-config.json',
      mimeType: 'application/json',
      buffer: Buffer.from(importJson, 'utf-8'),
    })
    await host.getByText(/已成功导入并应用 1 项配置（跳过 1 项不兼容字段）/).waitFor()
    assert.equal(await page.evaluate(() => window.qaEnh.store.get('hotkey')), 'F4')
    await host.getByText('配置备份与迁移', { exact: true }).scrollIntoViewIfNeeded()
    await host.screenshot({ path: path.join(shotDir, '浏览器实测_3_设置页配置导入导出与自定义代理.png') })

    // 4. C2: Full E2E flow across PlayerHistoryModal -> MatchReport -> PlayerTagBook -> TeamHistoryModal
    await page.evaluate(() => { window.qaEnh.host.style.display = 'none' })
    if (names.length >= 4 && ids.length >= 4) {
      await page.getByPlaceholder(/名字#Tag/).fill(`${names[2]}#DEMO`)
      await page.getByRole('button', { name: '查询战绩', exact: true }).click()
      const profileView = page.getByTestId('player-history')
      await profileView.locator('.rh-match').first().waitFor()

      // Mark player in PlayerHistoryModal header
      await profileView.getByRole('button', { name: '标记该玩家', exact: true }).click()
      const editor = page.getByTestId('player-tag-editor')
      await editor.waitFor()
      await editor.getByRole('button', { name: '大腿', exact: true }).first().click()
      await editor.getByLabel('玩家备注说明', { exact: true }).fill('中路游走支援极快，逆风心态很稳')
      await editor.getByRole('button', { name: '保存标记', exact: true }).click()
      await editor.waitFor({ state: 'hidden' })
      await profileView.getByTestId('player-tag-badge').getByText('大腿', { exact: true }).waitFor()

      // Expand first match report and mark another player right inside the 10-player report
      await profileView.locator('.rh-expand').first().click()
      await profileView.locator('.rh-report-table').first().waitFor()
      await profileView.locator('.rh-report-table').first().getByTestId('player-tag-badge').first().waitFor()
      await profileView.locator('.rh-report-table').first().getByTestId('report-award-mvp').waitFor()
      await profileView.locator('.rh-report-table').first().getByTestId('report-award-svp').waitFor()

      // Verify all 10 player rows render summoner name strictly above champion name (never on same line, even for 2-char short IDs)
      const rowLayoutOk = await profileView.locator('.rh-report-table').first().locator('.rh-player-link').evaluateAll((links) => {
        if (links.length < 10) return false
        // Also simulate a short summoner ID ("陈冠希#1") on one row temporarily to guarantee block-stacking
        const sampleStrong = links[1].querySelector('strong')
        const prevHtml = sampleStrong ? sampleStrong.innerHTML : ''
        if (sampleStrong) sampleStrong.textContent = '陈冠希#1'
        const ok = links.every((link) => {
          const strong = link.querySelector('strong')
          const small = link.querySelector('small')
          if (!strong || !small) return false
          const csStrong = getComputedStyle(strong)
          const csSmall = getComputedStyle(small)
          const sb = strong.getBoundingClientRect()
          const smb = small.getBoundingClientRect()
          return csStrong.display === 'block'
            && csSmall.display === 'flex'
            && sb.height > 0
            && smb.height > 0
            && sb.bottom <= smb.top + 1.5
        })
        if (sampleStrong) sampleStrong.innerHTML = prevHtml
        return ok
      })
      assert.ok(rowLayoutOk, 'Every MatchReport player row must stack summoner ID above champion name on separate lines')

      // Verify report legend keeps color markers without verbose trailing note
      const legendText = await profileView.locator('.rh-report-legend').first().textContent()
      assert.match(legendText || '', /物理/)
      assert.match(legendText || '', /魔法/)
      assert.match(legendText || '', /经济/)
      assert.ok(!(legendText || '').includes('条长相对本场同项最高值'), 'Verbose bar explanation must be removed from report legend')

      await profileView.locator('.rh-report-table').first().getByRole('button', { name: `标记 ${names[5]}#DEMO`, exact: true }).click()
      await editor.waitFor()
      await editor.getByRole('button', { name: '避雷', exact: true }).first().click()
      await editor.getByLabel('玩家备注说明', { exact: true }).fill('频繁挂机点投降')
      await editor.getByRole('button', { name: '保存标记', exact: true }).click()
      await editor.waitFor({ state: 'hidden' })
      await profileView.screenshot({ path: path.join(shotDir, '浏览器实测_4_个人战绩与十人战报标记.png') })

      // Open PlayerTagBookModal from header and verify both tags appear
      await profileView.getByRole('button', { name: '玩家小本本', exact: true }).click()
      const book = page.getByTestId('player-tag-book')
      await book.getByText('共标记 2 位召唤师', { exact: true }).waitFor()
      await book.getByText('中路游走支援极快，逆风心态很稳', { exact: true }).waitFor()
      await book.getByText('频繁挂机点投降', { exact: true }).waitFor()
      await page.waitForTimeout(260)
      await book.screenshot({ path: path.join(shotDir, '浏览器实测_5_玩家小本本管理弹窗.png') })
      await page.keyboard.press('Escape')
      await book.waitFor({ state: 'hidden' })
      await page.keyboard.press('Escape')
      await profileView.waitFor({ state: 'hidden' })

      // Open 10-player TeamHistoryModal and verify BOTH PlayerTagBadge AND EncounterAlertBadge + tooltip!
      await page.evaluate(() => {
        window.qaEnh.host.style.display = 'none'
        window.qaEnh.render('team')
      })
      const gameView = page.getByTestId('game-history')
      await gameView.locator('.rh-team-card-stats').nth(9).waitFor()
      await gameView.getByTestId('player-tag-badge').first().waitFor()
      const encounterBadge = gameView.getByTestId('encounter-alert-badge').first()
      await encounterBadge.waitFor()
      await encounterBadge.hover()
      await page.getByRole('tooltip').getByText(/近期撞车：我方/).waitFor()
      await page.screenshot({ path: path.join(shotDir, '浏览器实测_6_十人对局标记与撞车悬浮提示.png') })
      await page.mouse.move(2, 2)

      // 5. C3: BP Composition Damage Share & Weakness Diagnostic Bar (All-AD warning + hover breakdown + live balanced update)
      await page.evaluate(({ ids, names }) => {
        const allAdSession = {
          queueId: 420,
          localPlayerCellId: 0,
          myTeam: [
            { puuid: ids[0], gameName: names[0], tagLine: 'DEMO', cellId: 0, summonerId: 100, assignedPosition: 'top', championId: 222, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[1], gameName: names[1], tagLine: 'DEMO', cellId: 1, summonerId: 101, assignedPosition: 'jungle', championId: 51, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[2], gameName: names[2], tagLine: 'DEMO', cellId: 2, summonerId: 102, assignedPosition: 'middle', championId: 0, championPickIntent: 157, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[3], gameName: names[3], tagLine: 'DEMO', cellId: 3, summonerId: 103, assignedPosition: 'bottom', championId: 22, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[4], gameName: names[4], tagLine: 'DEMO', cellId: 4, summonerId: 104, assignedPosition: 'utility', championId: 117, nameVisibilityType: 'PUBLIC', isHumanoid: true },
          ],
          theirTeam: [],
          actions: [[
            { actorCellId: 0, type: 'pick', championId: 222, completed: true },
            { actorCellId: 1, type: 'pick', championId: 51, completed: true },
            { actorCellId: 2, type: 'pick', championId: 157, completed: false, isInProgress: true },
            { actorCellId: 3, type: 'pick', championId: 22, completed: true },
            { actorCellId: 4, type: 'pick', championId: 117, completed: true },
          ]],
        }
        window.qaEnh.lcu.getChampSelectSession = async () => allAdSession
        window.qaEnh.render('team-bp')
      }, { ids, names })

      const bpDiagView = page.getByTestId('bp-history')
      const compBar = bpDiagView.getByTestId('bp-comp-diagnostic')
      await compBar.waitFor()
      await compBar.getByText('菜刀队预警', { exact: true }).waitFor()
      await compBar.getByText('缺乏前排', { exact: true }).waitFor()
      await compBar.getByText(/5\/5（含1预选）/).waitFor()

      // Verify top-right count selector uses concise labels (20场/50场/100场) and never overlaps arrow or checkmark
      const countTrigger = bpDiagView.getByRole('combobox', { name: '队伍查询场次' })
      await countTrigger.click()
      const countListbox = page.getByRole('listbox', { name: '队伍查询场次' })
      await countListbox.waitFor()
      const countGeometry = await page.evaluate(() => {
        const trigger = document.querySelector('.sona-select.rh-team-count .sona-select-trigger')
        const val = trigger?.querySelector('.sona-select-value')
        const arrow = trigger?.querySelector('.sona-select-arrow')
        const list = document.querySelector('.sona-select-dropdown.rh-team-count')
        const opts = Array.from(list?.querySelectorAll('.sona-select-option') || [])
        const labels = opts.map((o) => o.querySelector('.sona-select-option-label')?.textContent?.trim() || '')
        const triggerOk = Boolean(
          val && arrow
          && val.scrollWidth <= val.clientWidth + 1
          && val.getBoundingClientRect().right <= arrow.getBoundingClientRect().left - 4,
        )
        const optionsOk = opts.length === 3 && opts.every((o) => {
          const lbl = o.querySelector('.sona-select-option-label')
          if (!lbl || lbl.scrollWidth > lbl.clientWidth + 1) return false
          const check = o.lastElementChild !== lbl ? o.lastElementChild : null
          if (check) {
            return lbl.getBoundingClientRect().right <= check.getBoundingClientRect().left - 8
          }
          return true
        })
        return { labels, triggerOk, optionsOk }
      })
      assert.deepEqual(countGeometry.labels, ['20场', '50场', '100场'])
      assert.ok(countGeometry.triggerOk, 'rh-team-count trigger text must not clip or overlap dropdown arrow')
      assert.ok(countGeometry.optionsOk, 'rh-team-count dropdown options must not clip or overlap checkmark')
      await page.screenshot({ path: path.join(shotDir, '浏览器实测_7b_BP右上角场次下拉不遮挡.png') })
      await page.keyboard.press('Escape')
      await countListbox.waitFor({ state: 'hidden' })

      await compBar.locator('.sona-comp-diag-bar-section').hover()
      await page.getByRole('tooltip').getByText('团队预计伤害结构与定位明细', { exact: true }).waitFor()
      await page.getByRole('tooltip').getByText(/3楼 \[预选\] 亚索/).waitFor()
      await page.screenshot({ path: path.join(shotDir, '浏览器实测_7_BP对局详情阵容伤害与短板诊断.png') })
      await page.mouse.move(2, 2)

      // Live session update -> balanced composition
      await page.evaluate(({ ids, names }) => {
        const balancedSession = {
          queueId: 420,
          localPlayerCellId: 0,
          myTeam: [
            { puuid: ids[0], gameName: names[0], tagLine: 'DEMO', cellId: 0, summonerId: 100, assignedPosition: 'top', championId: 154, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[1], gameName: names[1], tagLine: 'DEMO', cellId: 1, summonerId: 101, assignedPosition: 'jungle', championId: 64, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[2], gameName: names[2], tagLine: 'DEMO', cellId: 2, summonerId: 102, assignedPosition: 'middle', championId: 103, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[3], gameName: names[3], tagLine: 'DEMO', cellId: 3, summonerId: 103, assignedPosition: 'bottom', championId: 222, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[4], gameName: names[4], tagLine: 'DEMO', cellId: 4, summonerId: 104, assignedPosition: 'utility', championId: 267, nameVisibilityType: 'PUBLIC', isHumanoid: true },
          ],
          theirTeam: [],
          actions: [],
        }
        window.qaEmit('/lol-champ-select/v1/session', balancedSession)
      }, { ids, names })
      await compBar.getByText('阵容均衡', { exact: true }).waitFor()

      // 6. C4: ToolsPage ARAM Wishlist config + live ARAM bench auto-swap, highlight & teammate ace hints + native compact CompDiagnosticBar
      await page.evaluate(() => {
        window.qaEnh.host.style.display = 'block'
        window.qaEnh.render('tools')
      })
      const wishCard = host.locator('.sona-setting-card').filter({ hasText: '大乱斗替补席心愿单' })
      await wishCard.waitFor()
      await wishCard.scrollIntoViewIfNeeded()
      await wishCard.getByRole('switch').click()
      const wishInput = host.getByPlaceholder(/添加心愿英雄名\/称号/)
      await wishInput.waitFor()
      await wishInput.fill('阿狸')
      await host.locator('.sona-champ-suggest-item').filter({ hasText: '阿狸' }).first().click()
      await wishInput.fill('金克丝')
      await host.locator('.sona-champ-suggest-item').filter({ hasText: '金克丝' }).first().click()
      // Move 金克丝 (currently #2) up to #1!
      await host.getByRole('button', { name: '提高顺位', exact: true }).first().click()
      assert.deepEqual(await page.evaluate(() => window.qaEnh.store.get('aramWishlistChampionIds')), [222, 103])
      await wishCard.scrollIntoViewIfNeeded()
      await host.screenshot({ path: path.join(shotDir, '浏览器实测_8_工具页大乱斗心愿单与优先级配置.png') })

      // Hide host and mount realistic ARAM bench + native ally party stage
      await page.evaluate(({ ids, names }) => {
        window.qaEnh.host.style.display = 'none'
        const stage = document.createElement('div')
        stage.id = 'qa-aram-bench-stage'
        stage.style.cssText = 'position:fixed;inset:0;z-index:205000;background:radial-gradient(circle at 50% 0%, #16293d 0%, #071019 72%);padding:36px 44px;box-sizing:border-box;color:#f0e6d2;font-family:"Microsoft YaHei UI",sans-serif;'
        stage.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:24px;">
            <div style="font-size:12px;color:#c8aa6e;letter-spacing:0.06em;font-weight:700;">海克斯大乱斗 · 真实客户端紧凑替补席（44×44 · 6px 间距）视觉检验</div>
            <div class="bench-container" style="display:flex;align-items:center;gap:6px;padding:6px 12px;">
              <span style="font-size:12px;color:#a09b8c;margin-right:6px;">可用</span>
              ${[[103, '1', '#1fa6f3'], [64, '3', '#e0a23a'], [99, '2', '#17c3a5'], [154, '4', '#7f8c9a'], [238, '', ''], [81, '', '']].map(([cid, tierText, tierBg]) => `
                <div class="champion-bench-item" data-champion-id="${cid}" style="width:44px;height:44px;background:#091428;border:1px solid #463714;cursor:pointer;box-sizing:border-box;">
                  <div class="bench-champion-icon" style="width:100%;height:100%;position:relative;">
                    ${tierText ? `<span style="position:absolute;left:-1px;top:-1px;z-index:10;width:13px;height:14px;line-height:14px;text-align:center;font-size:9px;font-weight:800;color:#fff;background:${tierBg};clip-path:polygon(0 0,100% 0,100% 72%,50% 100%,0 72%);">${tierText}</span>` : ''}
                    <div class="bench-champion-background" style="width:100%;height:100%;background-image:url('/lol-game-data/assets/v1/champion-icons/${cid}.png');background-size:cover;"></div>
                  </div>
                </div>
              `).join('')}
            </div>
            <div style="width:460px;height:1px;background:linear-gradient(90deg,transparent,#785a28 18%,#c8aa6e 50%,#785a28 82%,transparent);"></div>
            <div style="font-size:22px;font-weight:700;color:#f0e6d2;line-height:1;margin-top:-2px;">14</div>
          </div>
          <div class="summoner-array your-party" style="width:334px;background:rgba(8,14,22,0.72);border:1px solid rgba(200,170,110,0.2);border-radius:8px;padding:12px 4px;">
            ${names.slice(0, 5).map((n, idx) => `
              <div style="display:flex;align-items:center;gap:10px;padding:6px 14px;font-size:12px;color:#cdbe91;">
                <span style="width:24px;height:24px;border-radius:50%;background:#1e2d42;display:inline-grid;place-items:center;border:1px solid rgba(200,170,110,0.4);">${idx + 1}</span>
                <span>${n}</span>
              </div>
            `).join('')}
          </div>
        `
        document.body.appendChild(stage)

        const aramSession1 = {
          queueId: 450,
          benchEnabled: true,
          benchChampions: [{ championId: 103, isPriority: false }, { championId: 64, isPriority: false }, { championId: 99, isPriority: false }, { championId: 154, isPriority: false }],
          localPlayerCellId: 0,
          myTeam: [
            { puuid: ids[0], gameName: names[0], tagLine: 'DEMO', cellId: 0, summonerId: 100, championId: 83, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[1], gameName: names[1], tagLine: 'DEMO', cellId: 1, summonerId: 101, championId: 64, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[2], gameName: names[2], tagLine: 'DEMO', cellId: 2, summonerId: 102, championId: 51, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[3], gameName: names[3], tagLine: 'DEMO', cellId: 3, summonerId: 103, championId: 22, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[4], gameName: names[4], tagLine: 'DEMO', cellId: 4, summonerId: 104, championId: 117, nameVisibilityType: 'PUBLIC', isHumanoid: true },
          ],
          theirTeam: [],
          actions: [],
        }
        window.qaEnh.lcu.getChampSelectSession = async () => aramSession1
        window.qaEnh.lcu.getGameflowPhase = async () => 'ChampSelect'
        window.qaEmit('/lol-gameflow/v1/gameflow-phase', 'ChampSelect')
        window.qaEmit('/lol-champ-select/v1/session', aramSession1)
      }, { ids, names })

      // Verify auto-swap triggered once for #2 Ahri (103)
      await page.waitForFunction(() => window.qaEnh.getSwappedIds().length === 1)
      assert.deepEqual(await page.evaluate(() => window.qaEnh.getSwappedIds()), [103])

      // Now simulate local player holding #1 Jinx (222) while #2 Ahri (103) is still on the bench -> must NOT ping-pong back to 103!
      await page.evaluate(({ ids, names }) => {
        const aramSession2 = {
          queueId: 450,
          benchEnabled: true,
          benchChampions: [{ championId: 103, isPriority: false }, { championId: 64, isPriority: false }, { championId: 99, isPriority: false }, { championId: 154, isPriority: false }],
          localPlayerCellId: 0,
          myTeam: [
            { puuid: ids[0], gameName: names[0], tagLine: 'DEMO', cellId: 0, summonerId: 100, championId: 222, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[1], gameName: names[1], tagLine: 'DEMO', cellId: 1, summonerId: 101, championId: 64, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[2], gameName: names[2], tagLine: 'DEMO', cellId: 2, summonerId: 102, championId: 51, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[3], gameName: names[3], tagLine: 'DEMO', cellId: 3, summonerId: 103, championId: 22, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[4], gameName: names[4], tagLine: 'DEMO', cellId: 4, summonerId: 104, championId: 117, nameVisibilityType: 'PUBLIC', isHumanoid: true },
          ],
          theirTeam: [],
          actions: [],
        }
        window.qaEmit('/lol-champ-select/v1/session', aramSession2)
      }, { ids, names })

      const stage = page.locator('#qa-aram-bench-stage')
      await stage.locator('[data-sona-bench-wish-badge]').getByText('★2', { exact: true }).waitFor()
      await stage.locator('[data-sona-bench-mate-badge]').first().waitFor()
      await stage.getByTestId('native-comp-diagnostic').waitFor()
      assert.deepEqual(await page.evaluate(() => window.qaEnh.getSwappedIds()), [103], 'Holding #1 Jinx must not swap down to #2 Ahri')

      // Verify bench badges never protrude outside 44x44 portrait bounds or overlap Hextech divider
      const benchBoundsOk = await stage.locator('.champion-bench-item').evaluateAll((items) => {
        return items.every((item) => {
          const ir = item.getBoundingClientRect()
          return Array.from(item.querySelectorAll('[data-sona-bench-wish-badge],[data-sona-bench-mate-badge]')).every((badge) => {
            const br = badge.getBoundingClientRect()
            return br.left >= ir.left - 0.5 && br.right <= ir.right + 0.5 && br.top >= ir.top - 0.5 && br.bottom <= ir.bottom + 0.5
          })
        })
      })
      assert.ok(benchBoundsOk, 'All bench badges must fit 100% flush inside their 44x44 portrait frame')

      // Hover bench item 103 to inspect non-colliding bench intelligence tooltip
      await stage.locator('.champion-bench-item[data-champion-id="103"]').hover()
      const benchTip = page.locator('#sona-aram-bench-assist-tooltip.is-visible')
      await benchTip.getByText('替补席情报', { exact: true }).waitFor()
      await benchTip.getByText(/★ 心愿英雄 #2/).waitFor()
      await benchTip.getByText('绝活', { exact: true }).first().waitFor()
      await page.screenshot({ path: path.join(shotDir, '浏览器实测_9_大乱斗替补席心愿高亮与队友绝活及原生诊断条.png') })
      await page.mouse.move(2, 2)

      // 7. Verify Custom 海克斯大乱斗 queue deduplication -> canonical 2400 (no duplicate 海克斯大乱斗 options)
      const canonicalCheck = await page.evaluate(async () => {
        const { resolveCanonicalQueueId } = await import('/src/lib/assets.ts')
        return {
          customKiwiByName: resolveCanonicalQueueId(3270, { name: '海克斯大乱斗', gameMode: 'KIWI', isCustom: true }),
          customKiwiByMode: resolveCanonicalQueueId(3271, { name: '自定义海斗', gameMode: 'KIWI', isCustom: true }),
          customAram: resolveCanonicalQueueId(3250, { name: '极地大乱斗', gameMode: 'ARAM', isCustom: true, mapId: 12 }),
          customRift: resolveCanonicalQueueId(3100, { name: '自选模式', gameMode: 'CLASSIC', isCustom: true, mapId: 11 }),
          standardRanked: resolveCanonicalQueueId(420),
        }
      })
      assert.deepEqual(canonicalCheck, {
        customKiwiByName: 2400,
        customKiwiByMode: 2400,
        customAram: 450,
        customRift: 0,
        standardRanked: 420,
      })

      // 8. Verify Career 详细战绩 button (.sona-profile-history-entry) circular border & dead-center SVG under production dist/index.css
      const profileBtnCheck = await page.evaluate(async () => {
        document.getElementById('qa-aram-bench-stage')?.remove()
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = '/dist/index.css'
        await new Promise((resolve, reject) => {
          link.onload = resolve
          link.onerror = reject
          document.head.appendChild(link)
        })
        const { styleClientEntry } = await import('/src/lib/client-entry-button.ts')
        const previewBox = document.createElement('div')
        previewBox.id = 'qa-profile-btn-preview'
        previewBox.style.cssText = 'position:fixed;top:40px;right:40px;width:300px;height:140px;z-index:215000;background:#09111b;border:1px solid rgba(200,170,110,0.35);border-radius:8px;padding:16px;box-sizing:border-box;'
        previewBox.innerHTML = '<div style="font-size:12px;color:#c8aa6e;margin-bottom:8px;">生涯入口图标居中校验（加载生产 dist/index.css）</div>'
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'sona-profile-history-entry'
        btn.style.top = '64px'
        btn.style.right = '134px'
        styleClientEntry(btn, '详细战绩', 'history')
        previewBox.appendChild(btn)
        document.body.appendChild(previewBox)

        const cs = getComputedStyle(btn)
        const btnRect = btn.getBoundingClientRect()
        const svgRect = btn.querySelector('svg').getBoundingClientRect()
        return {
          borderRadius: cs.borderRadius,
          paddingLeft: cs.paddingLeft,
          paddingRight: cs.paddingRight,
          width: btnRect.width,
          height: btnRect.height,
          horizDiff: Math.abs((svgRect.left - btnRect.left) - (btnRect.right - svgRect.right)),
          vertDiff: Math.abs((svgRect.top - btnRect.top) - (btnRect.bottom - svgRect.bottom)),
        }
      })
      assert.equal(profileBtnCheck.borderRadius, '50%')
      assert.equal(profileBtnCheck.paddingLeft, '0px')
      assert.equal(profileBtnCheck.paddingRight, '0px')
      assert.equal(profileBtnCheck.width, 32)
      assert.equal(profileBtnCheck.height, 32)
      assert.ok(profileBtnCheck.horizDiff <= 0.6, `Expected SVG horizontally centered, diff=${profileBtnCheck.horizDiff}`)
      assert.ok(profileBtnCheck.vertDiff <= 0.6, `Expected SVG vertically centered, diff=${profileBtnCheck.vertDiff}`)
      await page.locator('#qa-profile-btn-preview').screenshot({ path: path.join(shotDir, '浏览器实测_10_生涯详细战绩圆形居中按钮.png') })

      // 9. Verify production dist/index.css cascade order & walk through all Main App Modal sidebar tabs
      const prodCssText = fs.readFileSync(path.resolve('dist/index.css'), 'utf8')
      const personalIdx = prodCssText.indexOf('.rh-match-slot')
      const surfacesIdx = prodCssText.indexOf('.sona-select-dropdown.rh-select')
      assert.ok(personalIdx >= 0 && surfacesIdx > personalIdx, `ClientSurfaces.css (${surfacesIdx}) must follow PersonalHistory.css (${personalIdx}) in dist/index.css`)

      await page.evaluate(() => {
        document.getElementById('qa-profile-btn-preview')?.remove()
      })

      const prevDevMode = await page.evaluate(async () => {
        const ReactMod = await import('/node_modules/.vite/deps/react.js')
        const React = ReactMod.default ?? ReactMod
        const { App } = await import('/src/App.tsx')
        const { openModal } = await import('/src/lib/modal.ts')
        const prev = window.qaEnh.store.get('developerMode')
        window.qaEnh.host.style.display = 'none'
        window.qaEnh.store.set('developerMode', true)
        window.qaEnh.root.render(React.createElement(App))
        openModal()
        return prev
      })
      const mainOverlay = page.locator('.sona-modal-overlay').filter({ has: page.locator('.sona-sidebar') })
      await mainOverlay.waitFor()
      const navItems = await mainOverlay.locator('.sona-sidebar-item').all()
      assert.ok(navItems.length >= 7, `Expected >=7 sidebar tabs with developerMode, got ${navItems.length}`)
      for (const navItem of navItems) {
        await navItem.click()
        await page.waitForTimeout(90)
      }
      await mainOverlay.screenshot({ path: path.join(shotDir, '浏览器实测_11_主面板全分页巡检通过.png') })

      // Verify Main Menu HomePage stays pure welcome screen (no switches) & ToolsPage holds all dedicated switches
      await mainOverlay.locator('.sona-sidebar-item').filter({ hasText: '主页' }).click()
      await mainOverlay.locator('.sona-home-avatar').waitFor()
      assert.equal(await mainOverlay.locator('[data-testid="home-quick-toggles"], .sona-home-quick-panel, .sona-home-quick-item').count(), 0, 'HomePage must remain clean welcome screen without switches')
      assert.equal(await mainOverlay.locator('.sona-home').getByRole('switch').count(), 0, 'HomePage must not render any switch controls')
      await mainOverlay.screenshot({ path: path.join(shotDir, '浏览器实测_12_主菜单主页纯净还原.png') })

      // Verify all switches live inside ToolsPage (工具 -> 实战情报与增强)
      await mainOverlay.locator('.sona-sidebar-item').filter({ hasText: '工具' }).click()
      const tagSwitchCard = mainOverlay.locator('.sona-setting-card').filter({ hasText: '玩家标记（小本本）' })
      await tagSwitchCard.waitFor()
      for (const cardTitle of [
        '玩家标记（小本本）',
        '选人阶段小本本避雷预警',
        '历史撞车自动提醒',
        '赛后结算与战报 MVP/SVP 徽章',
        'BP 阵容伤害与短板诊断',
        '锁定英雄自动随机皮肤 / 炫彩',
        '自动处理楼层互换 / 英雄交换请求',
        '大乱斗替补席队友绝活提示',
        '大乱斗替补席心愿单',
        '分模式 / 分路独立秒选禁用预设',
      ]) {
        assert.equal(await mainOverlay.locator('.sona-setting-card').filter({ hasText: cardTitle }).count(), 1, `ToolsPage missing card: ${cardTitle}`)
      }
      // Toggle 玩家标记（小本本） off from ToolsPage and verify 玩家小本本 entry hides immediately, then re-enable
      await tagSwitchCard.getByRole('switch').click()
      assert.equal(await page.evaluate(() => window.qaEnh.store.get('playerTagEnabled')), false)
      assert.equal(await mainOverlay.getByRole('button', { name: '玩家小本本', exact: true }).count(), 0, 'Tag book button must hide when playerTagEnabled is false')
      await tagSwitchCard.getByRole('switch').click()
      assert.equal(await page.evaluate(() => window.qaEnh.store.get('playerTagEnabled')), true)
      await mainOverlay.getByRole('button', { name: '玩家小本本', exact: true }).waitFor()
      await mainOverlay.screenshot({ path: path.join(shotDir, '浏览器实测_13_工具页独立功能开关组.png') })

      // Verify Auto-Honor 3-option strategy dropdown (智能点赞 / 仅好友 / 随机分配给票)
      const honorCard = mainOverlay.locator('.sona-setting-card').filter({ hasText: /^对局结束自动点赞/ })
      await honorCard.scrollIntoViewIfNeeded()
      await honorCard.locator('.sona-select-trigger').click()
      const honorDropdown = page.locator('.sona-select-dropdown').last()
      await honorDropdown.waitFor()
      const honorOptionLabels = await honorDropdown.locator('.sona-select-option-label').allTextContents()
      assert.deepEqual(honorOptionLabels.map((s) => s.trim()), ['智能点赞（好友/MVP·跳避雷）', '仅好友', '随机分配给票'])
      await mainOverlay.screenshot({ path: path.join(shotDir, '浏览器实测_17_自动点赞仅好友选项.png') })
      await honorDropdown.locator('.sona-select-option').filter({ hasText: '仅好友' }).click()
      assert.equal(await page.evaluate(() => window.qaEnh.store.get('autoHonorStrategy')), 'friends_only')

      // E6 UI & Functional test: Auto-Lock 9-scope preset pill tabs (select 上单 -> add 亚索 -> verify pos:top preset)
      const autoLockCard = mainOverlay.locator('.sona-setting-card').filter({ hasText: /^秒抢英雄/ })
      await autoLockCard.scrollIntoViewIfNeeded()
      await autoLockCard.getByRole('switch').click()
      const presetTabs = mainOverlay.getByTestId('autolock-preset-tabs')
      await presetTabs.waitFor()
      assert.equal(await presetTabs.locator('button').count(), 9)
      await presetTabs.getByRole('button', { name: '上单', exact: true }).click()
      const lockInput = mainOverlay.getByPlaceholder(/输入英雄名\/称号搜索/).first()
      await lockInput.fill('亚索')
      await mainOverlay.locator('.sona-champ-suggest-item').filter({ hasText: '亚索' }).first().click()
      await presetTabs.getByRole('button', { name: '上单 (1)', exact: true }).waitFor()
      assert.deepEqual(await page.evaluate(() => window.qaEnh.store.get('champSelectPresets')['pos:top']?.lockIds), [157])
      await autoLockCard.scrollIntoViewIfNeeded()
      await mainOverlay.screenshot({ path: path.join(shotDir, '浏览器实测_16_工具页分路秒选预设方案.png') })

      await page.evaluate(async (prev) => {
        const { closeModal } = await import('/src/lib/modal.ts')
        closeModal()
        window.qaEnh.store.set('developerMode', prev)
        window.qaEnh.store.set('autoLockChampion', window.qaEnh.saved.autoLock)
        window.qaEnh.store.set('champSelectPresets', window.qaEnh.saved.presets)
      }, prevDevMode)
      await mainOverlay.waitFor({ state: 'hidden' })

      // 10. Browser UI & Functional test for E1 (Avoid Banner) + E4 (Random Skin) + E5 (Auto Swap) + E2 (Native Postgame Scoreboard)
      const eFeaturesRes = await page.evaluate(async ({ ids, names }) => {
        const { store, lcu } = window.qaEnh
        const selectedSkins = []
        const acceptedSwaps = []
        lcu.getSkinCarouselSkins = async () => [
          { id: 103000, championId: 103, name: '九尾妖狐', isBase: true, unlocked: true },
          { id: 103027, championId: 103, name: '灵魂莲华 阿狸', unlocked: true, childSkins: [{ id: 103028, name: '灵魂莲华 阿狸 炫彩·夜樱', unlocked: true }] },
        ]
        lcu.setSelectedSkinId = async (skinId) => {
          selectedSkins.push(skinId)
          return true
        }
        lcu.acceptPickOrderSwap = async (swapId) => {
          acceptedSwaps.push(swapId)
          return true
        }
        store.set('autoRandomSkin', true)
        store.set('autoAcceptSwap', true)
        store.set('autoAcceptSwapStrategy', 'favorable_or_friends')

        // ids[5] was marked '避雷' earlier in step 4! Put ids[5] on floor 3 + incoming swap from floor 4 (favorable counter-pick floor)
        const csWithAvoid = {
          id: 'qa-e1-cs',
          queueId: 420,
          allowSkinSelection: true,
          localPlayerCellId: 0,
          myTeam: [
            { puuid: ids[0], gameName: names[0], tagLine: 'DEMO', cellId: 0, summonerId: 100, championId: 103, selectedSkinId: 103000, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[1], gameName: names[1], tagLine: 'DEMO', cellId: 1, summonerId: 101, championId: 64, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[5], gameName: names[5], tagLine: 'DEMO', cellId: 2, summonerId: 105, championId: 157, nameVisibilityType: 'PUBLIC', isHumanoid: true },
            { puuid: ids[3], gameName: names[3], tagLine: 'DEMO', cellId: 3, summonerId: 103, championId: 222, nameVisibilityType: 'PUBLIC', isHumanoid: true },
          ],
          theirTeam: [],
          actions: [[{ id: 1, actorCellId: 0, type: 'pick', championId: 103, completed: true, isInProgress: false }]],
          pickOrderSwaps: [
            { id: 77, cellId: 2, state: 'RECEIVED' }, // from ids[5] (避雷) -> MUST NOT accept
            { id: 88, cellId: 3, state: 'RECEIVED' }, // from floor 4 -> moves 1楼 to 4楼 -> MUST accept!
          ],
          trades: [],
        }
        window.qaEnh.eState = { selectedSkins, acceptedSwaps }
        lcu.getChampSelectSession = async () => csWithAvoid
        lcu.getGameflowPhase = async () => 'ChampSelect'
        window.qaEmit('/lol-gameflow/v1/gameflow-phase', 'ChampSelect')
        window.qaEmit('/lol-champ-select/v1/session', csWithAvoid)
        return true
      }, { ids, names })
      assert.equal(eFeaturesRes, true)

      const avoidBanner = page.getByTestId('champselect-tag-alert')
      await avoidBanner.waitFor()
      await avoidBanner.getByText(/小本本避雷预警/).waitFor()
      await avoidBanner.getByText('频繁挂机点投降', { exact: false }).waitFor()
      await page.waitForFunction(() => window.qaEnh.eState.selectedSkins.length === 1)
      const skinAndSwap = await page.evaluate(() => window.qaEnh.eState)
      assert.ok([103027, 103028].includes(skinAndSwap.selectedSkins[0]), `Expected owned non-base skin/chroma, got ${skinAndSwap.selectedSkins[0]}`)
      assert.deepEqual(skinAndSwap.acceptedSwaps, [88], 'Must reject avoid player swap 77 and accept favorable floor swap 88')
      await avoidBanner.screenshot({ path: path.join(shotDir, '浏览器实测_14_选人阶段小本本避雷强预警.png') })
      await avoidBanner.getByRole('button', { name: '知道了', exact: true }).click()
      await avoidBanner.waitFor({ state: 'hidden' })

      // E2 Native Post-Game Scoreboard MVP/SVP + quick bookmark injection
      await page.evaluate(({ ids, names }) => {
        const pgStage = document.createElement('div')
        pgStage.id = 'qa-postgame-stage'
        pgStage.setAttribute('data-testid', 'qa-postgame-scoreboard')
        pgStage.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:215000;width:540px;padding:16px 20px;background:#09111b;border:1px solid rgba(200,170,110,0.42);border-radius:6px;color:#f0e6d2;font:13px "Microsoft YaHei UI",sans-serif;'
        pgStage.innerHTML = `
          <div style="font-size:13px;font-weight:700;color:#c8aa6e;margin-bottom:10px;">赛后结算计分板 · 原生行注入实测</div>
          <div class="scoreboard-row" data-puuid="${ids[0]}" style="padding:7px 10px;border-bottom:1px solid rgba(200,170,110,0.16);"><span class="summoner-name">${names[0]}</span> <span style="float:right;color:#a09b8c;">16 / 2 / 11</span></div>
          <div class="scoreboard-row" data-puuid="${ids[1]}" style="padding:7px 10px;border-bottom:1px solid rgba(200,170,110,0.16);"><span class="summoner-name">${names[1]}</span> <span style="float:right;color:#a09b8c;">5 / 4 / 9</span></div>
          <div class="scoreboard-row" data-puuid="${ids[3]}" style="padding:7px 10px;"><span class="summoner-name">${names[3]}</span> <span style="float:right;color:#a09b8c;">13 / 5 / 7</span></div>
        `
        document.body.appendChild(pgStage)
        window.qaEnh.lcu.getEogStatsBlock = async () => ({
          gameId: 776655,
          gameLength: 1420,
          gameMode: 'CLASSIC',
          teams: [
            {
              teamId: 100,
              isWinningTeam: true,
              players: [
                { puuid: ids[0], summonerId: 100, riotIdGameName: names[0], tagLine: 'DEMO', championId: 103, isLocalPlayer: true, stats: { CHAMPIONS_KILLED: 16, NUM_DEATHS: 2, ASSISTS: 11, TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: 39000, TOTAL_DAMAGE_TAKEN: 18000, GOLD_EARNED: 16200, MINIONS_KILLED: 210, NEUTRAL_MINIONS_KILLED: 12, TOTAL_HEAL: 4200, VISION_SCORE: 32, WIN: 1 } },
                { puuid: ids[1], summonerId: 101, riotIdGameName: names[1], tagLine: 'DEMO', championId: 64, isLocalPlayer: false, stats: { CHAMPIONS_KILLED: 5, NUM_DEATHS: 4, ASSISTS: 9, TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: 15000, TOTAL_DAMAGE_TAKEN: 24000, GOLD_EARNED: 11800, MINIONS_KILLED: 40, NEUTRAL_MINIONS_KILLED: 130, TOTAL_HEAL: 6200, VISION_SCORE: 26, WIN: 1 } },
              ],
            },
            {
              teamId: 200,
              isWinningTeam: false,
              players: [
                { puuid: ids[3], summonerId: 103, riotIdGameName: names[3], tagLine: 'DEMO', championId: 222, isLocalPlayer: false, stats: { CHAMPIONS_KILLED: 13, NUM_DEATHS: 5, ASSISTS: 7, TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: 33000, TOTAL_DAMAGE_TAKEN: 17000, GOLD_EARNED: 14900, MINIONS_KILLED: 225, NEUTRAL_MINIONS_KILLED: 4, TOTAL_HEAL: 2800, VISION_SCORE: 21, WIN: 0 } },
                { puuid: ids[4], summonerId: 104, riotIdGameName: names[4], tagLine: 'DEMO', championId: 117, isLocalPlayer: false, stats: { CHAMPIONS_KILLED: 1, NUM_DEATHS: 8, ASSISTS: 12, TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: 8200, TOTAL_DAMAGE_TAKEN: 19000, GOLD_EARNED: 9600, MINIONS_KILLED: 28, NEUTRAL_MINIONS_KILLED: 0, TOTAL_HEAL: 9100, VISION_SCORE: 45, WIN: 0 } },
              ],
            },
          ],
        })
        window.qaEnh.lcu.getGameflowPhase = async () => 'EndOfGame'
        window.qaEmit('/lol-gameflow/v1/gameflow-phase', 'EndOfGame')
      }, { ids, names })

      const pgStage = page.locator('#qa-postgame-stage')
      await pgStage.locator('.sona-pg-award--mvp').waitFor()
      await pgStage.locator('.sona-pg-award--svp').waitFor()
      await pgStage.getByRole('button', { name: '记本', exact: true }).first().waitFor()
      await pgStage.screenshot({ path: path.join(shotDir, '浏览器实测_15_赛后结算MVP徽章与一键记本.png') })

      await page.evaluate(() => {
        document.getElementById('qa-postgame-stage')?.remove()
        document.querySelector('link[href="/dist/index.css"]')?.remove()
      })

      // 11. Career top-right .sona-profile-history-entry instant open test (even when LCU only provides summoner-id with slow HTTP)
      await page.evaluate(({ ids, names }) => {
        let lookupCalls = 0
        window.qaEnh.getLookupCalls = () => lookupCalls
        window.qaEnh.lcu.getSummonerById = async (sid) => {
          lookupCalls += 1
          await new Promise((r) => setTimeout(r, 380))
          const idx = Number(sid) - 100
          return { puuid: ids[idx], summonerId: Number(sid), gameName: names[idx], tagLine: 'DEMO' }
        }
        const careerModal = document.createElement('div')
        careerModal.id = 'qa-career-latency-modal'
        careerModal.className = 'rcp-fe-lol-profiles-modal'
        careerModal.style.cssText = 'position:fixed;top:24px;left:24px;width:500px;height:140px;z-index:12000;background:#09111b;'
        careerModal.innerHTML = `
          <div class="style-profile-sub-nav" style="height:40px;">生涯导航</div>
          <lol-regalia-profile-v2-element summoner-id="108">他人生涯</lol-regalia-profile-v2-element>
        `
        document.body.appendChild(careerModal)
      }, { ids, names })

      const careerFastEntry = page.locator('#qa-career-latency-modal .sona-profile-history-entry')
      await careerFastEntry.waitFor()
      // Wait for background pre-warm while Career page is open
      await page.waitForTimeout(440)
      const callsBeforeClick = await page.evaluate(() => window.qaEnh.getLookupCalls())
      assert.equal(callsBeforeClick, 1, 'Career page mount should pre-warm summoner-id -> puuid in background')

      const clickElapsedMs = await page.evaluate(async () => {
        const btn = document.querySelector('#qa-career-latency-modal .sona-profile-history-entry')
        const t0 = performance.now()
        btn.click()
        await new Promise((r) => requestAnimationFrame(() => r()))
        const overlayMounted = Boolean(document.querySelector('.sona-modal-overlay [data-testid="player-history"]'))
        return overlayMounted ? performance.now() - t0 : 9999
      })
      assert.ok(clickElapsedMs < 80, `Expected frame-0 instant PlayerHistoryModal mount (<80ms), got ${clickElapsedMs.toFixed(1)}ms`)
      assert.equal(await page.evaluate(() => window.qaEnh.getLookupCalls()), 1, 'Clicking pre-warmed Career button must make 0 extra summoner lookups')
      await page.getByTestId('player-history').getByRole('heading', { name: `${names[8]}#DEMO`, exact: true }).waitFor()
      await page.keyboard.press('Escape')
      await page.getByTestId('player-history').waitFor({ state: 'hidden' })

      // Also verify 0ms immediate click BEFORE slow 380ms lookup finishes still opens Modal shell on frame 0!
      const shellElapsedMs = await page.evaluate(async () => {
        const regalia = document.querySelector('#qa-career-latency-modal lol-regalia-profile-v2-element')
        regalia.setAttribute('summoner-id', '109')
        const btn = document.querySelector('#qa-career-latency-modal .sona-profile-history-entry')
        const t0 = performance.now()
        btn.click()
        await new Promise((r) => requestAnimationFrame(() => r()))
        return document.querySelector('.sona-modal-overlay') ? performance.now() - t0 : 9999
      })
      assert.ok(shellElapsedMs < 80, `Expected frame-0 Modal shell even during uncached 380ms lookup, got ${shellElapsedMs.toFixed(1)}ms`)
      await page.getByTestId('player-history').getByRole('heading', { name: `${names[9]}#DEMO`, exact: true }).waitFor()
      await page.keyboard.press('Escape')
      await page.getByTestId('player-history').waitFor({ state: 'hidden' })
      await page.evaluate(() => { document.getElementById('qa-career-latency-modal')?.remove() })
      await page.waitForTimeout(140)
    }
  } finally {
    await page.evaluate(async () => {
      const { host, root, store, lcu, saved } = window.qaEnh
      lcu.benchSwap = saved.benchSwap
      lcu.getChampSelectSession = saved.getChampSelect
      lcu.getGameflowPhase = saved.getPhase
      window.qaEmit?.('/lol-gameflow/v1/gameflow-phase', 'Lobby')
      document.getElementById('qa-aram-bench-stage')?.remove()
      document.getElementById('qa-postgame-stage')?.remove()
      root.unmount()
      host.remove()
      window.openPluginsFolder = saved.openFolder
      window.reloadClient = saved.reloadClient
      lcu.getPlayerLootMap = saved.getLootMap
      lcu.craftLootRecipe = saved.craftLoot
      lcu.getSkinCarouselSkins = saved.getSkins
      lcu.setSelectedSkinId = saved.setSkin
      lcu.acceptPickOrderSwap = saved.acceptOrderSwap
      lcu.getEogStatsBlock = saved.getEog
      lcu.getSummonerById = saved.getSummonerById
      document.getElementById('qa-career-latency-modal')?.remove()
      store.set('customCorsProxyUrl', saved.proxy)
      store.set('playerTags', saved.tags)
      store.set('playerTagEnabled', saved.tagEnabled)
      store.set('champSelectTagAlert', saved.tagAlert)
      store.set('encounterAlertEnabled', saved.encounterEnabled)
      store.set('postgameEnhancement', saved.postgameEnh)
      store.set('autoHonorStrategy', saved.honorStrat)
      store.set('autoRandomSkin', saved.randomSkin)
      store.set('autoAcceptSwap', saved.acceptSwap)
      store.set('autoAcceptSwapStrategy', saved.swapStrat)
      store.set('champSelectPresetSwitch', saved.presetSwitch)
      store.set('champSelectPresets', saved.presets)
      store.set('hotkey', saved.hotkey)
      store.set('champSelectCompDiagnostic', saved.compDiag)
      store.set('aramWishlistEnabled', saved.wishEnabled)
      store.set('aramWishlistChampionIds', saved.wishIds)
      store.set('aramWishlistAutoSwap', saved.wishAuto)
      store.set('aramBenchTeammateHint', saved.mateHint)
      store.set('autoLockChampion', saved.autoLock)
      store.set('autoLockChampionIds', saved.autoLockIds)
      store.set('historyRecentPlayers', saved.recentPlayers)
      store.flush()
      await new Promise((r) => setTimeout(r, 40))
    })
  }

  console.log('[verify] production dist chunks, B1 folder updater, C6 loot helper, A4/C1 file import/export, C2 tag+encounter, C3 BP comp diagnostic & C4 ARAM bench wishlist/ace hints passed')
}
