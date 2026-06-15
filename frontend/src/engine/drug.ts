// 의약품 질문 답변 — "타이레놀/게보린 먹어도 되나" 류에 식약처 공식 의약품 정보(e약은요)를 제시.
// 효능·용법·주의·상호작용·부작용 = 식약처 공식 허가정보 인용(부당광고·명예훼손 무관, 안전).
import { DRUG_KB, type DrugEntry } from './drug-kb'

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

export interface DrugResult {
  name: string
  itemName: string
  entp: string
  efcy: string
  use: string
  caution: string
  interact: string
  side: string
}

export function drugAnswer(claim: string): DrugResult | null {
  const t = norm(claim)
  let best: { d: DrugEntry; len: number } | undefined
  for (const d of DRUG_KB) {
    for (const n of [d.name, ...(d.aka ?? [])]) {
      const nn = norm(n)
      if (nn.length >= 2 && t.includes(nn) && (!best || nn.length > best.len)) best = { d, len: nn.length }
    }
  }
  if (!best) return null
  const d = best.d
  return { name: d.name, itemName: d.itemName, entp: d.entp, efcy: d.efcy, use: d.use, caution: d.caution, interact: d.interact, side: d.side }
}
