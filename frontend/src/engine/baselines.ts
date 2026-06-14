// 비교 데모용 베이스라인 (대조군) — CLAUDE.md §13.11
// ⚠ 실제 LLM/RAG가 아니라, 두 접근의 '동작 방식 차이'를 보여주기 위한 모의(simulated) 대조군.
import { parseClaim } from './parse'
import { CLAIM_GRAPH } from './claimGraph'
import type { EvidenceRecord } from './types'

export interface NaiveLLMOut { answer: string; flags: string[] }
export interface NaiveRAGOut { snippet: string | null; source: string | null; note: string }

// 무근거 LLM: 출처·검증·룰 없이 그럴듯하게 응답(환각·동조 경향)
export function naiveLLM(_claim: string): NaiveLLMOut {
  return {
    answer: '네, 어느 정도 도움이 될 수 있습니다. 개인차가 있으니 꾸준히 참고해 보세요.',
    flags: ['출처 없음', '판정 없음', '환각 가능'],
  }
}

function closest(claim: string): EvidenceRecord | undefined {
  const disease = parseClaim(claim)[0]?.objectDisease
  if (!disease) return undefined
  return CLAIM_GRAPH.find((e) => e.objectDisease === disease)
}

// 일반 RAG: 관련 공식 문서를 '검색'만 하고, 참/거짓 판정·룰은 적용하지 않음
export function naiveRAG(claim: string): NaiveRAGOut {
  const ev = closest(claim)
  if (!ev) return { snippet: null, source: null, note: '관련 정보를 찾지 못했습니다.' }
  return {
    snippet: ev.note ?? `${ev.subject} — ${ev.objectDisease} 관련 공식 정보`,
    source: ev.citation.portal,
    note: '관련 정보를 검색해 보여줄 뿐, 주장의 참/거짓 판정과 룰 적용은 없습니다.',
  }
}
