// nk-index.json → Postgres (topic/dataset/record/measure/entity/entity_alias/record_entity)
//
// 어떤 Postgres에도 동일하게 적재된다 — Supabase(pg) / PGlite(검증용) 둘 다 같은 코드 경로를 쓴다.
// 그래야 "검증은 통과했는데 실제 DB에선 깨지는" 상황이 생기지 않는다.
//
//   실사용:  node scripts/load-nk-db.mjs            (api.txt의 SUPABASE_DB_URL 사용)
//   검증:    node scripts/verify-nk-db.mjs          (PGlite 인메모리)

import fs from 'node:fs'
import path from 'node:path'

const INDEX = path.resolve('frontend/src/data/nk-index.json')

// 확장 질의 프로토콜의 파라미터 개수는 Int16 — 32,767을 넘으면 음수로 읽혀 깨진다.
// 행당 컬럼 수로 배치 크기를 역산하되 여유를 둔다.
const MAX_PARAMS = 20000
const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o }

/** 다중행 INSERT — ($1,$2,…),($3,$4,…) 형태로 묶어 왕복 횟수를 줄인다 */
async function insertRows(client, table, cols, rows, { conflict = '', log } = {}) {
  if (!rows.length) return 0
  const per = Math.max(1, Math.floor(MAX_PARAMS / cols.length))
  let done = 0
  for (const part of chunk(rows, per)) {
    const params = []
    const values = part.map(r => {
      const ph = r.map(v => { params.push(v); return '$' + params.length })
      return '(' + ph.join(',') + ')'
    }).join(',')
    await client.query(
      `insert into ${table} (${cols.join(',')}) values ${values} ${conflict}`,
      params,
    )
    done += part.length
    if (log && rows.length > per) log(`    ${table} ${done.toLocaleString()}/${rows.length.toLocaleString()}`)
  }
  return done
}

export function readIndex(file = INDEX) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export async function loadAll(client, d, { log = console.log, truncate = true } = {}) {
  const t0 = Date.now()
  const stats = {}

  if (truncate) {
    // record_entity/measure는 CASCADE로 함께 비워진다. topic은 스키마 시드라 유지.
    await client.query('truncate record, entity restart identity cascade')
    await client.query('delete from dataset')
    log('  기존 데이터 비움')
  }

  // ── 1. 주제 (스키마 시드에 없는 항목 보충) ──────────────────
  const topics = Object.entries(d.topics || {}).map(([slug, label]) => [slug, label])
  stats.topics = await insertRows(client, 'topic', ['slug', 'label'], topics,
    { conflict: 'on conflict (slug) do nothing' })

  // ── 2. 데이터셋 ────────────────────────────────────────────
  const dsRows = Object.entries(d.datasets).map(([id, v]) => ([
    id, v.name, v.provider || '통일부', v.url || null,
    v.origin || 'file', v.topic || null,
    v.asOf, v.coverageStart || null, v.coverageEnd,
    v.freshness, v.frozenReason || null,
    v.updateCycle || null, v.note || null,
    v.status || 'ready', v.searchPriority ?? 50,
  ]))
  stats.datasets = await insertRows(client, 'dataset', [
    'id', 'name', 'provider', 'source_url', 'origin', 'topic',
    'as_of', 'coverage_start', 'coverage_end', 'freshness', 'frozen_reason',
    'update_cycle', 'note', 'status', 'search_priority',
  ], dsRows)
  log(`  dataset ${stats.datasets}종`)

  // ── 3. 레코드 (인덱스 id를 그대로 PK로 — measure/record_entity가 이 id를 참조) ──
  const recRows = d.records.map(r => ([
    r.id, r.datasetId, r.factKey || null, r.kind, r.topic,
    r.title, r.body || null,
    r.occurredOn || null, r.periodStart || null, r.periodEnd || null,
    r.asOf, r.coverageEnd, r.freshness,
    r.sourceUrl || null,
  ]))
  stats.records = await insertRows(client, 'record', [
    'id', 'dataset_id', 'fact_key', 'kind', 'topic',
    'title', 'body', 'occurred_on', 'period_start', 'period_end',
    'as_of', 'coverage_end', 'freshness', 'source_url',
  ], recRows, { log })
  await client.query("select setval(pg_get_serial_sequence('record','id'), (select coalesce(max(id),1) from record))")
  log(`  record ${stats.records.toLocaleString()}건`)

  // ── 4. 수치 ────────────────────────────────────────────────
  const mRows = d.measures.map(m => ([
    m.recordId, m.metric, m.metricSlug || m.metric,
    m.value, m.unit || null,
    m.periodStart || null, m.periodEnd || null, m.asOf,
    m.dims ? JSON.stringify(m.dims) : null,
  ]))
  stats.measures = await insertRows(client, 'measure', [
    'record_id', 'metric', 'metric_slug', 'value', 'unit',
    'period_start', 'period_end', 'as_of', 'dims',
  ], mRows, { log })
  log(`  measure ${stats.measures.toLocaleString()}건`)

  // ── 5. 엔티티 + 별칭 ───────────────────────────────────────
  const entRows = d.entities.map((e, i) => ([
    i + 1, e.slug, e.name, e.type, e.attrs ? JSON.stringify(e.attrs) : null,
  ]))
  stats.entities = await insertRows(client, 'entity',
    ['id', 'slug', 'name', 'type', 'attrs'], entRows)
  await client.query("select setval(pg_get_serial_sequence('entity','id'), (select coalesce(max(id),1) from entity))")

  // aliases는 {alias, kind} 객체 배열 — kind가 남북 표기 대응(nk_term/sk_term)을 구분한다
  const aliasRows = []
  d.entities.forEach((e, i) => {
    const seenAlias = new Set()
    for (const a of e.aliases || []) {
      const text = typeof a === 'string' ? a : a?.alias
      if (!text || text === e.name || seenAlias.has(text)) continue
      seenAlias.add(text)
      aliasRows.push([i + 1, text, typeof a === 'string' ? null : (a.kind || null)])
    }
  })
  stats.aliases = await insertRows(client, 'entity_alias',
    ['entity_id', 'alias', 'kind'], aliasRows, { conflict: 'on conflict do nothing' })
  log(`  entity ${stats.entities}개 · alias ${stats.aliases}개`)

  // ── 6. 레코드↔엔티티 ───────────────────────────────────────
  // record.entities는 표기 문자열 — slug → name → alias 순으로 해석한다
  const byKey = new Map()
  d.entities.forEach((e, i) => {
    byKey.set(e.slug, i + 1)
    if (!byKey.has(e.name)) byKey.set(e.name, i + 1)
    for (const a of e.aliases || []) {
      const text = typeof a === 'string' ? a : a?.alias
      if (text && !byKey.has(text)) byKey.set(text, i + 1)
    }
  })
  const reRows = []
  const seen = new Set()
  let unresolved = 0
  for (const r of d.records) {
    for (const key of r.entities || []) {
      const eid = byKey.get(key)
      if (!eid) { unresolved++; continue }
      const k = r.id + ':' + eid
      if (seen.has(k)) continue
      seen.add(k)
      reRows.push([r.id, eid, 'mention'])
    }
  }
  stats.recordEntity = await insertRows(client, 'record_entity',
    ['record_id', 'entity_id', 'role'], reRows, { conflict: 'on conflict do nothing', log })
  log(`  record_entity ${stats.recordEntity.toLocaleString()}건${unresolved ? ` (미해석 표기 ${unresolved}건)` : ''}`)

  stats.seconds = ((Date.now() - t0) / 1000).toFixed(1)
  return stats
}

// ── CLI (실 Supabase) ────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('load-nk-db.mjs')) {
  const { loadEnv } = await import('./nk-env.mjs')
  loadEnv(path.resolve('api.txt'))
  const url = process.env.SUPABASE_DB_URL
  if (!url) { console.error('SUPABASE_DB_URL 없음 (api.txt 확인)'); process.exit(1) }

  const pg = (await import('pg')).default
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 })
  try {
    await client.connect()
  } catch (e) {
    console.error('DB 연결 실패:', e.message)
    console.error('→ Supabase 프로젝트가 일시정지/삭제됐거나 접속정보가 만료됐을 수 있습니다.')
    process.exit(1)
  }
  try {
    for (const f of ['supabase/migrations/0011_nk_tree.sql', 'supabase/migrations/0012_verify_layer.sql']) {
      await client.query(fs.readFileSync(path.resolve(f), 'utf8'))
      console.log('  마이그레이션 적용:', path.basename(f))
    }
    const s = await loadAll(client, readIndex())
    console.log(`\n적재 완료 (${s.seconds}s)`)
  } catch (e) {
    console.error('적재 실패:', e.message)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}
