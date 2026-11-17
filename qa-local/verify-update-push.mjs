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
 console.log('[verify] in-plugin update notice, safe preview, announcement action and persisted dismissal/read state passed')
}
