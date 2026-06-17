// 주최기관 데이터 융합 — 질병청(감염병)×병무청(입영 신체)×네이버(검색트렌드)를 한 코호트(20대 남성=입영 대상)로 교차.
// 목적: "여러 주최기관 데이터를 동시에 활용한 분석"을 실데이터로 구현 + 가짜정보 방어 미션과 연결(발전가능성·공공데이터).
// 모든 수치는 실제 적재 데이터에서 계산(시드/날조 아님). 방위사업청·조달청 연계는 로드맵으로 별도 명시(데이터 미연동).
import { EID_SEXAGE } from '../data/eid-region'
import { MMA_YEARLY } from '../data/bodyspec'
import { NAVER_TRENDS } from '../data/naver-trends'

export interface CohortDisease { disease: string; count: number; year: string }
export interface FusionBrief {
  cohort: string
  mma: { year: number; heightCm: number; weightKg: number; bmi: number } | null   // 병무청
  diseases: CohortDisease[]                                                         // 질병청(20대 남성)
  diseaseYear: string
  searchSurges: { name: string; surgePct: number; cat: string }[]                  // 네이버(급상승 건강검색어)
}

const BAND = '20~29'

// 데이터 전반에서 '20~29 보고가 충분한' 최신 연도 1개 선택(연도 혼합 방지).
function pickYear(): string {
  const yearCount: Record<string, number> = {}
  for (const d of Object.keys(EID_SEXAGE)) {
    for (const y of Object.keys(EID_SEXAGE[d])) {
      if (EID_SEXAGE[d][y]?.[BAND]) yearCount[y] = (yearCount[y] ?? 0) + 1
    }
  }
  const years = Object.keys(yearCount).sort((a, b) => +b - +a)
  // 진행 중 최신년은 누락 많음 → 보고 질병 수가 직전년의 60% 이상일 때만 채택, 아니면 직전년.
  for (let i = 0; i < years.length; i++) {
    const y = years[i], prev = years[i + 1]
    if (!prev || yearCount[y] >= yearCount[prev] * 0.6) return y
  }
  return years[0] ?? ''
}

export function fusionBrief(topN = 6): FusionBrief {
  const mmaRow = MMA_YEARLY[MMA_YEARLY.length - 1] ?? null
  const mma = mmaRow ? { year: mmaRow.year, heightCm: mmaRow.heightCm, weightKg: mmaRow.weightKg, bmi: +(mmaRow.weightKg / (mmaRow.heightCm / 100) ** 2).toFixed(1) } : null

  const year = pickYear()
  const diseases: CohortDisease[] = []
  for (const d of Object.keys(EID_SEXAGE)) {
    const c = EID_SEXAGE[d][year]?.[BAND]
    if (c && c.m > 0) diseases.push({ disease: d, count: c.m, year })
  }
  diseases.sort((a, b) => b.count - a.count)

  const searchSurges = [...NAVER_TRENDS].sort((a, b) => b.surgePct - a.surgePct).slice(0, 4).map((t) => ({ name: t.name, surgePct: t.surgePct, cat: t.cat }))

  return { cohort: '20대 남성 (입영 대상 코호트)', mma, diseases: diseases.slice(0, topN), diseaseYear: year, searchSurges }
}
