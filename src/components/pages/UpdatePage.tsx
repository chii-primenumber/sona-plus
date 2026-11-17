import { store } from '@/lib/store'
import { useEffect, useState } from 'react'
import { SonaButton } from '@/components/ui/SonaButton'
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
  const info = updateState.info ?? getReleaseAnnouncement()
  useEffect(()=>{if(info)store.set('readAnnouncementVersion',info.latestVersion)},[info?.latestVersion])

  useEffect(() => onUpdateStateChange(setUpdateState), [])

  const openUrl = (url: string) => {
    if (!url) return
    window.open(url, '_blank')
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
              <SonaButton variant="primary" onClick={() => openUrl(info.releaseUrl || getReleasePageUrl())}>
                {t('update.openRelease')}
              </SonaButton>

              {updateState.status==='available'&&<SonaButton onClick={() => skipUpdateVersion(info.latestVersion)}>
                {t('update.skipVersion', { version: info.latestVersion })}
              </SonaButton>}
              <SonaButton disabled={updateState.status==='checking'} onClick={()=>{void checkForUpdates()}}>检查更新</SonaButton>
            </div>
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
