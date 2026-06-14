// 감염병포털 발생현황 → outbreak_trend (배치)
// 사용: DATA_GO_KR_API_KEY=... SUPABASE_DB_URL=... node scripts/fetch-outbreak.mjs
// 엔드포인트: https://apis.data.go.kr/1790387/EIDAPIService  오퍼레이션: /Disease /PeriodBasic /Age 등
// ⚠ 요청변수(연도/주차 등)는 '전수신고 감염병 발생현황 API 인터페이스 정의서_v.1.0.xlsx' 참조.
//   필요 시 OUTBREAK_OP(기본 Disease), OUTBREAK_PARAMS('std_yr=2025&std_wk=20' 형태)로 주입.
import pg from 'pg'

const KEY = process.env.DATA_GO_KR_API_KEY
const DB = process.env.SUPABASE_DB_URL
const ENDPOINT = 'https://apis.data.go.kr/1790387/EIDAPIService'
const OP = process.env.OUTBREAK_OP ?? 'Disease'
const EXTRA = process.env.OUTBREAK_PARAMS ?? ''

if (!KEY || !DB) { console.error('DATA_GO_KR_API_KEY, SUPABASE_DB_URL 필요'); process.exit(1) }

const url = `${ENDPOINT}/${OP}?serviceKey=${encodeURIComponent(KEY)}&pageNo=1&numOfRows=200&returnType=JSON${EXTRA ? '&' + EXTRA : ''}`
const res = await fetch(url)
const body = await res.text()
let data
try { data = JSON.parse(body) } catch { console.error('JSON 아님(원문 일부):', body.slice(0, 400)); process.exit(1) }

const code = data?.header?.resultCode
if (code && code !== '00') {
  console.error(`API 오류 ${code}: ${data.header.resultMsg}`)
  console.error('→ 정의서의 요청변수를 OUTBREAK_PARAMS 로 주입하거나, 오늘 승인 키면 전파(최대 1시간) 후 재시도.')
  process.exit(1)
}

const items = data?.body?.items?.item ?? data?.response?.body?.items?.item ?? data?.items ?? []
const arr = Array.isArray(items) ? items : [items]
const rows = arr.map((it) => ({
  disease: it.dissNm ?? it.diseaseNm ?? it.disease ?? '미상',
  period: it.std_yr ?? it.yr ?? it.std_ym ?? null,
  case_count: Number(it.occrCnt ?? it.cnt ?? it.dthCnt ?? 0) || 0,
  trend: null,
})).filter((r) => r.disease !== '미상')

if (rows.length === 0) { console.error('파싱 0건 — 응답 구조 확인:', JSON.stringify(data).slice(0, 400)); process.exit(1) }

const c = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  await c.query('BEGIN')
  await c.query('truncate outbreak_trend restart identity')
  for (const r of rows) {
    await c.query('insert into outbreak_trend(disease,period,case_count,trend) values($1,$2,$3,$4)', [r.disease, String(r.period ?? ''), r.case_count, r.trend])
  }
  await c.query('COMMIT')
  console.log(`outbreak_trend 적재 ${rows.length}건`)
} catch (e) {
  try { await c.query('ROLLBACK') } catch { /* ignore */ }
  console.error('FAIL:', e.message)
  process.exitCode = 1
} finally {
  await c.end()
}
