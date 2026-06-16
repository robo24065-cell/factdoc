// 한국어 건강-클레임 온톨로지 (동의어층) + 분류 헬퍼 — CLAUDE.md §13.5
import { ONTOLOGY_EXT } from './ontology-ext'
import { ONTOLOGY_FOODS } from './ontology-foods'
import { ONTOLOGY_EID } from './ontology-eid'

export type TermType = 'subject' | 'disease'

export interface OntologyEntry {
  canonical: string
  variants: string[]
  type: TermType
  tags?: string[]  // disease: 'chronic_irreversible','infectious','cancer' / subject: 'supplement','food','folk','drug','behavior','vaccine','nutrient'
}

const ONTOLOGY_BASE: OntologyEntry[] = [
  // ── 질환 ──
  { canonical: '제2형당뇨', variants: ['당뇨', '당뇨병', '성인당뇨', '제2형 당뇨병', '혈당병', 't2dm', '당뇨약', '당뇨병약', '혈당약'], type: 'disease', tags: ['chronic_irreversible'] },
  { canonical: '고혈압', variants: ['고혈압', '고혈압증', 'hypertension', '높은 혈압', '혈압약'], type: 'disease', tags: ['chronic_irreversible'] },
  { canonical: '기립성저혈압', variants: ['기립성 저혈압', '저혈압', '기립성저혈압', 'orthostatic'], type: 'disease' },
  { canonical: '이상지질혈증', variants: ['고지혈증', '콜레스테롤', '중성지방', 'ldl', '고콜레스테롤', '콜레스테롤약', '고지혈증약'], type: 'disease', tags: ['chronic_irreversible'] },
  { canonical: '골다공증', variants: ['뼈건강', '뼈 건강', '골밀도', 'osteoporosis'], type: 'disease', tags: ['chronic_irreversible'] },
  { canonical: '비만', variants: ['비만', '과체중', '비만증', 'obesity', '살이 찐다', '살찐다'], type: 'disease' },
  { canonical: '혈당조절', variants: ['혈당', '공복혈당', '당화혈색소', 'hba1c', '식후혈당'], type: 'disease' },
  { canonical: '면역기능', variants: ['면역', '면역력', '면역증진'], type: 'disease' },
  { canonical: '장건강', variants: ['장 건강', '장건강', '배변', '변비', '유익균'], type: 'disease' },
  { canonical: '눈건강', variants: ['눈 건강', '눈건강', '황반', '시력'], type: 'disease' },
  { canonical: '인플루엔자', variants: ['독감', '계절독감', 'flu'], type: 'disease', tags: ['infectious'] },
  { canonical: '코로나19', variants: ['코로나', 'covid', 'covid19', 'covid-19', '코로나바이러스감염증', '코로나바이러스'], type: 'disease', tags: ['infectious'] },
  { canonical: '대상포진', variants: ['shingles'], type: 'disease', tags: ['infectious'] },
  { canonical: '폐암', variants: ['lung cancer', '폐 암'], type: 'disease' },
  // ── 주체(성분/식품/요법/약물/백신/영양소) ──
  { canonical: '건강기능식품', variants: ['건기식', '보조제', '영양제', '건강식품'], type: 'subject', tags: ['supplement'] },
  { canonical: '홍삼', variants: ['홍삼농축액', '홍삼정', '고려홍삼', 'red ginseng'], type: 'subject', tags: ['supplement'] },
  { canonical: '유산균', variants: ['프로바이오틱스', 'probiotics', '락토바실러스'], type: 'subject', tags: ['supplement'] },
  { canonical: '비타민D', variants: ['비타민디', 'vitamin d', 'vitd'], type: 'subject', tags: ['supplement'] },
  { canonical: '칼슘', variants: ['calcium', '칼슘제'], type: 'subject', tags: ['supplement'] },
  { canonical: '루테인', variants: ['lutein'], type: 'subject', tags: ['supplement'] },
  { canonical: '설탕', variants: ['당류', '단순당', '단 음식', '단음식', '단것', '단 것', '탄수화물', '당분'], type: 'subject', tags: ['food', 'nutrient'] },
  { canonical: '토마토', variants: ['tomato', '방울토마토'], type: 'subject', tags: ['food'] },
  { canonical: '여주', variants: ['여주즙', '여주차', '비터멜론', 'bitter melon'], type: 'subject', tags: ['food', 'folk'] },
  { canonical: '돼지감자', variants: ['뚱딴지', '돼지감자즙'], type: 'subject', tags: ['food', 'folk'] },
  { canonical: '메트포르민', variants: ['메트포민', 'metformin'], type: 'subject', tags: ['drug'] },
  { canonical: '인슐린', variants: ['insulin', '인슐린주사', '기저인슐린'], type: 'subject', tags: ['drug'] },
  { canonical: '스타틴', variants: ['statin', '로수바스타틴', '아토르바스타틴'], type: 'subject', tags: ['drug'] },
  { canonical: '인플루엔자백신', variants: ['독감백신', '독감주사', '인플루엔자 예방접종', '독감 예방접종'], type: 'subject', tags: ['vaccine'] },
  { canonical: '대상포진백신', variants: ['대상포진 예방접종', '대상포진 백신', '대상포진주사'], type: 'subject', tags: ['vaccine'] },
  { canonical: '나트륨', variants: ['소금', '짠 음식', '짠음식', '짜게', '염분'], type: 'subject', tags: ['nutrient', 'food'] },
  { canonical: '금연', variants: ['담배끊', '담배 끊', '금연', '흡연 중단', '담배를 끊'], type: 'subject', tags: ['behavior'] },
  { canonical: '식이요법', variants: ['식단관리', '식사조절', '당뇨식', '저당식', '저염식'], type: 'subject', tags: ['behavior'] },
  { canonical: '운동요법', variants: ['걷기운동', '걷기', '유산소운동', '운동', '신체활동'], type: 'subject', tags: ['behavior'] },
]

// 본체 + 확장(폭) + 음식KB 주체 결합 — §13.1. 음식은 마지막(큐레이션 주체/태그가 동률시 우선).
export const ONTOLOGY: OntologyEntry[] = [...ONTOLOGY_BASE, ...ONTOLOGY_EXT, ...ONTOLOGY_FOODS, ...ONTOLOGY_EID]

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

const lookup = new Map<string, OntologyEntry>()
for (const e of ONTOLOGY) {
  lookup.set(norm(e.canonical), e)
  for (const v of e.variants) lookup.set(norm(v), e)
}

export function normalizeTerm(surface: string): OntologyEntry | undefined {
  return lookup.get(norm(surface))
}

// 텍스트에서 해당 타입의 엔티티를 '최장 일치'로 찾음 → 부분문자열 오매칭 방지(예: 기립성저혈압 ≠ 고혈압)
export function findInText(text: string, type: TermType): OntologyEntry | undefined {
  const t = norm(text)
  let best: { entry: OntologyEntry; len: number } | undefined
  for (const e of ONTOLOGY) {
    if (e.type !== type) continue
    for (const surf of [e.canonical, ...e.variants]) {
      const s = norm(surf)
      if (s && t.includes(s) && (!best || s.length > best.len)) best = { entry: e, len: s.length }
    }
  }
  return best?.entry
}

export function isChronicIrreversible(diseaseCanonical: string): boolean {
  return lookup.get(norm(diseaseCanonical))?.tags?.includes('chronic_irreversible') ?? false
}
export function isInfectious(diseaseCanonical: string): boolean {
  return lookup.get(norm(diseaseCanonical))?.tags?.includes('infectious') ?? false
}
export function subjectTags(subjectCanonical: string): string[] {
  return lookup.get(norm(subjectCanonical))?.tags ?? []
}

// 검색 자동완성 — 입력 접두사로 질병/음식/주체를 추천(네이버·구글식). 동의어 중복은 canonical로 제거.
export interface Suggestion { text: string; kind: TermType; tags?: string[] }
export function suggest(input: string, max = 6): Suggestion[] {
  const q = norm(input)
  if (q.length < 1) return []
  const seen = new Set<string>()
  const starts: Suggestion[] = []
  const contains: Suggestion[] = []
  for (const e of ONTOLOGY) {
    if (seen.has(e.canonical)) continue
    let surf: string | undefined
    let isStart = false
    for (const v of [e.canonical, ...e.variants]) {
      const nv = norm(v)
      if (nv.length < 1) continue
      if (nv.startsWith(q)) { surf = v; isStart = true; break }
      if (!surf && nv.includes(q)) surf = v
    }
    if (!surf) continue
    seen.add(e.canonical)
    ;(isStart ? starts : contains).push({ text: surf, kind: e.type, tags: e.tags })
  }
  // 질병·주체 우선순위: 접두 일치 먼저, 짧은(대표) 표면형 우선
  const rank = (s: Suggestion) => s.text.length
  return [...starts.sort((a, b) => rank(a) - rank(b)), ...contains.sort((a, b) => rank(a) - rank(b))].slice(0, max)
}

// canonical → 표면형(동의어 포함) 목록 — 근거 하이라이트(Span Grounding)용
export function variantsOf(canonical: string): string[] {
  const e = lookup.get(norm(canonical))
  return e ? [e.canonical, ...e.variants] : [canonical]
}
