import { store } from '@/lib/store'
import { useEffect, useState } from 'react'
import { SonaButton } from '@/components/ui/SonaButton'
import { getPluginFolderPath } from '@/lib/plugin-resolver'
import { checkForUpdates, getReleaseAnnouncement, getReleasePageUrl, getUpdateState, onUpdateStateChange, skipUpdateVersion, type UpdateState } from '@/lib/update-checker'
import { useI18n } from '@/i18n'
import '@/styles/UpdatePage.css'


function formatPublishedDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}年${month}月${day}日`
}

export function UpdatePage() {
  const { t } = useI18n()
  const [updateState, setUpdateState] = useState<UpdateState>(() => getUpdateState())
  const [folderHint, setFolderHint] = useState('')
  const info = updateState.info ?? getReleaseAnnouncement()
  useEffect(()=>{if(info)store.set('readAnnouncementVersion',info.latestVersion)},[info?.latestVersion])

  useEffect(() => onUpdateStateChange(setUpdateState), [])

  const openUrl = (url: string) => {
    if (!url) return
    window.open(url, '_blank')
  }

  const openUpdaterFolder = () => {
    const folder = getPluginFolderPath()
    if (typeof window.openPluginsFolder === 'function') {
      window.openPluginsFolder(folder)
      setFolderHint(`已打开插件目录（${folder}）。无需退出客户端，直接双击「双击更新SonaPlus.cmd」替换文件后，按 Ctrl+Enter 或点击「重载客户端生效」即可！`)
    } else {
      setFolderHint(`请在 Pengu Loader 插件目录的 ${folder} 文件夹中双击「双击更新SonaPlus.cmd」，完成后回到客户端按 Ctrl+Enter 重载生效。`)
    }
  }

  const handleReloadClient = () => {
    if (typeof window.reloadClient === 'function') {
      window.reloadClient()
      return
    }
    void fetch('/riotclient/kill-and-restart-ux', { method: 'POST' }).catch(() => {
      window.location.reload()
    })
  }

  return (
    <div className="sona-update-page">
      <h2 className="sona-update-title">
        {info && updateState.status==='available' ? (
          <>
            {t('update.titleWithVersion')}
            <span className="sona-update-title-version">{info.currentVersion}</span>
            <span className="sona-update-title-arrow">→</span>
            <span className="sona-update-title-version sona-update-title-version--latest">{info.latestVersion}</span>
          </>
        ) : (
          '更新与公告'
        )}
      </h2>

      {info ? (
        <>
          <div className="sona-update-release">
            <div className="sona-update-release-head">
              <span>{info.releaseName}{updateState.status==='available'?' · 新版本':''}</span>
              {info.publishedAt && <time dateTime={info.publishedAt}>{formatPublishedDate(info.publishedAt)}</time>}
            </div>
            <pre className="sona-update-notes">{info.releaseBody}</pre>
          </div>

          {updateState.status==='error'&&<p role="alert">更新检查失败，当前显示已缓存公告。</p>}
          <div className="sona-update-download">
            <h3>{t('update.downloadTitle')}</h3>
            <p>{t('update.downloadDescription')}</p>
            <div className="sona-update-actions">
              <SonaButton variant="primary" onClick={openUpdaterFolder}>
                打开目录一键更新
              </SonaButton>
              <SonaButton onClick={handleReloadClient}>
                重载客户端生效
              </SonaButton>
              <SonaButton onClick={() => openUrl(info.releaseUrl || getReleasePageUrl())}>
                {t('update.openRelease')}
              </SonaButton>

              {updateState.status==='available'&&<SonaButton onClick={() => skipUpdateVersion(info.latestVersion)}>
                {t('update.skipVersion', { version: info.latestVersion })}
              </SonaButton>}
              <SonaButton disabled={updateState.status==='checking'} onClick={()=>{void checkForUpdates()}}>检查更新</SonaButton>
            </div>
            {folderHint && <p className="sona-update-folder-hint" role="status" style={{ marginTop: 10, marginBottom: 0, color: 'rgb(var(--sona-accent-rgb))' }}>{folderHint}</p>}
          </div>
        </>
      ) : (
        <div className="sona-update-empty">
          <p>{updateState.status === 'checking' ? t('update.checking') : updateState.status === 'error' ? t('update.checkFailed', { error: updateState.error ?? '' }) : t('update.none')}</p>
          <SonaButton onClick={() => { void checkForUpdates() }}>
            {t('update.recheck')}
          </SonaButton>
        </div>
      )}
    </div>
  )
}
