import assert from 'node:assert/strict'
import { parseGameDescription } from '../src/lib/game-description'
import './datastore-stub'

const tokens = parseGameDescription('<stats>+15攻击力<br>9金币/10秒</stats><magicDamage>魔法<scaleAP>法强</scaleAP>伤害</magicDamage> &lt;原文&gt;')
assert.equal(tokens.filter((token)=>token.semantic==='stat').map((token)=>token.text).join(','),'+15,9,10')
assert.equal(tokens.filter((token)=>token.semantic==='magicdamage').map((token)=>token.text).join(''),'魔法伤害')
assert.equal(tokens.find((token)=>token.semantic==='abilitypower')?.color,'#786cff')
assert.equal(tokens.map((token)=>token.text).join(''),'+15攻击力\n9金币/10秒\n魔法法强伤害 <原文>')
assert.equal(parseGameDescription('<script>bad()</script><font color="javascript:alert(1)">文本</font>').map((token)=>token.text).join(''),'文本')
assert.equal(parseGameDescription('<font color="#48C4B7">原色</font>')[0].color,'#48C4B7')
assert.equal(parseGameDescription('普通文本 0')[0].text,'普通文本 0')
DataStore.set('sona:theme','slate')
const {store}=await import('../src/lib/store')
assert.equal(store.get('theme'),'client')
assert.equal(DataStore.get('sona:theme'),'client')
store.set('theme','slate' as 'client')
assert.equal(store.get('theme'),'client')
console.log('[verify] nested game tags, gold numeric stats, literal entities, original font colors, safe fallback and legacy theme migration passed')
