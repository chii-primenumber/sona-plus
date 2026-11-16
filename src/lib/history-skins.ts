import { useEffect, useState } from 'react'
import { SharedRequests } from './shared-requests'
import { deadline } from './history-api'
import type { SgpParticipantLol } from '@/types/sgp'

const requests = new SharedRequests(3, 16, 30000)
interface Skin { id: number; name?: string; questSkinInfo?: { tiers?: Skin[] } }
export function recordedSkinId(player: Pick<SgpParticipantLol, 'championId' | 'skinId' | 'skinIndex'>): number | null {
  if (!Number.isSafeInteger(player.championId) || player.championId <= 0) return null
  if (player.skinId != null && Number.isSafeInteger(player.skinId) && Math.floor(player.skinId / 1000) === player.championId) return player.skinId
  if (player.skinIndex != null && Number.isSafeInteger(player.skinIndex) && player.skinIndex >= 0 && player.skinIndex < 1000) return player.championId * 1000 + player.skinIndex
  return null
}

/** Only explicit match skin information is used; absent IDs never imply the default skin. */
export function useReportSkinNames(players: SgpParticipantLol[]) {
  const [names, setNames] = useState<Record<number, string>>({})
  useEffect(() => {
    const wanted = players.filter((player) => !player.skinName && recordedSkinId(player) != null)
    setNames((current) => Object.keys(current).length ? {} : current)
    if (!wanted.length) return
    let controller: AbortController | undefined
    let disposed = false
    const start = () => {
      if (document.hidden || disposed) return
      controller?.abort(); controller = new AbortController()
      const signal = controller.signal
      void Promise.all(wanted.map(async (player) => {
        const skins = await requests.run(`skins:${player.championId}`, (sharedSignal) => deadline(async (transportSignal) => {
          const response = await fetch(`/lol-game-data/assets/v1/champions/${player.championId}.json`, { signal: transportSignal })
          if (!response.ok) throw new Error('皮肤资料暂不可用')
          const data = await response.json() as { skins?: Skin[] }
          const result: Record<number, string> = {}
          const add = (skin: Skin) => { if (skin.name) result[skin.id] = skin.name; skin.questSkinInfo?.tiers?.forEach(add) }
          data.skins?.forEach(add)
          return result
        }, sharedSignal, 7500), { signal, ttlMs: 600000 })
        return [recordedSkinId(player)!, skins[recordedSkinId(player)!]] as const
      }).map((request) => request.catch(() => null))).then((results) => {
        if (!disposed && !signal.aborted) setNames(Object.fromEntries(results.filter((row): row is readonly [number,string] => !!row?.[1])))
      })
    }
    const visibility = () => document.hidden ? controller?.abort() : start()
    document.addEventListener('visibilitychange', visibility); start()
    return () => { disposed = true; controller?.abort(); document.removeEventListener('visibilitychange', visibility) }
  }, [players])
  return (player: SgpParticipantLol) => player.skinName?.trim() || names[recordedSkinId(player) ?? -1] || ''
}
