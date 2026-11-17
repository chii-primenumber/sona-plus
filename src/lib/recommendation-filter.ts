export type RecommendationKind = 'items' | 'runes' | 'augments'
export type RecommendationOrder = 'pick' | 'win'
export interface RecommendationPreferences {
  presets: Record<RecommendationKind, number[]>
  levels: Record<RecommendationKind, number>
  equipmentOrder: RecommendationOrder
  augmentOrder: RecommendationOrder
}
export const DEFAULT_RECOMMENDATION_PREFERENCES: RecommendationPreferences = {
  presets: {items:[100,500,2000],runes:[100,500,2000],augments:[1000,5000,20000]},
  levels: {items:0,runes:0,augments:0}, equipmentOrder:'pick', augmentOrder:'win',
}
export function normalizeRecommendationPreferences(value: unknown): RecommendationPreferences {
  const raw = (value && typeof value==='object' ? value : {}) as Partial<RecommendationPreferences>
  const result: RecommendationPreferences = {presets:{items:[],runes:[],augments:[]},levels:{items:0,runes:0,augments:0},equipmentOrder:raw.equipmentOrder==='win'?'win':'pick',augmentOrder:raw.augmentOrder==='pick'?'pick':'win'}
  for (const kind of ['items','runes','augments'] as const) {
    const list=raw.presets?.[kind]
    result.presets[kind]=Array.isArray(list)&&list.length===3&&list.every((n,i)=>Number.isSafeInteger(n)&&n>0&&n<=10000000&&(i===0||n>list[i-1])) ? [...list] : [...DEFAULT_RECOMMENDATION_PREFERENCES.presets[kind]]
    const level=raw.levels?.[kind]
    result.levels[kind]=typeof level==='number'&&Number.isInteger(level)&&level>=0&&level<=3?level:0
  }
  return result
}
export function sampleThreshold(preferences: RecommendationPreferences,kind: RecommendationKind): number {
  return preferences.presets[kind][preferences.levels[kind]-1] ?? 0
}
export function hasEnoughSamples(count: unknown, threshold: number): boolean {
  return threshold===0 || typeof count!=='number' || !Number.isFinite(count) || count<0 || count>=threshold
}
