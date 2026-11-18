/**
 * Sona Plus 轻量自建 CORS 转发 Cloudflare Worker
 *
 * 部署步骤：
 * 1. 登录 Cloudflare Dashboard -> Workers & Pages -> Create Worker
 * 2. 将本文件全部内容粘贴到 Worker 编辑器并点击 Deploy
 * 3. 复制生成的 `https://<你的worker名>.<子域>.workers.dev/`
 * 4. 在 Sona Plus「设置 -> 高级选项 -> 自定义跨域代理地址」中粘贴保存即可
 *
 * 特性：
 * - 严格上游域名白名单（杜绝被第三方滥用为开放代理）
 * - 对 GitHub Releases 与英雄平衡性数据启用 300 秒边缘缓存（规避 GitHub 未认证 60 次/小时限流）
 * - 兼容 `?url=<encoded>`、`?<encoded>` 与 `reqHeaders=Header:Value` 协议，无缝替代 corsproxy.io
 */

const ALLOWED_HOSTS = new Set([
  'api.github.com',
  'github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'sona-service.vercel.app',
  'api-takumi.mihoyogift.com',
  'plat-sh-operation-prod-upload-ugc.cn-shanghai.oss.aliyuncs.com',
])

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Type, ETag',
  'Access-Control-Max-Age': '86400',
}

function parseTargetAndHeaders(requestUrl) {
  const parsed = new URL(requestUrl)
  let target = parsed.searchParams.get('url') || ''
  if (!target && parsed.search.length > 1) {
    const rawQuery = parsed.search.slice(1)
    if (!rawQuery.includes('=') || rawQuery.startsWith('http%3A') || rawQuery.startsWith('https%3A') || rawQuery.startsWith('https://')) {
      try {
        target = decodeURIComponent(rawQuery)
      } catch {
        target = rawQuery
      }
    }
  }
  const extraHeaders = []
  for (const item of parsed.searchParams.getAll('reqHeaders')) {
    const idx = item.indexOf(':')
    if (idx > 0) {
      extraHeaders.push([item.slice(0, idx).trim(), item.slice(idx + 1).trim()])
    }
  }
  return { target, extraHeaders }
}

function shouldEdgeCache(method, targetUrl) {
  if (method !== 'GET') return false
  return (
    (targetUrl.hostname === 'api.github.com' && targetUrl.pathname.startsWith('/repos/chii-primenumber/sona-plus/releases')) ||
    (targetUrl.hostname === 'raw.githubusercontent.com' && targetUrl.pathname.startsWith('/chii-primenumber/sona-plus/'))
  )
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const { target, extraHeaders } = parseTargetAndHeaders(request.url)
    if (!target) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing url parameter' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      })
    }

    let targetUrl
    try {
      targetUrl = new URL(target)
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid target URL' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      })
    }

    if (targetUrl.protocol !== 'https:' || !ALLOWED_HOSTS.has(targetUrl.hostname)) {
      return new Response(JSON.stringify({ ok: false, error: `Host not allowed: ${targetUrl.hostname}` }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      })
    }

    const upstreamHeaders = new Headers()
    for (const [key, value] of request.headers.entries()) {
      const lower = key.toLowerCase()
      if (['host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-for', 'x-real-ip', 'origin', 'referer'].includes(lower)) {
        continue
      }
      upstreamHeaders.set(key, value)
    }
    if (!upstreamHeaders.has('User-Agent')) {
      upstreamHeaders.set('User-Agent', 'SonaPlus-Proxy/1.0')
    }
    for (const [name, value] of extraHeaders) {
      upstreamHeaders.set(name, value)
    }

    const cacheable = shouldEdgeCache(request.method, targetUrl)
    const init = {
      method: request.method,
      headers: upstreamHeaders,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'follow',
      ...(cacheable ? { cf: { cacheEverything: true, cacheTtl: 300 } } : {}),
    }

    const upstreamResponse = await fetch(targetUrl.toString(), init)
    const responseHeaders = new Headers(upstreamResponse.headers)
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      responseHeaders.set(k, v)
    }
    responseHeaders.delete('content-security-policy')
    responseHeaders.delete('x-frame-options')

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    })
  },
}
