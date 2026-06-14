// 참조 데이터 시드 — 엔진의 CLAIM_GRAPH·ONTOLOGY를 그대로 Supabase에 적재(단일 진실 소스).
// 사용: SUPABASE_DB_URL='postgresql://...' npx tsx scripts/seed.ts
import pg from 'pg'
import { CLAIM_GRAPH } from '../frontend/src/engine/claimGraph'
import { ONTOLOGY } from '../frontend/src/engine/ontology'
import { MFDS_DISEASE_CLAIM_RULE } from '../frontend/src/engine/mfdsRules'

const url = process.env.SUPABASE_DB_URL
if (!url) { console.error('SUPABASE_DB_URL required'); process.exit(1) }

const COVERAGE: [string, boolean, number][] = [
  ['당뇨', true, 5], ['고혈압', true, 3], ['이상지질혈증', true, 2], ['골다공증', true, 2],
  ['감염병/백신', true, 3], ['암 예방', true, 1], ['건강기능식품', true, 4], ['희귀질환 민간요법', false, 0],
]
const OUTBREAK: [string, string, number, string][] = [
  ['인플루엔자', '2026-W24', 6100, 'up'], ['코로나19', '2026-W24', 2700, 'up'], ['수족구병', '2026-W24', 900, 'flat'],
]

const srcKey = (c: { portal: string; title: string }) => `${c.portal}|${c.title}`

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  await c.query('BEGIN')
  await c.query('truncate claim_triple, mfds_rule, coverage_map, ontology_term, outbreak_trend, source_doc restart identity cascade')

  // 고유 출처(citation)별 source_doc
  const idByKey: Record<string, number> = {}
  const seen = new Set<string>()
  for (const e of CLAIM_GRAPH) {
    const k = srcKey(e.citation)
    if (seen.has(k)) continue
    seen.add(k)
    const license = e.citation.portal.includes('식품의약품') ? 'MFDS-open' : 'KOGL-4'
    const r = await c.query(
      'insert into source_doc(portal,title,url,license) values($1,$2,$3,$4) returning id',
      [e.citation.portal, e.citation.title, e.citation.url ?? null, license],
    )
    idByKey[k] = r.rows[0].id
  }

  for (const o of ONTOLOGY) {
    await c.query('insert into ontology_term(canonical,variants,term_type) values($1,$2,$3)', [o.canonical, o.variants, o.type])
  }

  for (const e of CLAIM_GRAPH) {
    await c.query(
      'insert into claim_triple(subject,relation,object_disease,evidence_level,strength,source_doc_id,tier) values($1,$2::relation_t,$3,$4::evidence_level_t,$5::strength_t,$6,$7::tier_t)',
      [e.subject, e.relation, e.objectDisease, e.evidenceLevel, e.strength, idByKey[srcKey(e.citation)] ?? null, 'verified'],
    )
  }

  await c.query(
    'insert into mfds_rule(ingredient,approved_function,disease_treatment_allowed,note) values($1,$2,$3,$4)',
    ['(전체 식품·건기식)', MFDS_DISEASE_CLAIM_RULE.description, false, '질병 치료·예방 표방 불가'],
  )
  for (const [cat, covered, n] of COVERAGE) {
    await c.query('insert into coverage_map(category,covered,doc_count) values($1,$2,$3)', [cat, covered, n])
  }
  for (const [disease, period, n, trend] of OUTBREAK) {
    await c.query('insert into outbreak_trend(disease,period,case_count,trend) values($1,$2,$3,$4)', [disease, period, n, trend])
  }

  await c.query('COMMIT')
  console.log('seeded OK')
} catch (e) {
  try { await c.query('ROLLBACK') } catch { /* ignore */ }
  console.error('FAIL:', e instanceof Error ? e.message : String(e))
  process.exitCode = 1
} finally {
  await c.end()
}
