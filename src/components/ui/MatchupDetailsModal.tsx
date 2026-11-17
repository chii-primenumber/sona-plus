import {useEffect,useState} from 'react'
import {Modal} from './Modal'
import {HistoryAssetTooltip} from './HistoryAssetTooltip'
import {OPGG_TIER_OPTIONS} from './OpggBuildRecommendationPanel'
import {getChampionById} from '@/lib/assets'
import {getMatchupDetail,laneKillRate,matchupNumber,comparisonShare} from '@/lib/matchup-details'
import {matchesMatchupChampion} from '@/lib/matchup-search'
import type {OpggPosition,OpggTier,OpggMatchup} from '@/lib/opgg-api'
import '@/styles/MatchupDetails.css'
const name=(id:number)=>getChampionById(id)?.name??`英雄 ${id}`
type Row=Record<string,unknown>|undefined
type Metric={key:string;label:string;read:(row:Row)=>number|null;percent?:boolean;lower?:boolean;description?:string}
const average=(row:Row,key:string)=>{const value=matchupNumber(row?.[key]),play=matchupNumber(row?.play);return value!==null&&play!==null&&play>0?value/play:null}
const metrics:Metric[]=[
 {key:'win',label:'整局胜率',percent:true,read:row=>{const win=matchupNumber(row?.win),play=matchupNumber(row?.play);return win!==null&&play!==null&&play>0&&win<=play?win/play:null}},
 {key:'lane',label:'线杀率',percent:true,read:laneKillRate,description:'对位线杀数 ÷（对位线杀数 + 对位线死数）'},
 {key:'kda',label:'KDA',read:row=>{const k=matchupNumber(row?.kill),a=matchupNumber(row?.assist),d=matchupNumber(row?.death);return k!==null&&a!==null&&d!==null&&d>0?(k+a)/d:null}},
 {key:'participation',label:'击杀参与率',percent:true,read:row=>{const value=matchupNumber(row?.kill_contribution_rate);return value!==null&&value<=1?value:null}},
 ...[['kill','场均击杀'],['death','场均死亡'],['assist','场均助攻'],['damage_dealt_to_champions','场均英雄伤害'],['damage_taken','场均承伤'],['turret_plate_destroy','场均镀层']].map(([key,label])=>({key,label,read:(row:Row)=>average(row,key),lower:key==='death'})),
]
const display=(value:number|null,percent=false)=>value===null?'—':percent?`${(value*100).toFixed(1)}%`:value.toLocaleString(undefined,{maximumFractionDigits:1})
export function MatchupDetailsModal({championId,targetId,position,tier,onClose,opponents=[],onTargetChange}:{championId:number;targetId:number;position:OpggPosition;tier:OpggTier;onClose:()=>void;opponents?:OpggMatchup[];onTargetChange?:(id:number)=>void}){
 const [data,setData]=useState<Awaited<ReturnType<typeof getMatchupDetail>>|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0),[search,setSearch]=useState('')
 const [winOrder,setWinOrder]=useState<'asc'|'desc'>('desc')
 const key=`${championId}:${targetId}:${position}:${tier}`
 const [dataKey,setDataKey]=useState('')
 const current=dataKey===key?data:null
 useEffect(()=>{const controller=new AbortController();setData(null);setError('');void getMatchupDetail(championId,targetId,position,tier,controller.signal).then(result=>{if(!controller.signal.aborted){setData(result);setDataKey(key)}}).catch(error=>{if(!controller.signal.aborted)setError(String(error))});return()=>controller.abort()},[key,championId,targetId,position,tier,revision])
 const visible=opponents.filter(item=>matchesMatchupChampion(item.championId,search)).slice().sort((a,b)=>{
  const valid=(value:number)=>Number.isFinite(value)&&value>=0&&value<=1
  if(valid(a.winRate)!==valid(b.winRate))return valid(a.winRate)?-1:1
  return (valid(a.winRate)?(a.winRate-b.winRate)*(winOrder==='asc'?1:-1):0)||b.play-a.play||a.championId-b.championId
 })
 return <Modal open onClose={onClose} careerBackground width="min(1080px,94vw)" height="min(750px,88vh)"><section className="rh-shell sobp-matchup-details" data-testid="matchup-detail"><h2>{name(championId)} 对位 {name(targetId)}</h2><p>韩服 · {({top:'上路',jungle:'打野',mid:'中路',adc:'下路',support:'辅助',none:'未选择',all:'全部分路'})[position]} · {OPGG_TIER_OPTIONS.find(option=>option.value===tier)?.label??tier} · {current?.meta?.version??'—'}</p><div className={`matchup-detail-layout${opponents.length?' has-opponents':''}`}><main className="matchup-comparison rh-scroll-area">
 <div className="matchup-versus">{[championId,targetId].map((id,index)=><div className={`matchup-versus-hero side-${index}`} key={id}><img width="48" height="48" src={`/lol-game-data/assets/v1/champion-icons/${id}.png`} alt=""/><div><strong>{name(id)}</strong><small>样本 {display(matchupNumber(current?.data.find(row=>row.champion_id===id)?.play))} 场</small></div></div>)}</div>
 {error?<div role="alert">{error}<button className="rh-button" onClick={()=>setRevision(n=>n+1)}>重试</button></div>:!current?<p>正在读取对位详情…</p>:<div className="matchup-comparison-rows">{metrics.map(metric=>{const left=metric.read(current.data.find(row=>row.champion_id===championId)),right=metric.read(current.data.find(row=>row.champion_id===targetId)),share=comparisonShare(left,right);return <div className="matchup-comparison-row" key={metric.key} data-metric={metric.key}><div className="matchup-comparison-values"><span>{display(left,metric.percent)}</span><HistoryAssetTooltip title={metric.label} description={[metric.description,metric.lower?'越低越好':'', '条长为两侧该项数值的相对占比，数字保留原始统计值。'].filter(Boolean).join('\n')} compact asChild><span>{metric.label}</span></HistoryAssetTooltip><span>{display(right,metric.percent)}</span></div><div className={`matchup-comparison-track${share===null?' is-missing':''}`} aria-label={`${metric.label}：${name(championId)} ${display(left,metric.percent)}；${name(targetId)} ${display(right,metric.percent)}`}>{share!==null&&<><i className="matchup-comparison-left" style={{width:`${share*100}%`}}/><i className="matchup-comparison-right" style={{width:`${(1-share)*100}%`}}/></>}</div></div>})}</div>}
 </main>{opponents.length>0&&<aside className="matchup-opponents"><input type="search" aria-label="搜索详情对手英雄" placeholder="搜索名称、称号、英文名或ID" value={search} onChange={event=>setSearch(event.target.value)}/><div className="matchup-opponents-header"><span>整局胜率 <HistoryAssetTooltip title={winOrder==='desc'?'胜率降序 · 点击改为升序':'胜率升序 · 点击改为降序'} compact asChild><button type="button" className="matchup-win-sort" aria-label={winOrder==='desc'?'切换胜率升序':'切换胜率降序'} onClick={()=>setWinOrder(order=>order==='desc'?'asc':'desc')}><span aria-hidden="true">{winOrder==='desc'?'↓':'↑'}</span></button></HistoryAssetTooltip></span><span>对位场数</span></div><div className="matchup-opponents-list rh-scroll-area">{visible.map(item=><button type="button" key={item.championId} className={item.championId===targetId?'is-selected':''} aria-pressed={item.championId===targetId} onClick={()=>onTargetChange?.(item.championId)}><img width="28" height="28" src={`/lol-game-data/assets/v1/champion-icons/${item.championId}.png`} alt=""/><span>{name(item.championId)}</span><small><span className={`matchup-opponent-winrate${Number.isFinite(item.winRate)&&item.winRate>=0&&item.winRate<=1?(item.winRate>.5?' is-high':item.winRate<.5?' is-low':''):''}`}>{display(Number.isFinite(item.winRate)&&item.winRate>=0&&item.winRate<=1?item.winRate:null,true)}</span><br/>{item.play.toLocaleString()} 场</small></button>)}{!visible.length&&<p>没有匹配的对手英雄</p>}</div></aside>}</div></section></Modal>
}
