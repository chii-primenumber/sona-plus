import {getChampionById} from './assets'
export function matchesMatchupChampion(id:number,query:string):boolean {
 const needle=query.trim().toLocaleLowerCase().replace(/\s+/g,'')
 if(!needle)return true
 const hero=getChampionById(id)
 return [String(id),hero?.name,hero?.title,hero?.alias].some(value=>value?.toLocaleLowerCase().replace(/\s+/g,'').includes(needle))
}
