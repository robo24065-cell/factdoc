import { supabase } from './supabase'
import { parseClaim, type Verdict } from '../engine'
import { findInText, normalizeTerm } from '../engine/ontology'

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

// 실제 빈출 가짜정보(허위·과장). 토씨가 달라도 **의미가 같으면(핵심 트리플=관계+질환) 묶어 카운트 합산** → 순위.
export async function fetchTopMisinfo(limit = 5): Promise<TopClaim[] | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase
      .from('verdict_cache')
      .select('canonical_claim,verdict,query_count')
      .in('verdict', ['false', 'partial'])
      .order('query_count', { ascending: false })
      .limit(80)
    const rows = (data ?? []) as { canonical_claim: string; verdict: Verdict; query_count: number | null }[]
    // 의미 그룹핑: 핵심 트리플(관계|대상질환)로 묶고, 파싱 불가 시 텍스트로. 대표=최다 조회.
    const groups = new Map<string, { claim: string; verdict: Verdict; count: number; rep: number }>()
    for (const r of rows) {
      const t = parseClaim(r.canonical_claim)[0]
      const key = t ? `${t.relation}|${t.objectDisease}` : `t|${r.canonical_claim}`
      const cnt = (r.query_count ?? 0) + 1 // 변형 하나당 최소 1
      const g = groups.get(key)
      if (g) {
        g.count += cnt
        if ((r.query_count ?? 0) > g.rep) { g.claim = r.canonical_claim; g.rep = r.query_count ?? 0; g.verdict = r.verdict }
      } else {
        groups.set(key, { claim: r.canonical_claim, verdict: r.verdict, count: cnt, rep: r.query_count ?? 0 })
      }
    }
    return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, limit)
      .map((g) => ({ claim: g.claim, verdict: g.verdict, count: g.count }))
  } catch {
    return null
  }
}

export interface TopDisease { disease: string; count: number }

// 사람들이 많이 물어본 질병 순위 — query_log 전체(주장·정보·제품 질문 불문)에서 질병 키워드 추출·집계.
// 말이 달라도 같은 질병이면 합산(findInText 정규화). 등록된 질병만 카운트.
export async function fetchTopDiseases(limit = 6): Promise<TopDisease[]> {
  if (!supabase) return []
  try {
    const { data } = await supabase.from('query_log').select('raw_text').order('created_at', { ascending: false }).limit(600)
    const counts = new Map<string, number>()
    for (const r of (data ?? []) as { raw_text: string }[]) {
      const d = findInText(r.raw_text, 'disease')
      if (d) counts.set(d.canonical, (counts.get(d.canonical) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([disease, count]) => ({ disease, count }))
  } catch {
    return []
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

export interface DiseaseFakeClaim { claim: string; verdict: Verdict }

// 질병 관련 흔한 가짜정보(허위·과장 캐시) — §13.10a 디스커버리 퍼널. 동의어 확장 + 조회수 내림차순.
export async function fetchDiseaseFakeClaims(name: string, limit = 4): Promise<DiseaseFakeClaim[]> {
  if (!supabase) return []
  try {
    const entry = normalizeTerm(name)
    const terms = [...new Set([name, ...(entry ? [entry.canonical, ...entry.variants] : [])])]
      .filter((s) => s && s.length >= 2 && !s.includes(',')).slice(0, 5)
    const orFilter = terms.map((s) => `canonical_claim.ilike.%${s}%`).join(',')
    const { data } = await supabase
      .from('verdict_cache')
      .select('canonical_claim,verdict,query_count')
      .in('verdict', ['false', 'partial'])
      .or(orFilter)
      .order('query_count', { ascending: false })
      .limit(limit)
    return (data ?? []).map((r) => ({ claim: r.canonical_claim as string, verdict: r.verdict as Verdict }))
  } catch {
    return []
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
