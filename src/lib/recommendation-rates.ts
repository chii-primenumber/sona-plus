/** Rates are fractions; the displayed difference is in percentage points. */
export function recommendationDelta(rate: unknown, baseline: unknown): number | null {
  if (typeof rate !== 'number' || typeof baseline !== 'number' || !Number.isFinite(rate) || !Number.isFinite(baseline) || rate < 0 || rate > 1 || baseline < 0 || baseline > 1) return null
  const delta = Math.round((rate - baseline) * 1000) / 10
  return Object.is(delta, -0) ? 0 : delta
}

export function recommendationWinRate(build: { winRate?: number | null; win?: number; play?: number }): number | undefined {
  if (build.winRate !== undefined) return typeof build.winRate === 'number' && Number.isFinite(build.winRate) && build.winRate >= 0 && build.winRate <= 1 ? build.winRate : undefined
  const { win, play } = build
  return typeof win === 'number' && Number.isFinite(win) && typeof play === 'number' && Number.isFinite(play) && play > 0 && win >= 0 && win <= play ? win / play : undefined
}

export function sortRecommendationBuilds<T extends { pick_rate: number; winRate?: number | null; win?: number; play?: number }>(builds: T[], order: 'pick' | 'win'): T[] {
  const value = (number: number | undefined) => typeof number === 'number' && Number.isFinite(number) ? number : -1
  return [...builds].sort((a, b) => {
    const pick = value(b.pick_rate) - value(a.pick_rate), win = value(recommendationWinRate(b)) - value(recommendationWinRate(a))
    return order === 'pick' ? pick || win : win || pick
  })
}
