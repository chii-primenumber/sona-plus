import {UpdatePushNotice} from '@/components/ui/UpdatePushNotice'
import { lazy, Suspense, useState, useEffect, useMemo } from 'react'
import '@/styles/App.css'
import { logger } from '@/lib/logger'
import { Modal } from '@/components/ui/Modal'
import { Sidebar, type SidebarItem } from '@/components/ui/Sidebar'
import { HomePage } from '@/components/pages/HomePage'
import { SettingsPage } from '@/components/pages/SettingsPage'
import { UpdatePage } from '@/components/pages/UpdatePage'
import { HomeIcon, GamepadIcon, PaletteIcon, SettingsIcon, InfoIcon, BugIcon, ZapIcon, GiftIcon } from '@/components/ui/icons'
import { onModalVisibilityChange, isModalVisible, closeModal, openModal } from '@/lib/modal'
import { store } from '@/lib/store'
import { checkUpdatesInBackground, getUpdateState, onUpdateStateChange, type UpdateState } from '@/lib/update-checker'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'

const ToolsPage = lazy(() => import('@/components/pages/ToolsPage').then((m) => ({ default: m.ToolsPage })))
const BeautifyPage = lazy(() => import('@/components/pages/BeautifyPage').then((m) => ({ default: m.BeautifyPage })))
const RewardsPage = lazy(() => import('@/components/pages/RewardsPage').then((m) => ({ default: m.RewardsPage })))
const AboutPage = lazy(() => import('@/components/pages/AboutPage').then((m) => ({ default: m.AboutPage })))
const DebugPage = lazy(() => import('@/components/pages/DebugPage').then((m) => ({ default: m.DebugPage })))

const baseSidebarItemConfigs: Array<Omit<SidebarItem, 'label'> & { labelKey: TranslationKey }> = [
  { id: 'home', icon: <HomeIcon />, labelKey: 'nav.home' },
  { id: 'tools', icon: <GamepadIcon />, labelKey: 'nav.tools' },
  { id: 'rewards', icon: <GiftIcon />, labelKey: 'nav.rewards' },
  { id: 'beautify', icon: <PaletteIcon />, labelKey: 'nav.beautify' },
  { id: 'settings', icon: <SettingsIcon />, labelKey: 'nav.settings' },
  { id: 'about', icon: <InfoIcon />, labelKey: 'nav.about' },
]

const debugSidebarItemConfig: Omit<SidebarItem, 'label'> & { labelKey: TranslationKey } = {
  id: 'debug', icon: <BugIcon />, labelKey: 'nav.debug',
}

const updateSidebarItemConfig: Omit<SidebarItem, 'label'> & { labelKey: TranslationKey } = {
  id: 'update', icon: <ZapIcon />, labelKey: 'nav.updateAvailable',
}

function PageContent({ pageId }: { pageId: string }) {
  switch (pageId) {
    case 'update':
      return <UpdatePage />
    case 'home':
      return <HomePage />
    case 'tools':
      return <ToolsPage />
    case 'rewards':
      return <RewardsPage />
    case 'beautify':
      return <BeautifyPage />
    case 'settings':
      return <SettingsPage />
    case 'about':
      return <AboutPage />
    case 'debug':
      return <DebugPage />
    default:
      return <HomePage />
  }
}

function hasUnhandledUpdate(state: UpdateState = getUpdateState()): boolean {
  if (state.status !== 'available' || !state.info?.latestVersion) return false
  const latestVersion = state.info.latestVersion
  return store.get('dismissedUpdateNotice') !== latestVersion
    && store.get('readAnnouncementVersion') !== latestVersion
}

export function App() {
  const { t } = useI18n()
  const [visible, setVisible] = useState(isModalVisible())
  const [activePageId, setActivePageId] = useState(() => (hasUnhandledUpdate() ? 'update' : 'home'))
  const [sidebarCollapsed, setSidebarCollapsed] = useState(store.get('sidebarCollapsed'))
  const [devMode, setDevMode] = useState(store.get('developerMode'))
  const [updateState, setUpdateState] = useState<UpdateState>(() => getUpdateState())

  useEffect(() => {
    return onModalVisibilityChange((v) => {
      const rootConnected = Boolean(document.getElementById('sona-root')?.isConnected)
      logger.debug('Modal visibility changed: %s (root in DOM: %s)', String(v), String(rootConnected))
      setVisible(v)
      if (v) checkUpdatesInBackground()
      if (v && hasUnhandledUpdate()) {
        setActivePageId('update')
      }
    })
  }, [])

  // 监听开发者模式变化
  useEffect(() => {
    return store.onChange('developerMode', (v) => {
      setDevMode(v)
      // 如果关闭开发者模式时正在调试页，切回主页
      if (!v && activePageId === 'debug') {
        setActivePageId('home')
      }
    })
  }, [activePageId])

  useEffect(() => {
    return onUpdateStateChange((state) => {
      setUpdateState(state)
    })
  }, [])

  // 动态构建侧边栏项目
  const sidebarItems = useMemo(() => {
    const makeItem = (item: Omit<SidebarItem, 'label'> & { labelKey: TranslationKey }): SidebarItem => ({
      id: item.id,
      icon: item.icon,
      label: t(item.labelKey),
    })
    const baseItems = baseSidebarItemConfigs.map(makeItem)
    const items = [makeItem({...updateSidebarItemConfig,labelKey:updateState.status === 'available'?'nav.updateAvailable':'nav.updates'}),...baseItems]
    return devMode ? [...items, makeItem(debugSidebarItemConfig)] : items
  }, [devMode, t, updateState.status])

  const handleClose = () => {
    closeModal()
    logger.info('Modal closed')
  }

  const handleToggleSidebar = () => {
    setSidebarCollapsed((v) => {
      const next = !v
      store.set('sidebarCollapsed', next)
      return next
    })
  }

  return (<>
    <UpdatePushNotice state={updateState} onView={()=>{setActivePageId('update');openModal()}}/>
    <Modal
      open={visible}
      onClose={handleClose}
      width={900}
      height={560}
    >
      <div className="sona-layout">
        <Sidebar
          items={sidebarItems}
          activeId={activePageId}
          onSelect={setActivePageId}
          collapsed={sidebarCollapsed}
          onToggle={handleToggleSidebar}
        />
        <div className="sona-content">
          <Suspense fallback={<div className="sona-settings" style={{ opacity: 0.7 }}>加载中…</div>}>
            <PageContent pageId={activePageId} />
          </Suspense>
        </div>
      </div>
    </Modal>
    </>
  )
}
