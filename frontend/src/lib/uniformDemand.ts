// 군복(전투복) 키 호수별 수요예측 — 평균이 아니라 '분포'로 각 호수 인원 비중을 추정하고, 작년 대비 증감을 예측.
// ⚠ 병무청은 평균 신장만 공개(히스토그램 미공개) → 정규분포 가정 모델(평균=병무청 실측, SD=문헌 근사). 방법론 투명 공개·실측 분포 아님.
// 분석기법: 정규분포 CDF로 키 구간별 비중 산출 → 연도별 평균 이동 + 코호트 규모로 호수별 수요량·증감 예측.
import { MMA_YEARLY } from '../data/bodyspec'

export const HEIGHT_SD = 5.6 // 한국 성인 남성 신장 표준편차 근사(통계 문헌·KNHANES 수준). 모델 가정값.

// 정규분포 CDF (erf 근사, Abramowitz-Stegun 7.1.26)
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return x >= 0 ? y : -y
}
function cdf(x: number, mu: number, sd: number): number { return 0.5 * (1 + erf((x - mu) / (sd * Math.SQRT2))) }

// 전투복 키 호수 구간(대표) — 작은 호수 → 큰 호수.
export interface SizeBand { label: string; lo: number | null; hi: number | null }
export const UNIFORM_BANDS: SizeBand[] = [
  { label: '소 (≤165cm)', lo: null, hi: 165 },
  { label: '중소 (165~170)', lo: 165, hi: 170 },
  { label: '중 (170~175)', lo: 170, hi: 175 },
  { label: '대 (175~180)', lo: 175, hi: 180 },
  { label: '특대 (180cm↑)', lo: 180, hi: null },
]

export function bandPct(meanH: number, sd = HEIGHT_SD): number[] {
  return UNIFORM_BANDS.map((b) => {
    const lo = b.lo == null ? 0 : cdf(b.lo, meanH, sd)
    const hi = b.hi == null ? 1 : cdf(b.hi, meanH, sd)
    return Math.max(0, hi - lo)
  })
}

export interface DemandRow { band: string; pctCur: number; pctPrev: number; deltaPctPt: number; qtyCur: number; qtyPrev: number; deltaQty: number }
export interface DemandForecast { yearCur: string; yearPrev: string; meanCur: number; meanPrev: number; cohort: number; rows: DemandRow[] }

// MMA_YEARLY 최신 2개 연도(평균 이동) + 코호트 규모로 호수별 수요·증감 예측.
export function uniformDemand(cohort: number): DemandForecast | null {
  const ys = [...MMA_YEARLY].sort((a, b) => a.year - b.year)
  if (ys.length < 1) return null
  const cur = ys[ys.length - 1]
  const prev = ys.length >= 2 ? ys[ys.length - 2] : cur
  const pCur = bandPct(cur.heightCm)
  const pPrev = bandPct(prev.heightCm)
  const rows: DemandRow[] = UNIFORM_BANDS.map((b, i) => ({
    band: b.label,
    pctCur: pCur[i], pctPrev: pPrev[i], deltaPctPt: (pCur[i] - pPrev[i]) * 100,
    qtyCur: Math.round(cohort * pCur[i]), qtyPrev: Math.round(cohort * pPrev[i]),
    deltaQty: Math.round(cohort * (pCur[i] - pPrev[i])),
  }))
  return { yearCur: String(cur.year), yearPrev: String(prev.year), meanCur: cur.heightCm, meanPrev: prev.heightCm, cohort, rows }
}
