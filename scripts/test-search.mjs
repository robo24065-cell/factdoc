// 시맨틱 캐시·하이브리드 검색 RPC 동작 검증
// 사용: GEMINI_API_KEY=... SUPABASE_DB_URL=... node scripts/test-search.mjs "당뇨 완치된다는데 진짜?"
import pg from 'pg'

const GK = process.env.GEMINI_API_KEY
const DB = process.env.SUPABASE_DB_URL
const query = process.argv[2] || '당뇨는 완치되나요'
if (!GK || !DB) { console.error('GEMINI_API_KEY, SUPABASE_DB_URL 필요'); process.exit(1) }

async function embed(text) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GK}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: { parts: [{ text }] }, outputDimensionality: 1024 }),
  })
  const d = await res.json()
  if (!d?.embedding?.values) throw new Error(JSON.stringify(d).slice(0, 200))
  return `[${d.embedding.values.join(',')}]`
}

const c = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await c.connect()
const v = await embed(query)

console.log(`\n=== 시맨틱 캐시 match_verdict_cache("${query}", thr=0.5) ===`)
const m = await c.query('select canonical_claim, verdict, round(similarity::numeric,3) sim from match_verdict_cache($1, 0.5, true)', [v])
console.log(m.rows.length ? m.rows : '(매칭 없음)')

console.log(`\n=== 하이브리드 search_chunks_hybrid("${query}", k=3) ===`)
const s = await c.query('select title, round(score::numeric,4) score, left(text,70) snippet from search_chunks_hybrid($1, $2, 3)', [v, query])
for (const r of s.rows) console.log(`  [${r.score}] ${r.title ?? ''} — ${r.snippet}`)

await c.end()
process.exit(0)
