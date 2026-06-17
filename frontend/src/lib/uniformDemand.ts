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
