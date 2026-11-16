/** Rates are fractions; the displayed difference is in percentage points. */
export function recommendationDelta(rate: unknown, baseline: unknown): number | null {
  if (typeof rate !== 'number' || typeof baseline !== 'number' || !Number.isFinite(rate) || !Number.isFinite(baseline) || rate < 0 || rate > 1 || baseline < 0 || baseline > 1) return null
  const delta = Math.round((rate - baseline) * 1000) / 10
  return Object.is(delta, -0) ? 0 : delta
}
