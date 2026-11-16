import assert from 'node:assert/strict'
import { recommendationDelta, recommendationWinRate, sortRecommendationBuilds } from '../src/lib/recommendation-rates'
assert.equal(recommendationDelta(.51,.5),1)
assert.equal(recommendationDelta(.49,.5),-1)
assert.equal(recommendationDelta(0,.5),-50)
assert.equal(recommendationDelta(.5,0),50)
assert.equal(recommendationDelta(.5,.5),0)
for (const value of [null,undefined,NaN,Infinity,-1,1.1,'0.5']) {
 assert.equal(recommendationDelta(value,.5),null)
 assert.equal(recommendationDelta(.5,value),null)
}
const builds = [
 {id:'common',pick_rate:.5,winRate:.6}, {id:'rare',pick_rate:.1,winRate:.9}, {id:'tie',pick_rate:.5,winRate:.7},
 {id:'missing-pick',pick_rate:NaN,winRate:.95}, {id:'zero',pick_rate:0,winRate:0}, {id:'missing-both',pick_rate:NaN,winRate:null},
]
assert.deepEqual(sortRecommendationBuilds(builds,'pick').map((item)=>item.id),['tie','common','rare','zero','missing-pick','missing-both'])
assert.deepEqual(sortRecommendationBuilds(builds,'win').map((item)=>item.id),['missing-pick','rare','tie','common','zero','missing-both'])
assert.equal(recommendationWinRate({win:0,play:10}),0)
assert.equal(recommendationWinRate({winRate:null,win:5,play:10}),undefined)
console.log(JSON.stringify({result:'passed',checks:['positive and negative percentage points','valid zero rate and baseline','equal rate','missing and invalid data']}))
