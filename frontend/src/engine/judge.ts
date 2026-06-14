// 판정 엔진(자체 방법) — 룰 + 클레임그래프 트리플 매칭. 진실판단은 여기서(LLM 아님). §13.3
import type { Citation, EvidenceRecord, Judgement, Strength, TraceStep, Triple, Verdict } from './types'
import { CLAIM_GRAPH } from './claimGraph'
import { MFDS_DISEASE_CLAIM_RULE } from './mfdsRules'
import { isChronicIrreversible, subjectTags } from './ontology'

const DISCLAIMER = '본 결과는 의료 진단이 아니며 참고용입니다. 증상이 의심되면 전문가와 상담하세요.'
const RISK_WARNING = '약물·치료를 임의로 중단하지 마세요. 반드시 표준치료를 따르고 전문가와 상담하세요.'

const VERDICT_RANK: Record<Verdict, number> = { true: 0, partial: 1, unverified: 2, false: 3 }
const STRENGTH_RANK: Record<Strength, number> = { weak: 0, moderate: 1, strong: 2, absolute: 3 }
const CONF: Record<EvidenceRecord['evidenceLevel'], number> = {
  official_guideline: 0.9, regulatory_counter: 0.9, mfds_approved: 0.85, statistics: 0.8, limited: 0.5, none: 0.2,
}

interface SingleResult {
  verdict: Verdict
  confidence: number
  citations: Citation[]
  trace: TraceStep[]
  warning?: string
}

function beneficial(rel: Triple['relation']): boolean {
  return rel === 'manages' || rel === 'reduces_risk' || rel === 'prevents' || rel === 'cures'
}

function sameDirection(e: EvidenceRecord, t: Triple): boolean {
  if (e.relation === t.relation) return true
  return beneficial(e.relation) && beneficial(t.relation)
}

function judgeTriple(t: Triple): SingleResult {
  const trace: TraceStep[] = []
  const citations: Citation[] = []

  trace.push({
    kind: 'normalize',
    label: '정규화',
    detail: `(${t.subject}) —[${t.relation}${t.polarity === 'negate' ? '/부정' : ''}]→ (${t.objectDisease}) · 강도 ${t.strength}`,
  })

  const tags = subjectTags(t.subject)
  const isFood = tags.includes('food') || tags.includes('supplement')
  const chronic = isChronicIrreversible(t.objectDisease)

  // 룰 A — 식약처: 식품/건기식이 질병 치료·예방 표방
  if (isFood && (t.relation === 'cures' || t.relation === 'prevents') && t.polarity === 'assert') {
    trace.push({ kind: 'rule', label: '식약처 룰 발동', detail: MFDS_DISEASE_CLAIM_RULE.description, outcome: '근거없음·허위' })
    citations.push(MFDS_DISEASE_CLAIM_RULE.citation)
    return { verdict: 'false', confidence: 0.9, citations, trace }
  }

  // 대체치료 — 약물·병원 치료 중단·대체 권유 (위험경고)
  if (t.relation === 'replaces_treatment') {
    trace.push({ kind: 'rule', label: '대체치료 경고', detail: '약물·병원 치료를 임의 중단·대체하는 주장은 공식 표준치료에 반합니다.', outcome: '부분적·과장(위험)' })
    const care = CLAIM_GRAPH.find((e) => e.objectDisease === t.objectDisease && e.relation === 'manages')
    if (care) citations.push(care.citation)
    return { verdict: 'partial', confidence: 0.7, citations, trace, warning: RISK_WARNING }
  }

  // 룰 B — 완치 룰: 비가역 만성질환의 완치
  if (t.relation === 'cures' && chronic && t.polarity === 'assert') {
    trace.push({ kind: 'rule', label: '완치 룰 발동', detail: `${t.objectDisease}은(는) 비가역 만성질환으로 공식적으로 '관리'만 인정됩니다(완치 불가).`, outcome: '근거없음·허위' })
    const care = CLAIM_GRAPH.find((e) => e.objectDisease === t.objectDisease && e.relation === 'manages')
    if (care) citations.push(care.citation)
    return { verdict: 'false', confidence: 0.88, citations, trace }
  }

  // 반증 — '효과없음' 또는 부정형 주장이 공식 유익 근거와 모순 (예: 백신 무용론)
  const contradicts =
    t.relation === 'no_effect' ||
    ((t.relation === 'prevents' || t.relation === 'reduces_risk' || t.relation === 'manages') && t.polarity === 'negate')
  if (contradicts) {
    const ev = CLAIM_GRAPH.find((e) => e.objectDisease === t.objectDisease && e.subject === t.subject && beneficial(e.relation))
    if (ev) {
      trace.push({ kind: 'graph_match', label: '반증 매칭', detail: `공식 근거 (${ev.subject})—[${ev.relation}]→(${ev.objectDisease}) · 근거수준 ${ev.evidenceLevel}`, outcome: '근거없음·허위(반증)' })
      citations.push(ev.citation)
      return { verdict: 'false', confidence: CONF[ev.evidenceLevel], citations, trace }
    }
    trace.push({ kind: 'coverage', label: '반증 근거 없음', detail: '이 부정 주장을 반박할 공식 근거가 코퍼스에 없습니다.', outcome: '공식근거없음·보류' })
    return { verdict: 'unverified', confidence: 0, citations, trace }
  }

  // 클레임그래프 매칭
  const matches = CLAIM_GRAPH.filter((e) => e.objectDisease === t.objectDisease && sameDirection(e, t))
  const exact = matches.find((e) => e.subject === t.subject)
  const best = exact ?? matches[0]

  if (best) {
    citations.push(best.citation)
    trace.push({
      kind: 'graph_match', label: '클레임그래프 매칭',
      detail: `근거 (${best.subject}) —[${best.relation}]→ (${best.objectDisease}) · 근거수준 ${best.evidenceLevel}`,
      outcome: exact ? '핵심 트리플 일치' : '동일 방향 근거 존재',
    })
    const overstated = STRENGTH_RANK[t.strength] > STRENGTH_RANK[best.strength] || !exact
    if (overstated) {
      trace.push({ kind: 'boundary', label: '경계 판정', detail: '근거 방향은 일치하나 강도 과장 또는 주체 불일치', outcome: '부분적·과장' })
      return { verdict: 'partial', confidence: CONF[best.evidenceLevel] * 0.85, citations, trace }
    }
    trace.push({ kind: 'boundary', label: '경계 판정', detail: '방향·강도·주체 일치', outcome: '사실' })
    return { verdict: 'true', confidence: CONF[best.evidenceLevel], citations, trace }
  }

  // 커버리지 — 보류
  trace.push({
    kind: 'coverage', label: '커버리지 검사',
    detail: '공식 코퍼스에 대조할 근거가 없습니다(근거 없어서 모름 ≠ 근거 있어서 부정).',
    outcome: '공식근거없음·보류',
  })
  return { verdict: 'unverified', confidence: 0, citations, trace }
}

function dedupeCitations(cs: Citation[]): Citation[] {
  const seen = new Set<string>()
  return cs.filter((c) => {
    const k = `${c.portal}|${c.title}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function judge(triples: Triple[], claimText: string): Judgement {
  if (triples.length === 0) {
    return {
      claimText, triples: [], verdict: 'unverified', confidence: 0, citations: [],
      trace: [{ kind: 'coverage', label: '주장 인식', detail: '대상 질환 또는 검증 가능한 주장을 인식하지 못했습니다.', outcome: '공식근거없음·보류' }],
      tier: 'auto_unverified', disclaimer: DISCLAIMER,
    }
  }

  const results = triples.map(judgeTriple)

  let worst = results[0]
  for (const r of results) if (VERDICT_RANK[r.verdict] > VERDICT_RANK[worst.verdict]) worst = r

  const multi = triples.length > 1
  const trace: TraceStep[] = results.flatMap((r, i) =>
    multi
      ? [{ kind: 'normalize' as const, label: `트리플 ${i + 1}`, detail: `${triples[i].subject} → ${triples[i].relation} → ${triples[i].objectDisease}` }, ...r.trace]
      : r.trace,
  )

  return {
    claimText,
    triples,
    verdict: worst.verdict,
    confidence: worst.confidence,
    citations: dedupeCitations(results.flatMap((r) => r.citations)),
    trace,
    tier: 'auto_unverified',
    warning: results.find((r) => r.warning)?.warning,
    disclaimer: DISCLAIMER,
  }
}
