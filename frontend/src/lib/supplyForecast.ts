// 통합 물자 수요예측 — 질병청 감염병 발생 다년 추세(EID_NAT_YEAR)를 선형회귀로 내년(2027) 예측 → 방역물자 카테고리 수요 방향.
//   조달청 현재 발주(procurement)와 교차해 "유행 추세 → 내년 방역물자 수요"를 통합. 병무(군복)는 별도 모델(uniformDemand).
// 분석기법: 최근 완전연도 최소제곱 선형회귀 + 외삽. ⚠ 발생 추세 기반 '방향·우선순위' 예측(절대 발주량은 조달이력 연동 시 정밀화). 의학근거 아님(물자기획 보조).
import { EID_NAT_YEAR } from '../data/eid-region'

export const SUPPLY_FC_YEAR = 2027
// 감염병군 → 방역물자 카테고리(전파경로 기반). 멤버 질병명은 EID_NAT_YEAR 키와 일치.
export const DISEASE_GROUPS: { key: string; label: string; supplies: string; members: string[] }[] = [
  { key: 'resp', label: '호흡기·비말 감염', supplies: '마스크·해열제·신속항원키트', members: ['수두', '성홍열', '유행성이하선염', '백일해', '폐렴구균 감염증', '수막구균 감염증', '홍역'] },
  { key: 'enteric', label: '수인성·접촉(소화기)', supplies: '소독제·손위생·정수', members: ['A형간염', 'E형간염', '장출혈성대장균감염증', '세균성이질', '장티푸스', '파라티푸스'] },
  { key: 'vector', label: '매개체(모기·진드기)', supplies: '기피제·방제·보호의', members: ['말라리아', '뎅기열', '쯔쯔가무시증', '중증열성혈소판감소증후군(SFTS)', '신증후군출혈열', '렙토스피라증', '라임병', '큐열'] },
  { key: 'hai', label: '의료감염·내성균', supplies: '진단·격리·소독·보호구', members: ['카바페넴내성장내세균목(CRE) 감염증', '레지오넬라증'] },
  { key: 'blood', label: '혈액·성매개', supplies: '검사키트·예방', members: ['C형간염', '매독', '매독(선천성)'] },
]

// 완전 연도만(현재 진행연도·직전 잠정 제외). EID_NAT_YEAR 키 중 최댓값=진행연도로 보고 제외.
function completeYears(): number[] {
  const ys = new Set<number>()
  for (const d of Object.values(EID_NAT_YEAR)) for (const y of Object.keys(d)) ys.add(+y)
  const sorted = [...ys].sort((a, b) => a - b)
  return sorted.slice(0, -1) // 마지막(진행중) 연도 제외
}
// 최소제곱 선형회귀 → 기울기·절편
function linreg(pts: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = pts.length; if (!n) return { slope: 0, intercept: 0 }
  const sx = pts.reduce((s, p) => s + p.x, 0), sy = pts.reduce((s, p) => s + p.y, 0)
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0), sxy = pts.reduce((s, p) => s + p.x * p.y, 0)
  const d = n * sxx - sx * sx
  if (!d) return { slope: 0, intercept: sy / n }
  const slope = (n * sxy - sx * sy) / d
  return { slope, intercept: (sy - slope * sx) / n }
}

export interface GroupForecast {
  key: string; label: string; supplies: string
  series: { year: number; total: number }[]   // 최근 완전연도 합계
  latest: number; latestYear: number
  fc: number                                   // 2027 예측(외삽, ≥0)
  deltaPct: number                             // 최신연도 대비 예측 변화율(%)
  dir: '급증' | '증가' | '유지' | '감소'
}

export function supplyForecast(fcYear = SUPPLY_FC_YEAR, lookback = 4): GroupForecast[] {
  const yrs = completeYears()
  const recent = yrs.slice(-lookback)
  return DISEASE_GROUPS.map((g) => {
    const series = recent.map((y) => ({ year: y, total: g.members.reduce((s, m) => s + (EID_NAT_YEAR[m]?.[String(y)] ?? 0), 0) }))
    const { slope, intercept } = linreg(series.map((p) => ({ x: p.year, y: p.total })))
    const fcRaw = slope * fcYear + intercept
    const fc = Math.max(0, Math.round(fcRaw))
    const latest = series[series.length - 1]?.total ?? 0
    const latestYear = series[series.length - 1]?.year ?? fcYear - 1
    const deltaPct = latest > 0 ? ((fc - latest) / latest) * 100 : (fc > 0 ? 100 : 0)
    const dir: GroupForecast['dir'] = deltaPct >= 30 ? '급증' : deltaPct >= 8 ? '증가' : deltaPct <= -8 ? '감소' : '유지'
    return { key: g.key, label: g.label, supplies: g.supplies, series, latest, latestYear, fc, deltaPct: Math.round(deltaPct), dir }
  }).sort((a, b) => b.fc - a.fc)
}
