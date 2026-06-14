// 감염병포털 '감염병별 발생현황' → outbreak_trend (배치, 전년 대비 추세 포함)
// 사용: DATA_GO_KR_API_KEY=... SUPABASE_DB_URL=... node scripts/fetch-outbreak.mjs
// 정의서: resType=2(json), searchType=1(발생수), searchYear, patntType=1(전체). EIDAPIService/Disease
import pg from 'pg'

const KEY = process.env.DATA_GO_KR_API_KEY
const DB = process.env.SUPABASE_DB_URL
if (!KEY || !DB) { console.error('DATA_GO_KR_API_KEY, SUPABASE_DB_URL 필요'); process.exit(1) }

const E = 'https://apis.data.go.kr/1790387/EIDAPIService'
const YEAR = process.env.OUTBREAK_YEAR ?? '2024'
const PREV = String(Number(YEAR) - 1)
const TOPN = Number(process.env.OUTBREAK_TOPN ?? 10)

async function fetchDisease(year) {
  const url = `${E}/Disease?serviceKey=${encodeURIComponent(KEY)}&resType=2&searchType=1&searchYear=${year}&patntType=1&pageNo=1&numOfRows=100`
  const res = await fetch(url)
  const data = await res.json()
  const code = data?.response?.header?.resultCode
  if (code !== '00') throw new Error(`${year} 오류 ${code}: ${data?.response?.header?.resultMsg}`)
  const items = data.response.body.items?.item ?? []
  const arr = Array.isArray(items) ? items : [items]
  const m = {}
  for (const it of arr) m[it.icdNm] = Number(it.resultVal) || 0
  return m
}

const cur = await fetchDisease(YEAR)
let prev = {}
try { prev = await fetchDisease(PREV) } catch { /* 전년 없으면 추세 flat */ }

const rows = Object.entries(cur)
  .map(([disease, count]) => {
    const p = prev[disease] ?? 0
    return { disease, period: `${YEAR}년`, case_count: count, trend: count > p ? 'up' : count < p ? 'down' : 'flat' }
  })
  .filter((r) => r.case_count > 0)
  .sort((a, b) => b.case_count - a.case_count)
  .slice(0, TOPN)

if (rows.length === 0) { console.error('발생수 > 0 데이터 없음'); process.exit(1) }

const c = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  await c.query('BEGIN')
  await c.query('truncate outbreak_trend restart identity')
  for (const r of rows) {
    await c.query('insert into outbreak_trend(disease,period,case_count,trend) values($1,$2,$3,$4)', [r.disease, r.period, r.case_count, r.trend])
  }
  await c.query('COMMIT')
  console.log(`outbreak_trend 적재 ${rows.length}건 (${YEAR}, 전년 대비 추세)`)
  for (const r of rows) console.log(`  ${r.trend === 'up' ? '▲' : r.trend === 'down' ? '▼' : '—'} ${r.disease}: ${r.case_count.toLocaleString()}`)
} catch (e) {
  try { await c.query('ROLLBACK') } catch { /* ignore */ }
  console.error('FAIL:', e.message); process.exitCode = 1
} finally {
  await c.end()
  process.exit(process.exitCode ?? 0)
}
