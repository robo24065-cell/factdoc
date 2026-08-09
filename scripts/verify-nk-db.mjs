// 스키마·적재 검증 하니스 — 실 Supabase 없이 전 과정을 재현한다
//
// 왜 필요한가: 사용자 지시 "데이터가 쌓이고 난 다음에는 건들수가없으니" —
// 스키마는 적재 전에 확정돼야 하는데, 원격 DB가 없다고 검증을 미루면 확정을 못 한다.
// PGlite(WASM PostgreSQL 16)에 같은 마이그레이션·같은 적재 코드를 그대로 돌려
// ① 마이그레이션이 실제로 적용되는지 ② 12,690건이 제약 위반 없이 들어가는지
// ③ 설계 불변식(frozen 사유 필수 / 뉴스는 근거 불가 / as-of 문구)이 DB 차원에서 지켜지는지 확인한다.
//
//   node scripts/verify-nk-db.mjs

import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite/vector'
import { ltree } from '@electric-sql/pglite/contrib/ltree'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { loadAll, readIndex } from './load-nk-db.mjs'

const ROOT = path.resolve('.')
const sql = f => fs.readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8')

let pass = 0, fail = 0
const results = []
async function check(name, fn) {
  try {
    const detail = await fn()
    pass++; results.push(['✅', name, detail ?? ''])
  } catch (e) {
    fail++; results.push(['❌', name, e.message.split('\n')[0].slice(0, 120)])
  }
}
const eq = (got, want, what) => {
  if (String(got) !== String(want)) throw new Error(`${what}: ${got} ≠ ${want}`)
  return `${what}=${got}`
}
/** 제약이 '실제로 거부하는지' 확인 — 통과해버리면 그게 실패다 */
async function mustReject(db, stmt, expect) {
  try { await db.query(stmt) } catch (e) {
    if (expect && !e.message.includes(expect)) throw new Error(`거부됐으나 사유가 다름: ${e.message.slice(0, 80)}`)
    return '거부됨'
  }
  throw new Error('거부되지 않음 — 제약이 작동하지 않는다')
}

console.log('PGlite(PostgreSQL 16) 인메모리 인스턴스 기동…')
const db = new PGlite({ extensions: { vector, ltree, pg_trgm } })
await db.query('select 1')

console.log('마이그레이션 적용…')
await db.exec(sql('0011_nk_tree.sql'))
await db.exec(sql('0012_verify_layer.sql'))
console.log('  0011_nk_tree.sql / 0012_verify_layer.sql OK\n')

console.log('적재…')
const data = readIndex()
const stats = await loadAll(db, data, { log: m => process.stdout.write(m.trimEnd() + '\n') })
console.log(`  ${stats.seconds}s\n`)

const one = async (q, p) => (await db.query(q, p)).rows[0]

// ── 1. 적재 무결성 ─────────────────────────────────────────
await check('레코드 수가 인덱스와 일치', async () =>
  eq((await one('select count(*) n from record')).n, data.records.length, 'record'))
await check('수치 수가 인덱스와 일치', async () =>
  eq((await one('select count(*) n from measure')).n, data.measures.length, 'measure'))
await check('엔티티 수가 인덱스와 일치', async () =>
  eq((await one('select count(*) n from entity')).n, data.entities.length, 'entity'))
await check('as_of NULL 레코드 없음', async () =>
  eq((await one('select count(*) n from record where as_of is null or coverage_end is null')).n, 0, 'null'))
await check('고아 measure 없음 (FK)', async () =>
  eq((await one('select count(*) n from measure m left join record r on r.id=m.record_id where r.id is null')).n, 0, 'orphan'))

// ── 2. 설계 불변식을 DB가 강제하는가 ────────────────────────
await check("frozen인데 사유 없으면 거부", () => mustReject(db,
  `insert into dataset (id,name,origin,as_of,coverage_end,freshness)
   values ('__bad','불량','file','2020-01-01','2020-01-01','frozen')`, 'frozen_needs_reason'))

await check("record.kind='news'는 존재할 수 없음", () => mustReject(db,
  `insert into record (dataset_id,kind,topic,title,as_of,coverage_end,freshness)
   values ((select id from dataset limit 1),'news','media.news','뉴스','2026-01-01','2026-01-01','live')`))

await check('verdict_citation.record_id는 record만 참조', async () => {
  const r = await one(`
    select ccu.table_name tgt
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.table_name='verdict_citation' and tc.constraint_type='FOREIGN KEY' and kcu.column_name='record_id'`)
  return eq(r?.tgt, 'record', '참조대상')
})
await check('verdict_citation에 news_id 컬럼 자체가 없음', async () =>
  eq((await one(`select count(*) n from information_schema.columns
                 where table_name='verdict_citation' and column_name like '%news%'`)).n, 0, 'news컬럼'))

// ── 3. as-of 문구를 DB가 생성하는가 ─────────────────────────
await check('frozen → "존재하지 않습니다"', async () => {
  const r = await one(`select level, notice from asof_notice(
      (select id from record where freshness='frozen' and topic <@ 'econ.kaesong' limit 1), date '2026-08-10')`)
  eq(r.level, 'frozen', 'level')
  if (!r.notice.includes('존재하지 않습니다')) throw new Error('문구 불일치: ' + r.notice)
  if (!r.notice.includes('개성공단')) throw new Error('사유 누락: ' + r.notice)
  return r.notice.slice(0, 48) + '…'
})
await check('stale → "이후 상황은 확인되지 않습니다"', async () => {
  const r = await one(`select level, notice from asof_notice(
      (select id from record where freshness='stale' order by coverage_end limit 1), date '2026-08-10')`)
  if (!r.notice.includes('이후 상황은 확인되지 않습니다')) throw new Error('문구 불일치: ' + r.notice)
  return r.notice.slice(0, 48) + '…'
})
await check('live + 최근 → "최신 자료입니다"', async () => {
  const r = await one(`select notice from asof_notice(
      (select id from record where freshness='live' order by coverage_end desc limit 1),
      (select coverage_end from record where freshness='live' order by coverage_end desc limit 1))`)
  if (!r.notice.includes('최신 자료입니다')) throw new Error('문구 불일치: ' + r.notice)
  return r.notice
})

// ── 4. 트리·뷰가 실제로 답을 내는가 ─────────────────────────
await check('ltree 롤업 — econ 하위 전체 집계', async () => {
  const r = await one(`select records, frozen_records from topic_stats where slug='econ'`)
  if (Number(r.records) < 100) throw new Error('롤업이 하위 주제를 못 모음: ' + r.records)
  return `econ 하위 ${Number(r.records).toLocaleString()}건 (frozen ${r.frozen_records})`
})
await check('record_latest — fact_key 중복 제거', async () => {
  const all = (await one('select count(*) n from record')).n
  const latest = (await one('select count(*) n from record_latest')).n
  const keys = (await one(`select count(distinct coalesce(fact_key, id::text)) n from record`)).n
  return eq(latest, keys, `latest(${latest})=고유factKey`) + ` / 전체 ${Number(all).toLocaleString()}`
})
await check('dims 집계 — 탈북민 연령대별 분포', async () => {
  const r = await db.query(`
    select m.dims->>'연령대' age, sum(m.value)::bigint v
    from measure m
    where m.dims ? '연령대' and (m.dims->>'성별') = '전체'
    group by 1 order by v desc limit 3`)
  if (!r.rows.length) throw new Error('차원 집계 결과 없음')
  return r.rows.map(x => `${x.age} ${Number(x.v).toLocaleString()}`).join(' · ')
})
await check('전문검색 — tsvector 인덱스로 조회', async () => {
  const r = await one(`select count(*) n from record where search @@ plainto_tsquery('simple','개성공단')`)
  if (Number(r.n) < 10) throw new Error('검색 결과 부족: ' + r.n)
  return `'개성공단' ${Number(r.n).toLocaleString()}건`
})
await check('trigram — 오타 내성 조회', async () => {
  const r = await one(`select count(*) n from record where title % '금강산관광'`)
  return `'금강산관광' 유사 ${r.n}건`
})

// ── 5. 판정 계층 왕복 (근거는 record만) ─────────────────────
await check('판정 1건 왕복 — 주장→판정→인용(record)', async () => {
  const rec = await one(`select id, title from record where topic <@ 'econ.kaesong' and freshness='frozen' limit 1`)
  await db.query(`insert into news_item (title, url, published_at, publisher, relevance) values ($1,$2,$3,$4,$5)`,
    ['개성공단 재가동 임박?', 'https://example.test/1', '2026-08-01', '테스트매체', 'strong'])
  const news = await one('select id from news_item limit 1')
  const cl = await one(`insert into claim (text, origin, news_id, topic)
                        values ('개성공단이 지금도 돌아간다','news',$1,'econ.kaesong') returning id`, [news.id])
  const vd = await one(`insert into verdict (claim_id, level, basis, tier, asof_level)
                        values ($1,'differs','record','auto','frozen') returning id`, [cl.id])
  await db.query(`insert into verdict_citation (verdict_id, record_id, quote, stance)
                  values ($1,$2,$3,'contradicts')`, [vd.id, rec.id, rec.title])
  await db.query(`insert into verdict_related_news (verdict_id, news_id) values ($1,$2)`, [vd.id, news.id])
  const j = await one(`select v.level, r.title src, count(n.news_id) news
                       from verdict v
                       join verdict_citation c on c.verdict_id = v.id
                       join record r on r.id = c.record_id
                       left join verdict_related_news n on n.verdict_id = v.id
                       where v.id=$1 group by v.level, r.title`, [vd.id])
  return `${j.level} · 근거="${j.src.slice(0, 24)}…" · 관련뉴스 ${j.news}건`
})

// ── 출력 ────────────────────────────────────────────────────
const W = Math.max(...results.map(r => r[1].length))
console.log('═'.repeat(78))
for (const [m, n, d] of results) console.log(`${m} ${n.padEnd(W)}  ${d}`)
console.log('═'.repeat(78))
console.log(` 스키마·적재 검증  ${pass}/${pass + fail} 통과  (${((pass / (pass + fail)) * 100).toFixed(0)}%)`)
console.log('═'.repeat(78))
await db.close()
process.exit(fail ? 1 : 0)
