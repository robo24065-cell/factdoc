// 신체 표준 통계 — 연령·연도별 평균 키/몸무게. ⚠ 자동 생성(scripts/fetch-bodyspec.mjs). 수기편집 금지(재생성됨).
// 출처: 질병관리청 2017 소아청소년 성장도표(남자 신장 50백분위) + 병무청 병역판정검사 평균(KOSIS orgId=144).
// KOSIS OpenAPI(KOSIS_KEY)로 GitHub Actions cron이 주기 갱신 → 매년 자동 최신화.

export interface AgeStd { age: number; sex: 'M' | 'F'; heightCm: number; weightKg?: number; source: string }

export const BODY_STD: AgeStd[] = [
  { age: 6, sex: 'M', heightCm: 115.9, source: '질병청 2017 성장도표(50%)' },
  { age: 7, sex: 'M', heightCm: 122.1, source: '질병청 2017 성장도표(50%)' },
  { age: 8, sex: 'M', heightCm: 127.9, source: '질병청 2017 성장도표(50%)' },
  { age: 9, sex: 'M', heightCm: 133.4, source: '질병청 2017 성장도표(50%)' },
  { age: 10, sex: 'M', heightCm: 138.8, source: '질병청 2017 성장도표(50%)' },
  { age: 11, sex: 'M', heightCm: 144.7, source: '질병청 2017 성장도표(50%)' },
  { age: 12, sex: 'M', heightCm: 151.4, source: '질병청 2017 성장도표(50%)' },
  { age: 13, sex: 'M', heightCm: 158.6, source: '질병청 2017 성장도표(50%)' },
  { age: 14, sex: 'M', heightCm: 165, source: '질병청 2017 성장도표(50%)' },
  { age: 15, sex: 'M', heightCm: 169.2, source: '질병청 2017 성장도표(50%)' },
  { age: 16, sex: 'M', heightCm: 171.4, source: '질병청 2017 성장도표(50%)' },
  { age: 17, sex: 'M', heightCm: 172.6, source: '질병청 2017 성장도표(50%)' },
  { age: 18, sex: 'M', heightCm: 173.6, source: '질병청 2017 성장도표(50%)' },
  { age: 19, sex: 'M', heightCm: 174.54, weightKg: 73.27, source: '병무청 병역판정(2024)' },
]

export interface MmaYear { year: number; sex: 'M'; heightCm: number; weightKg: number; source: string }
export const MMA_YEARLY: MmaYear[] = [
  { year: 2022, sex: 'M', heightCm: 174.3, weightKg: 73.1, source: '병무청 병역판정(2022)' },
  { year: 2024, sex: 'M', heightCm: 174.54, weightKg: 73.27, source: '병무청 병역판정(2024)' },
]

export function bodyStandard(sex: 'M' | 'F', age: number, maxGap = 1): AgeStd | null {
  const cands = BODY_STD.filter((s) => s.sex === sex)
  if (!cands.length || !(age > 0)) return null
  let best = cands[0], bd = Infinity
  for (const c of cands) { const d = Math.abs(c.age - age); if (d < bd) { bd = d; best = c } }
  return bd <= maxGap ? best : null
}
