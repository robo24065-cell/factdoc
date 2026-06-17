// 질병관리청 감염병포털 EDW 대시보드 API → 감염병 현황판 정적 데이터셋(시도×연 + 시도×주).
//   dportal.kdca.go.kr/pot/is/dashboardRegion.do — diseaseCls=코드, yearStartDt/yearEndDt=yyyymmdd,
//     weekFlag=Y(주별·yearStartDt만), population=CNT, occurGbn=CNT, grp=01,02,03, area=01,02.
//     응답 1건에 건수(발생수)+VAL(인구10만명당 발생률) 동시 제공.
//   dashboardCurrentWeek.do — 현재 연/주차.
// data.go.kr 공개API와 달리 EDW는 시도×주·시도×일 제공(공식 대시보드와 동일 소스). 출처: 질병관리청 감염병포털.
// per-request 외부호출 금지(§13.7) → 배치로 미리 구워 frontend/src/data/eid-region.ts 캐시. 인증키 불필요(공개 포털).
// 사용: node scripts/fetch-eid-edw.mjs
import fs from 'node:fs'

const BASE = 'https://dportal.kdca.go.kr/pot/is'
const REF = `${BASE}/dashboardEDW.do`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const TOP_N = 30
const WEEKLY_MIN = 50 // 현재년 발생수 이 이상인 질병만 주별 시도 수집(호출 절감)

const CODES = JSON.parse(fs.readFileSync('scripts/eid-disease-codes.json', 'utf8')) // {code:{name,grp}}
const SIDO = [
  { code: '01', name: '서울', lat: 37.57, lng: 126.98 }, { code: '02', name: '부산', lat: 35.18, lng: 129.08 },
  { code: '03', name: '대구', lat: 35.87, lng: 128.60 }, { code: '04', name: '인천', lat: 37.46, lng: 126.71 },
  { code: '05', name: '광주', lat: 35.16, lng: 126.85 }, { code: '06', name: '대전', lat: 36.35, lng: 127.38 },
  { code: '07', name: '울산', lat: 35.54, lng: 129.31 }, { code: '08', name: '경기', lat: 37.41, lng: 127.52 },
  { code: '09', name: '강원', lat: 37.83, lng: 128.16 }, { code: '10', name: '충북', lat: 36.80, lng: 127.70 },
  { code: '11', name: '충남', lat: 36.52, lng: 126.80 }, { code: '12', name: '전북', lat: 35.72, lng: 127.15 },
  { code: '13', name: '전남', lat: 34.96, lng: 126.99 }, { code: '14', name: '경북', lat: 36.40, lng: 128.89 },
  { code: '15', name: '경남', lat: 35.36, lng: 128.21 }, { code: '16', name: '제주', lat: 33.49, lng: 126.53 },
  { code: '17', name: '세종', lat: 36.56, lng: 127.29 },
]
const X = (lng) => (lng - 125.6) * 64 + 6
const Y = (lat) => (38.8 - lat) * 64 + 6
const num = (v) => Number(String(v ?? '').replace(/,/g, '')) || 0
const sidoCode = (s) => (String(s).trim().match(/^(\d\d)/) || [])[1] // " 08경기" → "08"
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`

async function region({ code, start, end, week }, tries = 0) {
  const p = new URLSearchParams()
  p.set('ymd', String(start).slice(0, 4)); p.set('yearStartDt', start)
  if (!week) p.set('yearEndDt', end)
  p.set('diseaseCls', code); p.set('occurGbn', 'CNT'); p.set('population', 'CNT')
  p.set('infectedArea', ''); p.set('weekFlag', week ? 'Y' : '')
  for (const g of ['01', '02', '03']) p.append('grp', g)
  for (const a of ['01', '02']) p.append('area', a)
  try {
    const r = await fetch(`${BASE}/dashboardRegion.do?${p}`, { headers: { Referer: REF, 'X-Requested-With': 'XMLHttpRequest' } })
    const j = await r.json()
    if (!Array.isArray(j)) return null
    const out = {} // sido → {c:count, v:rate}
    for (const row of j) { const c = sidoCode(row['시도']); if (c) out[c] = { c: num(row['건수']), v: num(row['VAL']) } }
    return out
  } catch { if (tries < 2) { await sleep(1500); return region({ code, start, end, week }, tries + 1) } return null }
}
async function currentWeek() {
  try { const r = await fetch(`${BASE}/dashboardCurrentWeek.do`, { headers: { Referer: REF } }); const j = await r.json(); return { yr: +j.value.YR, wk: +j.value.WEEK } } catch { return null }
}
// 범용 GET(배열 JSON) — 기간/성별연령/환자분류/감염지역 엔드포인트
function qs(o) { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) { if (v === undefined) continue; if (Array.isArray(v)) v.forEach((x) => p.append(k, x)); else p.set(k, v) } return p.toString() }
async function getArr(endpoint, o, tries = 0) {
  try { const r = await fetch(`${BASE}/${endpoint}?${qs(o)}`, { headers: { Referer: REF, 'X-Requested-With': 'XMLHttpRequest' } }); const j = await r.json(); return Array.isArray(j) ? j : null }
  catch { if (tries < 2) { await sleep(1500); return getArr(endpoint, o, tries + 1) } return null }
}
const P = (code, start, end, week) => ({ ymd: String(start).slice(0, 4), yearStartDt: start, yearEndDt: week ? undefined : end, diseaseCls: code, occurGbn: 'CNT', population: 'CNT', infectedArea: '', weekFlag: week ? 'Y' : '', grp: ['01', '02', '03'], area: ['01', '02'] })
const dayOfYear = (y, m, d) => { let n = d - 1; for (let mm = 1; mm < m; mm++) n += new Date(y, mm, 0).getDate(); return n }

// ── 현재 연/주 ──
const cw = await currentWeek()
if (!cw) { console.error('현재 주차 조회 실패'); process.exit(1) }
const CUR_YEAR = cw.yr, CUR_WEEK = cw.wk
// 과거 데이터는 '뽑을 수 있는 데까지' 전부 수집(데이터 가치 = 누적). 빈 연도는 후처리에서 가지치기.
//   EID_START_YEAR 환경변수로 시작연도 조절(기본 2015). EDW가 없는 옛 연도는 자동 제외됨.
const START_YEAR = Math.max(2001, +(process.env.EID_START_YEAR || 2015))
const CAND_PAST = []; for (let y = CUR_YEAR - 1; y >= START_YEAR; y--) CAND_PAST.push(String(y)) // 최신→과거
let YEARS = [String(CUR_YEAR)] // 데이터 확인 후 과거연도 추가(가지치기)
console.log(`현재 ${CUR_YEAR}년 ${CUR_WEEK}주차 · 과거 후보 ${START_YEAR}~${CUR_YEAR - 1} (데이터 있는 연도만 채택)`)

// ── 1) 현재년 연간 시도(건수+율) 전 질병 → 상위 선별 ──
const annual = {} // year → code → sido → {c,v}
annual[String(CUR_YEAR)] = {}
const allCodes = Object.keys(CODES)
let i = 0
for (const code of allCodes) {
  const d = await region({ code, start: `${CUR_YEAR}0101`, end: `${CUR_YEAR}1231` }); await sleep(110)
  if (d && Object.keys(d).length) annual[String(CUR_YEAR)][code] = d
  process.stdout.write(`\r  ${CUR_YEAR} 연간 스캔 ${++i}/${allCodes.length}   `)
}
const totalOf = (yobj) => (yobj ? SIDO.reduce((s, x) => s + (yobj[x.code]?.c || 0), 0) : 0)
const diseases = Object.keys(annual[String(CUR_YEAR)])
  .map((code) => ({ code, total: totalOf(annual[String(CUR_YEAR)][code]) }))
  .filter((d) => d.total > 0).sort((a, b) => b.total - a.total).slice(0, TOP_N).map((d) => d.code)
console.log(`\n  상위 ${diseases.length}종: ${diseases.slice(0, 8).map((c) => CODES[c].name).join(', ')}…`)

// ── 2) 상위 질병 × 과거연도 연간 (뽑을 수 있는 데까지 전부) ──
for (const y of CAND_PAST) {
  annual[y] = {}
  for (const code of diseases) { const d = await region({ code, start: `${y}0101`, end: `${y}1231` }); await sleep(105); if (d && Object.keys(d).length) annual[y][code] = d }
  process.stdout.write(`\r  ${y} 연간 수집 (질병 ${Object.keys(annual[y]).length}종)     `)
}
// 데이터 있는 과거연도만 채택 + 현재년 → 오름차순(차트용)
YEARS = [...CAND_PAST.filter((y) => Object.keys(annual[y]).length > 0), String(CUR_YEAR)].sort()
console.log(`\n  채택 연도(${YEARS.length}): ${YEARS.join('/')}`)

// ── 3) 상위 질병(현재년 발생 많은 것) × 현재년 주별 시도 ──
const now = new Date(); const yest = new Date(now); yest.setDate(now.getDate() - 1)
const weekRefDate = (w) => { const d = new Date(yest); d.setDate(yest.getDate() - (CUR_WEEK - w) * 7); return ymd(d) }
const weeklySido = {} // code → week(1..CUR_WEEK) → sido → count
const weeklyCodes = diseases.filter((code) => totalOf(annual[String(CUR_YEAR)][code]) >= WEEKLY_MIN)
let wc = 0
for (const code of weeklyCodes) {
  weeklySido[code] = {}
  for (let w = 1; w <= CUR_WEEK; w++) {
    const d = await region({ code, start: weekRefDate(w), week: true }); await sleep(95)
    if (d) { const per = {}; for (const s of SIDO) if (d[s.code]?.c) per[s.code] = d[s.code].c; if (Object.keys(per).length) weeklySido[code][w] = per }
  }
  process.stdout.write(`\r  주별 시도 수집 ${++wc}/${weeklyCodes.length} (${CODES[code].name})        `)
}
console.log('')

// ── 4) 심층 분석: 전국 일/월/년 시계열 + 성별연령·환자분류·감염지역(현재년) ──
const daily = {}, monthly = {}, yearly = {}, sexage = {}, ptnt = {}, area = {}
const yStart = `${YEARS[0]}0101`, yEnd = `${CUR_YEAR}1231`, curStart = `${CUR_YEAR}0101`, curEnd = `${CUR_YEAR}1231`
let dc = 0
for (const code of diseases) {
  const nm = CODES[code].name
  const dd = await getArr('dashboardDateWeek.do', P(code, curStart, curEnd, false)); await sleep(85) // 일별(현재년)
  if (dd && dd.length) { const arr = []; for (const r of dd) { const doy = dayOfYear(CUR_YEAR, +r.MM, +r.DD); if (doy >= 0) arr[doy] = num(r['건수']) } daily[nm] = Array.from({ length: arr.length }, (_, i) => arr[i] || 0) }
  const mm = await getArr('dashboardDateHalf.do', P(code, yStart, yEnd, false)); await sleep(85) // 월별(다년)
  if (mm && mm.length) { const o = {}; for (const r of mm) { const y = r.YYYY, m = +String(r['MM월']).replace(/\D/g, ''); if (y && m) (o[y] ??= new Array(12).fill(0))[m - 1] = num(r['건수']) } monthly[nm] = o }
  const yy = await getArr('dashboardDateYear.do', P(code, yStart, yEnd, false)); await sleep(85) // 년별
  if (yy && yy.length) { const o = {}; for (const r of yy) if (r.YYYY) o[r.YYYY] = num(r['건수']); yearly[nm] = o }
  // 성별연령·환자분류·감염지역 — 연도별(지도 연도 슬라이더와 연동)
  for (const y of YEARS) {
    const ys = `${y}0101`, ye = `${y}1231`
    const sa = await getArr('dashboardSexAndAge.do', P(code, ys, ye, false)); await sleep(78)
    if (sa && sa.length) { const o = {}; for (const r of sa) { const a = r.AGE_RANGE; if (!a) continue; (o[a] ??= { m: 0, f: 0 }); if (r.PTNT_GNDR_NM === '남성') o[a].m = num(r.CNT); else o[a].f = num(r.CNT) } if (Object.keys(o).length) (sexage[nm] ??= {})[y] = o }
    const pc = await getArr('dashboardPatientClassification.do', P(code, ys, ye, false)); await sleep(78)
    if (pc && pc.length) { const o = {}; for (const r of pc) if (r['환자분류']) o[r['환자분류']] = num(r['총건수']); if (Object.keys(o).length) (ptnt[nm] ??= {})[y] = o }
    const ea = await getArr('dashboardEstimatedArea.do', P(code, ys, ye, false)); await sleep(78)
    if (ea && ea.length) { const o = {}; for (const r of ea) if (r['추정감염지역']) o[r['추정감염지역']] = num(r['총건수']); if (Object.keys(o).length) (area[nm] ??= {})[y] = o }
  }
  process.stdout.write(`\r  심층 분석 수집 ${++dc}/${diseases.length} (${nm})            `)
}
console.log('')

// ── 출력 ──
const q = (s) => JSON.stringify(s)
const names = diseases.map((c) => CODES[c].name)
const groups = Object.fromEntries(diseases.map((c) => [CODES[c].name, CODES[c].grp]))
const sidoOut = SIDO.map((s) => `  { code: ${q(s.code)}, name: ${q(s.name)}, x: ${+X(s.lng).toFixed(1)}, y: ${+Y(s.lat).toFixed(1)} },`).join('\n')

function annualBlock(field) { // field: 'c'(건수) | 'v'(율)
  let out = ''
  for (const y of YEARS) {
    let yb = ''
    for (const code of diseases) {
      const per = annual[y]?.[code]; if (!per) continue
      const cells = SIDO.map((s) => { const o = per[s.code]; if (!o || !o[field]) return null; return `${q(s.code)}:${field === 'v' ? Math.round(o.v * 100) / 100 : Math.round(o.c)}` }).filter(Boolean)
      const tot = SIDO.reduce((t, s) => t + (per[s.code]?.[field] || 0), 0)
      if (field === 'c' && tot > 0) cells.push(`"00":${Math.round(tot)}`)
      if (!cells.length) continue
      yb += `    ${q(CODES[code].name)}: { ${cells.join(', ')} },\n`
    }
    out += `  ${q(y)}: {\n${yb}  },\n`
  }
  return out
}
// 주별 시도: code명 → week → {sido:count}  / 주별 전국(합) → code명 → [week1..CUR_WEEK]
let wkSidoOut = '', wkNatOut = ''
for (const code of weeklyCodes) {
  const wkObj = weeklySido[code]; if (!wkObj || !Object.keys(wkObj).length) continue
  let body = ''; const nat = new Array(CUR_WEEK).fill(0)
  for (let w = 1; w <= CUR_WEEK; w++) {
    const per = wkObj[w]; if (!per) continue
    const cells = SIDO.map((s) => per[s.code] ? `${q(s.code)}:${per[s.code]}` : null).filter(Boolean)
    nat[w - 1] = SIDO.reduce((t, s) => t + (per[s.code] || 0), 0)
    if (cells.length) body += `    ${w}: { ${cells.join(', ')} },\n`
  }
  wkSidoOut += `  ${q(CODES[code].name)}: {\n${body}  },\n`
  wkNatOut += `  ${q(CODES[code].name)}: [${nat.join(',')}],\n`
}

const header = `// 질병관리청 감염병포털 EDW 대시보드 — 시도×연(발생수·발생률) + 시도×주(현재년). fetch-eid-edw.mjs 배치 산출. ⚠ 수기편집 금지.\n` +
  `// 출처: 질병관리청 감염병포털(dportal.kdca.go.kr). 공공누리 4유형 준수(출처표시·요약). 상위 ${diseases.length}종 · ${YEARS.length}연 · 현재 ${CUR_YEAR}년 ${CUR_WEEK}주.\n` +
  `export interface EidSido { code: string; name: string; x: number; y: number }\n` +
  `export const EID_YEARS = [${YEARS.map(q).join(', ')}] as const\n` +
  `export const EID_PARTIAL_YEAR = ${q(String(CUR_YEAR))}\n` +
  `export const EID_CUR_YEAR = ${q(String(CUR_YEAR))}\n` +
  `export const EID_CUR_WEEK = ${CUR_WEEK}\n` +
  `export const EID_SIDO: EidSido[] = [\n${sidoOut}\n]\n` +
  `export const EID_DISEASES: string[] = [\n${names.map((d) => '  ' + q(d)).join(',\n')}\n]\n` +
  `export const EID_GROUP: Record<string, string> = ${JSON.stringify(groups, null, 0)}\n` +
  `export const EID_WEEKLY_DISEASES: string[] = [${weeklyCodes.map((c) => q(CODES[c].name)).join(', ')}]\n` +
  `// 연간 [year][disease][sido] — '00'=전국(시도합). 발생수.\n` +
  `export const EID_COUNT: Record<string, Record<string, Record<string, number>>> = {\n${annualBlock('c')}}\n` +
  `// 연간 [year][disease][sido] — 인구10만명당 발생률.\n` +
  `export const EID_RATE: Record<string, Record<string, Record<string, number>>> = {\n${annualBlock('v')}}\n` +
  `// 현재년 주별 시도 [disease][week][sido] = 발생수. (지도 주별 슬라이더용)\n` +
  `export const EID_WK_SIDO: Record<string, Record<string, Record<string, number>>> = {\n${wkSidoOut}}\n` +
  `// 현재년 주별 전국 [disease] = [1주..${CUR_WEEK}주] 발생수(시도합).\n` +
  `export const EID_WK_NAT: Record<string, number[]> = {\n${wkNatOut}}\n` +
  `// ── 심층 분석 시계열(전국, 주식차트식 일/월/년) ──\n` +
  `// 일별(현재년): [disease] = [1/1부터 일별 발생수]. 날짜 = ${CUR_YEAR}-01-01 + index일.\n` +
  `export const EID_NAT_DAILY: Record<string, number[]> = ${JSON.stringify(daily)}\n` +
  `// 월별(다년): [disease][year] = [1월..12월].\n` +
  `export const EID_NAT_MONTH: Record<string, Record<string, number[]>> = ${JSON.stringify(monthly)}\n` +
  `// 년별: [disease][year] = 발생수.\n` +
  `export const EID_NAT_YEAR: Record<string, Record<string, number>> = ${JSON.stringify(yearly)}\n` +
  `// 성별·연령(연도별): [disease][year][ageRange] = { m: 남, f: 여 }.\n` +
  `export const EID_SEXAGE: Record<string, Record<string, Record<string, { m: number; f: number }>>> = ${JSON.stringify(sexage)}\n` +
  `// 환자분류(연도별): [disease][year] = { 병원체보유자, 환자 }.\n` +
  `export const EID_PTNT: Record<string, Record<string, Record<string, number>>> = ${JSON.stringify(ptnt)}\n` +
  `// 추정감염지역(연도별): [disease][year] = { 국내, 국외 }.\n` +
  `export const EID_AREA: Record<string, Record<string, Record<string, number>>> = ${JSON.stringify(area)}\n`
fs.writeFileSync('frontend/src/data/eid-region.ts', header, 'utf8')
console.log(`완료 → frontend/src/data/eid-region.ts (질병 ${diseases.length} · 연 ${YEARS.length} · 주별 ${weeklyCodes.length} · 일/월/년+성별연령+환자분류+감염지역)`)
