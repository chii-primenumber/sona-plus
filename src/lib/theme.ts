import { store } from '@/lib/store'
import '@/styles/Theme.css'
import '@/styles/ClientSurfaces.css'

export type SonaTheme = 'client'

export function initSonaTheme() {
  const applyTheme = () => {
    document.documentElement.dataset.sonaTheme = 'client'
  }
  applyTheme()
  return store.onChange('theme', applyTheme)
}
