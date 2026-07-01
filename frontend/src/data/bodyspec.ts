// 신체 표준 통계 — 자동 생성(scripts/fetch-bodyspec.mjs). 수기편집 금지(재생성됨).
// 소아(만6~18): 질병관리청 2017 소아청소년 성장도표 신장 50%ile. 성인(연령대별 남/여 신장·체중): KOSIS 국민건강보험 건강검진통계(orgId=350, DT_35007_N130/N132).
// KOSIS_KEY로 GitHub Actions 월1회 cron 자동 갱신 → 매년 최신 평균 반영.

export interface AgeStd { age: number; sex: 'M' | 'F'; heightCm: number; weightKg?: number; source: string }
export interface AdultStd { band: string; sex: 'M' | 'F'; heightCm: number; weightKg: number; year: string }
export interface MmaYear { year: number; sex: 'M'; heightCm: number; weightKg: number; source: string }

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
  { age: 6, sex: 'F', heightCm: 114.7, source: '질병청 2017 성장도표(50%)' },
  { age: 7, sex: 'F', heightCm: 120.8, source: '질병청 2017 성장도표(50%)' },
  { age: 8, sex: 'F', heightCm: 126.7, source: '질병청 2017 성장도표(50%)' },
  { age: 9, sex: 'F', heightCm: 132.6, source: '질병청 2017 성장도표(50%)' },
  { age: 10, sex: 'F', heightCm: 139.1, source: '질병청 2017 성장도표(50%)' },
  { age: 11, sex: 'F', heightCm: 145.8, source: '질병청 2017 성장도표(50%)' },
  { age: 12, sex: 'F', heightCm: 151.7, source: '질병청 2017 성장도표(50%)' },
  { age: 13, sex: 'F', heightCm: 155.9, source: '질병청 2017 성장도표(50%)' },
  { age: 14, sex: 'F', heightCm: 158.3, source: '질병청 2017 성장도표(50%)' },
  { age: 15, sex: 'F', heightCm: 159.5, source: '질병청 2017 성장도표(50%)' },
  { age: 16, sex: 'F', heightCm: 160, source: '질병청 2017 성장도표(50%)' },
  { age: 17, sex: 'F', heightCm: 160.2, source: '질병청 2017 성장도표(50%)' },
  { age: 18, sex: 'F', heightCm: 160.6, source: '질병청 2017 성장도표(50%)' },
]

// 병무청 병역판정검사 평균(만19세 남) — 주최기관(병무청) 데이터. 마이페이지 또래 비교 폴백.
export const MMA_YEARLY: MmaYear[] = [
  { year: 2022, sex: 'M', heightCm: 174.3, weightKg: 73.1, source: '병무청 병역판정(2022)' },
  { year: 2024, sex: 'M', heightCm: 174.54, weightKg: 73.27, source: '병무청 병역판정(2024)' },
]

// 성인 연령대별(전국 평균, 남/여) — KOSIS 건강검진통계. 최신연도.
export const ADULT_STD: AdultStd[] = [

]
export const ADULT_YEAR = ""

// 만 나이 → 표준. 20세 이상은 KOSIS 연령대별(최신·실측 평균), 6~18세는 성장도표(50%ile).
export function bodyStandard(sex: 'M' | 'F', age: number, maxGap = 1): { heightCm: number; weightKg?: number; label: string; source: string } | null {
  if (!(age > 0)) return null
  if (age >= 20) {
    const band = age >= 80 ? '80세 이상' : `${Math.floor(age / 10) * 10}대`
    const a = ADULT_STD.find((x) => x.band === band && x.sex === sex)
    if (a) return { heightCm: a.heightCm, weightKg: a.weightKg, label: `${a.band} ${sex === 'M' ? '남성' : '여성'}`, source: `국민건강보험 건강검진통계 ${a.year}년` }
    return null
  }
  const cands = BODY_STD.filter((s) => s.sex === sex)
  if (!cands.length) return null
  let best = cands[0], bd = Infinity
  for (const c of cands) { const d = Math.abs(c.age - age); if (d < bd) { bd = d; best = c } }
  return bd <= maxGap ? { heightCm: best.heightCm, weightKg: best.weightKg, label: `만 ${best.age}세 ${sex === 'M' ? '남성' : '여성'}`, source: best.source } : null
}
