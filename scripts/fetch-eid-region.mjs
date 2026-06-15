// 질병관리청 전수신고 감염병 발생현황 — 시도별·질병별·연도별 발생수 → 정적 데이터셋(감염병 현황판용).
//   Region 오퍼레이션(POST/GET): searchType(1발생수/2발생률), searchYear, searchSidoCd(00전국,01서울~17세종), resType=2(json)
// per-request 외부호출 금지(§13.7) → 배치로 미리 구워 frontend/src/data/eid-region.ts 로 캐시. 공공누리 4유형.
// 사용: DATA_GO_KR_API_KEY=... node scripts/fetch-eid-region.mjs
import fs from 'node:fs'

const KEY = process.env.DATA_GO_KR_API_KEY
if (!KEY) { console.error('DATA_GO_KR_API_KEY 필요'); process.exit(1) }
const BASE = 'https://apis.data.go.kr/1790387/EIDAPIService/Region'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const YEARS = ['2022', '2023', '2024']
// 시도코드 → 이름 + 지리좌표(중심 위경도)
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
// 위경도 → SVG 좌표(여백 포함, viewBox 0 0 300 440)
const X = (lng) => (lng - 125.6) * 64 + 6
const Y = (lat) => (38.8 - lat) * 64 + 6

async function fetchSido(year, code, tries = 0) {
  const url = `${BASE}?serviceKey=${encodeURIComponent(KEY)}&resType=2&searchType=1&searchYear=${year}&searchSidoCd=${code}&numOfRows=300&pageNo=1`
  try {
    const r = await fetch(url); const j = await r.json()
    if (j?.response?.header?.resultCode !== '00') { if (tries < 2) { await sleep(1200); return fetchSido(year, code, tries + 1) } return [] }
    const it = j.response.body.items?.item ?? []
    return Array.isArray(it) ? it : [it]
  } catch { if (tries < 2) { await sleep(1200); return fetchSido(year, code, tries + 1) } return [] }
}

// data[year][icdNm][sidoCd] = count ; group[icdNm] = 급수
const data = {}; const group = {}
for (const year of YEARS) {
  data[year] = {}
  for (const s of SIDO) {
    const rows = await fetchSido(year, s.code); await sleep(140)
    for (const row of rows) {
      const nm = (row.icdNm || '').trim(); const sc = row.sidoCd; const val = Number(row.resultVal) || 0
      if (!nm) continue
      group[nm] = (row.icdGroupNm || '').replace(/급$/, '') + '급'
      ;(data[year][nm] ??= {})[sc] = val
    }
    process.stdout.write(`\r  ${year} ${s.name} 수집...   `)
  }
}
console.log('')

// 상위 질병 선별: 2024 전국(00) 발생수 기준 top 30(0건 제외)
const y0 = data[YEARS[YEARS.length - 1]]
const diseases = Object.keys(y0)
  .map((nm) => ({ nm, total: y0[nm]['00'] || 0 }))
  .filter((d) => d.total > 0)
  .sort((a, b) => b.total - a.total)
  .slice(0, 30)
  .map((d) => d.nm)

const q = (s) => JSON.stringify(s)
const sidoOut = SIDO.map((s) => `  { code: ${q(s.code)}, name: ${q(s.name)}, x: ${+X(s.lng).toFixed(1)}, y: ${+Y(s.lat).toFixed(1)} },`).join('\n')
let dataOut = ''
for (const year of YEARS) {
  let yb = ''
  for (const nm of diseases) {
    const per = data[year][nm] || {}
    const cells = SIDO.concat([{ code: '00' }]).map((s) => per[s.code] ? `${q(s.code)}:${per[s.code]}` : null).filter(Boolean).join(', ')
    yb += `    ${q(nm)}: { ${cells} },\n`
  }
  dataOut += `  ${q(year)}: {\n${yb}  },\n`
}
const header = `// 질병관리청 전수신고 감염병 발생현황 — 시도별·질병별·연도별 발생수. fetch-eid-region.mjs 배치 산출. ⚠ 수기편집 금지.\n` +
  `// 출처: 질병관리청 감염병포털(전수신고). 공공누리 제4유형. 상위 ${diseases.length}개 질병 · ${YEARS.length}개 연도.\n` +
  `export interface EidSido { code: string; name: string; x: number; y: number }\n` +
  `export const EID_YEARS = [${YEARS.map(q).join(', ')}] as const\n` +
  `export const EID_SIDO: EidSido[] = [\n${sidoOut}\n]\n` +
  `export const EID_DISEASES: string[] = [\n${diseases.map((d) => '  ' + q(d)).join(',\n')}\n]\n` +
  `export const EID_GROUP: Record<string, string> = ${JSON.stringify(Object.fromEntries(diseases.map((d) => [d, group[d]])), null, 0)}\n` +
  `// data[year][disease][sidoCode] = 발생수 ('00'=전국)\n` +
  `export const EID_DATA: Record<string, Record<string, Record<string, number>>> = {\n${dataOut}}\n`
fs.writeFileSync('frontend/src/data/eid-region.ts', header, 'utf8')
console.log(`완료 → frontend/src/data/eid-region.ts (질병 ${diseases.length} · 연도 ${YEARS.length} · 시도 17)`)
