// 주장 텍스트 → 트리플 파서 (결정론적 스텁)
// ⚠ 이것은 §13.4의 LLM(Gemini) 파서 자리의 임시 대체물. 진실판단은 하지 않고 '모양'만 추출.
import type { Relation, Strength, Triple } from './types'
import { findInText } from './ontology'
import { relationHits } from './relationLex'

function detectStrength(text: string): Strength {
  if (/(완치|무조건|유일|100%|반드시 낫)/.test(text)) return 'absolute'
  if (/(확실|반드시|꼭)/.test(text)) return 'strong'
  return 'moderate'
}

// 관계 동사가 부정되는지 — 부정 표지를 동사 인접 윈도우에서만 탐지해 다른 절의 부정에 오염되지 않게 한다.
// 후치 부정(한국어 기본): '완치되지 않/못', '완치 안 된다/안돼', '예방 못 한다' / 선치 부정: '안/못 ~'.
// 미지원: 이중부정·원거리 부정(→ Gemini 파서가 보강). 진실판단이 아니라 '극성(polarity)'만 본다.
function isNegated(text: string, hitWords: string[]): boolean {
  for (const w of hitWords) {
    const i = text.indexOf(w)
    if (i < 0) continue
    const after = text.slice(i + w.length, i + w.length + 7)
    const before = text.slice(Math.max(0, i - 2), i)
    if (/^\s*(되)?\s*지\s*(않|못)/.test(after)) return true              // 완치'되지 않' / 치료하'지 못'
    if (/^\s*[가-힣]?\s*안\s*[가-힣]?\s*(된|됨|돼|되)/.test(after)) return true // 완치 '안 된다/안돼' / 완치도 '안 됨'
    if (/^\s*(안|못)\s/.test(after)) return true                          // 완치 '안 함' / 예방 '못 한다'
    if (/(^|[\s,])(안|못)\s*$/.test(before)) return true                  // '안' 완치 / '못' 고친다
  }
  return false
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
  // 발병 패턴: "~에 걸린다/걸리나/생긴다" + "[질병]되나/된다/돼요"(예: 비만되나요·당뇨가 된다) + 유발/초래 → 위험 증가.
  // 단 부정형(안 걸리/예방)은 제외.
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const diseaseNames = [disease.canonical, ...disease.variants].filter((s) => s.length >= 2).map(esc).join('|')
  const becomesDisease = new RegExp(`(${diseaseNames})\\s*(이|가|으로|로|에)?\\s*(되|돼|된다|됩니|되나|되어|와|올|온다|생기)`).test(text)
  const getsDisease =
    (/(걸린|걸리나|걸려|걸리게|생긴|생기나|잘\s*생|유발|초래|불러일으|발생시|발병)/.test(text) || becomesDisease) &&
    !/(안\s*걸|못\s*걸|예방|막아|안\s*생|되지\s*않|안\s*된|안\s*생기)/.test(text)

  // 매칭된 관계 + 각 관계가 부정되는지(polarity). 부정 표지가 그 관계 동사에 인접할 때만 negate.
  // relationHits: 1,100+ 어간 사전(relationLex)으로 무한한 표현을 닫힌 관계집합에 매핑(LLM 없이 일반화).
  const matched = relationHits(text)
  const negated = new Set<Relation>()
  for (const k of matched) {
    if (isNegated(text, k.words.filter((w) => text.includes(w)))) negated.add(k.rel)
  }

  let relations = matched.map((k) => k.rel)
  if (negPrevent && !relations.includes('prevents')) relations.push('prevents')
  if (negPrevent) negated.add('prevents') // "백신이 독감을 못 막는다" 류 — 예방 주장의 부정
  if (getsDisease && !relations.includes('increases_risk')) relations.push('increases_risk')
  if (relations.length === 0) relations = ['manages']
  relations = [...new Set(relations)]

  return relations.map((rel) => ({
    subject,
    subjectSurface,
    relation: rel,
    objectDisease: disease.canonical,
    objectSurface: disease.variants[0],
    polarity: negated.has(rel) ? ('negate' as const) : ('assert' as const),
    strength:
      rel === 'cures' || rel === 'replaces_treatment'
        ? strength === 'absolute' ? 'absolute' : 'strong'
        : strength,
    qualifier: null,
    claimText: text,
  }))
}
