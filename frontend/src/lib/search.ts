// 하이브리드 코퍼스 검색: dense(벡터 ANN) + lexical(tsvector) RRF 융합(RPC search_chunks_hybrid).
// "이 주제 관련 질병청 공식 자료"를 결과에 덧붙임 — 검색은 부품, 판정 근거(citations)와는 별도.
// 작은·잡음 코퍼스에서 무관한 최근접이 뜨지 않도록, 주장의 질병/주체 용어(+동의어)로 관련성 필터링.
import { supabase } from './supabase'
import { vecLiteral } from './embed'
import { normalizeTerm } from '../engine/ontology'

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

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

// 용어(질병/주체 canonical) → 동의어 포함 정규화 매칭 토큰 집합
function matchTokens(terms: string[]): string[] {
  const out = new Set<string>()
  for (const t of terms) {
    if (!t || t === '(미상)') continue
    const e = normalizeTerm(t)
    for (const s of [t, ...(e ? [e.canonical, ...e.variants] : [])]) {
      const n = norm(s)
      if (n.length >= 2) out.add(n)
    }
  }
  return [...out]
}

export async function searchEvidence(text: string, vec: number[], k = 3, terms: string[] = []): Promise<EvidenceChunk[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase.rpc('search_chunks_hybrid', {
      query_embedding: vecLiteral(vec),
      query_text: text,
      match_count: Math.max(k, 8), // 넉넉히 가져와 관련성 필터 후 상위 k
    })
    if (error || !data) return []
    let rows: EvidenceChunk[] = (data as RpcRow[]).map((r) => ({
      text: r.text,
      section: r.source_span?.section ?? null,
      portal: r.portal ?? '',
      title: r.title ?? null,
      url: r.url ?? null,
      score: r.score ?? 0,
    }))
    // 관련성 필터: 주장의 질병/주체(+동의어)가 청크 본문에 실제로 등장하는 것만. 토큰 없으면 미적용.
    const tokens = matchTokens(terms)
    if (tokens.length) {
      const filtered = rows.filter((r) => { const n = norm(r.text); return tokens.some((tk) => n.includes(tk)) })
      rows = filtered // 관련 없으면 빈 배열 → 섹션 숨김(엉뚱한 자료 표시 방지)
    }
    return rows.slice(0, k)
  } catch {
    return []
  }
}
