import {useEffect,useState} from 'react'
import {createPortal} from 'react-dom'
import {store} from '@/lib/store'
import type {UpdateState} from '@/lib/update-checker'
import '@/styles/UpdatePushNotice.css'
/** A non-modal notice: no updater, local protocol, polling or forced client navigation. */
export function UpdatePushNotice({state,onView}:{state:UpdateState;onView:()=>void}) {
 const [dismissed,setDismissed]=useState(store.get('dismissedUpdateNotice'))
 const [read,setRead]=useState(store.get('readAnnouncementVersion'))
 useEffect(()=>{const stop=store.onChange('dismissedUpdateNotice',setDismissed),stopRead=store.onChange('readAnnouncementVersion',setRead);return()=>{stop();stopRead()}},[])
 const info=state.info
 if(state.status!=='available'||!info||dismissed===info.latestVersion||read===info.latestVersion)return null
 const hide=()=>store.set('dismissedUpdateNotice',info.latestVersion)
 const preview=info.releaseBody.split('\n').map(line=>line.replace(/^\s*[#*-]+\s*/, '').trim()).filter(Boolean).slice(0,3).join(' · ').slice(0,180)
 return createPortal(<aside className="sona-update-push" role="status" aria-label="Sona Plus 更新提醒"><button type="button" className="sona-update-push-close" aria-label="关闭更新提醒" onClick={hide}>×</button><strong>Sona Plus 有新版本</strong><p>v{info.currentVersion} → v{info.latestVersion}</p>{preview&&<p className="sona-update-push-preview">{preview}</p>}<div><button type="button" onClick={()=>{hide();onView()}}>查看更新公告</button><button type="button" onClick={hide}>稍后再看</button></div></aside>,document.body)
}
