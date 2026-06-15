// 음식 KB 전체를 'food' 주체로 온톨로지에 자동 등록 — judge의 식약처 식품룰(식품이 질병 치료·예방 표방=허위)이
// 임의 음식에도 발동하게 한다. "마늘이 감기 예방"·"계피가 당뇨 완치" 등이 보류가 아니라 허위로. §6 데이터 구조 모트.
// 질병 오인식 방지는 parse.ts 마스킹이 처리. 식품류는 food 태그.
import type { OntologyEntry } from './ontology'
import { FOOD_KB } from './food-kb'
import { FOOD_KB_EXT } from './food-kb-ext'
import { FOOD_KB_COMMON } from './food-kb-common'

const all = [...FOOD_KB, ...FOOD_KB_EXT, ...FOOD_KB_COMMON]
const seen = new Set<string>()
export const ONTOLOGY_FOODS: OntologyEntry[] = all
  .filter((f) => f.name && f.name.length >= 2 && !seen.has(f.name) && (seen.add(f.name), true))
  .map((f) => ({
    canonical: f.name,
    variants: [f.name, ...(f.aka ?? []).filter((v) => v && v.replace(/\s+/g, '').length >= 2)],
    type: 'subject' as const,
    tags: ['food'],
  }))
