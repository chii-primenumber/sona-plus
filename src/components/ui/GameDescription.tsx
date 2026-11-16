import { useMemo } from 'react'
import { parseGameDescription } from '@/lib/game-description'
import '@/styles/GameDescription.css'

export function GameDescription({ text }: { text: string }) {
  const tokens = useMemo(() => parseGameDescription(text), [text])
  return <span className="sona-game-description">{tokens.map((token, index) => <span key={index}
    data-game-semantic={token.semantic} style={{ color: token.color, fontWeight: token.bold ? 700 : undefined, fontStyle: token.italic ? 'italic' : undefined }}
  >{token.text}</span>)}</span>
}
