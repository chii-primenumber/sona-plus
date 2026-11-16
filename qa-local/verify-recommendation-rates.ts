import assert from 'node:assert/strict'
import { recommendationDelta } from '../src/lib/recommendation-rates'
assert.equal(recommendationDelta(.51,.5),1)
assert.equal(recommendationDelta(.49,.5),-1)
assert.equal(recommendationDelta(0,.5),-50)
assert.equal(recommendationDelta(.5,0),50)
assert.equal(recommendationDelta(.5,.5),0)
for (const value of [null,undefined,NaN,Infinity,-1,1.1,'0.5']) {
 assert.equal(recommendationDelta(value,.5),null)
 assert.equal(recommendationDelta(.5,value),null)
}
console.log(JSON.stringify({result:'passed',checks:['positive and negative percentage points','valid zero rate and baseline','equal rate','missing and invalid data']}))
