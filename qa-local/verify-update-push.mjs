import assert from 'node:assert/strict'
export async function verifyUpdatePush(page){
 await page.evaluate(async()=>{
  const ReactModule=await import('/node_modules/.vite/deps/react.js'),DOM=await import('/node_modules/.vite/deps/react-dom_client.js'),{UpdatePushNotice}=await import('/src/components/ui/UpdatePushNotice.tsx'),{store}=await import('/src/lib/store.ts')
  const old={dismissed:store.get('dismissedUpdateNotice'),read:store.get('readAnnouncementVersion')};store.set('dismissedUpdateNotice',null);store.set('readAnnouncementVersion',null)
  const host=document.createElement('div');host.id='qa-update-push';document.body.append(host);const root=(DOM.default??DOM).createRoot(host);let views=0
  const state={status:'available',error:'',info:{currentVersion:'1.1.2',latestVersion:'9.0.1',releaseName:'Sona Plus 9.0.1',releaseBody:'# 更新说明\n- <img src=x onerror=alert(1)>',releaseUrl:'https://github.com/chii-primenumber/sona-plus/releases/tag/v9.0.1',publishedAt:''}}
  const render=()=>root.render((ReactModule.default??ReactModule).createElement(UpdatePushNotice,{state,onView:()=>{views++}}));render()
  window.qaPush={root,host,store,old,render,views:()=>views}
 })
 const notice=page.getByRole('status',{name:'Sona Plus 更新提醒',exact:true});await notice.waitFor();assert.equal(await notice.locator('img').count(),0)
 await notice.getByRole('button',{name:'查看更新公告',exact:true}).click();await notice.waitFor({state:'detached'})
 assert.equal(await page.evaluate(()=>window.qaPush.views()),1)
 await page.evaluate(()=>window.qaPush.render());assert.equal(await notice.count(),0)
 await page.evaluate(()=>{window.qaPush.store.set('dismissedUpdateNotice',null);window.qaPush.store.set('readAnnouncementVersion','9.0.1')});assert.equal(await notice.count(),0)
 await page.evaluate(()=>{const {root,host,store,old}=window.qaPush;root.unmount();host.remove();store.set('dismissedUpdateNotice',old.dismissed);store.set('readAnnouncementVersion',old.read)})
 await page.evaluate(async()=>{
  const ReactModule=await import('/node_modules/.vite/deps/react.js'),DOM=await import('/node_modules/.vite/deps/react-dom_client.js')
  const {App}=await import('/src/App.tsx'),{openModal,closeModal}=await import('/src/lib/modal.ts'),{checkForUpdates,clearSkippedUpdateVersion}=await import('/src/lib/update-checker.ts'),{store}=await import('/src/lib/store.ts'),{useI18n}=await import('/src/i18n/index.ts')
  const React=ReactModule.default??ReactModule,createRoot=(DOM.default??DOM).createRoot
  const saved={fetch:window.fetch,dismissed:store.get('dismissedUpdateNotice'),read:store.get('readAnnouncementVersion'),skip:store.get('skippedUpdateVersion'),announcement:store.get('releaseAnnouncement'),lastCheck:store.get('lastUpdateCheckAt'),locale:store.get('locale'),lang:document.documentElement.lang}
  let docObservers=0
  const OrigObserver=window.MutationObserver
  window.MutationObserver=class extends OrigObserver{observe(target,opts){if(target===document.documentElement)docObservers++;return super.observe(target,opts)}}
  const i18nHost=document.createElement('div');document.body.append(i18nHost);const i18nRoot=createRoot(i18nHost)
  function Probe(){const {locale}=useI18n();return React.createElement('span',{'data-locale':locale},locale)}
  store.set('locale','auto');document.documentElement.lang='zh-CN'
  i18nRoot.render(React.createElement(React.Fragment,null,React.createElement(Probe),React.createElement(Probe),React.createElement(Probe),React.createElement(Probe)))
  await new Promise(r=>setTimeout(r,20))
  if(docObservers>1)throw new Error(`Expected shared documentElement MutationObserver (<=1 new), got ${docObservers}`)
  document.documentElement.lang='en-US'
  await new Promise(r=>setTimeout(r,20))
  if(i18nHost.querySelectorAll('[data-locale="en-US"]').length!==4)throw new Error('Shared i18n observer did not update all consumers')
  i18nRoot.unmount();i18nHost.remove();window.MutationObserver=OrigObserver
  document.documentElement.lang=saved.lang;store.set('locale',saved.locale)

  closeModal();clearSkippedUpdateVersion()
  store.set('dismissedUpdateNotice',null);store.set('readAnnouncementVersion',null)
  window.fetch=async(url,...args)=>String(url).includes('chii-primenumber/sona-plus/releases')?new Response(JSON.stringify({tag_name:'v9.0.2',name:'Sona Plus v9.0.2',body:'# 9.0.2\n- fix tab',html_url:'https://github.com/chii-primenumber/sona-plus/releases/tag/v9.0.2'}),{status:200}):saved.fetch(url,...args)
  await checkForUpdates()
  const appHost=document.createElement('div');appHost.id='qa-update-app';document.body.append(appHost);const appRoot=createRoot(appHost)
  appRoot.render(React.createElement(App))
  await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,20)))
  window.qaUpdateApp={appRoot,appHost,openModal,closeModal,store,saved}
 })
 await page.evaluate(()=>window.qaUpdateApp.openModal())
 const appModal=page.locator('.sona-layout')
 await appModal.getByText('Sona Plus v9.0.2 · 新版本',{exact:true}).waitFor()
 await appModal.locator('.sona-sidebar-item').nth(2).click()
 await appModal.getByRole('heading',{name:'工具',exact:true}).waitFor()
 assert.equal(await appModal.getByText('Sona Plus v9.0.2 · 新版本',{exact:true}).count(),0)
 await page.evaluate(()=>window.qaUpdateApp.closeModal())
 await page.evaluate(()=>window.qaUpdateApp.openModal())
 await appModal.waitFor()
 assert.equal(await appModal.getByText('Sona Plus v9.0.2 · 新版本',{exact:true}).count(),0)
 await page.evaluate(()=>{window.qaUpdateApp.store.set('readAnnouncementVersion',null);window.qaUpdateApp.store.set('dismissedUpdateNotice','9.0.2');window.qaUpdateApp.closeModal()})
 await page.evaluate(()=>window.qaUpdateApp.openModal())
 await appModal.waitFor()
 assert.equal(await appModal.getByText('Sona Plus v9.0.2 · 新版本',{exact:true}).count(),0)
 await page.evaluate(()=>{const {appRoot,appHost,closeModal,store,saved}=window.qaUpdateApp;closeModal();appRoot.unmount();appHost.remove();window.fetch=saved.fetch;store.set('dismissedUpdateNotice',saved.dismissed);store.set('readAnnouncementVersion',saved.read);store.set('skippedUpdateVersion',saved.skip);store.set('releaseAnnouncement',saved.announcement);store.set('lastUpdateCheckAt',saved.lastCheck)})
 console.log('[verify] in-plugin update notice, safe preview, non-hijacking F1 modal reopen, shared i18n observer and persisted dismissal/read state passed')
}
