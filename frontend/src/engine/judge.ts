// 판정 엔진(자체 방법) — 룰 + 클레임그래프 트리플 매칭. 진실판단은 여기서(LLM 아님). §13.3
import type { Citation, EvidenceRecord, Judgement, Strength, TraceStep, Triple, Verdict } from './types'
import { CLAIM_GRAPH } from './claimGraph'
import { MFDS_DISEASE_CLAIM_RULE } from './mfdsRules'
import { isChronicIrreversible, isInfectious, subjectTags } from './ontology'

const DISCLAIMER = '본 결과는 의료 진단이 아니며 참고용입니다. 증상이 의심되면 전문가와 상담하세요.'
const RISK_WARNING = '약물·치료를 임의로 중단하지 마세요. 반드시 표준치료를 따르고 전문가와 상담하세요.'

// 다중 트리플 결합 시 '가장 결정적/주의해야 할' 판정 우선. 보류(무근거)는 결정적 판정을 가리지 않음(false>partial>true>unverified).
const VERDICT_RANK: Record<Verdict, number> = { unverified: 0, true: 1, partial: 2, false: 3 }
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
function harmful(rel: Triple['relation']): boolean {
  return rel === 'increases_risk' || rel === 'causes_or_worsens'
}

function sameDirection(e: EvidenceRecord, t: Triple): boolean {
  if (e.relation === t.relation) return true
  if (beneficial(e.relation) && beneficial(t.relation)) return true
  return harmful(e.relation) && harmful(t.relation)
}

// useGraph=false → 룰만 적용(클레임그래프 트리플 매칭·반증 매칭 비활성). ablation config (c) 'RAG+룰'용.
function judgeTriple(t: Triple, useGraph = true): SingleResult {
  const trace: TraceStep[] = []
  const citations: Citation[] = []

  trace.push({
    kind: 'normalize',
    label: '정규화',
    detail: `(${t.subject}) —[${t.relation}${t.polarity === 'negate' ? '/부정' : ''}]→ (${t.objectDisease}) · 강도 ${t.strength}`,
  })

  const tags = subjectTags(t.subject)
  const isFood = tags.includes('food') || tags.includes('supplement')
  const isFoodLike = isFood || tags.includes('nutrient')
  const chronic = isChronicIrreversible(t.objectDisease)

  // 감염 경로 룰: 일반 식품 섭취로 감염병에 '걸린다'는 주장 → 근거없음(식품은 감염 경로 아님)
  if (isFoodLike && (t.relation === 'increases_risk' || t.relation === 'causes_or_worsens') && isInfectious(t.objectDisease) && t.polarity === 'assert') {
    trace.push({ kind: 'rule', label: '감염 경로 룰', detail: `일반 식품 섭취는 ${t.objectDisease}의 감염 경로가 아닙니다(공식 근거상 무관).`, outcome: '근거없음·허위' })
    return { verdict: 'false', confidence: 0.85, citations, trace }
  }

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

  // 룰 B′ — 완치 부정 룰: "비가역 만성질환은 완치되지 않는다"는 주장은 공식 입장(관리만 인정·완치 불가)과 일치 = 사실. §13.3
  if (t.relation === 'cures' && chronic && t.polarity === 'negate') {
    trace.push({ kind: 'rule', label: '완치 룰(부정)', detail: `${t.objectDisease}은(는) 비가역 만성질환으로 완치되지 않고 '관리'만 인정됩니다 — 주장이 공식 입장과 일치합니다.`, outcome: '사실' })
    const care = CLAIM_GRAPH.find((e) => e.objectDisease === t.objectDisease && e.relation === 'manages')
    if (care) citations.push(care.citation)
    return { verdict: 'true', confidence: 0.85, citations, trace }
  }

  // 반증 — '효과없음' 또는 부정형 주장이 공식 유익 근거와 모순 (예: 백신 무용론)
  const contradicts =
    t.relation === 'no_effect' ||
    ((t.relation === 'prevents' || t.relation === 'reduces_risk' || t.relation === 'manages') && t.polarity === 'negate')
  if (contradicts) {
    const ev = useGraph ? CLAIM_GRAPH.find((e) => e.objectDisease === t.objectDisease && e.subject === t.subject && beneficial(e.relation)) : undefined
    if (ev) {
      trace.push({ kind: 'graph_match', label: '반증 매칭', detail: `공식 근거 (${ev.subject})—[${ev.relation}]→(${ev.objectDisease}) · 근거수준 ${ev.evidenceLevel}`, outcome: '근거없음·허위(반증)' })
      citations.push(ev.citation)
      return { verdict: 'false', confidence: CONF[ev.evidenceLevel], citations, trace }
    }
    trace.push({ kind: 'coverage', label: '반증 근거 없음', detail: '이 부정 주장을 반박할 공식 근거가 코퍼스에 없습니다.', outcome: '공식근거없음·보류' })
    return { verdict: 'unverified', confidence: 0, citations, trace }
  }

  // 클레임그래프 매칭 (정확한 주체 일치만 — 다른 주체의 근거로 '대충 사실/과장' 금지)
  const ev = useGraph ? CLAIM_GRAPH.find((e) => e.objectDisease === t.objectDisease && e.subject === t.subject && sameDirection(e, t)) : undefined
  if (ev) {
    citations.push(ev.citation)
    trace.push({
      kind: 'graph_match', label: '클레임그래프 매칭',
      detail: `근거 (${ev.subject}) —[${ev.relation}]→ (${ev.objectDisease}) · 근거수준 ${ev.evidenceLevel}`,
      outcome: '핵심 트리플 일치',
    })
    if (STRENGTH_RANK[t.strength] > STRENGTH_RANK[ev.strength]) {
      trace.push({ kind: 'boundary', label: '경계 판정', detail: '근거 방향·주체는 일치하나 강도 과장', outcome: '부분적·과장' })
      return { verdict: 'partial', confidence: CONF[ev.evidenceLevel] * 0.85, citations, trace }
    }
    trace.push({ kind: 'boundary', label: '경계 판정', detail: '방향·강도·주체 일치', outcome: '사실' })
    return { verdict: 'true', confidence: CONF[ev.evidenceLevel], citations, trace }
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

export function judge(triples: Triple[], claimText: string, opts: { useGraph?: boolean } = {}): Judgement {
  const useGraph = opts.useGraph !== false
  if (triples.length === 0) {
    return {
      claimText, triples: [], verdict: 'unverified', confidence: 0, citations: [],
      trace: [{ kind: 'coverage', label: '주장 인식', detail: '대상 질환 또는 검증 가능한 주장을 인식하지 못했습니다.', outcome: '공식근거없음·보류' }],
      tier: 'auto_unverified', disclaimer: DISCLAIMER,
    }
  }

  const results = triples.map((t) => judgeTriple(t, useGraph))

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
