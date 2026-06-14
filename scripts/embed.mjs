// 청크 임베딩 (Gemini embedding-001, 1024d) → chunk.embedding + HNSW + 의미검색
// 임베딩:  GEMINI_API_KEY=... SUPABASE_DB_URL=... node scripts/embed.mjs
// 의미검색: GEMINI_API_KEY=... SUPABASE_DB_URL=... node scripts/embed.mjs "검색어"
// 참고: CLAUDE.md는 BGE-m3(로컬)를 코어로 지정 — 대규모 코퍼스 단계에서 교체. W1은 Gemini 1024d(무료·무다운로드).
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

const search = process.argv[2]
if (search) {
  const q = await embed(search)
  const { rows } = await c.query(
    'select text, round((embedding <=> $1::vector)::numeric, 3) as dist from chunk where embedding is not null order by embedding <=> $1::vector limit 3',
    [q],
  )
  console.log(`의미검색 "${search}":`)
  for (const r of rows) console.log(`  [${r.dist}] ${r.text}`)
  await c.end()
  process.exit(0)
}

const { rows } = await c.query('select id, text from chunk where embedding is null')
let n = 0
for (const r of rows) {
  try {
    const v = await embed(r.text)
    await c.query('update chunk set embedding = $1::vector where id = $2', [v, r.id])
    n++
  } catch (e) {
    console.error('embed 실패 id', r.id, e.message)
  }
}
await c.query('create index if not exists chunk_embedding_hnsw on chunk using hnsw (embedding vector_cosine_ops)')
console.log(`임베딩 완료: ${n}개 청크`)
await c.end()
process.exit(0)
