import { useState, useRef, useEffect, useLayoutEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/i18n'
import '@/styles/SonaSelect.css'

export interface SonaSelectOption { value: string; label: string; icon?: string; content?: ReactNode; disabled?: boolean }
export interface SonaSelectProps {
  options: SonaSelectOption[]; value: string; onChange: (value: string) => void; placeholder?: string
  ariaLabel?: string; className?: string; disabled?: boolean; iconOnly?: boolean
}
export function SonaSelect({ options, value, onChange, placeholder = '请选择...', ariaLabel, className = '', disabled = false, iconOnly = false }: SonaSelectProps) {
  const [open, setOpen] = useState(false), [active, setActive] = useState(0)
  const [placement, setPlacement] = useState<{left?:number;right?:number;top?:number;bottom?:number;maxHeight:number}>({maxHeight:220})
  const trigger = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null)
  const id = useId(), typed = useRef({text:'',at:0}), { t } = useI18n()
  const selected = options.find((item)=>item.value===value)
  const close = () => setOpen(false)
  const show = () => { if (!disabled) { setActive(Math.max(0,options.findIndex((item)=>item.value===value))); setOpen(true) } }
  const choose = (index:number) => { const item=options[index]; if(item&&!item.disabled) { onChange(item.value); close(); trigger.current?.focus() } }
  useEffect(()=>{if(disabled)close()},[disabled])
  useLayoutEffect(()=>{
    if(!open||!trigger.current)return
    let frame=0
    const position=()=>{
      frame=0
      const box=trigger.current?.getBoundingClientRect()
      if(!box||box.bottom<=0||box.top>=window.innerHeight){close();return}
      const below=window.innerHeight-box.bottom-12, above=box.top-12, up=below<160&&above>below
      setPlacement({...(box.left>window.innerWidth/2?{right:Math.max(10,window.innerWidth-box.right)}:{left:Math.max(10,box.left)}),...(up?{bottom:window.innerHeight-box.top+4}:{top:box.bottom+4}),maxHeight:Math.max(64,Math.min(260,up?above:below))})
    }
    const schedule=(event:Event)=>{if(!list.current?.contains(event.target as Node)&&!frame)frame=requestAnimationFrame(position)}
    position();document.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule)
    return ()=>{cancelAnimationFrame(frame);document.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule)}
  },[open])
  useEffect(()=>{
    if(!open)return
    const outside=(event:Event)=>{if(!trigger.current?.contains(event.target as Node)&&!list.current?.contains(event.target as Node))close()}
    const hidden=()=>{if(document.hidden)close()}
    document.addEventListener('pointerdown',outside,true)
    window.addEventListener('blur',close);document.addEventListener('visibilitychange',hidden)
    return ()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('blur',close);document.removeEventListener('visibilitychange',hidden)}
  },[open])
  useEffect(()=>{if(open)list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({block:'nearest'})},[open,active])
  const content=(item:SonaSelectOption)=> <>{item.icon&&<img className="sona-select-icon" src={item.icon} alt=""/>}{item.content??item.label}</>
  return <div className={`sona-select ${className}${iconOnly?' sona-select--icons':''}`}>
    <button ref={trigger} type="button" role="combobox" aria-label={ariaLabel || selected?.label || placeholder} aria-expanded={open} aria-controls={open?id:undefined} aria-haspopup="listbox" aria-activedescendant={open?`${id}-${active}`:undefined}
      data-value={value} title={iconOnly?selected?.label:undefined} disabled={disabled} className={`sona-select-trigger${open?' sona-select-trigger--open':''}`}
      onClick={()=>open?close():show()} onKeyDown={(event)=>{
        if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();close();return}
        if(event.key==='Tab'){close();return}
        if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
          event.preventDefault();event.stopPropagation();if(!open){show();return}
          const direction=event.key==='ArrowUp'?-1:1
          let next=event.key==='Home'?0:event.key==='End'?options.length-1:(active+direction+options.length)%options.length
          for(let i=0;i<options.length&&options[next]?.disabled;i++)next=(next+direction+options.length)%options.length
          setActive(next)
        } else if((event.key==='Enter'||event.key===' ')&&open){event.preventDefault();event.stopPropagation();choose(active)}
        else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey){
          const now=event.timeStamp;typed.current={text:((now-typed.current.at<700?typed.current.text:'')+event.key).slice(-64),at:now}
          const index=options.findIndex((item)=>!item.disabled&&item.label.toLowerCase().startsWith(typed.current.text.toLowerCase()))
          if(index>=0){event.preventDefault();if(open)setActive(index);else onChange(options[index].value)}
        }
      }}>
      <span className="sona-select-value">{selected?content(selected):placeholder==='请选择...'?t('select.placeholder'):placeholder}</span>
      <svg className={`sona-select-arrow${open?' sona-select-arrow--open':''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    {open&&createPortal(<div ref={list} id={id} role="listbox" aria-label={ariaLabel} className={`sona-select-dropdown ${className}${iconOnly?' sona-select-dropdown--icons':''}`} style={placement}>
      {options.map((item,index)=><button key={item.value} id={`${id}-${index}`} type="button" role="option" aria-label={item.label} aria-selected={value===item.value} disabled={item.disabled} data-value={item.value} data-index={index} tabIndex={-1}
        className={`sona-select-option${value===item.value?' sona-select-option--active':''}${index===active?' is-highlighted':''}`}
        onPointerMove={()=>setActive(index)} onMouseDown={(event)=>event.preventDefault()} onClick={()=>choose(index)}><span className="sona-select-option-label">{content(item)}</span>{value===item.value&&<span aria-hidden="true">✓</span>}</button>)}
    </div>,document.body)}
  </div>
}
