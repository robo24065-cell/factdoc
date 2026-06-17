// 신체 표준 통계 자동 갱신 — KOSIS OpenAPI로 연도별·연령별 평균 신장/체중을 받아 frontend/src/data/bodyspec.ts 재생성.
// 목적: 사람 손 없이 매년 자동 최신화(하드코딩 영구방치 X). GitHub Actions cron(.github/workflows/update-bodyspec.yml)에서 주기 실행.
//
// 필요: 환경변수 KOSIS_KEY (KOSIS 공유서비스 인증키 — https://kosis.kr/openapi/ 에서 무료 발급)
//   선택: BODY_KOSIS_MMA_TBL  (병무청 병역판정 평균 신장/체중 통계표 tblId, orgId=144)
//        BODY_KOSIS_ADULT_TBL (연령대별 평균 신장/체중 통계표 tblId — NHIS 건강검진 또는 KNHANES)
//
// 안전장치: KOSIS 응답이 비정상/빈값이면 기존 시드(질병청 성장도표 + 병무 평균)를 절대 지우지 않고 그대로 둔다(§10 — 날조·데이터 유실 방지).
import fs from 'node:fs'

const OUT = 'frontend/src/data/bodyspec.ts'
const KEY = process.env.KOSIS_KEY
const MMA_TBL = process.env.BODY_KOSIS_MMA_TBL // 병무청 병역판정 평균(연도별)
const ADULT_TBL = process.env.BODY_KOSIS_ADULT_TBL // 연령대별 평균(성인)

// 질병청 2017 소아청소년 성장도표 — 신장 50백분위(고정 표준, 연 1회 개정 시에만 바뀜). 시드로 항상 유지.
const GROWTH_M = [
  [6, 115.9], [7, 122.1], [8, 127.9], [9, 133.4], [10, 138.8], [11, 144.7], [12, 151.4],
  [13, 158.6], [14, 165.0], [15, 169.2], [16, 171.4], [17, 172.6], [18, 173.6],
]
const GROWTH_F = [
  [6, 114.7], [7, 120.8], [8, 126.7], [9, 132.6], [10, 139.1], [11, 145.8], [12, 151.7],
  [13, 155.9], [14, 158.3], [15, 159.5], [16, 160.0], [17, 160.2], [18, 160.6],
]
// 병무청 병역판정 평균(만19세 남) 시드 — KOSIS 수집 성공 시 교체/확장.
let mmaYearly = [
  { year: 2022, h: 174.3, w: 73.1 },
  { year: 2024, h: 174.54, w: 73.27 },
]

async function kosis(tblId) {
  if (!KEY || !tblId) return null
  // KOSIS 통계자료 조회. newEstPrdCnt=30 → '뽑을 수 있는 데까지' 과거 전부(연단위 최대 30년). 데이터 가치=누적.
  const url = `https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList&apiKey=${KEY}&itmId=ALL&objL1=ALL&format=json&jsonVD=Y&prdSe=Y&newEstPrdCnt=30&orgId=144&tblId=${tblId}`
  try {
    const res = await fetch(url)
    const txt = await res.text()
    const data = JSON.parse(txt)
    if (!Array.isArray(data) || !data.length || data[0].err) { console.warn('  KOSIS 응답 비정상:', txt.slice(0, 160)); return null }
    return data // [{ PRD_DE, C1_NM, ITM_NM, DT, UNIT_NM, ... }]
  } catch (e) { console.warn('  KOSIS 호출 실패:', e.message); return null }
}

// 병무청 연도별 평균 신장/체중 — KOSIS 행에서 (연도, 신장/체중) 추출(통계표 구조에 맞게 ITM_NM 매칭).
function parseMma(rows) {
  const byYear = {}
  for (const r of rows) {
    const y = +String(r.PRD_DE).slice(0, 4); if (!y) continue
    const itm = (r.ITM_NM || '') + (r.C1_NM || '')
    const v = parseFloat(r.DT); if (!Number.isFinite(v)) continue
    byYear[y] ??= {}
    if (/신장|키/.test(itm)) byYear[y].h = v
    else if (/체중|몸무게/.test(itm)) byYear[y].w = v
  }
  const out = Object.entries(byYear).filter(([, v]) => v.h && v.w).map(([year, v]) => ({ year: +year, h: v.h, w: v.w })).sort((a, b) => a.year - b.year)
  return out.length ? out : null
}

async function main() {
  if (KEY && MMA_TBL) {
    const rows = await kosis(MMA_TBL)
    const parsed = rows && parseMma(rows)
    if (parsed) { mmaYearly = parsed; console.log(`  ✓ 병무 연도별 ${parsed.length}개 연도 KOSIS 갱신`) }
    else console.log('  · 병무 KOSIS 갱신 실패 → 시드 유지')
  } else {
    console.log('  · KOSIS_KEY/BODY_KOSIS_MMA_TBL 미설정 → 시드 유지(질병청 성장도표 + 병무 평균). KOSIS 키 발급: https://kosis.kr/openapi/')
  }
  // (성인 연령대별 ADULT_TBL은 통계표 확정 후 같은 방식으로 BODY_STD에 19세 이상 행 추가 — 현재는 미설정 시 생략)

  const latest = mmaYearly[mmaYearly.length - 1]
  const std = [
    ...GROWTH_M.map(([age, h]) => `  { age: ${age}, sex: 'M', heightCm: ${h}, source: '질병청 2017 성장도표(50%)' },`),
    `  { age: 19, sex: 'M', heightCm: ${latest.h}, weightKg: ${latest.w}, source: '병무청 병역판정(${latest.year})' },`,
    ...GROWTH_F.map(([age, h]) => `  { age: ${age}, sex: 'F', heightCm: ${h}, source: '질병청 2017 성장도표(50%)' },`),
  ].join('\n')
  const mma = mmaYearly.map((m) => `  { year: ${m.year}, sex: 'M', heightCm: ${m.h}, weightKg: ${m.w}, source: '병무청 병역판정(${m.year})' },`).join('\n')

  const header = `// 신체 표준 통계 — 연령·연도별 평균 키/몸무게. ⚠ 자동 생성(scripts/fetch-bodyspec.mjs). 수기편집 금지(재생성됨).\n` +
    `// 출처: 질병관리청 2017 소아청소년 성장도표(남자 신장 50백분위) + 병무청 병역판정검사 평균(KOSIS orgId=144).\n` +
    `// KOSIS OpenAPI(KOSIS_KEY)로 GitHub Actions cron이 주기 갱신 → 매년 자동 최신화.\n\n` +
    `export interface AgeStd { age: number; sex: 'M' | 'F'; heightCm: number; weightKg?: number; source: string }\n\n` +
    `export const BODY_STD: AgeStd[] = [\n${std}\n]\n\n` +
    `export interface MmaYear { year: number; sex: 'M'; heightCm: number; weightKg: number; source: string }\n` +
    `export const MMA_YEARLY: MmaYear[] = [\n${mma}\n]\n\n` +
    `export function bodyStandard(sex: 'M' | 'F', age: number, maxGap = 1): AgeStd | null {\n` +
    `  const cands = BODY_STD.filter((s) => s.sex === sex)\n` +
    `  if (!cands.length || !(age > 0)) return null\n` +
    `  let best = cands[0], bd = Infinity\n` +
    `  for (const c of cands) { const d = Math.abs(c.age - age); if (d < bd) { bd = d; best = c } }\n` +
    `  return bd <= maxGap ? best : null\n}\n`
  fs.writeFileSync(OUT, header, 'utf8')
  console.log(`\n${OUT} 재생성 — 성장도표 ${GROWTH_M.length}행 + 병무 ${mmaYearly.length}개 연도`)
}
main()
