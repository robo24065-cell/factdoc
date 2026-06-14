// 임의 SQL 조회 헬퍼: SUPABASE_DB_URL=... node scripts/q.mjs "select ..."
import pg from 'pg'
const url = process.env.SUPABASE_DB_URL
const sql = process.argv[2]
if (!url || !sql) { console.error('usage: SUPABASE_DB_URL=... node scripts/q.mjs "<sql>"'); process.exit(1) }
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
const r = await c.query(sql)
console.log(JSON.stringify(r.rows, null, 2))
await c.end()
