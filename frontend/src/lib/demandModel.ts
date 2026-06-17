// 다중변수 가중치 수요예측 모델 — 여러 기관 데이터를 가중 융합해 내년 발주량·시점(액션플랜)을 산출.
//   변수 A 기본수요(인구·코호트) · B 환경위험(기상, 연동대기) · C 유행가속(질병청 발생 추세) → 가중합 조정률.
//   발주 시점: 질병청 월별 계절성(EID_NAT_MONTH)의 정점월 - 리드타임. ⚠ 추세 외삽·가정 모델(절대량은 baseline 입력 기반).
import { EID_NAT_YEAR, EID_NAT_MONTH } from '../data/eid-region'

export const MODEL_FC_YEAR = 2027
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

function linreg(pts: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = pts.length; if (!n) return { slope: 0, intercept: 0 }
  const sx = pts.reduce((s, p) => s + p.x, 0), sy = pts.reduce((s, p) => s + p.y, 0)
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0), sxy = pts.reduce((s, p) => s + p.x * p.y, 0)
  const d = n * sxx - sx * sx
  if (!d) return { slope: 0, intercept: sy / n }
  const slope = (n * sxy - sx * sy) / d
  return { slope, intercept: (sy - slope * sx) / n }
}
function completeYears(): number[] {
  const ys = new Set<number>()
  for (const d of Object.values(EID_NAT_YEAR)) for (const y of Object.keys(d)) ys.add(+y)
  return [...ys].sort((a, b) => a - b).slice(0, -1) // 진행중 연도 제외
}

// 질병 발생 추세 → 예측연도 변화율(%) (변수 C: 유행가속)
export function epiChange(disease: string, fcYear = MODEL_FC_YEAR, lookback = 4): { latest: number; latestYear: number; fc: number; deltaPct: number } {
  const rec = completeYears().slice(-lookback)
  const series = rec.map((y) => ({ x: y, y: EID_NAT_YEAR[disease]?.[String(y)] ?? 0 }))
  const { slope, intercept } = linreg(series)
  const fc = Math.max(0, Math.round(slope * fcYear + intercept))
  const latest = series[series.length - 1]?.y ?? 0
  const deltaPct = latest > 0 ? Math.round(((fc - latest) / latest) * 100) : (fc > 0 ? 100 : 0)
  return { latest, latestYear: rec[rec.length - 1] ?? fcYear - 1, fc, deltaPct }
}

// 계절성 정점월(평균 월별 프로파일 argmax). 0=정보부족.
export function peakMonth(disease: string): { month: number; profile: number[] } {
  const byYear = EID_NAT_MONTH[disease] ?? {}
  const sum = new Array(12).fill(0); let cnt = 0
  for (const [y, arr] of Object.entries(byYear)) {
    if (!Array.isArray(arr) || arr.length < 12) continue
    const tot = arr.reduce((s, v) => s + v, 0)
    if (tot <= 0) continue
    // 진행중 연도(0이 많은 최신)는 그대로 더해도 평균에 큰 영향 없음
    for (let i = 0; i < 12; i++) sum[i] += arr[i]
    cnt++
    void y
  }
  if (!cnt) return { month: 0, profile: sum }
  let mi = 0; for (let i = 1; i < 12; i++) if (sum[i] > sum[mi]) mi = i
  return { month: mi + 1, profile: sum }
}

export interface DemandPlan {
  disease: string; fcYear: number
  epi: { latest: number; latestYear: number; fc: number; deltaPct: number }
  weights: { base: number; env: number; epi: number }
  envPct: number; basePct: number
  adjPct: number          // 최종 조정률(%)
  baseline: number; recommendedQty: number
  peak: number            // 정점월(1-12)
  orderMonth: number      // 권장 발주월
  monthLabel: string; orderLabel: string
  dir: '대폭증량' | '증량' | '유지' | '감축'
}

// 가중 융합 → 발주량·시점. weights 합은 내부 정규화. envPct=기상 환경위험 가산(%), basePct=인구·코호트 변화(%).
export function demandPlan(disease: string, baseline: number, weights: { base: number; env: number; epi: number }, envPct = 0, basePct = 0, fcYear = MODEL_FC_YEAR, lead = 2): DemandPlan {
  const epi = epiChange(disease, fcYear)
  const wsum = weights.base + weights.env + weights.epi || 1
  const w = { base: weights.base / wsum, env: weights.env / wsum, epi: weights.epi / wsum }
  const adjPct = Math.round(w.base * basePct + w.env * envPct + w.epi * epi.deltaPct)
  const recommendedQty = Math.max(0, Math.round(baseline * (1 + adjPct / 100)))
  const { month: peak } = peakMonth(disease)
  const orderMonth = peak > 0 ? ((peak - 1 - lead + 12) % 12) + 1 : 0
  const dir: DemandPlan['dir'] = adjPct >= 30 ? '대폭증량' : adjPct >= 8 ? '증량' : adjPct <= -8 ? '감축' : '유지'
  return {
    disease, fcYear, epi, weights: w, envPct, basePct, adjPct, baseline, recommendedQty,
    peak, orderMonth, monthLabel: peak > 0 ? MONTHS[peak - 1] : '—', orderLabel: orderMonth > 0 ? MONTHS[orderMonth - 1] : '—', dir,
  }
}

// 모델에서 고를 수 있는 감염병(발생 데이터 있는 것)
export const MODEL_DISEASES = Object.keys(EID_NAT_YEAR)
