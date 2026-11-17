import {opggApi,type OpggPosition,type OpggTier} from './opgg-api'
import {SharedRequests} from './shared-requests'
const requests=new SharedRequests(3,100,5000)
export const matchupNumber=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null
export function laneKillRate(row:Record<string,unknown>|undefined):number|null {
 const kills=matchupNumber(row?.lane_kill),deaths=matchupNumber(row?.lane_death)
 return kills!==null&&deaths!==null&&kills+deaths>0?kills/(kills+deaths):null
}
export function getMatchupDetail(id:number,target:number,position:OpggPosition,tier:OpggTier,signal?:AbortSignal){
 return requests.run(`${id}:${target}:${position}:${tier}`,async sharedSignal=>{
  const result=await opggApi.getCounterDetail(id,target,position,tier,sharedSignal)
  if(!Array.isArray(result.data))throw new Error('对位数据格式异常')
  return result
 },{signal,ttlMs:300000})
}

export function comparisonShare(left:number|null,right:number|null):number|null {
 if(left===null||right===null||!Number.isFinite(left)||!Number.isFinite(right)||left<0||right<0||left+right<=0)return null
 return left/(left+right)
}
