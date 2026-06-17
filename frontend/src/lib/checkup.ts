// 건강검진 수치 → 또래(연령·성별) 분포 백분위. KOSIS 도수분포표(checkup-dist.ts)의 누적%로 위치 계산.
// 분석기법: 누적도수 + 구간내 선형보간(개방구간 제외) + 방향성(high/low/mid) + 임상컷. 진단 아님(참고용).
import { CHECKUP_DIST, type CheckupMetric } from '../data/checkup-dist'

export type Sex = 'M' | 'F'
export function bandStart(age: number): number { return age < 20 ? 19 : age >= 85 ? 85 : Math.floor(age / 5) * 5 }
export function bandLabel(bs: number): string { return bs === 19 ? '19세 이하' : bs >= 85 ? '85세 이상' : `${bs}~${bs + 4}세` }

export interface PercentileResult {
  key: string; label: string; unit: string; dir: 'high' | 'low' | 'mid'; cut: number; cutLabel: string
  value: number; band: string; sexLabel: string
  point: number      // 낮은값→높은값 누적 백분위(0~1)
  worsePct: number   // '위험한 쪽' 비율(high/mid=상위%, low=하위%)
  worseSide: '상위' | '하위'
  flagged: boolean   // 임상 진단컷 초과
  binLabel: string
}

export function percentile(key: string, age: number, sex: Sex, value: number): PercentileResult | null {
  const metric = CHECKUP_DIST[key] as CheckupMetric | undefined
  if (!metric || !(value > 0) || !(age > 0)) return null
  const bs = bandStart(age)
  const counts = metric.counts[String(bs)]?.[sex] ?? metric.counts[String(bs)]?.A
  if (!counts || !counts.length) return null
  const total = counts.reduce((s, n) => s + n, 0)
  if (!total) return null
  // 값이 속한 구간
  let idx = metric.bins.findIndex((b) => (b.lo == null || value >= b.lo) && (b.hi == null || value < b.hi))
  if (idx < 0) idx = value < (metric.bins[0].hi ?? Infinity) ? 0 : metric.bins.length - 1
  let below = 0
  for (let i = 0; i < idx; i++) below += counts[i]
  const cumLow = below / total
  const cumHigh = (below + counts[idx]) / total
  const b = metric.bins[idx]
  let point = (cumLow + cumHigh) / 2
  if (b.lo != null && b.hi != null && b.hi > b.lo) {
    const frac = Math.max(0, Math.min(1, (value - b.lo) / (b.hi - b.lo)))
    point = cumLow + frac * (cumHigh - cumLow)
  }
  const worseSide: '상위' | '하위' = metric.dir === 'low' ? '하위' : '상위'
  const worsePct = metric.dir === 'low' ? point : 1 - point
  const cutBySex = key === 'waist' ? (sex === 'F' ? 85 : 90) : key === 'hdl' ? (sex === 'F' ? 50 : 40) : metric.cut
  const flagged = metric.dir === 'low' ? value < cutBySex : value >= cutBySex
  return {
    key, label: metric.label, unit: metric.unit, dir: metric.dir, cut: cutBySex, cutLabel: metric.cutLabel,
    value, band: bandLabel(bs), sexLabel: sex === 'F' ? '여성' : '남성',
    point, worsePct, worseSide, flagged, binLabel: b.label,
  }
}

// 대사증후군 진단(5개 중 3개 이상) — 별도 진단컷(질환진단컷과 다름). 입력 가능한 값만 평가.
export interface MetSyndrome { metCount: number; total: number; risk: boolean; items: { label: string; met: boolean; note: string }[] }
export function metabolicSyndrome(sex: Sex, v: { waist?: number; sbp?: number; dbp?: number; fbs?: number; hdl?: number; tg?: number }): MetSyndrome {
  const items: { label: string; met: boolean; note: string }[] = []
  const add = (has: boolean, label: string, met: boolean, note: string) => { if (has) items.push({ label, met, note }) }
  add(v.waist != null, '복부비만', !!v.waist && v.waist >= (sex === 'F' ? 85 : 90), `허리 ${sex === 'F' ? '85' : '90'}cm↑`) // 대사증후군 허리 기준 남90·여85(국내)
  add(v.sbp != null || v.dbp != null, '혈압', (!!v.sbp && v.sbp >= 130) || (!!v.dbp && v.dbp >= 85), '130/85↑')
  add(v.fbs != null, '공복혈당', !!v.fbs && v.fbs >= 100, '100↑')
  add(v.hdl != null, 'HDL', !!v.hdl && v.hdl < (sex === 'F' ? 50 : 40), `${sex === 'F' ? '50' : '40'}↓`)
  add(v.tg != null, '중성지방', !!v.tg && v.tg >= 150, '150↑')
  const metCount = items.filter((i) => i.met).length
  return { metCount, total: items.length, risk: metCount >= 3, items }
}

export const CHECKUP_INPUTS: { key: string; label: string; unit: string; placeholder: string }[] = [
  { key: 'fbs', label: '공복혈당', unit: 'mg/dL', placeholder: '예: 95' },
  { key: 'sbp', label: '수축기혈압', unit: 'mmHg', placeholder: '예: 120' },
  { key: 'dbp', label: '이완기혈압', unit: 'mmHg', placeholder: '예: 80' },
  { key: 'waist', label: '허리둘레', unit: 'cm', placeholder: '예: 84' },
  { key: 'hdl', label: 'HDL콜레스테롤', unit: 'mg/dL', placeholder: '예: 55' },
  { key: 'tg', label: '중성지방', unit: 'mg/dL', placeholder: '예: 120' },
]
