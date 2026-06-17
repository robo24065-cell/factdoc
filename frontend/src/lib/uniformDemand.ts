// 군복 수요예측 — 평균이 아니라 '분포'로 호수별 인원을 추정하고, 추세를 외삽해 '내년(예측연도)' 수요를 예측.
//   키(길이 호수) + 몸무게(체형/둘레 호수)를 함께 사용. ⚠ 병무청은 평균만 공개 → 정규분포 가정 모델(평균=병무청 실측, SD=문헌 근사)·키·체중 독립 가정. 방법론 투명.
import { MMA_YEARLY } from '../data/bodyspec'

export const HEIGHT_SD = 5.6 // 한국 성인 남성 신장 표준편차 근사(cm)
export const WEIGHT_SD = 11   // 한국 성인 남성 체중 표준편차 근사(kg)
export const FORECAST_YEAR = 2027 // 예측 대상(내년 발주 계획)

function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return x >= 0 ? y : -y
}
const cdf = (x: number, mu: number, sd: number) => 0.5 * (1 + erf((x - mu) / (sd * Math.SQRT2)))

export interface Band { label: string; lo: number | null; hi: number | null }
export const HEIGHT_BANDS: Band[] = [
  { label: '소 (≤165cm)', lo: null, hi: 165 }, { label: '중소 (165~170)', lo: 165, hi: 170 },
  { label: '중 (170~175)', lo: 170, hi: 175 }, { label: '대 (175~180)', lo: 175, hi: 180 }, { label: '특대 (180cm↑)', lo: 180, hi: null },
]
export const WEIGHT_BANDS: Band[] = [
  { label: '~60kg', lo: null, hi: 60 }, { label: '60~70', lo: 60, hi: 70 }, { label: '70~80', lo: 70, hi: 80 },
  { label: '80~90', lo: 80, hi: 90 }, { label: '90kg↑', lo: 90, hi: null },
]
function bandPct(bands: Band[], mean: number, sd: number): number[] {
  return bands.map((b) => Math.max(0, (b.hi == null ? 1 : cdf(b.hi, mean, sd)) - (b.lo == null ? 0 : cdf(b.lo, mean, sd))))
}
// 두 연도 (y0,v0)(y1,v1)로 targetYear 선형 외삽
function project(y0: number, v0: number, y1: number, v1: number, target: number): number {
  if (y1 === y0) return v1
  return v1 + ((v1 - v0) / (y1 - y0)) * (target - y1)
}

export interface DemandRow { band: string; pctBase: number; pctFc: number; deltaPctPt: number; qtyBase: number; qtyFc: number; deltaQty: number }
export interface DemandTable { dim: '키' | '몸무게'; unit: string; baseYear: number; fcYear: number; meanBase: number; meanFc: number; sd: number; rows: DemandRow[] }
export interface UniformDemand { cohort: number; baseYear: number; fcYear: number; prevYear: number; height: DemandTable; weight: DemandTable }

function table(dim: '키' | '몸무게', unit: string, bands: Band[], sd: number, baseYear: number, meanBase: number, fcYear: number, meanFc: number, cohort: number): DemandTable {
  const pB = bandPct(bands, meanBase, sd), pF = bandPct(bands, meanFc, sd)
  const rows: DemandRow[] = bands.map((b, i) => ({
    band: b.label, pctBase: pB[i], pctFc: pF[i], deltaPctPt: (pF[i] - pB[i]) * 100,
    qtyBase: Math.round(cohort * pB[i]), qtyFc: Math.round(cohort * pF[i]), deltaQty: Math.round(cohort * (pF[i] - pB[i])),
  }))
  return { dim, unit, baseYear, fcYear, meanBase, meanFc, sd, rows }
}

// ───────────────────────── 키×체중 결합(이변량 정규) 분포 모델 ─────────────────────────
// 군복은 '체형'(키+체중 결합)에 맞춰 발주해야 함. 키·체중을 독립으로 보면 '키 큰 마른형/단신 고도비만형'이 과다 계상됨('독립 확률의 함정').
// 결합 데이터(원시자료)가 없으므로 → 키-체중 상관계수 ρ(문헌 근사 ρ≈0.45)로 '조건부 정규분포'를 적용해 가상 결합분포를 합성:
//   P(키 구간 i, 체중 구간 j) = P(키 i) × P(체중 j | 키=구간중심)  where  W|H ~ N(μ_W + ρ(σ_W/σ_H)(h−μ_H),  σ_W√(1−ρ²))
// ρ=0이면 독립(현재 단순모델)과 동일 → 슬라이더로 '상관 반영의 효과'를 직접 비교 가능. (체성분 기반 근육/비만 구분·정밀 가슴/허리둘레 호수는 병무청 상세 인체치수 연동 시 — 로드맵)
export const HW_RHO = 0.45 // 20대 남성 키–체중 상관계수 근사(문헌). 원시 결합자료 확보 시 실측 대체.
const HEIGHT_CENTERS = [162, 167.5, 172.5, 177.5, 183] // HEIGHT_BANDS 구간 대표값
const WEIGHT_CENTERS = [56, 65, 75, 85, 95]            // WEIGHT_BANDS 구간 대표값
export type BuildType = '저체중' | '정상' | '과체중' | '비만'
// 대한비만학회·질병청 BMI 기준(아시아인): 저체중<18.5 / 정상 18.5~22.9 / 과체중(비만전단계) 23~24.9 / 비만≥25
function buildOf(bmi: number): BuildType { return bmi < 18.5 ? '저체중' : bmi < 23 ? '정상' : bmi < 25 ? '과체중' : '비만' }
const BUILD_BMI: Record<BuildType, string> = { '저체중': 'BMI<18.5', '정상': '18.5~22.9', '과체중': '23~24.9', '비만': '≥25' }
const BUILD_FIT: Record<BuildType, string> = { '저체중': '기장 대비 둘레 작게(슬림)', '정상': '표준 핏', '과체중': '둘레 여유(상의↑)', '비만': '특수 둘레·별도 발주' }

export interface JointCell { hi: number; wi: number; hLabel: string; wLabel: string; hShort: string; wShort: string; p: number; qty: number; bmi: number; build: BuildType }
export interface JointDemand {
  cohort: number; fcYear: number; rho: number
  meanH: number; meanW: number; sdH: number; sdW: number
  hBands: Band[]; wBands: Band[]
  cells: JointCell[]
  maxQty: number
  builds: { type: BuildType; bmiRange: string; fit: string; p: number; qty: number }[]
  topCells: JointCell[]
  trap: { hLabel: string; wLabel: string; indepQty: number; jointQty: number; diffPct: number }[] // 독립가정 대비 차이 큰 코너
}

// 1D 정규 구간확률
function pBand(b: Band, mean: number, sd: number): number {
  return Math.max(0, (b.hi == null ? 1 : cdf(b.hi, mean, sd)) - (b.lo == null ? 0 : cdf(b.lo, mean, sd)))
}
const shortH = ['소', '중소', '중', '대', '특대']
const shortW = ['~60', '60~70', '70~80', '80~90', '90↑']

// 결합 수요: 키 구간별 P(키) × 조건부 P(체중|키). cohort×결합확률 = 체격별 인원.
export function jointUniformDemand(cohort: number, rho = HW_RHO, fcYear = FORECAST_YEAR): JointDemand | null {
  const ys = [...MMA_YEARLY].sort((a, b) => a.year - b.year)
  if (!ys.length) return null
  const cur = ys[ys.length - 1], prev = ys.length >= 2 ? ys[ys.length - 2] : cur
  const meanH = Math.round(project(prev.year, prev.heightCm, cur.year, cur.heightCm, fcYear) * 10) / 10
  const meanW = Math.round(project(prev.year, prev.weightKg, cur.year, cur.weightKg, fcYear) * 10) / 10
  const sdW_c = WEIGHT_SD * Math.sqrt(1 - rho * rho) // 조건부 표준편차
  const pH = HEIGHT_BANDS.map((b) => pBand(b, meanH, HEIGHT_SD))
  const pW = WEIGHT_BANDS.map((b) => pBand(b, meanW, WEIGHT_SD)) // 독립(비교용)
  const cells: JointCell[] = []
  const trapRaw: JointDemand['trap'] = []
  for (let i = 0; i < HEIGHT_BANDS.length; i++) {
    const h = HEIGHT_CENTERS[i]
    const muW_c = meanW + rho * (WEIGHT_SD / HEIGHT_SD) * (h - meanH) // 키가 크면 조건부 체중 평균↑
    for (let j = 0; j < WEIGHT_BANDS.length; j++) {
      const pWcond = pBand(WEIGHT_BANDS[j], muW_c, sdW_c)
      const p = pH[i] * pWcond
      const w = WEIGHT_CENTERS[j]
      const bmi = Math.round((w / ((h / 100) ** 2)) * 10) / 10
      cells.push({ hi: i, wi: j, hLabel: HEIGHT_BANDS[i].label, wLabel: WEIGHT_BANDS[j].label, hShort: shortH[i], wShort: shortW[j], p, qty: Math.round(cohort * p), bmi, build: buildOf(bmi) })
      const indepQty = Math.round(cohort * pH[i] * pW[j])
      const jointQty = Math.round(cohort * p)
      if (indepQty + jointQty > 0) trapRaw.push({ hLabel: HEIGHT_BANDS[i].label, wLabel: WEIGHT_BANDS[j].label, indepQty, jointQty, diffPct: indepQty > 0 ? Math.round(((jointQty - indepQty) / indepQty) * 100) : 100 })
    }
  }
  const builds = (['저체중', '정상', '과체중', '비만'] as BuildType[]).map((type) => {
    const cs = cells.filter((c) => c.build === type)
    const p = cs.reduce((s, c) => s + c.p, 0)
    return { type, bmiRange: BUILD_BMI[type], fit: BUILD_FIT[type], p, qty: Math.round(cohort * p) }
  })
  const topCells = [...cells].sort((a, b) => b.qty - a.qty).slice(0, 6)
  const trap = trapRaw.filter((t) => Math.abs(t.indepQty - t.jointQty) >= 1).sort((a, b) => Math.abs(b.jointQty - b.indepQty) - Math.abs(a.jointQty - a.indepQty)).slice(0, 4)
  return { cohort, fcYear, rho, meanH, meanW, sdH: HEIGHT_SD, sdW: WEIGHT_SD, hBands: HEIGHT_BANDS, wBands: WEIGHT_BANDS, cells, maxQty: Math.max(...cells.map((c) => c.qty), 1), builds, topCells, trap }
}

// MMA_YEARLY 최근 2개 연도로 평균 변화 추세를 잡아 FORECAST_YEAR로 외삽 → 호수별(키·몸무게) 수요·증감 예측.
export function uniformDemand(cohort: number, fcYear = FORECAST_YEAR): UniformDemand | null {
  const ys = [...MMA_YEARLY].sort((a, b) => a.year - b.year)
  if (!ys.length) return null
  const cur = ys[ys.length - 1]               // 최신 실측(기준, 예: 2024)
  const prev = ys.length >= 2 ? ys[ys.length - 2] : cur // 직전 실측(예: 2022)
  const hFc = project(prev.year, prev.heightCm, cur.year, cur.heightCm, fcYear)
  const wFc = project(prev.year, prev.weightKg, cur.year, cur.weightKg, fcYear)
  return {
    cohort, baseYear: cur.year, fcYear, prevYear: prev.year,
    height: table('키', 'cm', HEIGHT_BANDS, HEIGHT_SD, cur.year, cur.heightCm, fcYear, Math.round(hFc * 10) / 10, cohort),
    weight: table('몸무게', 'kg', WEIGHT_BANDS, WEIGHT_SD, cur.year, cur.weightKg, fcYear, Math.round(wFc * 10) / 10, cohort),
  }
}
