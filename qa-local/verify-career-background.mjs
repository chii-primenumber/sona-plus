import assert from 'node:assert/strict'

export async function verifyCareerBackground(page) {
  const PROFILE='/lol-summoner/v1/current-summoner/summoner-profile', CURRENT='/lol-summoner/v1/current-summoner'
  let account='career-account-A', skin=37001, profiles=0, metadata=0, fail=false, slowStarted=false
  const routeProfile=(route)=>{profiles++;return route.fulfill({status:fail?503:200,json:{backgroundSkinId:skin}})}
  const routeCurrent=(route)=>route.fulfill({json:{puuid:account,summonerId:1}})
  const routeMetadata=async(route)=>{
    metadata++
    const id=Number(new URL(route.request().url()).pathname.split('/').at(-1).replace('.json',''))
    if(id===157){slowStarted=true;await new Promise((resolve)=>setTimeout(resolve,300))}
    return route.fulfill({json:{skins:[{id:id*1000+1,splashPath:`/lol-game-data/assets/qa-career/${id*1000+1}.jpg`,uncenteredSplashPath:'/lol-game-data/assets/qa-career/group-full.jpg',questSkinInfo:{tiers:[{id:id*1000+2,uncenteredSplashPath:`/lol-game-data/assets/qa-career/${id*1000+2}.jpg`}]}}]}}).catch(()=>{})
  }
  await page.route('**'+PROFILE,routeProfile)
  await page.route('**'+CURRENT,routeCurrent)
  await page.route('**/lol-game-data/assets/v1/champions/*.json',routeMetadata)
  const ready=(id)=>page.waitForFunction((id)=>window.qaCareer.getCareerBackground().endsWith(`/qa-career/${id}.jpg`),id)
  const emitProfile=()=>page.evaluate(({uri,id})=>window.qaEmit(uri,{backgroundSkinId:id}),{uri:PROFILE,id:skin})
  try {
    await page.evaluate(async()=>{
      window.qaCareer=await import('/src/lib/career-background.ts')
      window.qaCareerStops=[qaCareer.subscribeCareerBackground(()=>{}),qaCareer.subscribeCareerBackground(()=>{})]
    })
    await ready(37001)
    assert.equal(profiles,1,'concurrent surfaces share one profile read')
    assert.equal(metadata,1)
    skin=37002;await emitProfile();await ready(37002)
    assert.equal(metadata,1,'quest tier reuses the champion skin catalog')
    const same=await page.evaluate(()=>{
      window.qaEmit('/lol-summoner/v2/summoners/puuid/inspected-player',{puuid:'inspected-player'})
      return qaCareer.getCareerBackground()
    })
    assert.match(same,/37002\.jpg$/)
    account='career-account-B';skin=16001
    assert.equal(await page.evaluate(({uri,account})=>{window.qaEmit(uri,{puuid:account});return qaCareer.getCareerBackground()},{uri:CURRENT,account}),'')
    await ready(16001)
    skin=157001;await emitProfile()
    await page.waitForFunction(()=>Boolean(window.qaCareer))
    for(let i=0;i<100&&!slowStarted;i++)await page.waitForTimeout(10)
    assert.equal(slowStarted,true)
    skin=37001;await emitProfile();await ready(37001)
    await page.waitForTimeout(350)
    assert.match(await page.evaluate(()=>qaCareer.getCareerBackground()),/37001\.jpg$/,'stale metadata cannot overwrite new background')
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))})
    const hiddenAt=profiles;skin=37002;await emitProfile();await page.waitForTimeout(80)
    assert.equal(profiles,hiddenAt)
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))})
    await ready(37002)
    fail=true;await page.evaluate(()=>qaCareer.refreshCareerBackground())
    await page.waitForFunction(()=>qaCareer.getCareerBackground()==='')
    fail=false;await page.evaluate(()=>qaCareer.refreshCareerBackground());await ready(37002)
    skin=0;await emitProfile();await page.waitForFunction(()=>qaCareer.getCareerBackground()==='')
    await page.evaluate(()=>{qaCareerStops.forEach((stop)=>stop());qaCareerStops=[]})
    const closedAt=profiles;skin=37001;await emitProfile();await page.waitForTimeout(80)
    assert.equal(profiles,closedAt,'closed surfaces have no background request callbacks')
    assert.equal(await page.evaluate(()=>qaCareer.getCareerBackground()),'')
    console.log('[verify] signed-in career art: centered career art preferred over group splash, shared reads, quest tier, account isolation, stale cancellation, hidden/closed pause and failure retry passed')
  } finally {
    await page.evaluate(()=>{delete document.hidden;window.qaCareerStops?.forEach((stop)=>stop());delete window.qaCareerStops;delete window.qaCareer})
    await page.unroute('**'+PROFILE,routeProfile)
    await page.unroute('**'+CURRENT,routeCurrent)
    await page.unroute('**/lol-game-data/assets/v1/champions/*.json',routeMetadata)
  }
}
