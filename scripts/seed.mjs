// 참조 데이터 시드 (W1) — 엔진 시드(claimGraph/ontology)를 Supabase에 적재
// 사용: SUPABASE_DB_URL='postgresql://...' node scripts/seed.mjs
import pg from 'pg'

const url = process.env.SUPABASE_DB_URL
if (!url) { console.error('SUPABASE_DB_URL required'); process.exit(1) }

const SOURCES = [
  { portal: '질병관리청 국가건강정보포털', title: '당뇨병·고혈압 표준 치료·관리', url: 'https://health.kdca.go.kr', license: 'KOGL-4' },
  { portal: '질병관리청 국민건강영양조사(KNHANES)', title: '당뇨 위험요인 통계', url: 'https://knhanes.kdca.go.kr', license: 'KOGL-4' },
  { portal: '질병관리청 감염병포털', title: '인플루엔자 예방접종 권고', url: 'https://dportal.kdca.go.kr', license: 'KOGL-4' },
  { portal: '식품의약품안전처 건강기능식품', title: '홍삼 인정 기능성 / 기능성 인정 범위', url: 'https://www.foodsafetykorea.go.kr', license: 'MFDS-open' },
]

const ONTOLOGY = [
  { c: '제2형당뇨', v: ['당뇨', '당뇨병', '성인당뇨', '제2형 당뇨병', '혈당병', 't2dm'], t: 'disease' },
  { c: '고혈압', v: ['혈압', '고혈압증', 'hypertension'], t: 'disease' },
  { c: '혈당조절', v: ['혈당', '공복혈당', '당화혈색소', 'hba1c', '식후혈당'], t: 'disease' },
  { c: '면역기능', v: ['면역', '면역력', '면역증진'], t: 'disease' },
  { c: '인플루엔자', v: ['독감', '계절독감', 'flu'], t: 'disease' },
  { c: '건강기능식품', v: ['건기식', '보조제', '영양제', '건강식품'], t: 'subject' },
  { c: '홍삼', v: ['홍삼농축액', '홍삼정', '고려홍삼', 'red ginseng'], t: 'subject' },
  { c: '여주', v: ['여주즙', '여주차', '비터멜론', 'bitter melon'], t: 'subject' },
  { c: '돼지감자', v: ['뚱딴지', '돼지감자즙'], t: 'subject' },
  { c: '메트포르민', v: ['메트포민', 'metformin'], t: 'subject' },
  { c: '인슐린', v: ['insulin', '인슐린주사', '기저인슐린'], t: 'subject' },
  { c: '인플루엔자백신', v: ['독감백신', '독감주사', '인플루엔자 예방접종', '독감 예방접종'], t: 'subject' },
  { c: '나트륨', v: ['소금', '짠 음식', '짜게', '염분'], t: 'subject' },
  { c: '식이요법', v: ['식단관리', '식사조절', '당뇨식', '저당식', '저염식'], t: 'subject' },
  { c: '운동요법', v: ['걷기운동', '걷기', '유산소운동', '운동', '신체활동'], t: 'subject' },
]

const TRIPLES = [
  ['인슐린', 'manages', '제2형당뇨', 'official_guideline', 'strong', '질병관리청 국가건강정보포털'],
  ['메트포르민', 'manages', '제2형당뇨', 'official_guideline', 'strong', '질병관리청 국가건강정보포털'],
  ['식이요법', 'manages', '제2형당뇨', 'official_guideline', 'strong', '질병관리청 국가건강정보포털'],
  ['운동요법', 'manages', '제2형당뇨', 'official_guideline', 'moderate', '질병관리청 국가건강정보포털'],
  ['운동요법', 'reduces_risk', '제2형당뇨', 'statistics', 'moderate', '질병관리청 국민건강영양조사(KNHANES)'],
  ['식이요법', 'manages', '고혈압', 'official_guideline', 'strong', '질병관리청 국가건강정보포털'],
  ['운동요법', 'manages', '고혈압', 'official_guideline', 'moderate', '질병관리청 국가건강정보포털'],
  ['나트륨', 'increases_risk', '고혈압', 'official_guideline', 'strong', '질병관리청 국가건강정보포털'],
  ['인플루엔자백신', 'prevents', '인플루엔자', 'official_guideline', 'strong', '질병관리청 감염병포털'],
  ['인플루엔자백신', 'reduces_risk', '인플루엔자', 'statistics', 'moderate', '질병관리청 감염병포털'],
  ['홍삼', 'manages', '면역기능', 'mfds_approved', 'moderate', '식품의약품안전처 건강기능식품'],
]

const COVERAGE = [
  ['당뇨', true, 5], ['고혈압', true, 3], ['감염병/백신', true, 2], ['건강기능식품', true, 1], ['희귀질환 민간요법', false, 0],
]

const OUTBREAK = [
  ['인플루엔자', '2026-W24', 6100, 'up'], ['코로나19', '2026-W24', 2700, 'up'], ['수족구병', '2026-W24', 900, 'flat'],
]

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  await c.query('BEGIN')
  await c.query('truncate claim_triple, mfds_rule, coverage_map, ontology_term, outbreak_trend, source_doc restart identity cascade')

  const portalId = {}
  for (const s of SOURCES) {
    const r = await c.query('insert into source_doc(portal,title,url,license) values($1,$2,$3,$4) returning id', [s.portal, s.title, s.url, s.license])
    portalId[s.portal] = r.rows[0].id
  }
  for (const o of ONTOLOGY) {
    await c.query('insert into ontology_term(canonical,variants,term_type) values($1,$2,$3)', [o.c, o.v, o.t])
  }
  for (const [subject, relation, disease, ev, strength, portal] of TRIPLES) {
    await c.query(
      'insert into claim_triple(subject,relation,object_disease,evidence_level,strength,source_doc_id,tier) values($1,$2::relation_t,$3,$4::evidence_level_t,$5::strength_t,$6,$7::tier_t)',
      [subject, relation, disease, ev, strength, portalId[portal] ?? null, 'verified'],
    )
  }
  await c.query(
    'insert into mfds_rule(ingredient,approved_function,disease_treatment_allowed,source_doc_id,note) values($1,$2,$3,$4,$5)',
    ['(전체 식품·건기식)', '질병위험감소·생리활성·영양소기능 3종 한정', false, portalId['식품의약품안전처 건강기능식품'] ?? null, '질병 치료·예방 표방 불가'],
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
  console.error('FAIL:', e.message)
  process.exitCode = 1
} finally {
  await c.end()
}
