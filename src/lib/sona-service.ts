import { getCorsProxyCandidates } from '@/lib/cors-proxy'

export const SONA_SERVICE_BASE_URL = 'https://sona-service.vercel.app'
export const SONA_SERVICE_CLIENT_HEADER = 'X-Sona-Client'
export const SONA_SERVICE_CLIENT_HEADER_PREFIX = '­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­'

interface SonaAvatarResponse {
  ok: boolean
  puuid?: string
  url?: string
  avatar?: {
    url?: string
    displayUrl?: string
  }
  error?: string
}

interface SonaAvatarBatchResponse {
  ok: boolean
  avatars?: Record<string, {
    url?: string
    displayUrl?: string
  }>
  error?: string
}

export function createSonaServiceHeaders(headers?: HeadersInit): Headers {
  const nextHeaders = new Headers(headers)
  nextHeaders.set(SONA_SERVICE_CLIENT_HEADER, `${SONA_SERVICE_CLIENT_HEADER_PREFIX}${crypto.randomUUID()}`)
  return nextHeaders
}

export async function fetchSonaService(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = createSonaServiceHeaders(init.headers)
  if (typeof input === 'string' || input instanceof URL) {
    const candidates = getCorsProxyCandidates(String(input))
    let lastError: unknown = null
    for (let i = 0; i < candidates.length; i += 1) {
      try {
        const res = await fetch(candidates[i], { ...init, headers })
        if (res.ok || res.status === 404 || i === candidates.length - 1) return res
      } catch (err) {
        lastError = err
        if (i === candidates.length - 1) throw err
      }
    }
    if (lastError) throw lastError
  }

  return fetch(input, {
    ...init,
    headers,
  })
}

export async function getSonaAvatarUrl(puuid: string): Promise<string | null> {
  const url = `${SONA_SERVICE_BASE_URL}/api/avatar?puuid=${encodeURIComponent(puuid)}`
  const response = await fetchSonaService(url)

  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`Sona avatar query failed: ${response.status} ${response.statusText}`)
  }

  const body = await response.json() as SonaAvatarResponse
  return body.avatar?.url || body.avatar?.displayUrl || body.url || null
}

export async function getSonaAvatarUrls(puuids: string[]): Promise<Record<string, string>> {
  const uniquePuuids = [...new Set(puuids.map((puuid) => puuid.trim().toLowerCase()).filter(Boolean))]
  if (uniquePuuids.length === 0) return {}

  const response = await fetchSonaService(`${SONA_SERVICE_BASE_URL}/api/avatars`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ puuids: uniquePuuids }),
  })
  const body = await response.json().catch(() => null) as SonaAvatarBatchResponse | null

  if (!response.ok) {
    throw new Error(body?.error || `Sona avatar batch query failed: ${response.status} ${response.statusText}`)
  }

  const avatars = body?.avatars ?? {}
  return Object.fromEntries(
    Object.entries(avatars)
      .map(([puuid, avatar]) => [puuid.toLowerCase(), avatar.url || avatar.displayUrl || ''])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  )
}

export async function uploadSonaAvatar(puuid: string, image: Blob): Promise<string> {
  const url = `${SONA_SERVICE_BASE_URL}/api/avatar?puuid=${encodeURIComponent(puuid)}`
  const response = await fetchSonaService(url, {
    method: 'POST',
    headers: {
      'Content-Type': image.type || 'image/png',
    },
    body: image,
  })
  const body = await response.json().catch(() => null) as SonaAvatarResponse | null

  if (!response.ok) {
    throw new Error(body?.error || `Sona avatar upload failed: ${response.status} ${response.statusText}`)
  }

  const avatarUrl = body?.url || body?.avatar?.url || body?.avatar?.displayUrl
  if (!avatarUrl) {
    throw new Error('Sona avatar upload response missing url.')
  }

  return avatarUrl
}
