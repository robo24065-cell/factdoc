// 주장 텍스트 → 트리플 파서 (결정론적 스텁)
// ⚠ 이것은 §13.4의 LLM(Gemini) 파서 자리의 임시 대체물. 진실판단은 하지 않고 '모양'만 추출.
import type { Relation, Strength, Triple } from './types'
import { findInText } from './ontology'

// 우선순위 순서가 중요(replaces_treatment·cures를 manages보다 먼저 잡음)
const REL_KEYWORDS: { rel: Relation; words: string[] }[] = [
  { rel: 'replaces_treatment', words: ['약 끊', '약을 끊', '약 대신', '병원 안 가', '병원 안가', '약 안 먹어도', '치료 안 받아도'] },
  { rel: 'cures', words: ['완치', '낫는다', '낫게', '고친다', '없앤다', '치료된다', '치료한다', '치료된'] },
  { rel: 'prevents', words: ['예방', '막아준다', '안 걸리', '안걸리'] },
  { rel: 'increases_risk', words: ['위험을 높', '위험이 높', '위험 높', '유발', '높인다', '악화', '발병률 증가'] },
  { rel: 'reduces_risk', words: ['위험을 낮', '위험이 낮', '위험 낮', '발병률 감소', '낮춘다', '낮춰', '내린다'] },
  { rel: 'no_effect', words: ['효과 없', '효과없', '효과가 없', '소용없', '의미 없'] },
  { rel: 'manages', words: ['도움', '좋다', '좋아', '개선', '완화', '관리', '조절'] },
]

function detectStrength(text: string): Strength {
  if (/(완치|무조건|유일|100%|반드시 낫)/.test(text)) return 'absolute'
  if (/(확실|반드시|꼭)/.test(text)) return 'strong'
  return 'moderate'
}

export function parseClaim(text: string): Triple[] {
  const disease = findInText(text, 'disease')
  if (!disease) return []

  const subjectEntry = findInText(text, 'subject')
  const subject = subjectEntry?.canonical ?? '(미상)'
  const subjectSurface = subjectEntry?.variants[0]
  const strength = detectStrength(text)

  // 부정형 예방 주장(예: "백신이 독감을 못 막는다")
  const negPrevent = /(못\s*막|안\s*막|막지\s*못|예방.*(못|안 됨|안돼|안 된))/.test(text)

  let relations = REL_KEYWORDS.filter((k) => k.words.some((w) => text.includes(w))).map((k) => k.rel)
  if (negPrevent && !relations.includes('prevents')) relations.push('prevents')
  if (relations.length === 0) relations = ['manages']
  relations = [...new Set(relations)]

  return relations.map((rel) => ({
    subject,
    subjectSurface,
    relation: rel,
    objectDisease: disease.canonical,
    objectSurface: disease.variants[0],
    polarity: rel === 'prevents' && negPrevent ? ('negate' as const) : ('assert' as const),
    strength:
      rel === 'cures' || rel === 'replaces_treatment'
        ? strength === 'absolute' ? 'absolute' : 'strong'
        : strength,
    qualifier: null,
    claimText: text,
  }))
}
