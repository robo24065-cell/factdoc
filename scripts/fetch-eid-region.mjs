// 질병관리청 전수신고 감염병 발생현황 → 감염병 현황판 정적 데이터셋(강화판).
//   ① Region searchType=1(발생수)  ② Region searchType=2(인구10만명당 발생률)  — 둘 다 시도별·연도별
//   ③ PeriodBasic searchPeriodType=3(주별) — 전국 주(週) 단위 시계열(일별은 API 미제공, 주별이 최소단위)
// 시도코드 00전국·01서울~17세종. 전국 발생수는 17개 시도 합산(00행 누락 방지 — 원본 배치 누락버그 수정).
// per-request 외부호출 금지(§13.7) → 배치로 미리 구워 frontend/src/data/eid-region.ts 캐시. 공공누리 4유형.
// 사용: DATA_GO_KR_API_KEY=... node scripts/fetch-eid-region.mjs
import fs from 'node:fs'

const KEY = process.env.DATA_GO_KR_API_KEY
if (!KEY) { console.error('DATA_GO_KR_API_KEY 필요'); process.exit(1) }
const BASE = 'https://apis.data.go.kr/1790387/EIDAPIService'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 최신 4개 연도(현재년 포함, 진행중). CI 주기 갱신 시 자동 전진.
const NOW_Y = new Date().getFullYear()
const YEARS = [NOW_Y - 3, NOW_Y - 2, NOW_Y - 1, NOW_Y].map(String)
const TOP_N = 36
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
const SIDO_CODES = SIDO.map((s) => s.code)
const X = (lng) => (lng - 125.6) * 64 + 6
const Y = (lat) => (38.8 - lat) * 64 + 6
const num = (v) => Number(String(v ?? '').replace(/,/g, '')) || 0 // API가 1000+ 값을 "5,507" 콤마표기 → 제거 필수

async function getJson(url, tries = 0) {
  try {
    const r = await fetch(url); const j = await r.json()
    if (j?.response?.header?.resultCode !== '00') { if (tries < 2) { await sleep(1300); return getJson(url, tries + 1) } return null }
    const it = j.response.body.items?.item ?? []
    return Array.isArray(it) ? it : [it]
  } catch { if (tries < 2) { await sleep(1300); return getJson(url, tries + 1) } return null }
}
const regionUrl = (type, year, code) => `${BASE}/Region?serviceKey=${encodeURIComponent(KEY)}&resType=2&searchType=${type}&searchYear=${year}&searchSidoCd=${code}&numOfRows=400&pageNo=1`
const weeklyUrl = (year) => `${BASE}/PeriodBasic?serviceKey=${encodeURIComponent(KEY)}&resType=2&searchPeriodType=3&searchStartYear=${year}&searchEndYear=${year}&numOfRows=4000&pageNo=1`

// ── 수집 ─────────────────────────────────────────────
const count = {}; const rate = {}; const group = {}; const weekly = {}
for (const year of YEARS) {
  count[year] = {}; rate[year] = {}; weekly[year] = {}
  for (const s of SIDO) {
    const c = await getJson(regionUrl(1, year, s.code)); await sleep(130)
    for (const row of c || []) {
      const nm = (row.icdNm || '').trim(); if (!nm) continue
      group[nm] = (row.icdGroupNm || '').replace(/제/, '').replace(/급$/, '') + '급'
      ;(count[year][nm] ??= {})[row.sidoCd] = num(row.resultVal)
    }
    const r = await getJson(regionUrl(2, year, s.code)); await sleep(130)
    for (const row of r || []) {
      const nm = (row.icdNm || '').trim(); if (!nm) continue
      ;(rate[year][nm] ??= {})[row.sidoCd] = Math.round((num(row.resultVal)) * 100) / 100
    }
    process.stdout.write(`\r  ${year} ${s.name} 수집(발생수·발생률)...   `)
  }
  // 주별 전국 시계열
  const w = await getJson(weeklyUrl(year)); await sleep(160)
  for (const row of w || []) {
    const nm = (row.icdNm || '').trim(); if (!nm) continue
    const m = /(\d+)\s*주/.exec(row.period || ''); if (!m) continue
    const wk = Number(m[1]) - 1; if (wk < 0 || wk > 52) continue
    const arr = (weekly[year][nm] ??= new Array(53).fill(0))
    arr[wk] = num(row.resultVal)
  }
  process.stdout.write(`\r  ${year} 수집 완료(주별 포함)        \n`)
}

// ── 상위 질병 선별: 전 연도 시도합산 발생수 최댓값 기준(00행 의존 X) ──
const natCount = (year, nm) => SIDO_CODES.reduce((s, c) => s + (count[year]?.[nm]?.[c] || 0), 0)
const allNames = new Set()
for (const y of YEARS) for (const nm of Object.keys(count[y])) allNames.add(nm)
const diseases = [...allNames]
  .map((nm) => ({ nm, peak: Math.max(...YEARS.map((y) => natCount(y, nm))) }))
  .filter((d) => d.peak > 0)
  .sort((a, b) => b.peak - a.peak)
  .slice(0, TOP_N)
  .map((d) => d.nm)

// 현재년(진행중)에 데이터 없으면 출력연도에서 제외. 있으면 '잠정' 연도로 표기.
const lastY = YEARS[YEARS.length - 1]
const lastTotal = diseases.reduce((s, nm) => s + natCount(lastY, nm), 0)
const partialYear = lastTotal > 0 ? lastY : null
const outYears = lastTotal > 0 ? YEARS : YEARS.slice(0, -1)

// 주별 사용 연수 결정(최대 주차)
let maxWeek = 52
for (const y of outYears) for (const nm of diseases) { const a = weekly[y]?.[nm]; if (a) { for (let i = 52; i >= 0; i--) if (a[i] > 0) { if (i + 1 > maxWeek) maxWeek = i + 1; break } } }

// 무결성 점검(주요 질병 존재 경고)
const must = ['매독', 'A형간염', '쯔쯔가무시증', '수두', '백일해']
const missing = must.filter((m) => !diseases.includes(m) && !diseases.some((d) => d.includes(m)))
if (missing.length) console.warn(`\n⚠ 주요 질병 누락 의심: ${missing.join(', ')} — API 응답 확인 필요`)

// ── 출력 ─────────────────────────────────────────────
const q = (s) => JSON.stringify(s)
const sidoOut = SIDO.map((s) => `  { code: ${q(s.code)}, name: ${q(s.name)}, x: ${+X(s.lng).toFixed(1)}, y: ${+Y(s.lat).toFixed(1)} },`).join('\n')

function metricBlock(store, decimals) {
  let out = ''
  for (const year of outYears) {
    let yb = ''
    for (const nm of diseases) {
      const per = store[year]?.[nm] || {}
      const cells = SIDO_CODES.concat(['00']).map((c) => {
        const v = per[c]; if (!v) return null
        return `${q(c)}:${decimals ? v : Math.round(v)}`
      }).filter(Boolean).join(', ')
      yb += `    ${q(nm)}: { ${cells} },\n`
    }
    out += `  ${q(year)}: {\n${yb}  },\n`
  }
  return out
}
function weeklyBlock() {
  let out = ''
  for (const year of outYears) {
    let yb = ''
    for (const nm of diseases) {
      const a = weekly[year]?.[nm]; if (!a) continue
      const trimmed = a.slice(0, maxWeek)
      if (!trimmed.some((v) => v > 0)) continue
      yb += `    ${q(nm)}: [${trimmed.join(',')}],\n`
    }
    out += `  ${q(year)}: {\n${yb}  },\n`
  }
  return out
}

const header = `// 질병관리청 전수신고 감염병 발생현황 — 시도별 발생수·발생률(10만명당) + 전국 주별 시계열. fetch-eid-region.mjs 배치 산출. ⚠ 수기편집 금지.\n` +
  `// 출처: 질병관리청 감염병포털(전수신고). 공공누리 제4유형. 상위 ${diseases.length}개 질병 · ${outYears.length}개 연도 · 주별 ${maxWeek}주.${partialYear ? ` ${partialYear}년=진행중(잠정).` : ''}\n` +
  `export interface EidSido { code: string; name: string; x: number; y: number }\n` +
  `export const EID_YEARS = [${outYears.map(q).join(', ')}] as const\n` +
  `export const EID_PARTIAL_YEAR = ${partialYear ? q(partialYear) : 'null'}\n` +
  `export const EID_WEEKS = ${maxWeek}\n` +
  `export const EID_SIDO: EidSido[] = [\n${sidoOut}\n]\n` +
  `export const EID_DISEASES: string[] = [\n${diseases.map((d) => '  ' + q(d)).join(',\n')}\n]\n` +
  `export const EID_GROUP: Record<string, string> = ${JSON.stringify(Object.fromEntries(diseases.map((d) => [d, group[d]])), null, 0)}\n` +
  `// [year][disease][sidoCode] — '00'=전국(발생수는 시도합산 권장). 발생수=정수, 발생률=10만명당(소수).\n` +
  `export const EID_COUNT: Record<string, Record<string, Record<string, number>>> = {\n${metricBlock(count, false)}}\n` +
  `export const EID_RATE: Record<string, Record<string, Record<string, number>>> = {\n${metricBlock(rate, true)}}\n` +
  `// [year][disease] = 전국 주별 발생수 배열(index0 = 1주차)\n` +
  `export const EID_WEEKLY: Record<string, Record<string, number[]>> = {\n${weeklyBlock()}}\n`
fs.writeFileSync('frontend/src/data/eid-region.ts', header, 'utf8')
console.log(`완료 → frontend/src/data/eid-region.ts (질병 ${diseases.length} · 연도 ${outYears.join('/')}${partialYear ? `[${partialYear}잠정]` : ''} · 주별 ${maxWeek}주 · 발생수+발생률+주별)`)
console.log(`  상위10: ${diseases.slice(0, 10).join(', ')}`)
