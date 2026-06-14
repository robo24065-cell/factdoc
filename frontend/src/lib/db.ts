import { supabase } from './supabase'
import type { Verdict } from '../engine'

export interface DbStats {
  triples: number
  terms: number
  queries: number
  verdictDist: Record<Verdict, number>
}

// 검증 1건을 query_log에 적재(비차단). RLS: 공개 insert 허용.
export async function logQuery(rawText: string, verdict: Verdict, category?: string): Promise<void> {
  if (!supabase) return
  try {
    await supabase.from('query_log').insert({ raw_text: rawText, verdict, category: category ?? null })
  } catch {
    /* 로깅 실패는 무시(UX 비차단) */
  }
}

// 대시보드용 라이브 통계(트리플·온톨로지·누적검증·판정분포). 실패 시 null → 로컬 폴백.
export async function fetchDbStats(): Promise<DbStats | null> {
  if (!supabase) return null
  try {
    const [triples, terms, queries, logs] = await Promise.all([
      supabase.from('claim_triple').select('*', { count: 'exact', head: true }),
      supabase.from('ontology_term').select('*', { count: 'exact', head: true }),
      supabase.from('query_log').select('*', { count: 'exact', head: true }),
      supabase.from('query_log').select('verdict'),
    ])
    const dist: Record<Verdict, number> = { true: 0, partial: 0, false: 0, unverified: 0 }
    for (const r of logs.data ?? []) {
      const v = r.verdict as Verdict | null
      if (v && v in dist) dist[v] += 1
    }
    return { triples: triples.count ?? 0, terms: terms.count ?? 0, queries: queries.count ?? 0, verdictDist: dist }
  } catch {
    return null
  }
}
