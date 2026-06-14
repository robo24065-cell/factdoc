// 하이브리드 코퍼스 검색: dense(벡터 ANN) + lexical(tsvector) RRF 융합(RPC search_chunks_hybrid).
// "이 주제 관련 질병청 공식 자료"를 결과에 덧붙임 — 검색은 부품, 판정 근거(citations)와는 별도.
import { supabase } from './supabase'
import { vecLiteral } from './embed'

export interface EvidenceChunk {
  text: string
  section: string | null
  portal: string
  title: string | null
  url: string | null
  score: number
}

interface RpcRow {
  text: string
  source_span: { section?: string } | null
  portal: string | null
  title: string | null
  url: string | null
  score: number | null
}

export async function searchEvidence(text: string, vec: number[], k = 3): Promise<EvidenceChunk[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase.rpc('search_chunks_hybrid', {
      query_embedding: vecLiteral(vec),
      query_text: text,
      match_count: k,
    })
    if (error || !data) return []
    return (data as RpcRow[]).map((r) => ({
      text: r.text,
      section: r.source_span?.section ?? null,
      portal: r.portal ?? '',
      title: r.title ?? null,
      url: r.url ?? null,
      score: r.score ?? 0,
    }))
  } catch {
    return []
  }
}
