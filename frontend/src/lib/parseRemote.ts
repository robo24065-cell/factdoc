// Gemini 파서(Edge Function parse-claim) 호출 → 정규화된 트리플
// 진실 판단은 하지 않음(룰·그래프가 함). 실패 시 빈 배열 → 규칙 파서만 사용.
import { supabase } from './supabase'
import type { Relation, Strength, Triple } from '../engine'
import { normalizeTerm } from '../engine/ontology'

const RELS: ReadonlySet<string> = new Set([
  'cures', 'prevents', 'reduces_risk', 'increases_risk', 'manages',
  'no_effect', 'insufficient_evidence', 'causes_or_worsens', 'diagnoses', 'replaces_treatment',
])
const STRS: ReadonlySet<string> = new Set(['absolute', 'strong', 'moderate', 'weak'])

interface RawClaim {
  subject?: string
  relation?: string
  object_disease?: string
  polarity?: string
  strength?: string
  qualifier?: string | null
}

export async function geminiTriples(text: string): Promise<Triple[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase.functions.invoke('parse-claim', { body: { text } })
    if (error || !data) return []
    const claims: RawClaim[] = (data as { claims?: RawClaim[] }).claims ?? []
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
  } catch {
    return []
  }
}
