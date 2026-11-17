import { useEffect, useState } from 'react'
import { store } from '@/lib/store'
import { normalizeRecommendationPreferences, type RecommendationKind } from '@/lib/recommendation-filter'
import { SonaSegmented } from './SonaSegmented'
import { SettingCard, SettingGroup } from './SettingCard'
import { SonaButton } from './SonaButton'
import '@/styles/RecommendationControls.css'
const labels={items:'装备',runes:'符文',augments:'海克斯'}
export function useRecommendationPreferences() {
  const [preferences,setPreferences]=useState(()=>normalizeRecommendationPreferences(store.get('recommendationPreferences')))
  useEffect(()=>store.onChange('recommendationPreferences',value=>setPreferences(normalizeRecommendationPreferences(value))),[])
  const change=(patch:Partial<typeof preferences>)=>store.set('recommendationPreferences',{...normalizeRecommendationPreferences(store.get('recommendationPreferences')),...patch})
  return {preferences,change}
}
export function SampleFilter({kind}:{kind:RecommendationKind}) {
  const {preferences,change}=useRecommendationPreferences()
  return <div className="sobp-sample-filter"><span>{labels[kind]}样本</span><SonaSegmented value={preferences.levels[kind]} label={`${labels[kind]}最低场数`} options={[{value:0,label:'全部'},...preferences.presets[kind].map((n,i)=>({value:i+1,label:`≥${n}场`}))]} onChange={level=>change({levels:{...preferences.levels,[kind]:level}})} /></div>
}
function PresetsEditor({kind}:{kind:RecommendationKind}) {
  const {preferences,change}=useRecommendationPreferences()
  const [draft,setDraft]=useState(preferences.presets[kind].map(String)),[error,setError]=useState('')
  const values=preferences.presets[kind].join(',')
  useEffect(()=>setDraft(values.split(',')),[values])
  return <SettingCard title={`${labels[kind]}样本档位`} description="三档最低场数，从小到大；全部档始终不过滤。" layout="stacked"><div className="sona-sample-presets">{draft.map((value,index)=><label key={index}>第 {index+1} 档<input type="number" min="1" max="10000000" step="1" aria-label={`${labels[kind]}第${index+1}档场数`} value={value} onChange={event=>{const next=[...draft];next[index]=event.target.value;setDraft(next);setError('')}} /></label>)}<SonaButton onClick={()=>{const next=draft.map(Number);if(next.some((n,i)=>!Number.isSafeInteger(n)||n<1||n>10000000||(i>0&&n<=next[i-1]))){setError('请输入从小到大的三个整数，范围 1–10000000。');return}change({presets:{...preferences.presets,[kind]:next}});setError('')}}>保存{labels[kind]}档位</SonaButton></div>{error&&<p role="alert">{error}</p>}</SettingCard>
}
export function RecommendationSettings() {
  return <SettingGroup title="推荐样本过滤"><PresetsEditor kind="items"/><PresetsEditor kind="runes"/><PresetsEditor kind="augments"/></SettingGroup>
}
