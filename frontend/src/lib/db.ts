import { supabase } from './supabase'
import { parseClaim, type Verdict } from '../engine'
import { findInText, normalizeTerm } from '../engine/ontology'
import { KDCA_CORPUS } from '../engine/kdca-corpus'

// 질병청 국가건강정보포털 정적 코퍼스(건강정보검색 API 배치 수집) — Supabase 없이도 그라운딩 동작.
const KDCA_URL = 'https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do'
const TX_RE = /(치료|약물|연고|도포|바르|복용|관리|요법|예방|권고|표준|개선|조절)/
const nospace = (s: string) => s.toLowerCase().replace(/\s+/g, '')
// 여러 질병이 섞이지 않게 좁히기 — 구체적(긴) 용어부터, '한 질병'만 잡힐 때만 채택.
// 예: "E형간염" 검색 시 광범위어 "간염"이 A형·C형간염을 함께 끌어오는 혼입 방지.
function narrowToOneDisease<T extends { title: string }>(docs: T[], terms: string[]): T[] {
  if (docs.length <= 1) return docs
  for (const term of [...terms].sort((a, b) => b.length - a.length)) {
    const hit = docs.filter((d) => d.title.includes(term))
    if (hit.length && new Set(hit.map((d) => d.title)).size === 1) return hit
  }
  const exact = docs.filter((d) => terms.some((term) => nospace(d.title) === nospace(term)))
  return exact
}
function staticDocs(terms: string[]) {
  const t = [...new Set(terms)].filter((s) => s && s.length >= 2 && !s.includes(','))
  const cand = KDCA_CORPUS.filter((d) => t.some((term) => d.title.includes(term)))
  return narrowToOneDisease(cand, t)
}

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
// 최근 7일 의심 주장(허위·과장) 일별 추이 — query_log 실데이터(트렌드 레이더).
export async function fetchWeeklyMisinfo(): Promise<{ day: string; count: number }[] | null> {
  if (!supabase) return null
  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString()
    const { data } = await supabase.from('query_log').select('created_at,verdict').gte('created_at', since)
    if (!data || data.length < 3) return null // 데이터 희소 시 데모 폴백
    const wd = ['일', '월', '화', '수', '목', '금', '토']
    const b: Record<string, number> = {}
    for (const r of data as { created_at: string; verdict: string }[]) {
      if (r.verdict === 'false' || r.verdict === 'partial') { const d = wd[new Date(r.created_at).getDay()]; b[d] = (b[d] || 0) + 1 }
    }
    return ['월', '화', '수', '목', '금', '토', '일'].map((d) => ({ day: d, count: b[d] || 0 }))
  } catch { return null }
}

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

export interface GroundedPassage { text: string; section: string; url: string | null; portal: string; treatment: boolean }

// 코퍼스 그라운딩 — 손코딩 트리플이 없어도 실제 질병청 본문에서 (질병 문서 ∩ 주제어) 본문을 찾아 답.
// 주제어가 그 질병의 '치료/관리' 맥락에 등장하면 treatment=true(주장 뒷받침 신호). 렉시컬(Gemini 불필요).
export async function fetchGroundedAnswer(diseaseTerms: string[], subjectTerms: string[]): Promise<GroundedPassage[]> {
  if (!supabase) return staticGrounded(diseaseTerms, subjectTerms)
  try {
    const dTerms = [...new Set(diseaseTerms)].filter((s) => s && s.length >= 2 && !s.includes(',')).slice(0, 5)
    if (!dTerms.length) return []
    const dOr = dTerms.map((s) => `title.ilike.%${s}%`).join(',')
    const { data: docs } = await supabase.from('source_doc').select('id,title,url,portal').or(dOr).limit(6)
    if (!docs || !docs.length) return []
    const ids = (docs as { id: number }[]).map((d) => d.id)
    const docMap = new Map((docs as { id: number; url: string | null; portal: string }[]).map((d) => [d.id, d]))
    const subj = [...new Set(subjectTerms)].filter((s) => s && s.length >= 2 && !s.includes(',')).slice(0, 6)
    // 주제어 매칭 + 치료/관리 맥락 본문을 함께(공백·표기차 대비) — 질병의 치료 청크는 늘 후보
    const orParts = [...subj.map((s) => `text.ilike.%${s}%`), 'text.ilike.%치료%', 'text.ilike.%관리%', 'text.ilike.%예방%', 'text.ilike.%연고%']
    const { data: chunks } = await supabase.from('chunk').select('text,source_span,source_doc_id').in('source_doc_id', ids).or(orParts.join(',')).limit(10)
    const TX = /(치료|약물|연고|도포|바르|복용|관리|요법|예방|권고|표준)/
    const sNorm = subj.map((s) => s.toLowerCase().replace(/\s+/g, ''))
    const out = (chunks ?? []).map((c) => {
      const span = c.source_span as { section?: string } | null
      const d = docMap.get(c.source_doc_id as number)
      const text = c.text as string
      const hasSubj = sNorm.some((s) => text.toLowerCase().replace(/\s+/g, '').includes(s))
      return { text, section: span?.section ?? '', url: d?.url ?? null, portal: d?.portal ?? '질병관리청', treatment: TX.test(text) || TX.test(span?.section ?? ''), _subj: hasSubj }
    })
    // 주제어 포함 본문 우선, 그다음 치료 맥락
    out.sort((a, b) => (Number(b._subj) - Number(a._subj)) || (Number(b.treatment) - Number(a.treatment)))
    const sup = out.slice(0, 4).map(({ _subj, ...g }) => g)
    return sup.length ? sup : staticGrounded(diseaseTerms, subjectTerms)
  } catch {
    return staticGrounded(diseaseTerms, subjectTerms)
  }
}

// 정적 코퍼스(KDCA) 그라운딩 — Supabase 미스/오프라인 폴백.
function staticGrounded(diseaseTerms: string[], subjectTerms: string[]): GroundedPassage[] {
  const docs = staticDocs(diseaseTerms)
  if (!docs.length) return []
  const sNorm = [...new Set(subjectTerms)].filter((s) => s && s.length >= 2).map((s) => s.toLowerCase().replace(/\s+/g, ''))
  const out = docs.flatMap((d) => d.chunks.map((c) => {
    const hasSubj = sNorm.some((s) => c.text.toLowerCase().replace(/\s+/g, '').includes(s))
    return { text: c.text, section: c.section, url: KDCA_URL, portal: d.portal, treatment: TX_RE.test(c.text) || TX_RE.test(c.section), _subj: hasSubj }
  }))
  out.sort((a, b) => (Number(b._subj) - Number(a._subj)) || (Number(b.treatment) - Number(a.treatment)))
  return out.slice(0, 4).map(({ _subj, ...g }) => g)
}

export interface DiseaseSection { section: string; text: string; url: string | null; portal: string }

// 질병명으로 코퍼스(질병청 콘텐츠) 섹션 조회. 동의어(온톨로지) 확장 검색 — 예: 제2형당뇨↔당뇨병.
export async function fetchDiseaseInfo(name: string): Promise<DiseaseSection[] | null> {
  // 검색어 = 입력 + 정규화 동의어. 단 '같은 질병 계열'만(입력명을 포함하거나 입력명에 포함되는 것).
  // 간염 같은 umbrella는 변형에 형제질병명(a형/c형간염)이 섞여 있어, 그대로 쓰면 다른 질병이 혼입됨.
  const entry = normalizeTerm(name)
  const nn = nospace(name)
  const terms = [...new Set([name, ...(entry ? [entry.canonical, ...entry.variants] : [])])]
    .filter((s) => s && s.length >= 2 && !s.includes(','))
    .filter((s) => { const sn = nospace(s); return sn.includes(nn) || nn.includes(sn) })
    .slice(0, 5)
  if (!supabase) return staticDiseaseInfo(terms)
  try {
    const orFilter = terms.map((s) => `title.ilike.%${s}%`).join(',')
    const { data: docsRaw } = await supabase.from('source_doc').select('id,title,url,portal').or(orFilter).limit(6)
    const docs = narrowToOneDisease((docsRaw ?? []) as { id: number; title: string; url: string | null; portal: string }[], terms)
    if (!docs.length) return staticDiseaseInfo(terms)
    const ids = docs.map((d) => d.id)
    const { data: chunks } = await supabase.from('chunk').select('text,source_span,source_doc_id').in('source_doc_id', ids).limit(12)
    const docMap = new Map(docs.map((d) => [d.id, d]))
    const sup = (chunks ?? []).map((c) => {
      const span = c.source_span as { section?: string } | null
      const d = docMap.get(c.source_doc_id as number)
      return { section: span?.section ?? '', text: c.text as string, url: d?.url ?? null, portal: d?.portal ?? '' }
    })
    return sup.length ? sup : staticDiseaseInfo(terms)
  } catch {
    return staticDiseaseInfo(terms)
  }
}

// 정적 코퍼스(KDCA) 질병정보 — Supabase 미스/오프라인 폴백.
function staticDiseaseInfo(terms: string[]): DiseaseSection[] {
  return staticDocs(terms).flatMap((d) => d.chunks.map((c) => ({ section: c.section, text: c.text, url: KDCA_URL, portal: d.portal })))
}
