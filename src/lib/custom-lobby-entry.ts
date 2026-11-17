/** Clone the native spectator control's appearance without its disabled state or handlers. */
export function findCustomLobbySpectate():HTMLElement|null {
 return [...document.querySelectorAll<HTMLElement>('lol-uikit-flat-button,button')].find(node=>!node.hasAttribute('data-sona-custom-overview')&&!node.closest('#sona-root,.sona-modal-overlay')&&/^(观战|Spectate)$/i.test((node.textContent||node.getAttribute('aria-label')||'').trim()))??null
}
export function createCustomLobbyEntry(native:HTMLElement,onOpen:()=>void) {
 const button=native.cloneNode(false) as HTMLElement
 if(button instanceof HTMLButtonElement)button.type='button'
 button.removeAttribute('id');button.removeAttribute('disabled');button.removeAttribute('aria-disabled')
 for(const name of [...button.classList])if(/disabled/i.test(name))button.classList.remove(name)
 button.setAttribute('data-sona-custom-overview','true');button.setAttribute('role','button');button.tabIndex=0;button.textContent='战绩总览'
 Object.assign(button.style,{position:'absolute',inset:'auto',margin:'0',transform:'none',boxSizing:'border-box',pointerEvents:'auto'})
 native.insertAdjacentElement('afterend',button)
 const position=()=>{
  if(!native.isConnected||!native.getClientRects().length){button.style.display='none';return}
  button.style.display='block'
  const box=native.getBoundingClientRect(),parent=button.offsetParent as HTMLElement|null,anchor=parent?.getBoundingClientRect()
  const sx=parent&&anchor&&parent.offsetWidth?anchor.width/parent.offsetWidth:1,sy=parent&&anchor&&parent.offsetHeight?anchor.height/parent.offsetHeight:1
  button.style.left=`${(box.left-(anchor?.left??0))/sx+(parent?.scrollLeft??0)-(parent?.clientLeft??0)}px`
  button.style.top=`${(box.bottom-(anchor?.top??0)+8)/sy+(parent?.scrollTop??0)-(parent?.clientTop??0)}px`
  button.style.width=`${box.width/sx}px`;button.style.height=`${box.height/sy}px`
 }
 let frame=0
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;position()})}
 const observer=new ResizeObserver(schedule);observer.observe(native);if(button.offsetParent)observer.observe(button.offsetParent)
 window.addEventListener('resize',schedule);document.addEventListener('scroll',schedule,true)
 button.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();onOpen()},true)
 button.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();onOpen()}},true)
 position()
 return {button,dispose:()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',schedule);document.removeEventListener('scroll',schedule,true);button.remove()}}
}
