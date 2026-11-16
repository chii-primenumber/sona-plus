import { useCallback, useState, useSyncExternalStore } from 'react'
import { getCareerBackground, subscribeCareerBackground } from '@/lib/career-background'
import '@/styles/CareerBackdrop.css'

export function CareerBackdrop({ active = true }: { active?: boolean }) {
  const subscribe = useCallback((listener: () => void) => active ? subscribeCareerBackground(listener) : () => {}, [active])
  const src = useSyncExternalStore(subscribe, getCareerBackground)
  const [loaded, setLoaded] = useState(''), [failed, setFailed] = useState('')
  return <div className="sona-career-backdrop" aria-hidden="true">
    {src && failed !== src && <img src={src} alt="" decoding="async" draggable={false}
      className={loaded === src ? 'is-loaded' : ''} onLoad={() => setLoaded(src)} onError={() => setFailed(src)} />}
  </div>
}
