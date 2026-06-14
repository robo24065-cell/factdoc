// 코퍼스 적재 파이프라인: 문서 → 청크(받침② source_span) → 규칙기반 트리플(tier=자동·미검증) → DB
// 사용: SUPABASE_DB_URL='postgresql://...' npx tsx scripts/ingest.ts
// 임베딩(BGE-m3)은 별도 배치(여기선 텍스트+tsvector 전문검색만 적재, embedding=null).
import pg from 'pg'
import { readFileSync, readdirSync } from 'node:fs'
import { parseClaim } from '../frontend/src/engine/parse'

const url = process.env.SUPABASE_DB_URL
if (!url) { console.error('SUPABASE_DB_URL required'); process.exit(1) }

const dir = new URL('../corpus/', import.meta.url)
const files = readdirSync(dir).filter((f) => f.endsWith('.md') || f.endsWith('.txt'))
if (files.length === 0) { console.error('corpus/ 에 문서가 없습니다.'); process.exit(1) }

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  await c.query('BEGIN')
  let docs = 0, chunks = 0, triples = 0
  for (const f of files) {
    const text = readFileSync(new URL(f, dir), 'utf8')
    const r = await c.query(
      'insert into source_doc(portal,title,license) values($1,$2,$3) returning id',
      ['샘플 코퍼스(예시)', f, 'sample'],
    )
    const docId = r.rows[0].id as number
    docs++

    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('>'))
    let cursor = 0
    for (const line of lines) {
      const start = text.indexOf(line, cursor)
      cursor = start + line.length
      const cr = await c.query(
        "insert into chunk(source_doc_id,text,tsv,source_span,evidence_level) values($1,$2,to_tsvector('simple',$2),$3::jsonb,$4) returning id",
        [docId, line, JSON.stringify({ char_start: start, char_end: cursor }), 'limited'],
      )
      const chunkId = cr.rows[0].id as number
      chunks++

      for (const t of parseClaim(line)) {
        if (t.subject === '(미상)') continue // 주체 불명은 적재 제외
        await c.query(
          "insert into claim_triple(subject,relation,object_disease,evidence_level,strength,source_doc_id,chunk_id,tier) values($1,$2::relation_t,$3,'limited'::evidence_level_t,$4::strength_t,$5,$6,'auto_unverified'::tier_t)",
          [t.subject, t.relation, t.objectDisease, t.strength, docId, chunkId],
        )
        triples++
      }
    }
  }
  await c.query('COMMIT')
  console.log(`적재: 문서 ${docs} · 청크 ${chunks} · 자동추출 트리플 ${triples}(tier=자동·미검증)`)
} catch (e) {
  try { await c.query('ROLLBACK') } catch { /* ignore */ }
  console.error('FAIL:', e instanceof Error ? e.message : String(e))
  process.exitCode = 1
} finally {
  await c.end()
}
