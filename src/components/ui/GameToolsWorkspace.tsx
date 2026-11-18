import {lazy,Suspense,useEffect,useState,type ReactNode} from 'react'
import {type TeamHistoryMode} from './TeamHistoryModal'
import {SonaSegmented} from './SonaSegmented'
import {HistoryAssetTooltip} from './HistoryAssetTooltip'
import '@/styles/GameToolsWorkspace.css'
const TeamHistoryModal=lazy(()=>import('./TeamHistoryModal').then(m=>({default:m.TeamHistoryModal})))
export function GameToolsWorkspace({initialView,request,mode,party,onBuildRequested,onClose,children}:{initialView:'history'|'build';request:number;mode:TeamHistoryMode;party:ReadonlySet<string>;onBuildRequested:()=>void;onClose:()=>void;children:ReactNode}){
 const [view,setView]=useState(initialView),[historyVisited,setHistoryVisited]=useState(initialView==='history'),[buildVisited,setBuildVisited]=useState(initialView==='build')
 useEffect(()=>{setView(initialView);if(initialView==='history')setHistoryVisited(true);else setBuildVisited(true)},[initialView,request])
 const choose=(next:'history'|'build')=>{setView(next);if(next==='history')setHistoryVisited(true);else{setBuildVisited(true);onBuildRequested()}}
 return <div className="sona-game-tools"><header className="sona-game-tools-nav"><SonaSegmented label="对局工具切换" value={view} options={[{value:'history',label:mode==='lobby'?'战绩总览':'对局详情'},{value:'build',label:'配装推荐'}]} onChange={choose}/><HistoryAssetTooltip title="关闭" compact asChild><button className="sona-tools-close sona-modal-close" aria-label="关闭对局工具" onClick={onClose}>×</button></HistoryAssetTooltip></header><div className="sona-game-tools-page" hidden={view!=='history'}>{historyVisited&&<Suspense fallback={null}><TeamHistoryModal embedded open mode={mode} party={party} onClose={onClose}/></Suspense>}</div><div className="sona-game-tools-page sona-opgg-modal-content" hidden={view!=='build'}>{buildVisited&&children}</div></div>
}
