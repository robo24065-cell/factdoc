// SQL 파일을 Supabase Postgres에 트랜잭션으로 적용
// 사용: SUPABASE_DB_URL='postgresql://...' node scripts/apply.mjs <sqlfile>
import { readFileSync } from 'node:fs'
import pg from 'pg'

const file = process.argv[2]
const url = process.env.SUPABASE_DB_URL
if (!url || !file) {
  console.error('usage: SUPABASE_DB_URL=... node scripts/apply.mjs <sqlfile>')
  process.exit(1)
}

const sql = readFileSync(file, 'utf8')
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  await client.query('BEGIN')
  await client.query(sql)
  await client.query('COMMIT')
  console.log('OK applied:', file)
} catch (e) {
  try { await client.query('ROLLBACK') } catch { /* ignore */ }
  console.error('FAIL:', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
