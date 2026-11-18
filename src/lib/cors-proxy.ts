import { store } from '@/lib/store'

export const DEFAULT_CORS_PROXY_URL = 'https://corsproxy.io/'

/**
 * 校验并规范化用户自定义 CORS 代理地址。
 * 允许 https:// 域名，或本地调试用的 http://localhost / http://127.0.0.1。
 */
export function normalizeCorsProxyBaseUrl(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    const isHttps = parsed.protocol === 'https:'
    const isLocalHttp = parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    if (!isHttps && !isLocalHttp) return ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return ''
  }
}

export function formatProxiedUrl(
  proxyBaseUrl: string,
  targetUrl: string,
  requestHeaders?: Record<string, string>,
): string {
  const hasHeaders = Boolean(requestHeaders && Object.keys(requestHeaders).length > 0)
  if (!hasHeaders && proxyBaseUrl === DEFAULT_CORS_PROXY_URL) {
    return `${DEFAULT_CORS_PROXY_URL}?${encodeURIComponent(targetUrl)}`
  }
  const url = new URL(proxyBaseUrl)
  url.searchParams.set('url', targetUrl)
  if (requestHeaders) {
    for (const [name, value] of Object.entries(requestHeaders)) {
      url.searchParams.append('reqHeaders', `${name}:${value}`)
    }
  }
  return url.toString()
}

/**
 * 生成代理候选 URL 列表：若配置了合法自定义代理则优先使用，并自动保留默认公共代理作为回退。
 */
export function getCorsProxyCandidates(
  targetUrl: string,
  requestHeaders?: Record<string, string>,
): string[] {
  const customBase = normalizeCorsProxyBaseUrl(store.get('customCorsProxyUrl'))
  const candidates: string[] = []
  if (customBase && customBase !== DEFAULT_CORS_PROXY_URL) {
    candidates.push(formatProxiedUrl(customBase, targetUrl, requestHeaders))
  }
  candidates.push(formatProxiedUrl(DEFAULT_CORS_PROXY_URL, targetUrl, requestHeaders))
  return candidates
}
