// 감염병포털 발생현황 API → outbreak_trend 적재 (배치)
// 사용: DATA_GO_KR_API_KEY=... SUPABASE_DB_URL=... node scripts/fetch-outbreak.mjs
//
// ⚠ 엔드포인트 확인 필요: data.go.kr 15139178(전수신고 감염병 발생현황) 상세페이지의
//    '활용신청 상세기능정보 / API 명세서'에서 실제 요청 URL·오퍼레이션·파라미터명을 확인해
//    ENDPOINT와 파싱 매핑을 맞출 것. (자동조회가 정부포털 렌더링 제약으로 미완.)
//    data.go.kr 표준 패턴: https://apis.data.go.kr/<orgcode>/<service>/<operation>?serviceKey=...&pageNo=1&numOfRows=100&type=json
import pg from 'pg'

const API_KEY = process.env.DATA_GO_KR_API_KEY
const DB_URL = process.env.SUPABASE_DB_URL
const ENDPOINT = process.env.OUTBREAK_ENDPOINT // ← 확인된 엔드포인트를 환경변수로 주입(미설정 시 안전 종료)

if (!DB_URL) { console.error('SUPABASE_DB_URL required'); process.exit(1) }
if (!API_KEY || !ENDPOINT) {
  console.error('DATA_GO_KR_API_KEY 와 OUTBREAK_ENDPOINT(확인된 API URL) 필요. data.go.kr 15139178 명세서 확인 후 OUTBREAK_ENDPOINT 설정.')
  process.exit(1)
}

// 응답 → outbreak_trend 행 매핑(실제 필드명에 맞게 조정 필요)
function mapItem(it) {
  return {
    disease: it.diseaseNm ?? it.dissNm ?? it.disease ?? '미상',
    period: it.yr ? `${it.yr}${it.weekNo ? '-W' + it.weekNo : ''}` : (it.baseYmd ?? null),
    case_count: Number(it.cnt ?? it.occrCnt ?? it.dthCnt ?? 0) || 0,
    trend: null, // 추세는 직전 기간 대비 계산(후속)
  }
}

const url = `${ENDPOINT}${ENDPOINT.includes('?') ? '&' : '?'}serviceKey=${encodeURIComponent(API_KEY)}&pageNo=1&numOfRows=100&type=json`
const res = await fetch(url)
if (!res.ok) { console.error('API 실패:', res.status, await res.text()); process.exit(1) }
const data = await res.json()
const items = data?.response?.body?.items?.item ?? data?.items ?? []
const rows = (Array.isArray(items) ? items : [items]).map(mapItem).filter((r) => r.disease !== '미상')
if (rows.length === 0) { console.error('파싱된 항목 0 — 응답 구조 확인(mapItem 조정).'); process.exit(1) }

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  await c.query('BEGIN')
  await c.query('truncate outbreak_trend restart identity')
  for (const r of rows) {
    await c.query('insert into outbreak_trend(disease,period,case_count,trend) values($1,$2,$3,$4)', [r.disease, r.period, r.case_count, r.trend])
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
