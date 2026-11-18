import { initScrollbarVisibility } from '@/lib/scrollbar-visibility'
import { store } from '@/lib/store'
import '@/styles/Theme.css'
import '@/styles/PersonalHistory.css'
import '@/styles/ClientSurfaces.css'

export type SonaTheme = 'client'

export function initSonaTheme() {
  const applyTheme = () => {
    document.documentElement.dataset.sonaTheme = 'client'
  }
  applyTheme()
  const stopScrollbars = initScrollbarVisibility()
  const stopTheme = store.onChange('theme', applyTheme)
  return () => { stopTheme(); stopScrollbars() }
}
