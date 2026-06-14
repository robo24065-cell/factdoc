import { supabase } from './supabase'
import { parseClaim } from '../engine'
import type { Citation, Judgement, TraceStep, Verdict } from '../engine'
import { vecLiteral } from './embed'

const DISCLAIMER = '본 결과는 의료 진단이 아니며 참고용입니다. 증상이 의심되면 전문가와 상담하세요.'
export type Tier = 'auto_unverified' | 'verified'

// 엔진/온톨로지/룰을 의미 있게 바꾸면 이 버전을 올린다 → 구버전 캐시는 무시되고 재판정됨.
export const ENGINE_VERSION = 'v3-2026-06-14'

// 정규화 + FNV-1a 해시 → 시맨틱 캐시 키(추후 임베딩 ANN으로 확장)
export function claimHash(text: string): string {
  const s = text.trim().toLowerCase().replace(/\s+/g, ' ')
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export interface CacheHit {
  tier: Tier
  judgement: Judgement
  explanation: string | null
}

export async function getCachedVerdict(text: string): Promise<CacheHit | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase
      .from('verdict_cache')
      .select('*')
      .eq('claim_hash', claimHash(text))
      .eq('engine_version', ENGINE_VERSION) // 구버전 캐시 무시 → 재판정
      .maybeSingle()
    if (!data) return null
    if (data.verdict === 'unverified') return null // 보류는 서빙 안 함(엔진 개선 시 재판정)
    void supabase.from('verdict_cache').update({ query_count: (data.query_count ?? 0) + 1 }).eq('id', data.id)
    return {
      tier: data.tier as Tier,
      explanation: (data.explanation as string | null) ?? null,
      judgement: {
        claimText: data.canonical_claim as string,
        triples: [],
        verdict: data.verdict as Verdict,
        confidence: (data.confidence as number) ?? 0,
        citations: (data.citations as Citation[]) ?? [],
        trace: (data.decision_trace as TraceStep[]) ?? [],
        tier: data.tier as Tier,
        disclaimer: DISCLAIMER,
      },
    }
  } catch {
    return null
  }
}

export async function cacheVerdict(
  text: string,
  j: Judgement,
  explanation?: string | null,
  vec?: number[] | null,
): Promise<void> {
  if (!supabase) return
  if (j.verdict === 'unverified') return // 보류는 캐시하지 않음(엔진/코퍼스 개선 시 매번 재판정)
  try {
    const row: Record<string, unknown> = {
      claim_hash: claimHash(text),
      canonical_claim: text.trim(),
      verdict: j.verdict,
      citations: j.citations,
      confidence: j.confidence,
      decision_trace: j.trace,
      explanation: explanation ?? null,
      tier: 'auto_unverified',
      engine_version: ENGINE_VERSION,
    }
    if (vec && vec.length) row.embedding = vecLiteral(vec) // 시맨틱 캐시용 임베딩 동시 저장
    await supabase.from('verdict_cache').upsert(row, { onConflict: 'claim_hash' })
  } catch {
    /* 캐시 실패는 무시 */
  }
}

// ── 시맨틱 캐시: 임베딩 ANN으로 유사 과거판정 검색 + 규칙파서로 동일주장 확인 ──
export interface SemanticHit extends CacheHit {
  similarity: number
  matchedClaim: string
}

// 핵심 트리플 키(관계|대상질환|극성) 집합 — 규칙파서(로컬·즉시·무료)로 추출
function tripleKeys(text: string): Set<string> {
  const out = new Set<string>()
  for (const t of parseClaim(text)) out.add(`${t.relation}|${t.objectDisease}|${t.polarity}`)
  return out
}

// 두 주장이 핵심(관계·대상질환·극성)에서 호환되는가 — 임베딩 거짓히트(특히 부정문 뒤집힘) 차단.
// 한쪽이라도 규칙파싱 불가 → 유사도 임계(0.92)에만 의존(보수적).
function claimsCompatible(query: string, cached: string): boolean {
  const a = tripleKeys(query)
  const b = tripleKeys(cached)
  if (a.size === 0 || b.size === 0) return true
  for (const k of a) if (b.has(k)) return true
  return false
}

export async function getSemanticCachedVerdict(text: string, vec: number[]): Promise<SemanticHit | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.rpc('match_verdict_cache', {
      query_embedding: vecLiteral(vec),
      match_threshold: 0.92,
      fresh_only: true,
      req_version: ENGINE_VERSION,
    })
    if (error || !Array.isArray(data) || data.length === 0) return null
    const row = data[0] as {
      id: number; canonical_claim: string; verdict: Verdict; citations: Citation[] | null
      confidence: number | null; decision_trace: TraceStep[] | null; explanation: string | null
      tier: Tier; query_count: number | null; similarity: number
    }
    if (!claimsCompatible(text, row.canonical_claim)) return null // 핵심 트리플 불일치 → 캐시 거부(미스 처리)
    void supabase.from('verdict_cache').update({ query_count: (row.query_count ?? 0) + 1 }).eq('id', row.id)
    return {
      similarity: row.similarity,
      matchedClaim: row.canonical_claim,
      tier: row.tier,
      explanation: row.explanation ?? null,
      judgement: {
        claimText: row.canonical_claim,
        triples: [],
        verdict: row.verdict,
        confidence: row.confidence ?? 0,
        citations: row.citations ?? [],
        trace: row.decision_trace ?? [],
        tier: row.tier,
        disclaimer: DISCLAIMER,
      },
    }
  } catch {
    return null
  }
}

export interface ReviewItem {
  id: number
  canonical_claim: string
  verdict: Verdict
  tier: Tier
  query_count: number
  created_at: string
  needs_review: boolean
  review_reason: string | null
}

export async function fetchReviewQueue(): Promise<ReviewItem[] | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase
      .from('verdict_cache')
      .select('id,canonical_claim,verdict,tier,query_count,created_at,needs_review,review_reason')
      .order('needs_review', { ascending: false })
      .order('query_count', { ascending: false })
      .limit(100)
    return (data as ReviewItem[] | null) ?? []
  } catch {
    return null
  }
}

// 티어 변경(검증완료 시 재검토 플래그 해제)
export async function setTier(id: number, tier: Tier): Promise<boolean> {
  if (!supabase) return false
  try {
    const patch = tier === 'verified' ? { tier, needs_review: false, review_reason: null } : { tier }
    const { error } = await supabase.from('verdict_cache').update(patch).eq('id', id)
    return !error
  } catch {
    return false
  }
}

// 관리자 판정 교정(+검증완료 승격, 재검토 해제)
export async function setVerdict(id: number, verdict: Verdict): Promise<boolean> {
  if (!supabase) return false
  try {
    const { error } = await supabase.from('verdict_cache').update({ verdict, tier: 'verified', needs_review: false, review_reason: null }).eq('id', id)
    return !error
  } catch {
    return false
  }
}

// 캐시 항목 삭제
export async function deleteCached(id: number): Promise<boolean> {
  if (!supabase) return false
  try {
    const { error } = await supabase.from('verdict_cache').delete().eq('id', id)
    return !error
  } catch {
    return false
  }
}

// 재검토로 보내기(검증완료 → 자동·미검증, 사유 표시)
export async function flagForReview(id: number, reason: string): Promise<boolean> {
  if (!supabase) return false
  try {
    const { error } = await supabase.from('verdict_cache').update({ needs_review: true, review_reason: reason, tier: 'auto_unverified' }).eq('id', id)
    return !error
  } catch {
    return false
  }
}
