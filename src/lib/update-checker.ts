declare const __PLUGIN_VERSION__: string
declare const __PLUGIN_RELEASE_NOTES__: string

import { logger } from '@/lib/logger'
import { getCorsProxyCandidates } from '@/lib/cors-proxy'
import { store } from '@/lib/store'

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  releaseName: string
  releaseUrl: string
  releaseBody: string
  publishedAt: string
}

interface GithubReleaseResponse {
  draft?: boolean
  prerelease?: boolean
  tag_name?: string
  name?: string
  html_url?: string
  body?: string
  published_at?: string
}

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'latest' | 'error'
  info: UpdateInfo | null
  error: string
}

const RELEASE_PAGE_URL = 'https://github.com/chii-primenumber/sona-plus/releases'
const GITHUB_API_LATEST = 'https://api.github.com/repos/chii-primenumber/sona-plus/releases/latest'
const GITHUB_API_RELEASES = 'https://api.github.com/repos/chii-primenumber/sona-plus/releases'
let state: UpdateState = {
  status: 'idle',
  info: null,
  error: '',
}
let inFlight: Promise<UpdateState> | null = null
let notifiedVersion = ''
const listeners = new Set<(state: UpdateState) => void>()

function emit() {
  const snapshot = getUpdateState()
  listeners.forEach((listener) => listener(snapshot))
}

function setState(next: UpdateState) {
  state = next
  emit()
}

export function getUpdateState(): UpdateState {
  return {
    ...state,
    info: state.info ? { ...state.info } : null,
  }
}

export function onUpdateStateChange(listener: (state: UpdateState) => void): () => void {
  listeners.add(listener)
  listener(getUpdateState())
  return () => listeners.delete(listener)
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '')
}

function compareVersion(a: string, b: string): number {
  const left = normalizeVersion(a).split(/[.-]/)
  const right = normalizeVersion(b).split(/[.-]/)
  const length = Math.max(left.length, right.length)

  for (let index = 0; index < length; index += 1) {
    const leftPart = Number.parseInt(left[index] ?? '0', 10)
    const rightPart = Number.parseInt(right[index] ?? '0', 10)
    const leftNumber = Number.isFinite(leftPart) ? leftPart : 0
    const rightNumber = Number.isFinite(rightPart) ? rightPart : 0
    if (leftNumber !== rightNumber) return leftNumber - rightNumber
  }

  return 0
}

function getSkippedUpdateVersion(): string {
  const version = normalizeVersion(store.get('skippedUpdateVersion') ?? '')
  return /^\d+\.\d+\.\d+$/.test(version) ? version : ''
}

function isPlusRelease(release: GithubReleaseResponse): boolean {
  return !release.draft && !release.prerelease
    && /^v?\d+\.\d+\.\d+$/.test(release.tag_name ?? '')
}

async function fetchLatestRelease(): Promise<GithubReleaseResponse> {
  const errors: string[] = []
  const candidates: Array<{ url: string; kind: 'single' | 'array' }> = [
    { url: GITHUB_API_LATEST, kind: 'single' },
    { url: GITHUB_API_RELEASES, kind: 'array' },
    ...getCorsProxyCandidates(GITHUB_API_LATEST).map((url) => ({ url, kind: 'single' as const })),
    ...getCorsProxyCandidates(GITHUB_API_RELEASES).map((url) => ({ url, kind: 'array' as const })),
  ]

  for (const { url, kind } of candidates) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(()=>controller.abort(),8000)
      let response: Response
      let text: string
      try {
      response = await fetch(url, {
        signal: controller.signal,
        method: 'GET',
        mode: 'cors',
        headers: {
          Accept: 'application/vnd.github+json',
        },
      })
      text = await response.text()
      } finally { clearTimeout(timer) }

      if (!response.ok) {
        errors.push(`${url} -> ${response.status} ${response.statusText}`)
        continue
      }

      const parsed = JSON.parse(text) as unknown
      const data = kind === 'single'
        ? (parsed as GithubReleaseResponse)
        : (Array.isArray(parsed) ? parsed.find((entry) => entry && isPlusRelease(entry)) as GithubReleaseResponse | undefined : null)

      if (!data?.tag_name || !isPlusRelease(data)) {
        errors.push(`${url} -> missing tag_name`)
        continue
      }

      return data
    } catch (err) {
      errors.push(`${url} -> ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  throw new Error(errors.join(' | ') || 'no release api response')
}

export function getReleasePageUrl(): string {
  return RELEASE_PAGE_URL
}

export function checkForUpdates(): Promise<UpdateState> {
  if (inFlight) return inFlight

  setState({ status: 'checking', info: null, error: '' })

  inFlight = fetchLatestRelease()
    .then((release) => {
      const currentVersion = normalizeVersion(__PLUGIN_VERSION__)
      const latestVersion = normalizeVersion(release.tag_name ?? '')
      const announcement: UpdateInfo = {
        currentVersion, latestVersion,
        releaseName: release.name || `Sona Plus v${latestVersion}`,
        releaseUrl: release.html_url?.startsWith(`${RELEASE_PAGE_URL}/tag/`) ? release.html_url : RELEASE_PAGE_URL,
        releaseBody: release.body || '该版本没有填写更新说明。', publishedAt: release.published_at || '',
      }
      store.set('releaseAnnouncement',announcement)
      store.set('lastUpdateCheckAt',Date.now())
      const skippedVersion = getSkippedUpdateVersion()
      if (skippedVersion && compareVersion(currentVersion, skippedVersion) >= 0) {
        store.set('skippedUpdateVersion', null)
      }

      if (!latestVersion || compareVersion(latestVersion, currentVersion) <= 0) {
        const next: UpdateState = { status: 'latest', info: null, error: '' }
        setState(next)
        return next
      }

      if (latestVersion === skippedVersion) {
        const next: UpdateState = { status: 'latest', info: null, error: '' }
        setState(next)
        logger.info('[Update] 已跳过版本 %s，本次不再提示。', latestVersion)
        return next
      }

      const next: UpdateState = {
        status: 'available',
        error: '',
        info: announcement,
      }
      setState(next)
      logger.info('[Update] 检测到新版本: %s -> %s', currentVersion, latestVersion)
      notifyUpdateAvailable(currentVersion, latestVersion)
      return next
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      const next: UpdateState = { status: 'error', info: null, error: message }
      setState(next)
      logger.warn('[Update] 检查更新失败:', err)
      return next
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

export function skipUpdateVersion(version: string): UpdateState {
  const normalizedVersion = normalizeVersion(version)
  if (!normalizedVersion) return getUpdateState()

  store.set('skippedUpdateVersion', normalizedVersion)
  notifiedVersion = normalizedVersion

  if (state.info?.latestVersion === normalizedVersion) {
    setState({ status: 'latest', info: null, error: '' })
  } else {
    emit()
  }

  logger.info('[Update] 跳过版本更新提醒: %s', normalizedVersion)
  return getUpdateState()
}

export function clearSkippedUpdateVersion() {
  store.set('skippedUpdateVersion', null)
  notifiedVersion = ''
}

function notifyUpdateAvailable(currentVersion: string, latestVersion: string) {
  if (notifiedVersion === latestVersion || store.get('readAnnouncementVersion') === latestVersion) return
  notifiedVersion = latestVersion

  logger.info('[Update] 插件内更新提醒已就绪：%s → %s',currentVersion,latestVersion)

}

export function getReleaseAnnouncement(): UpdateInfo | null {
  const value=store.get('releaseAnnouncement')
  if(value && typeof value.latestVersion==='string' && typeof value.releaseBody==='string' && typeof value.releaseName==='string' && typeof value.releaseUrl==='string' && compareVersion(value.latestVersion,__PLUGIN_VERSION__)>=0)return {...value,currentVersion:__PLUGIN_VERSION__}
  const body=typeof __PLUGIN_RELEASE_NOTES__==='string'?__PLUGIN_RELEASE_NOTES__:''
  return body?{currentVersion:__PLUGIN_VERSION__,latestVersion:__PLUGIN_VERSION__,releaseName:`Sona Plus v${__PLUGIN_VERSION__}`,releaseBody:body,releaseUrl:`${RELEASE_PAGE_URL}/tag/v${__PLUGIN_VERSION__}`,publishedAt:''}:null
}

let backgroundInitialized=false
let lastAttempt=0
export function checkUpdatesInBackground() {
  if (!store.get('automaticUpdateCheck') || document.hidden || Date.now()-lastAttempt<10*60*1000) return
  const lastSuccess=store.get('lastUpdateCheckAt')
  if (Number.isFinite(lastSuccess) && Date.now()-lastSuccess<6*60*60*1000) return
  lastAttempt=Date.now()
  void checkForUpdates()
}
/** Startup delay plus visible-page refresh; no polling and no automatic installation. */
export function initUpdateAnnouncements() {
  if (backgroundInitialized) return
  backgroundInitialized=true
  const timer=window.setTimeout(checkUpdatesInBackground,15000)
  const visible=()=>{if(!document.hidden)checkUpdatesInBackground()}
  document.addEventListener('visibilitychange',visible)
  const stop=store.onChange('automaticUpdateCheck',enabled=>{if(enabled)checkUpdatesInBackground()})
  return ()=>{window.clearTimeout(timer);stop();document.removeEventListener('visibilitychange',visible);backgroundInitialized=false}
}
