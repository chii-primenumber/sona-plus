import { lcu } from './lcu'
import { deadline } from './history-api'

const PROFILE = '/lol-summoner/v1/current-summoner/summoner-profile'
const CURRENT = '/lol-summoner/v1/current-summoner'
interface SkinArt { id: number; uncenteredSplashPath?: string; splashPath?: string; questSkinInfo?: { tiers?: SkinArt[] } }
const catalogs = new Map<number, { expires: number; paths: Map<number, string> }>()
const listeners = new Set<() => void>()
let image = '', account = '', skinId = 0, generation = 0
let controller: AbortController | null = null
let releaseEvents: (() => void) | null = null

function setImage(value: string) {
  if (image === value) return
  image = value; listeners.forEach((listener) => listener())
}

function localSplash(path?: string) {
  if (!path) return ''
  if (/^\/lol-game-data\/assets\//i.test(path)) return path
  return /^assets\//i.test(path) ? `/lol-game-data/assets/${path}` : ''
}

async function json<T>(path: string, signal: AbortSignal): Promise<T> {
  return deadline(async (requestSignal) => {
    const response = await fetch(path, { signal: requestSignal })
    if (!response.ok) throw new Error(`生涯背景暂不可用 (${response.status})`)
    return response.json() as Promise<T>
  }, signal, 8000)
}

async function splashFor(id: number, signal: AbortSignal) {
  const championId = Math.floor(id / 1000)
  if (championId <= 0) return ''
  const cached = catalogs.get(championId)
  if (cached && cached.expires > Date.now()) {
    catalogs.delete(championId); catalogs.set(championId, cached)
    return cached.paths.get(id) ?? ''
  }
  const champion = await json<{ skins?: SkinArt[] }>(`/lol-game-data/assets/v1/champions/${championId}.json`, signal)
  const paths = new Map<number, string>()
  const add = (skin: SkinArt) => {
    const path = localSplash(skin.uncenteredSplashPath) || localSplash(skin.splashPath)
    if (path) paths.set(skin.id, path)
    for (const tier of skin.questSkinInfo?.tiers ?? []) add(tier)
  }
  for (const skin of champion.skins ?? []) add(skin)
  if (signal.aborted) throw new DOMException('查询已取消', 'AbortError')
  catalogs.delete(championId); catalogs.set(championId, { expires: Date.now() + 600000, paths })
  while (catalogs.size > 4) catalogs.delete(catalogs.keys().next().value!)
  return paths.get(id) ?? ''
}

/** Only the signed-in account owns this background; inspected players never affect it. */
export function refreshCareerBackground() {
  if (!listeners.size || document.hidden) return
  controller?.abort()
  const current = new AbortController(), token = ++generation
  controller = current
  void Promise.all([
    json<{ puuid?: string; summonerId?: number }>(CURRENT, current.signal),
    json<{ backgroundSkinId?: number }>(PROFILE, current.signal),
  ]).then(async ([me, profile]) => {
    if (token !== generation || current.signal.aborted) return
    const nextAccount = me.puuid || String(me.summonerId || '')
    if (!nextAccount) { setImage(''); return }
    if (account !== nextAccount) { account = nextAccount; setImage('') }
    const nextSkin = Number(profile.backgroundSkinId)
    skinId = Number.isSafeInteger(nextSkin) && nextSkin > 0 ? nextSkin : 0
    if (!skinId) { setImage(''); return }
    const path = await splashFor(skinId, current.signal)
    if (token === generation && !current.signal.aborted) setImage(path)
  }).catch(() => {
    if (token === generation && !current.signal.aborted) { setImage(''); current.abort() }
  }).finally(() => { if (controller === current) controller = null })
}

function start() {
  const visibility = () => {
    if (document.hidden) { generation++; controller?.abort(); controller = null }
    else refreshCareerBackground()
  }
  const releaseProfile = lcu.observe(PROFILE, (event) => {
    const id = Number((event.data as { backgroundSkinId?: number } | null)?.backgroundSkinId)
    if (event.eventType === 'Delete') { generation++; controller?.abort(); setImage(''); skinId = 0; return }
    if (Number.isSafeInteger(id) && id === skinId && image) return
    refreshCareerBackground()
  })
  const releaseAccount = lcu.observe(CURRENT, (event) => {
    const me = event.data as { puuid?: string; summonerId?: number } | null
    const next = me?.puuid || String(me?.summonerId || '')
    if (event.eventType === 'Delete' || !next || next !== account) {
      generation++; controller?.abort(); controller = null; account = ''; skinId = 0; setImage('')
      if (event.eventType !== 'Delete' && next) refreshCareerBackground()
    }
  })
  document.addEventListener('visibilitychange', visibility)
  releaseEvents = () => { releaseProfile(); releaseAccount(); document.removeEventListener('visibilitychange', visibility) }
  refreshCareerBackground()
}

export const getCareerBackground = () => image
export function subscribeCareerBackground(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) start()
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      generation++; controller?.abort(); controller = null
      releaseEvents?.(); releaseEvents = null
      // Never paint a previous account's art for even one frame on the next open.
      image = ''; account = ''; skinId = 0
    }
  }
}
