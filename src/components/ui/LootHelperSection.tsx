import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SonaButton } from '@/components/ui/SonaButton'
import { SonaSelect } from '@/components/ui/SonaSelect'
import { SonaInput } from '@/components/ui/SonaInput'
import { getChampionById } from '@/lib/assets'
import { lcu } from '@/lib/lcu'
import {
  normalizeLootShards,
  planShardDisenchants,
  type LootDisenchantStrategy,
  type NormalizedLootShard,
} from '@/lib/loot-helper'

const STRATEGY_OPTIONS: Array<{ value: LootDisenchantStrategy; label: string }> = [
  { value: 'owned_all', label: '推荐：仅分解已拥有（未拥有全留）' },
  { value: 'keep_one_unowned', label: '已拥有全拆 + 未拥有各留 1 个' },
  { value: 'keep_one_all', label: '收集保留：所有碎片各留 1 个（仅拆重复）' },
  { value: 'all', label: '全部分解（最大化精粹）' },
]

const CATEGORY_OPTIONS = [
  { value: 'champion', label: '英雄碎片（蓝色精粹）' },
  { value: 'skin', label: '皮肤碎片（橙色精粹）' },
]

export function LootHelperSection() {
  const [shards, setShards] = useState<NormalizedLootShard[]>([])
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<'champion' | 'skin'>('champion')
  const [strategy, setStrategy] = useState<LootDisenchantStrategy>('owned_all')
  const [search, setSearch] = useState('')
  const [uncheckedIds, setUncheckedIds] = useState<Set<string>>(() => new Set())
  const [confirming, setConfirming] = useState(false)
  const [running, setRunning] = useState<{ current: number; total: number } | null>(null)
  const [status, setStatus] = useState('')
  const abortRef = useRef(false)

  const loadLoot = useCallback(async () => {
    setLoading(true)
    setStatus('')
    try {
      const map = await lcu.getPlayerLootMap()
      const parsed = normalizeLootShards(map, (id) => getChampionById(id)?.name ?? '')
      setShards(parsed)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatus(`读取战利品失败：${msg}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLoot()
    return () => {
      abortRef.current = true
    }
  }, [loadLoot])

  useEffect(() => {
    return lcu.observe('/lol-loot/v1/player-loot-map', (event) => {
      if (event.data && typeof event.data === 'object' && !Array.isArray(event.data)) {
        setShards(normalizeLootShards(event.data as Record<string, unknown>, (id) => getChampionById(id)?.name ?? ''))
      }
    })
  }, [])

  const handleCategoryChange = (value: string) => {
    const next = value === 'skin' ? 'skin' : 'champion'
    setCategory(next)
    // 切换到皮肤碎片时默认切到保守模式“仅拆重复（各留 1 个）”防误拆
    if (next === 'skin' && strategy === 'all') {
      setStrategy('keep_one_all')
    }
    setUncheckedIds(new Set())
    setConfirming(false)
  }

  const handleStrategyChange = (value: string) => {
    setStrategy(value as LootDisenchantStrategy)
    setUncheckedIds(new Set())
    setConfirming(false)
  }

  const planned = useMemo(() => {
    const query = search.trim().toLowerCase()
    return planShardDisenchants(shards, strategy, category).filter((entry) => {
      if (!query) return true
      return entry.shard.name.toLowerCase().includes(query) || entry.shard.lootId.toLowerCase().includes(query)
    })
  }, [shards, strategy, category, search])

  const actionable = useMemo(
    () => planned.filter((entry) => entry.disenchantCount > 0 && !uncheckedIds.has(entry.shard.lootId)),
    [planned, uncheckedIds],
  )

  const summary = useMemo(() => {
    let totalPieces = 0
    let totalEssence = 0
    for (const item of actionable) {
      totalPieces += item.disenchantCount
      totalEssence += item.totalEssence
    }
    return {
      types: actionable.length,
      pieces: totalPieces,
      essence: totalEssence,
      currencyLabel: category === 'champion' ? '蓝色精粹' : '橙色精粹',
    }
  }, [actionable, category])

  const toggleItem = (lootId: string, hasDisenchantCount: boolean) => {
    if (!hasDisenchantCount || running) return
    setConfirming(false)
    setUncheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(lootId)) next.delete(lootId)
      else next.add(lootId)
      return next
    })
  }

  const executeBatchDisenchant = async () => {
    if (!actionable.length || running) return
    setConfirming(false)
    abortRef.current = false
    setRunning({ current: 0, total: actionable.length })
    setStatus('')

    let completedTypes = 0
    let completedPieces = 0
    let gainedEssence = 0
    let errorMessage = ''

    for (let i = 0; i < actionable.length; i += 1) {
      if (abortRef.current) break
      const item = actionable[i]
      setRunning({ current: i + 1, total: actionable.length })
      try {
        await lcu.craftLootRecipe(item.shard.recipeName, [item.shard.lootId], item.disenchantCount)
        completedTypes += 1
        completedPieces += item.disenchantCount
        gainedEssence += item.totalEssence
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err)
        break
      }
    }

    setRunning(null)
    await loadLoot()

    if (abortRef.current) {
      setStatus(`已停止分解：已完成 ${completedPieces} 个碎片（+${gainedEssence.toLocaleString()} ${summary.currencyLabel}）。`)
    } else if (errorMessage) {
      setStatus(`分解中断（已完成 ${completedPieces} 个）：${errorMessage}`)
    } else {
      setStatus(`批量分解完成：共处理 ${completedTypes} 种、${completedPieces} 个碎片，预计获得 +${gainedEssence.toLocaleString()} ${summary.currencyLabel}。`)
    }
  }

  const busy = loading || running !== null

  return (
    <div className="sona-loot-helper" data-testid="loot-helper">
      <div className="sona-loot-toolbar">
        <div className="sona-loot-filters">
          <SonaSelect
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={handleCategoryChange}
          />
          <SonaSelect
            options={STRATEGY_OPTIONS}
            value={strategy}
            onChange={handleStrategyChange}
          />
          <div style={{ minWidth: 170, flex: 1 }}>
            <SonaInput
              value={search}
              onChange={setSearch}
              placeholder="搜索英雄或皮肤名称…"
            />
          </div>
        </div>
        <div className="sona-rewards-actions">
          <SonaButton onClick={() => { void loadLoot() }} disabled={busy}>
            {loading ? '读取中…' : '刷新战利品'}
          </SonaButton>
          {running ? (
            <SonaButton onClick={() => { abortRef.current = true }}>
              停止 ({running.current}/{running.total})
            </SonaButton>
          ) : !confirming ? (
            <SonaButton
              variant="primary"
              disabled={busy || summary.pieces === 0}
              onClick={() => setConfirming(true)}
            >
              一键分解 ({summary.pieces})
            </SonaButton>
          ) : (
            <>
              <SonaButton variant="primary" onClick={() => { void executeBatchDisenchant() }}>
                确认分解 +{summary.essence.toLocaleString()}
              </SonaButton>
              <SonaButton onClick={() => setConfirming(false)}>取消</SonaButton>
            </>
          )}
        </div>
      </div>

      <div className="sona-loot-summary">
        <span>
          待分解：<strong>{summary.types}</strong> 种 / <strong>{summary.pieces}</strong> 个碎片
        </span>
        <span>
          预计收益：<strong className="sona-loot-essence">+{summary.essence.toLocaleString()} {summary.currencyLabel}</strong>
        </span>
        <span className="sona-loot-tip">点击下方卡片可单独取消/恢复勾选</span>
      </div>

      {status && <p className="sona-rewards-status" role="status">{status}</p>}

      {!loading && planned.length === 0 && (
        <div className="sona-rewards-empty">战利品库中暂无符合条件的碎片记录。</div>
      )}

      {planned.length > 0 && (
        <div className="sona-reward-card">
          <div className="sona-reward-items sona-loot-grid">
            {planned.map(({ shard, disenchantCount, keepCount, totalEssence }) => {
              const selected = disenchantCount > 0 && !uncheckedIds.has(shard.lootId)
              const canToggle = disenchantCount > 0
              return (
                <button
                  key={shard.lootId}
                  type="button"
                  className={`sona-reward-item sona-loot-item${selected ? ' sona-reward-item--selected' : ''}${!canToggle ? ' sona-loot-item--kept' : ''}`}
                  disabled={busy || !canToggle}
                  onClick={() => toggleItem(shard.lootId, canToggle)}
                  data-sona-tooltip={`每个 +${shard.disenchantValue} 精粹 · 保留 ${selected ? keepCount : shard.count} 个`}
                >
                  {selected && <span className="sona-reward-item-check" aria-hidden>✓</span>}
                  <span className="sona-reward-item-thumb">
                    {shard.tilePath
                      ? <img src={shard.tilePath} alt={shard.name} draggable={false} />
                      : <span className="sona-reward-item-thumb-placeholder" />}
                    <span className="sona-reward-item-qty">x{shard.count}</span>
                  </span>
                  <span className="sona-reward-item-name">{shard.name}</span>
                  <span className="sona-loot-item-meta">
                    {selected
                      ? `拆 ${disenchantCount} · +${totalEssence}`
                      : disenchantCount > 0
                        ? '已跳过'
                        : `保留 (${shard.owned ? '已拥有' : '未解锁'})`}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
