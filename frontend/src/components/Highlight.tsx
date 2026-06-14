// 근거 하이라이트(Span Grounding, §13.9 #3) — 본문에서 주장의 질병·주체 용어를 형광펜 처리.
// 인용 근거가 실제로 주제어를 담고 있음을 시각적으로 보여줌(인용 정확도·설명가능성).
import { type ReactNode } from 'react'

export default function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const toks = [...new Set(terms.filter((t) => t && t.length >= 2))].sort((a, b) => b.length - a.length)
  if (!toks.length) return <>{text}</>
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(${toks.map(esc).join('|')})`, 'g')
  const set = new Set(toks)
  const out: ReactNode[] = []
  text.split(re).forEach((p, i) => {
    out.push(
      set.has(p)
        ? <mark key={i} className="rounded bg-amber-100 px-0.5 text-amber-900 dark:bg-amber-400/25 dark:text-amber-100">{p}</mark>
        : <span key={i}>{p}</span>,
    )
  })
  return <>{out}</>
}
