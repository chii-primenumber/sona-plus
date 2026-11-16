/** Riot tags and ARAMKit semantics share this small, non-HTML rendering vocabulary. */
export const GAME_TEXT_COLORS: Record<string, string> = {
  stat: '#ffd700', attention: '#ffd700', totalvalue: '#f0e6d2',
  physicaldamage: '#f26522', magicdamage: '#0acbe6', truedamage: '#cdfafa',
  attackdamage: '#eb8d34', abilitypower: '#786cff', armorpenetration: '#f95f55',
  attackspeed: '#ffe384', mana: '#189ce7', magicresist: '#4fdfff', armor: '#f0ba57',
  health: '#1f995c', criticalstrike: '#ffd3b3', lifesteal: '#ce1c42', omnivamp: '#cb0c2d',
  magicpenetration: '#cd69fd', abilityhaste: '#b2ffdc', tenacity: '#8666ff',
  heal: '#60e08f', shield: '#4dd0eb', status: '#ad76c4', movementspeed: '#fffdc9',
  gold: '#d8ae4b', active: '#ffe38c', passive: '#f0e6d2', spellname: '#f0e6d2',
  keyword: '#d182be', keywordmajor: '#dddd77', recast: '#d67351', ornnbonus: '#ff6d18',
  buffedstat: '#e8be2c', flavortext: '#a09b8c', rules: '#a09b8c', legacytext: '#a09b8c',
  raritygeneric: '#ccc4b3', raritylegendary: '#f0e6d2', raritymythic: '#ff8811',
  rarityprismatic: '#d258f9', raritysilver: '#c2d0cc', danger: '#ff4655',
}

const ALIASES: Record<string, string> = {
  scalead: 'attackdamage', scaleap: 'abilitypower', scalearmor: 'armor', scalemr: 'magicresist',
  scalehealth: 'health', scalemana: 'mana', scalecrit: 'criticalstrike',
  scalelethality: 'armorpenetration', armorpen: 'armorpenetration', healing: 'heal',
  ms: 'movementspeed', speed: 'movementspeed', prismatic: 'rarityprismatic', silver: 'raritysilver',
  onhit: 'keyword', spellpassive: 'passive', restrictiontext: 'danger',
}
export interface GameText { text: string; semantic?: string; color?: string; bold?: boolean; italic?: boolean }

export function escapeGameText(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function decodeText(text: string) {
  return text.replace(/&(#x[\da-f]+|#\d+|nbsp|amp|lt|gt|quot|apos|#39);/gi, (match, entity: string) => {
    const named: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
    if (!entity.startsWith('#')) return named[entity.toLowerCase()] ?? match
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : match
  })
}

/** No innerHTML, DOM parsing, arbitrary CSS, links, images, or event attributes. */
export function parseGameDescription(raw: string): GameText[] {
  const tokens: GameText[] = []
  const stack: Array<{ tag: string; semantic?: string; color?: string; bold?: boolean; italic?: boolean }> = []
  const source = raw.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
  const append = (text: string) => {
    const state = Object.assign({}, ...stack)
    const stats = stack.some((entry) => entry.tag === 'stats')
    const parts = stats ? decodeText(text).split(/([+−-]?\d+(?:[,.]\d+)*(?:%)?)/g) : [decodeText(text)]
    parts.forEach((part, index) => {
      const numeric = stats && index % 2 === 1
      const token: GameText = { text: part, semantic: numeric ? 'stat' : state.semantic, color: numeric ? GAME_TEXT_COLORS.stat : state.color, bold: state.bold, italic: state.italic }
      const last = tokens[tokens.length - 1]
      if (last && last.semantic === token.semantic && last.color === token.color && last.bold === token.bold && last.italic === token.italic) last.text += token.text
      else if (token.text) tokens.push(token)
    })
  }
  for (const match of source.matchAll(/<[^>]*>|[^<]+|</g)) {
    const part = match[0]
    if (!part.startsWith('<') || part === '<') { append(part); continue }
    const tagMatch = /^<\s*(\/?)\s*([\w-]+)/.exec(part)
    if (!tagMatch) continue
    const [, closing, original] = tagMatch, tag = original.toLowerCase()
    if (tag === 'br') { append('\n'); continue }
    if (closing) {
      let index = stack.length - 1
      while (index >= 0 && stack[index].tag !== tag) index--
      if (index >= 0) stack.splice(index)
      if (['p', 'div', 'li', 'stats'].includes(tag)) append('\n')
      continue
    }
    if (tag === 'li') append('• ')
    const alias = ALIASES[tag]
    const semantic = typeof alias === 'string' ? alias : tag
    const semanticColor = GAME_TEXT_COLORS[semantic]
    const color = tag === 'font' ? /\bcolor\s*=\s*["']?(#[\da-f]{6}|#[\da-f]{3})(?=["'\s>])/i.exec(part)?.[1] : undefined
    if ((typeof semanticColor === 'string' || color || ['stats', 'b', 'strong', 'i', 'em'].includes(tag)) && stack.length < 64) {
      stack.push({ tag, ...(typeof semanticColor === 'string' ? { semantic, color: semanticColor } : {}),
        ...(color ? { color } : {}), ...(['b', 'strong', 'passive', 'active', 'spellname'].includes(tag) ? { bold: true } : {}),
        ...(['i', 'em', 'flavortext'].includes(tag) ? { italic: true } : {}) })
    }
  }
  return tokens.map((token) => ({ ...token, text: token.text.replace(/\n{3,}/g, '\n\n') }))
}

/** Preserve source semantics; rendering is exclusively through parseGameDescription. */
export function richDescription(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : ''
}
