import { getChampionById } from './assets'
import { matchesSmartSearch } from './pinyin-search'

export function matchesMatchupChampion(id: number, query: string): boolean {
  if (!query.trim()) return true
  const hero = getChampionById(id)
  return matchesSmartSearch(query, [String(id), hero?.name, hero?.title, hero?.alias])
}
