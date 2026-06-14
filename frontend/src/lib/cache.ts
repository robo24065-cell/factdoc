import { supabase } from './supabase'
import type { Citation, Judgement, TraceStep, Verdict } from '../engine'

const DISCLAIMER = '본 결과는 의료 진단이 아니며 참고용입니다. 증상이 의심되면 전문가와 상담하세요.'
export type Tier = 'auto_unverified' | 'verified'

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
}

export async function getCachedVerdict(text: string): Promise<CacheHit | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase.from('verdict_cache').select('*').eq('claim_hash', claimHash(text)).maybeSingle()
    if (!data) return null
    void supabase.from('verdict_cache').update({ query_count: (data.query_count ?? 0) + 1 }).eq('id', data.id)
    return {
      tier: data.tier as Tier,
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

export async function cacheVerdict(text: string, j: Judgement): Promise<void> {
  if (!supabase) return
  try {
    await supabase.from('verdict_cache').upsert(
      {
        claim_hash: claimHash(text),
        canonical_claim: text.trim(),
        verdict: j.verdict,
        citations: j.citations,
        confidence: j.confidence,
        decision_trace: j.trace,
        tier: 'auto_unverified',
      },
      { onConflict: 'claim_hash' },
    )
  } catch {
    /* 캐시 실패는 무시 */
  }
}

export interface ReviewItem {
  id: number
  canonical_claim: string
  verdict: Verdict
  tier: Tier
  query_count: number
}

export async function fetchReviewQueue(): Promise<ReviewItem[] | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase
      .from('verdict_cache')
      .select('id,canonical_claim,verdict,tier,query_count')
      .order('query_count', { ascending: false })
      .limit(50)
    return (data as ReviewItem[] | null) ?? []
  } catch {
    return null
  }
}

export async function setTier(id: number, tier: Tier): Promise<boolean> {
  if (!supabase) return false
  try {
    const { error } = await supabase.from('verdict_cache').update({ tier }).eq('id', id)
    return !error
  } catch {
    return false
  }
}

// 관리자가 판정 자체를 교정(+검증완료 승격). RLS: verdict_cache update 허용(0003).
export async function setVerdict(id: number, verdict: Verdict): Promise<boolean> {
  if (!supabase) return false
  try {
    const { error } = await supabase.from('verdict_cache').update({ verdict, tier: 'verified' }).eq('id', id)
    return !error
  } catch {
    return false
  }
}
