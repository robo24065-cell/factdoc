// 병무청 병역판정검사 통계 — 또래(병역판정 수검자, 주로 19세 남성) 신체스펙 기준치(참고용).
// 출처: 병무청 병역판정 신체검사 정보(공공데이터포털 3064321) · 병역판정검사 통계 발표(2024).
// ★주최기관(병무청) 데이터 사용 — §1 공공데이터 활용. 개인 진단 아님(§10.4 의료면책).
// 라이브 갱신: scripts/fetch-mma-bodyspec.mjs — 병무청 OpenAPI 게이트웨이 전파 완료 후 1회 실행하면
//   수검자 개별레코드를 집계해 실측 평균·표준편차·분위수로 이 상수를 교체(현재는 공식 발표 평균치).

export interface MmaRef {
  year: number
  n: number
  meanHeight: number // cm
  meanWeight: number // kg
  meanBmi: number
  source: string
}

// 2024년 병역판정검사(2005년생) 공식 발표 평균. (실측 분포·분위수는 전파 완료 후 배치로 보강)
export const MMA_REF: MmaRef = {
  year: 2024,
  n: 211000,
  meanHeight: 174.54,
  meanWeight: 73.27,
  meanBmi: +(73.27 / (174.54 / 100) ** 2).toFixed(1), // ≈ 24.0
  source: '병무청 병역판정검사 통계(2024, 2005년생 약 21.1만 명)',
}

export interface MmaCompare {
  ref: MmaRef
  bmi: number
  dHeight: number
  dWeight: number
  dBmi: number
  heightBand: string
  weightBand: string
}

// 평균 대비 정성 밴드(거짓 정밀도의 '상위 X%' 대신 정직한 위치 표현)
function band(delta: number, near: number, far: number): string {
  const a = Math.abs(delta)
  if (a < near) return '또래 평균과 비슷'
  if (a < far) return delta > 0 ? '또래 평균보다 큰 편' : '또래 평균보다 작은 편'
  return delta > 0 ? '또래 평균보다 많이 큰 편' : '또래 평균보다 많이 작은 편'
}

export function compareToMma(heightCm: number, weightKg: number): MmaCompare | null {
  if (!(heightCm > 0) || !(weightKg > 0)) return null
  const bmi = +(weightKg / (heightCm / 100) ** 2).toFixed(1)
  return {
    ref: MMA_REF,
    bmi,
    dHeight: +(heightCm - MMA_REF.meanHeight).toFixed(1),
    dWeight: +(weightKg - MMA_REF.meanWeight).toFixed(1),
    dBmi: +(bmi - MMA_REF.meanBmi).toFixed(1),
    heightBand: band(heightCm - MMA_REF.meanHeight, 2, 7),
    weightBand: band(weightKg - MMA_REF.meanWeight, 3, 10),
  }
}
