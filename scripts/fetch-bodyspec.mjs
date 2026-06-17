// 신체 표준 통계 자동 갱신 — KOSIS 국민건강보험 건강검진통계(orgId=350)로 연령대별·성별 평균 신장/체중 수집.
//   DT_35007_N130=신장, DT_35007_N132=체중. 전국("계") × 연령대 × 성별, 최신연도(현재 2024, 매년 갱신).
//   + 질병청 2017 소아청소년 성장도표(만6~18 신장 50%ile)는 소아 보조 시드(KOSIS는 '19세 이하' 묶음이라 세분 안 됨).
// 목적: 방치해도 매월 자동 최신화(키·몸무게는 1년에 한 번 갱신 → 월 1회 cron이면 충분). 하드코딩 영구방치 X.
// 필요: 환경변수 KOSIS_KEY (https://kosis.kr/openapi/). 안전: 호출 실패 시 기존 파일 유지(데이터 유실 방지).
import fs from 'node:fs'

const OUT = 'frontend/src/data/bodyspec.ts'
const KEY = process.env.KOSIS_KEY
const Y0 = 2012, Y1 = 2024 // 수록기간(최신연도 자동 선택). 다음해 자료 올라오면 endPrdDe만 늘리거나 그대로 두면 최신 자동.

// 질병청 2017 소아청소년 성장도표 — 신장 50%ile(소아 6~18, 고정 표준). 시드 유지.
const GROWTH_M = [[6, 115.9], [7, 122.1], [8, 127.9], [9, 133.4], [10, 138.8], [11, 144.7], [12, 151.4], [13, 158.6], [14, 165.0], [15, 169.2], [16, 171.4], [17, 172.6], [18, 173.6]]
const GROWTH_F = [[6, 114.7], [7, 120.8], [8, 126.7], [9, 132.6], [10, 139.1], [11, 145.8], [12, 151.7], [13, 155.9], [14, 158.3], [15, 159.5], [16, 160.0], [17, 160.2], [18, 160.6]]
// 병무청 병역판정검사 평균(만19세 남) — 병무청 통계연보 발표치(연1회 갱신, KOSIS 건강검진과 별개 주최기관 출처). 시드.
const MMA_YEARLY = [[2022, 174.3, 73.1], [2024, 174.54, 73.27]]

const SEX = { 남자: 'M', 여자: 'F' }
const bandOf = (c3) => { const m = String(c3).match(/(\d0)대/); if (m) return m[1] + '대'; if (/80세/.test(c3)) return '80세 이상'; return null }

async function kosisTable(tblId) {
  const url = `https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList&apiKey=${KEY}&itmId=001+&objL1=ALL&objL2=ALL&objL3=ALL&format=json&jsonVD=Y&prdSe=Y&startPrdDe=${Y0}&endPrdDe=${Y1}&orgId=350&tblId=${tblId}`
  const res = await fetch(url); const txt = await res.text()
  const data = JSON.parse(txt)
  if (!Array.isArray(data) || !data.length || data[0].err) { console.warn(`  KOSIS ${tblId} 비정상:`, txt.slice(0, 120)); return null }
  // 전국("계") × 성별(남/여) × 연령대, 최신연도만
  const nat = data.filter((r) => /계|전국/.test(r.C1_NM) && SEX[r.C2_NM] && bandOf(r.C3_NM))
  if (!nat.length) return null
  const latestYr = nat.reduce((mx, r) => Math.max(mx, +r.PRD_DE), 0)
  const out = {} // band → {M, F} value
  for (const r of nat) {
    if (+r.PRD_DE !== latestYr) continue
    const band = bandOf(r.C3_NM), sx = SEX[r.C2_NM], v = parseFloat(r.DT)
    if (!band || !sx || !Number.isFinite(v)) continue
    ;(out[band] ??= {})[sx] = v
  }
  return { year: String(latestYr), byBand: out }
}

async function main() {
  let adult = null // band → {M:{h,w}, F:{h,w}}, year
  if (KEY) {
    const H = await kosisTable('DT_35007_N130'), W = await kosisTable('DT_35007_N132')
    if (H && W) {
      const year = H.year; const bands = [...new Set([...Object.keys(H.byBand), ...Object.keys(W.byBand)])]
      const rows = []
      for (const b of bands) for (const sx of ['M', 'F']) {
        const h = H.byBand[b]?.[sx], w = W.byBand[b]?.[sx]
        if (h && w) rows.push({ band: b, sex: sx, heightCm: Math.round(h * 10) / 10, weightKg: Math.round(w * 10) / 10, year })
      }
      if (rows.length) { adult = rows; console.log(`  ✓ KOSIS 연령대별 ${rows.length}행(${year}년)`) }
    }
  }
  if (!adult) console.log('  · KOSIS 미설정/실패 → 성인 연령대별 비움(소아 성장도표만). KOSIS 키: https://kosis.kr/openapi/')

  const std = [
    ...GROWTH_M.map(([a, h]) => `  { age: ${a}, sex: 'M', heightCm: ${h}, source: '질병청 2017 성장도표(50%)' },`),
    ...GROWTH_F.map(([a, h]) => `  { age: ${a}, sex: 'F', heightCm: ${h}, source: '질병청 2017 성장도표(50%)' },`),
  ].join('\n')
  const adultRows = (adult || []).map((r) => `  { band: ${JSON.stringify(r.band)}, sex: '${r.sex}', heightCm: ${r.heightCm}, weightKg: ${r.weightKg}, year: '${r.year}' },`).join('\n')
  const adultYear = adult ? adult[0].year : ''

  const header = `// 신체 표준 통계 — 자동 생성(scripts/fetch-bodyspec.mjs). 수기편집 금지(재생성됨).\n` +
    `// 소아(만6~18): 질병관리청 2017 소아청소년 성장도표 신장 50%ile. 성인(연령대별 남/여 신장·체중): KOSIS 국민건강보험 건강검진통계(orgId=350, DT_35007_N130/N132)${adultYear ? ` ${adultYear}년(최신)` : ''}.\n` +
    `// KOSIS_KEY로 GitHub Actions 월1회 cron 자동 갱신 → 매년 최신 평균 반영.\n\n` +
    `export interface AgeStd { age: number; sex: 'M' | 'F'; heightCm: number; weightKg?: number; source: string }\n` +
    `export interface AdultStd { band: string; sex: 'M' | 'F'; heightCm: number; weightKg: number; year: string }\n` +
    `export interface MmaYear { year: number; sex: 'M'; heightCm: number; weightKg: number; source: string }\n\n` +
    `export const BODY_STD: AgeStd[] = [\n${std}\n]\n\n` +
    `// 병무청 병역판정검사 평균(만19세 남) — 주최기관(병무청) 데이터. 마이페이지 또래 비교 폴백.\n` +
    `export const MMA_YEARLY: MmaYear[] = [\n${MMA_YEARLY.map(([y, h, w]) => `  { year: ${y}, sex: 'M', heightCm: ${h}, weightKg: ${w}, source: '병무청 병역판정(${y})' },`).join('\n')}\n]\n\n` +
    `// 성인 연령대별(전국 평균, 남/여) — KOSIS 건강검진통계. 최신연도.\n` +
    `export const ADULT_STD: AdultStd[] = [\n${adultRows}\n]\n` +
    `export const ADULT_YEAR = ${JSON.stringify(adultYear)}\n\n` +
    `// 만 나이 → 표준. 20세 이상은 KOSIS 연령대별(최신·실측 평균), 6~18세는 성장도표(50%ile).\n` +
    `export function bodyStandard(sex: 'M' | 'F', age: number, maxGap = 1): { heightCm: number; weightKg?: number; label: string; source: string } | null {\n` +
    `  if (!(age > 0)) return null\n` +
    `  if (age >= 20) {\n` +
    `    const band = age >= 80 ? '80세 이상' : \`\${Math.floor(age / 10) * 10}대\`\n` +
    `    const a = ADULT_STD.find((x) => x.band === band && x.sex === sex)\n` +
    `    if (a) return { heightCm: a.heightCm, weightKg: a.weightKg, label: \`\${a.band} \${sex === 'M' ? '남성' : '여성'}\`, source: \`국민건강보험 건강검진통계 \${a.year}년\` }\n` +
    `    return null\n` +
    `  }\n` +
    `  const cands = BODY_STD.filter((s) => s.sex === sex)\n` +
    `  if (!cands.length) return null\n` +
    `  let best = cands[0], bd = Infinity\n` +
    `  for (const c of cands) { const d = Math.abs(c.age - age); if (d < bd) { bd = d; best = c } }\n` +
    `  return bd <= maxGap ? { heightCm: best.heightCm, weightKg: best.weightKg, label: \`만 \${best.age}세 \${sex === 'M' ? '남성' : '여성'}\`, source: best.source } : null\n}\n`
  fs.writeFileSync(OUT, header, 'utf8')
  console.log(`\n${OUT} 재생성 — 소아 ${GROWTH_M.length + GROWTH_F.length}행 + 성인 ${(adult || []).length}행`)
}
main()
