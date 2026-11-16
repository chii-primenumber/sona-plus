import { createRoot, type Root } from 'react-dom/client'
import { HistoryAssetTooltip } from '@/components/ui/HistoryAssetTooltip'
import { RunesAndSpells } from '@/components/ui/HistoryWidgets'
import { OpggBuildRecommendationPanel } from '@/components/ui/OpggBuildRecommendationPanel'
import { getPerkStyleDescription } from '@/lib/assets'
import { parseAramKitRecommendation, type AramKitDetail } from '@/lib/aramkit-api'
import sample from './fixtures/game-descriptions.json'
import type { SgpParticipantLol } from '@/types/sgp'

let root: Root | undefined
let host: HTMLDivElement | undefined
export function clear() { root?.unmount(); host?.remove(); root = undefined; host = undefined }
function container() {
  clear(); host = document.createElement('div'); host.id = 'qa-rich-tooltip'
  host.style.cssText = 'position:fixed;inset:60px 40px;background:#010a13;padding:30px;z-index:20010;overflow:auto;color:#f0e6d2'
  document.body.append(host); root = createRoot(host); return root
}
export function native() {
  container().render(<div style={{display:'flex',gap:30}}>
    <HistoryAssetTooltip title={sample.item.name} description={sample.item.description}><button>装备说明</button></HistoryAssetTooltip>
    <HistoryAssetTooltip title={sample.rune.name} description={sample.rune.longDesc}><button>符文说明</button></HistoryAssetTooltip>
    <HistoryAssetTooltip title="输入安全检查" description={'<script>window.qaExecuted=true</script><img src=x onerror="window.qaExecuted=true"><font color="#f26522">橙色</font><magicDamage>魔法伤害 <scaleAP>法强</scaleAP> 魔法伤害</magicDamage>&lt;b&gt;原文&lt;/b&gt;'}><button>安全检查</button></HistoryAssetTooltip>
    <RunesAndSpells player={{perks:{styles:[{style:8200,selections:[{perk:8214}]},{style:8300,selections:[]} ]}} as SgpParticipantLol} />
  </div>)
}
export function panel() {
  const detail: AramKitDetail = {champion:{id:86,stats:{winRate:.5}},augments:{all:[{id:1001,pickRate:.1,winRate:.5}]},items:{unfiltered:{all:[{id:3118,pickRate:.2,winRate:.5}]}},builds:{unfiltered:{archetypes:[]}}}
  const recommendation = parseAramKitRecommendation(detail,{items:{3118:sample.kitItem},augments:{1001:sample.kitAugment}},{version:'16.22',dataPath:'',resourcePath:''},86)
  container().render(<OpggBuildRecommendationPanel context={{championId:86,queueId:2400,gameMode:'KIWI',gameVersion:'16.22',position:'none'}} recommendation={recommendation}
    loadError="" isLoading={false} selectedTier="all" onTierChange={()=>{}} onPositionChange={()=>{}} onClose={clear} />)
}
export function styleDescriptions() { return sample.styles.map(({id,tooltip})=>({id,expected:tooltip,actual:getPerkStyleDescription(id)})) }
