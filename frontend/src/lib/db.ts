import { supabase } from './supabase'
import type { Verdict } from '../engine'
import { normalizeTerm } from '../engine/ontology'

// 검증 1건을 query_log에 적재(비차단). ※ 캐시 히트(중복 질문)에는 호출하지 않음 → 분포 인플레 방지.
export async function logQuery(rawText: string, verdict: Verdict, category?: string): Promise<void> {
  if (!supabase) return
  try {
    await supabase.from('query_log').insert({ raw_text: rawText, verdict, category: category ?? null })
  } catch {
    /* 비차단 */
  }
}

export interface DbStats {
  triples: number
  terms: number
  checks: number // 고유 검증 주장 수(verdict_cache)
  verdictDist: Record<Verdict, number>
}

// 통계·분포는 '고유 주장'(verdict_cache) 기준 → 같은 질문 반복해도 분포가 부풀지 않음.
export async function fetchDbStats(): Promise<DbStats | null> {
  if (!supabase) return null
  try {
    const [triples, terms, checks, verdicts] = await Promise.all([
      supabase.from('claim_triple').select('*', { count: 'exact', head: true }),
      supabase.from('ontology_term').select('*', { count: 'exact', head: true }),
      supabase.from('verdict_cache').select('*', { count: 'exact', head: true }),
      supabase.from('verdict_cache').select('verdict'),
    ])
    const dist: Record<Verdict, number> = { true: 0, partial: 0, false: 0, unverified: 0 }
    for (const r of verdicts.data ?? []) {
      const v = r.verdict as Verdict | null
      if (v && v in dist) dist[v] += 1
    }
    return { triples: triples.count ?? 0, terms: terms.count ?? 0, checks: checks.count ?? 0, verdictDist: dist }
  } catch {
    return null
  }
}

export interface TopClaim { claim: string; verdict: Verdict; count: number }

// 실제 빈출 가짜정보(허위·과장) — 조회수 내림차순. 주간 가짜정보 TOP/유행 탭에 사용.
export async function fetchTopMisinfo(limit = 5): Promise<TopClaim[] | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase
      .from('verdict_cache')
      .select('canonical_claim,verdict,query_count')
      .in('verdict', ['false', 'partial'])
      .order('query_count', { ascending: false })
      .limit(limit)
    return (data ?? []).map((r) => ({
      claim: r.canonical_claim as string,
      verdict: r.verdict as Verdict,
      count: (r.query_count as number) ?? 0,
    }))
  } catch {
    return null
  }
}

export interface OutbreakRow {
  disease: string
  period: string | null
  case_count: number | null
  trend: string | null
}

// 감염병 트렌드(outbreak_trend) — 발생건수 내림차순. 실패 시 null → 데모 폴백.
export async function fetchOutbreak(): Promise<OutbreakRow[] | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase
      .from('outbreak_trend')
      .select('disease,period,case_count,trend')
      .order('case_count', { ascending: false })
    return (data as OutbreakRow[] | null) ?? []
  } catch {
    return null
  }
}

export interface DiseaseSection { section: string; text: string; url: string | null; portal: string }

// 질병명으로 코퍼스(질병청 콘텐츠) 섹션 조회. 동의어(온톨로지) 확장 검색 — 예: 제2형당뇨↔당뇨병.
export async function fetchDiseaseInfo(name: string): Promise<DiseaseSection[] | null> {
  if (!supabase) return null
  try {
    // 검색어 = 입력 + 정규화 동의어(중복·짧은 토큰 제거, 최대 5개)
    const entry = normalizeTerm(name)
    const terms = [...new Set([name, ...(entry ? [entry.canonical, ...entry.variants] : [])])]
      .filter((s) => s && s.length >= 2 && !s.includes(','))
      .slice(0, 5)
    const orFilter = terms.map((s) => `title.ilike.%${s}%`).join(',')
    const { data: docs } = await supabase.from('source_doc').select('id,title,url,portal').or(orFilter).limit(4)
    if (!docs || docs.length === 0) return []
    const ids = (docs as { id: number }[]).map((d) => d.id)
    const { data: chunks } = await supabase.from('chunk').select('text,source_span,source_doc_id').in('source_doc_id', ids).limit(12)
    const docMap = new Map((docs as { id: number; url: string | null; portal: string }[]).map((d) => [d.id, d]))
    return (chunks ?? []).map((c) => {
      const span = c.source_span as { section?: string } | null
      const d = docMap.get(c.source_doc_id as number)
      return { section: span?.section ?? '', text: c.text as string, url: d?.url ?? null, portal: d?.portal ?? '' }
    })
  } catch {
    return null
  }
}
