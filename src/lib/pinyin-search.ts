const PINYIN_BOUNDARIES: Array<[string, string]> = [
  ['a', '啊'],
  ['b', '芭'],
  ['c', '擦'],
  ['d', '搭'],
  ['e', '蛾'],
  ['f', '发'],
  ['g', '噶'],
  ['h', '哈'],
  ['j', '击'],
  ['k', '喀'],
  ['l', '垃'],
  ['m', '妈'],
  ['n', '拿'],
  ['o', '哦'],
  ['p', '啪'],
  ['q', '期'],
  ['r', '然'],
  ['s', '撒'],
  ['t', '塌'],
  ['w', '挖'],
  ['x', '昔'],
  ['y', '压'],
  ['z', '匝'],
]

const zhCollator = typeof Intl !== 'undefined'
  ? new Intl.Collator('zh-Hans-CN', { sensitivity: 'base' })
  : null

const charInitialCache = new Map<string, string>()
const stringInitialCache = new Map<string, string>()

function normalizeSearchToken(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, '')
}

function charPinyinInitial(ch: string): string {
  if (/^[a-z0-9]$/i.test(ch)) return ch.toLocaleLowerCase()
  if (!/[\u4e00-\u9fff]/.test(ch) || !zhCollator) return ''
  const cached = charInitialCache.get(ch)
  if (cached !== undefined) return cached

  let found = ''
  if (zhCollator.compare(ch, PINYIN_BOUNDARIES[0][1]) >= 0) {
    for (let i = PINYIN_BOUNDARIES.length - 1; i >= 0; i--) {
      if (zhCollator.compare(ch, PINYIN_BOUNDARIES[i][1]) >= 0) {
        found = PINYIN_BOUNDARIES[i][0]
        break
      }
    }
  }
  if (charInitialCache.size < 4096) charInitialCache.set(ch, found)
  return found
}

/** 提取文本的汉语拼音首字母与英文/数字字符（带整串缓存） */
export function getPinyinInitials(text: string): string {
  if (!text) return ''
  const cached = stringInitialCache.get(text)
  if (cached !== undefined) return cached

  let out = ''
  for (const ch of text) {
    const initial = charPinyinInitial(ch)
    if (initial) out += initial
  }
  if (stringInitialCache.size >= 2048) {
    const oldest = stringInitialCache.keys().next().value
    if (oldest !== undefined) stringInitialCache.delete(oldest)
  }
  stringInitialCache.set(text, out)
  return out
}

export interface SmartSearchIndex {
  normalized: string[]
  initials: string[]
}

/** 预建可复用搜索索引，避免高频输入时重复归一化与拼音提取 */
export function createSearchIndex(candidates: Array<string | number | null | undefined>): SmartSearchIndex {
  const normalized: string[] = []
  const initials: string[] = []
  for (const value of candidates) {
    if (value == null) continue
    const text = String(value)
    if (!text) continue
    normalized.push(normalizeSearchToken(text))
    initials.push(getPinyinInitials(text))
  }
  return { normalized, initials }
}

export function tokenizeSearchQuery(query: string): Array<{ text: string; isAsciiAlpha: boolean }> {
  const trimmed = query.trim().toLocaleLowerCase()
  if (!trimmed) return []
  return trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => ({ text, isAsciiAlpha: /^[a-z]+$/.test(text) }))
}

export function matchesSearchIndex(
  tokens: ReadonlyArray<{ text: string; isAsciiAlpha: boolean }>,
  index: SmartSearchIndex,
): boolean {
  if (!tokens.length) return true
  if (!index.normalized.length) return false
  return tokens.every(({ text, isAsciiAlpha }) => {
    for (let i = 0; i < index.normalized.length; i++) {
      if (index.normalized[i].includes(text)) return true
      if (isAsciiAlpha && index.initials[i].includes(text)) return true
    }
    return false
  })
}

/** 智能匹配：支持中文子串、英文/数字子串、多词空格分隔，以及中文拼音首字母匹配 */
export function matchesSmartSearch(query: string, candidates: Array<string | number | null | undefined>): boolean {
  const tokens = tokenizeSearchQuery(query)
  if (!tokens.length) return true
  return matchesSearchIndex(tokens, createSearchIndex(candidates))
}

/** 返回应在文本中高亮的 [start, end) 区间（优先原文子串，其次拼音首字母连续区间） */
export function findHighlightRange(text: string, query: string): [number, number] | null {
  const needle = normalizeSearchToken(query)
  if (!needle || !text) return null

  const lower = text.toLocaleLowerCase()
  const direct = lower.indexOf(needle)
  if (direct >= 0) return [direct, direct + needle.length]

  if (/^[a-z]+$/.test(needle)) {
    const charPositions: number[] = []
    let initials = ''
    for (let i = 0; i < text.length; i++) {
      const initial = charPinyinInitial(text[i])
      if (initial) {
        initials += initial
        charPositions.push(i)
      }
    }
    const idx = initials.indexOf(needle)
    if (idx >= 0) {
      return [charPositions[idx], charPositions[idx + needle.length - 1] + 1]
    }
  }

  return null
}
