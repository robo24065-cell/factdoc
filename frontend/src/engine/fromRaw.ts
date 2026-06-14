// Gemini 파서(raw JSON) → 정규화 Triple[]. Home(parseRemote)·평가 하니스가 공유.
// 진실 판단은 안 함 — 트리플 '모양'만 정규화(온톨로지 매핑). §13.4
import type { Relation, Strength, Triple } from './types'
import { normalizeTerm } from './ontology'

export interface RawClaim {
  subject?: string
  relation?: string
  object_disease?: string
  polarity?: string
  strength?: string
  qualifier?: string | null
}

const RELS: ReadonlySet<string> = new Set([
  'cures', 'prevents', 'reduces_risk', 'increases_risk', 'manages',
  'no_effect', 'insufficient_evidence', 'causes_or_worsens', 'diagnoses', 'replaces_treatment',
])
const STRS: ReadonlySet<string> = new Set(['absolute', 'strong', 'moderate', 'weak'])

export function rawToTriples(claims: RawClaim[], text: string): Triple[] {
  const out: Triple[] = []
  for (const c of claims) {
    const rel = c.relation ?? ''
    const disease = c.object_disease ?? ''
    if (!RELS.has(rel) || !disease) continue
    out.push({
      subject: c.subject ? (normalizeTerm(c.subject)?.canonical ?? c.subject) : '(미상)',
      subjectSurface: c.subject,
      relation: rel as Relation,
      objectDisease: normalizeTerm(disease)?.canonical ?? disease,
      objectSurface: disease,
      polarity: c.polarity === 'negate' ? 'negate' : 'assert',
      strength: (STRS.has(c.strength ?? '') ? c.strength : 'moderate') as Strength,
      qualifier: c.qualifier ?? null,
      claimText: text,
    })
  }
  return out
}

// 규칙 트리플 + Gemini 트리플 결합(핵심키 중복 제거) — Home·평가 동일 파이프라인
export function mergeTriples(a: Triple[], b: Triple[]): Triple[] {
  const seen = new Set<string>()
  const out: Triple[] = []
  for (const t of [...a, ...b]) {
    const k = `${t.subject}|${t.relation}|${t.objectDisease}|${t.polarity}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}
