// verdict_cache.embedding 백필 (시맨틱 캐시) — canonical_claim 임베딩(Gemini embedding-001, 1024d)
// 사용: GEMINI_API_KEY=... SUPABASE_DB_URL=... node scripts/embed-cache.mjs
import pg from 'pg'

const GK = process.env.GEMINI_API_KEY
const DB = process.env.SUPABASE_DB_URL
if (!GK || !DB) { console.error('GEMINI_API_KEY, SUPABASE_DB_URL 필요'); process.exit(1) }

async function embed(text) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GK}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: { parts: [{ text }] }, outputDimensionality: 1024 }),
  })
  const d = await res.json()
  const v = d?.embedding?.values
  if (!v) throw new Error(JSON.stringify(d).slice(0, 200))
  return `[${v.join(',')}]`
}

const c = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await c.connect()
const { rows } = await c.query('select id, canonical_claim from verdict_cache where embedding is null')
let n = 0
for (const r of rows) {
  try {
    const v = await embed(r.canonical_claim)
    await c.query('update verdict_cache set embedding = $1::vector where id = $2', [v, r.id])
    n++
  } catch (e) {
    console.error('embed 실패 id', r.id, e.message)
  }
}
console.log(`캐시 임베딩 백필 완료: ${n}/${rows.length}`)
await c.end()
process.exit(0)
