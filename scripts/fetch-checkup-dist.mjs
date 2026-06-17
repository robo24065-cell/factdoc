// 건강검진 수치 분포 수집 — KOSIS 국민건강보험 건강검진통계(orgId=350)의 '분포 현황' 도수분포표.
//   공복혈당·수축기/이완기혈압·허리둘레·BMI·HDL·중성지방을 (연령×성별×수치구간) 인원수로 받아,
//   사용자가 자기 검진수치를 넣으면 "또래(연령·성별) 분포에서 내 위치(백분위)"를 누적%로 계산하는 데이터로 굽는다.
// ★평균이 아니라 도수분포(각 구간 사람 수) — 누적%로 백분위 근사 가능(구간합==계 검증됨).
// per-request 외부호출 금지(§13.7) → GitHub Actions cron 연1회. 임상 진단컷은 데이터 아닌 룰테이블 상수(아래).
// 필요: 환경변수 KOSIS_KEY. 실패 시 기존 파일 유지.
import fs from 'node:fs'

const OUT = 'frontend/src/data/checkup-dist.ts'
const KEY = process.env.KOSIS_KEY
const YEAR = process.env.CHECKUP_YEAR || '2024' // 최신 단년(추세는 별도). 새 연도 나오면 변경/그대로 최신.

// 표 + 임상 메타(진단컷은 룰테이블 상수 — 데이터 아님). dir: high=높을수록 위험, low=낮을수록 위험, mid=양방향.
const METRICS = [
  { key: 'fbs', tbl: 'DT_35007_N069', label: '공복혈당', unit: 'mg/dL', dir: 'high', cut: 126, cutLabel: '당뇨 진단 126↑' },
  { key: 'sbp', tbl: 'DT_35007_N063', label: '수축기혈압', unit: 'mmHg', dir: 'high', cut: 140, cutLabel: '고혈압 140↑' },
  { key: 'dbp', tbl: 'DT_35007_N061', label: '이완기혈압', unit: 'mmHg', dir: 'high', cut: 90, cutLabel: '고혈압 90↑' },
  { key: 'waist', tbl: 'DT_35007_N059', label: '허리둘레', unit: 'cm', dir: 'high', cut: 90, cutLabel: '복부비만 남90·여85↑' },
  { key: 'bmi', tbl: 'DT_35007_N057', label: '체질량지수(BMI)', unit: '', dir: 'mid', cut: 25, cutLabel: '비만 25↑' },
  { key: 'hdl', tbl: 'DT_35007_N073', label: 'HDL콜레스테롤', unit: 'mg/dL', dir: 'low', cut: 40, cutLabel: '낮으면 위험 남40·여50↓' },
  { key: 'tg', tbl: 'DT_35007_N075', label: '중성지방(TG)', unit: 'mg/dL', dir: 'high', cut: 150, cutLabel: '높음 150↑' },
]
const SEX = { 합계: 'A', 남자: 'M', 여자: 'F' }
// 연령 C1_NM → 밴드 시작값(숫자). '19세 이하'=19, '20~24세'=20 … '85세 이상'=85. '계'는 제외.
function ageStart(nm) { if (/계/.test(nm)) return null; if (/19세\s*이하/.test(nm)) return 19; const m = nm.match(/(\d+)/); return m ? +m[1] : null }
// 구간명 → [lo,hi] (null=개방). '100미만'→[null,100] '110-125'→[110,125] '200mg/dL이상'→[200,null] '저체중(18.5미만)'→[null,18.5]
function parseBin(nm) {
  const nums = (nm.match(/\d+(?:\.\d+)?/g) || []).map(Number)
  if (/미만/.test(nm)) return [null, nums[0] ?? null]
  if (/이상/.test(nm)) return [nums[0] ?? null, null]
  if (nums.length >= 2) return [nums[0], nums[1]]
  if (nums.length === 1) return [nums[0], null]
  return [null, null]
}

async function fetchTable(tbl) {
  const url = `https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList&apiKey=${KEY}` +
    `&itmId=001+&objL1=ALL&objL2=ALL&objL3=ALL&format=json&jsonVD=Y&prdSe=A&startPrdDe=${YEAR}&endPrdDe=${YEAR}&orgId=350&tblId=${tbl}`
  const res = await fetch(url); const txt = await res.text()
  let d; try { d = JSON.parse(txt) } catch { return null }
  if (!Array.isArray(d) || !d.length || d[0].err) { console.warn(`  ${tbl} 비정상:`, txt.slice(0, 100)); return null }
  return d
}

async function main() {
  if (!KEY) { console.log('· KOSIS_KEY 미설정 → 기존 checkup-dist.ts 유지'); return }
  const out = {}
  for (const m of METRICS) {
    const rows = await fetchTable(m.tbl)
    if (!rows) { console.warn(`  ${m.key}(${m.tbl}) 스킵`); continue }
    // C3 구간 순서 수집(계 제외), 라벨→[lo,hi]
    const binOrder = []; const binMap = new Map()
    for (const r of rows) { const c3 = r.C3_NM; if (/^계$|합계/.test(c3)) continue; if (!binMap.has(c3)) { binMap.set(c3, parseBin(c3)); binOrder.push(c3) } }
    const bins = binOrder.map((nm) => ({ label: nm, lo: binMap.get(nm)[0], hi: binMap.get(nm)[1] }))
    // counts[ageStart][sex] = number[] (bin 순서)
    const counts = {}
    for (const r of rows) {
      const a = ageStart(r.C1_NM), sx = SEX[r.C2_NM], c3 = r.C3_NM
      if (a == null || !sx || /^계$|합계/.test(c3)) continue
      const bi = binOrder.indexOf(c3); if (bi < 0) continue
      const v = parseInt(String(r.DT).replace(/[^\d]/g, ''), 10)
      ;((counts[a] ??= {})[sx] ??= new Array(binOrder.length).fill(0))[bi] = Number.isFinite(v) ? v : 0
    }
    out[m.key] = { key: m.key, label: m.label, unit: m.unit, dir: m.dir, cut: m.cut, cutLabel: m.cutLabel, year: YEAR, bins, counts }
    console.log(`  ✓ ${m.key} ${m.label} — ${bins.length}구간, 연령밴드 ${Object.keys(counts).length}`)
  }
  if (!Object.keys(out).length) { console.warn('수집 0종 → 기존 유지'); return }

  const header = `// 건강검진 수치 분포(도수분포표) — 자동 생성(scripts/fetch-checkup-dist.mjs). 수기편집 금지(재생성됨).\n` +
    `// 출처: 국민건강보험공단 건강검진통계(KOSIS orgId=350). (연령×성별×수치구간) 인원수 → 누적%로 '또래 분포 내 내 위치' 계산.\n` +
    `// ${YEAR}년. dir: high=높을수록 위험·low=낮을수록 위험·mid=양방향. cut=임상 진단컷(룰테이블 상수, 데이터 아님). 참고용·진단 아님.\n` +
    `export interface CheckupBin { label: string; lo: number | null; hi: number | null }\n` +
    `export interface CheckupMetric { key: string; label: string; unit: string; dir: 'high' | 'low' | 'mid'; cut: number; cutLabel: string; year: string; bins: CheckupBin[]; counts: Record<string, Record<'A' | 'M' | 'F', number[]>> }\n` +
    `export const CHECKUP_YEAR = ${JSON.stringify(YEAR)}\n` +
    `export const CHECKUP_DIST: Record<string, CheckupMetric> = ${JSON.stringify(out)}\n`
  fs.writeFileSync(OUT, header, 'utf8')
  const kb = Math.round(fs.statSync(OUT).size / 1024)
  console.log(`\n✓ ${OUT} — ${Object.keys(out).length}종 지표, ${YEAR}년 (${kb}KB)`)
}
main()
