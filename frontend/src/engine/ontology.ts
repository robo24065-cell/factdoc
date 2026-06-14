// 한국어 건강-클레임 온톨로지 (동의어층) + 분류 헬퍼 — CLAUDE.md §13.5

export type TermType = 'subject' | 'disease'

export interface OntologyEntry {
  canonical: string
  variants: string[]
  type: TermType
  tags?: string[]  // disease: 'chronic_irreversible' / subject: 'supplement','food','folk','drug','behavior','vaccine','nutrient'
}

export const ONTOLOGY: OntologyEntry[] = [
  // ── 질환 ──
  { canonical: '제2형당뇨', variants: ['당뇨', '당뇨병', '성인당뇨', '제2형 당뇨병', '혈당병', 't2dm'], type: 'disease', tags: ['chronic_irreversible'] },
  { canonical: '고혈압', variants: ['혈압', '고혈압증', 'hypertension'], type: 'disease', tags: ['chronic_irreversible'] },
  { canonical: '혈당조절', variants: ['혈당', '공복혈당', '당화혈색소', 'hba1c', '식후혈당'], type: 'disease' },
  { canonical: '면역기능', variants: ['면역', '면역력', '면역증진'], type: 'disease' },
  { canonical: '인플루엔자', variants: ['독감', '계절독감', 'flu'], type: 'disease' },
  // ── 주체(성분/식품/요법/약물/백신) ──
  { canonical: '건강기능식품', variants: ['건기식', '보조제', '영양제', '건강식품'], type: 'subject', tags: ['supplement'] },
  { canonical: '홍삼', variants: ['홍삼농축액', '홍삼정', '고려홍삼', 'red ginseng'], type: 'subject', tags: ['supplement'] },
  { canonical: '여주', variants: ['여주즙', '여주차', '비터멜론', 'bitter melon'], type: 'subject', tags: ['food', 'folk'] },
  { canonical: '돼지감자', variants: ['뚱딴지', '돼지감자즙'], type: 'subject', tags: ['food', 'folk'] },
  { canonical: '메트포르민', variants: ['메트포민', 'metformin'], type: 'subject', tags: ['drug'] },
  { canonical: '인슐린', variants: ['insulin', '인슐린주사', '기저인슐린'], type: 'subject', tags: ['drug'] },
  { canonical: '인플루엔자백신', variants: ['독감백신', '독감주사', '인플루엔자 예방접종', '독감 예방접종', '독감예방주사'], type: 'subject', tags: ['vaccine'] },
  { canonical: '나트륨', variants: ['소금', '짠 음식', '짜게', '염분'], type: 'subject', tags: ['nutrient'] },
  { canonical: '식이요법', variants: ['식단관리', '식사조절', '당뇨식', '저당식', '저염식'], type: 'subject', tags: ['behavior'] },
  { canonical: '운동요법', variants: ['걷기운동', '걷기', '유산소운동', '운동', '신체활동'], type: 'subject', tags: ['behavior'] },
]

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

const lookup = new Map<string, OntologyEntry>()
for (const e of ONTOLOGY) {
  lookup.set(norm(e.canonical), e)
  for (const v of e.variants) lookup.set(norm(v), e)
}

export function normalizeTerm(surface: string): OntologyEntry | undefined {
  return lookup.get(norm(surface))
}

// 텍스트에서 해당 타입의 첫 엔티티를 surface 매칭으로 찾음(시드 단계 규칙기반; 추후 LLM/임베딩)
export function findInText(text: string, type: TermType): OntologyEntry | undefined {
  const t = norm(text)
  for (const e of ONTOLOGY) {
    if (e.type !== type) continue
    if (t.includes(norm(e.canonical))) return e
    for (const v of e.variants) if (t.includes(norm(v))) return e
  }
  return undefined
}

export function isChronicIrreversible(diseaseCanonical: string): boolean {
  return lookup.get(norm(diseaseCanonical))?.tags?.includes('chronic_irreversible') ?? false
}

export function subjectTags(subjectCanonical: string): string[] {
  return lookup.get(norm(subjectCanonical))?.tags ?? []
}
