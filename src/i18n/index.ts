import { useMemo, useSyncExternalStore } from 'react'
import { store } from '@/lib/store'
import { locales, type SonaLocale, type SonaLocaleSetting, type TranslationKey } from '@/i18n/locales'

function normalizeLocale(value: string | null | undefined): SonaLocale {
  const normalized = (value ?? '').trim().replace('_', '-').toLowerCase()
  if (normalized.startsWith('zh')) return 'zh-CN'
  return 'en-US'
}

function normalizeLocaleSetting(value: string | null | undefined): SonaLocaleSetting {
  if (value === 'auto' || value === 'zh-CN' || value === 'en-US') return value
  return 'auto'
}

export function resolveAutoLocale(): SonaLocale {
  return normalizeLocale(document.documentElement.lang)
}

export function resolveLocale(setting: SonaLocaleSetting | string): SonaLocale {
  const normalizedSetting = normalizeLocaleSetting(setting)
  return normalizedSetting === 'auto' ? resolveAutoLocale() : normalizedSetting
}

export function getCurrentLocaleSetting(): SonaLocaleSetting {
  return normalizeLocaleSetting(store.get('locale'))
}

export function getCurrentLocale(): SonaLocale {
  return resolveLocale(getCurrentLocaleSetting())
}

export function translate(key: TranslationKey, params?: Record<string, string | number>): string {
  const locale = getCurrentLocale()
  const template = locales[locale][key] ?? locales['zh-CN'][key] ?? key
  if (!params) return template

  return template.replace(/\{(\w+)\}/g, (match, name) => {
    const value = params[name]
    return value == null ? match : String(value)
  })
}

const i18nListeners = new Set<() => void>()
let stopLocaleStore: (() => void) | null = null
let langObserver: MutationObserver | null = null

function notifyI18nListeners() {
  i18nListeners.forEach((listener) => listener())
}

function subscribeI18n(listener: () => void): () => void {
  i18nListeners.add(listener)
  if (i18nListeners.size === 1) {
    stopLocaleStore = store.onChange('locale', notifyI18nListeners)
    langObserver = new MutationObserver(notifyI18nListeners)
    langObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang'],
    })
  }

  return () => {
    i18nListeners.delete(listener)
    if (i18nListeners.size === 0) {
      stopLocaleStore?.()
      stopLocaleStore = null
      langObserver?.disconnect()
      langObserver = null
    }
  }
}

function getI18nSnapshot(): string {
  const localeSetting = getCurrentLocaleSetting()
  const resolved = resolveLocale(localeSetting === 'auto' ? document.documentElement.lang : localeSetting)
  return `${localeSetting}:${resolved}`
}

export function useI18n() {
  const snapshot = useSyncExternalStore(subscribeI18n, getI18nSnapshot, getI18nSnapshot)
  const separatorIndex = snapshot.indexOf(':')
  const localeSetting = normalizeLocaleSetting(snapshot.slice(0, separatorIndex))
  const locale = (snapshot.slice(separatorIndex + 1) === 'en-US' ? 'en-US' : 'zh-CN') as SonaLocale

  const t = useMemo(() => {
    return (key: TranslationKey, params?: Record<string, string | number>) => {
      const template = locales[locale][key] ?? locales['zh-CN'][key] ?? key
      if (!params) return template

      return template.replace(/\{(\w+)\}/g, (match, name) => {
        const value = params[name]
        return value == null ? match : String(value)
      })
    }
  }, [locale])

  const setLocaleSetting = (nextLocaleSetting: SonaLocaleSetting) => {
    store.set('locale', nextLocaleSetting)
  }

  return {
    locale,
    localeSetting,
    setLocaleSetting,
    t,
  }
}

export type { SonaLocale, SonaLocaleSetting, TranslationKey }
