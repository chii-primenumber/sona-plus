declare const __PLUGIN_VERSION__: string

import { normalizeChampSelectPresetsMap } from '@/lib/champselect-enhancements'
import { normalizeCorsProxyBaseUrl } from '@/lib/cors-proxy'
import { normalizePlayerTagsMap } from '@/lib/player-tags'
import { normalizeRecommendationPreferences } from '@/lib/recommendation-filter'
import { getDefaultConfig, store, type SonaConfig } from '@/lib/store'

export interface SonaConfigExportPayload {
  schema: 1
  app: 'sona-plus'
  version: string
  exportedAt: string
  includeAccountData: boolean
  config: Partial<SonaConfig>
}

const EPHEMERAL_KEYS = new Set<keyof SonaConfig>([
  'lastUpdateCheckAt',
  'releaseAnnouncement',
  'customAvatarRemoteCache',
  'cachedChampionBalance',
])

const ACCOUNT_SCOPED_KEYS = new Set<keyof SonaConfig>([
  'gameSettingsBackups',
  'statusMessage',
  'historyRecentPlayers',
])

const NULLABLE_KEYS = new Set<keyof SonaConfig>([
  'skippedUpdateVersion',
  'dismissedUpdateNotice',
  'readAnnouncementVersion',
  'beautifyHomepageBackgroundAssetPath',
  'beautifyHomepageBackgroundLastRandomAssetPath',
  'customBannerSelection',
])

function isCompatibleShape(defaultValue: unknown, candidate: unknown, key: keyof SonaConfig): boolean {
  if (candidate === null) {
    return defaultValue === null || NULLABLE_KEYS.has(key)
  }
  if (defaultValue === null) {
    if (key === 'customBannerSelection') {
      return typeof candidate === 'object' && !Array.isArray(candidate)
    }
    return typeof candidate === 'string'
  }
  if (Array.isArray(defaultValue)) {
    return Array.isArray(candidate)
  }
  if (typeof defaultValue === 'object') {
    return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
  }
  if (typeof defaultValue === 'number') {
    return typeof candidate === 'number' && Number.isFinite(candidate)
  }
  return typeof candidate === typeof defaultValue
}

function normalizeConfigEntry<K extends keyof SonaConfig>(key: K, rawValue: unknown): SonaConfig[K] {
  if (key === 'theme') {
    return 'client' as SonaConfig[K]
  }
  if (key === 'recommendationPreferences') {
    return normalizeRecommendationPreferences(rawValue as SonaConfig['recommendationPreferences']) as SonaConfig[K]
  }
  if (key === 'playerTags') {
    return normalizePlayerTagsMap(rawValue) as SonaConfig[K]
  }
  if (key === 'champSelectPresets') {
    return normalizeChampSelectPresetsMap(rawValue) as SonaConfig[K]
  }
  if (key === 'autoHonorStrategy') {
    const valid = rawValue === 'friends_only' || rawValue === 'random' ? rawValue : 'smart'
    return valid as SonaConfig[K]
  }
  if (key === 'customCorsProxyUrl') {
    const trimmed = typeof rawValue === 'string' ? rawValue.trim() : ''
    return (trimmed ? normalizeCorsProxyBaseUrl(trimmed) : '') as SonaConfig[K]
  }
  if (key === 'autoLockChampionIds' || key === 'autoBanChampionIds' || key === 'aramWishlistChampionIds') {
    const ids = Array.isArray(rawValue)
      ? Array.from(new Set(rawValue.filter((v): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0)))
      : []
    return ids as SonaConfig[K]
  }
  return rawValue as SonaConfig[K]
}

export function serializeSonaConfig(options: { includeAccountData?: boolean } = {}): string {
  const includeAccountData = options.includeAccountData ?? true
  const defaults = getDefaultConfig()
  const snapshot = store.getAll()
  const config: Partial<SonaConfig> = {}

  for (const key of Object.keys(defaults) as Array<keyof SonaConfig>) {
    if (EPHEMERAL_KEYS.has(key)) continue
    if (!includeAccountData && ACCOUNT_SCOPED_KEYS.has(key)) continue
    ;(config as Record<string, unknown>)[key] = snapshot[key]
  }

  const version = typeof __PLUGIN_VERSION__ === 'string' ? __PLUGIN_VERSION__ : '1.2.0'
  const payload: SonaConfigExportPayload = {
    schema: 1,
    app: 'sona-plus',
    version,
    exportedAt: new Date().toISOString(),
    includeAccountData,
    config,
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

export function applyImportedSonaConfig(rawJson: string): { appliedKeys: number; skippedKeys: number } {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    throw new Error('配置文件不是合法的 JSON 格式')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('配置文件内容格式无效')
  }

  const root = parsed as Record<string, unknown>
  if ('app' in root && root.app !== 'sona-plus' && root.app !== 'sona') {
    throw new Error('该文件不是 Sona Plus 导出的配置文件')
  }

  const rawConfig = root.config && typeof root.config === 'object' && !Array.isArray(root.config)
    ? (root.config as Record<string, unknown>)
    : root

  const defaults = getDefaultConfig()
  const patch: Partial<SonaConfig> = {}
  let appliedKeys = 0
  let skippedKeys = 0

  for (const [rawKey, rawValue] of Object.entries(rawConfig)) {
    if (!(rawKey in defaults)) {
      if (rawConfig !== root || !['schema', 'app', 'version', 'exportedAt', 'includeAccountData'].includes(rawKey)) {
        skippedKeys += 1
      }
      continue
    }
    const key = rawKey as keyof SonaConfig
    if (EPHEMERAL_KEYS.has(key)) {
      skippedKeys += 1
      continue
    }
    if (!isCompatibleShape(defaults[key], rawValue, key)) {
      skippedKeys += 1
      continue
    }
    ;(patch as Record<string, unknown>)[key] = normalizeConfigEntry(key, rawValue)
    appliedKeys += 1
  }

  if (appliedKeys === 0) {
    throw new Error('未在文件中找到任何有效的 Sona Plus 配置项')
  }

  store.setBatch(patch, true)
  return { appliedKeys, skippedKeys }
}
