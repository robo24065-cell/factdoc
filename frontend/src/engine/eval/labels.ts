// 골드 라벨셋 (시드) — CLAUDE.md §13.6
// ⚠ W1 시드: 엔진과 함께 작성됨(자가채점 한계). 실제 평가는 독립 라벨 200~300건 + 코헨 카파(W2).
// 각 라벨의 근거(basis)는 공식 출처 기준으로 고정.
import type { Verdict } from '../types'

export interface Label {
  claim: string
  gold: Verdict
  basis: string
}

export const LABELS: Label[] = [
  // ── 사실 ──
  { claim: '걷기운동이 당뇨에 좋다', gold: 'true', basis: '질병청: 운동요법은 제2형당뇨 표준 관리' },
  { claim: '홍삼이 면역력에 도움이 된다', gold: 'true', basis: '식약처 인정기능성: 홍삼-면역 기능 개선' },
  { claim: '인슐린은 당뇨 관리에 쓰인다', gold: 'true', basis: '질병청: 인슐린은 당뇨 표준 치료' },
  { claim: '독감백신은 독감을 예방한다', gold: 'true', basis: '질병청 감염병포털: 인플루엔자 예방접종 권고' },
  { claim: '식이요법이 고혈압 관리에 도움이 된다', gold: 'true', basis: '질병청: 고혈압 식사·생활습관 관리' },
  { claim: '운동이 당뇨 위험을 낮춘다', gold: 'true', basis: 'KNHANES: 신체활동과 당뇨 위험요인' },
  { claim: '스타틴은 이상지질혈증 관리에 쓰인다', gold: 'true', basis: '질병청: 스타틴은 이상지질혈증 약물 치료' },
  { claim: '유산균이 장 건강에 도움이 된다', gold: 'true', basis: '식약처 인정기능성: 프로바이오틱스-장 건강' },
  { claim: '비타민D가 뼈 건강에 도움이 된다', gold: 'true', basis: '식약처 인정기능성: 비타민D-뼈 건강' },
  { claim: '대상포진백신은 대상포진을 예방한다', gold: 'true', basis: '질병청 감염병포털: 대상포진 예방접종 권고' },
  { claim: '금연이 폐암 위험을 낮춘다', gold: 'true', basis: '질병청: 금연과 폐암 위험 감소' },

  // ── 근거없음·허위 ──
  { claim: '당뇨는 △△즙으로 완치된다', gold: 'false', basis: '완치 룰: 비가역 만성질환 완치 불가' },
  { claim: '○○건강기능식품이 당뇨를 치료한다', gold: 'false', basis: '식약처 룰: 식품 질병치료 표방 불가' },
  { claim: '고혈압은 약초로 완치된다', gold: 'false', basis: '완치 룰: 고혈압은 관리만 인정' },
  { claim: '이상지질혈증은 △△로 완치된다', gold: 'false', basis: '완치 룰: 이상지질혈증은 관리만 인정' },
  { claim: '독감백신은 효과 없다', gold: 'false', basis: '반증: 예방접종 효과 공식 근거에 반함' },
  { claim: '독감백신은 독감을 못 막는다', gold: 'false', basis: '반증: 인플루엔자 예방접종 권고에 반함' },
  { claim: '홍삼이 당뇨를 예방한다', gold: 'false', basis: '식약처 룰: 식품의 질병 예방 표방 불가' },
  { claim: '유산균이 당뇨를 치료한다', gold: 'false', basis: '식약처 룰: 식품의 질병 치료 표방 불가' },
  { claim: '루테인이 당뇨를 완치한다', gold: 'false', basis: '식약처 룰 + 완치 룰' },

  // ── 부분적·과장 ──
  { claim: '당뇨에 좋다고 약 끊고 걷기만 하면 된다', gold: 'partial', basis: '운동 도움은 사실이나 약물 중단 권유는 위험' },
  { claim: '홍삼이 면역력에 무조건 도움이 된다', gold: 'partial', basis: '인정기능성은 맞으나 강도(무조건) 과장' },
  { claim: '걷기운동이 당뇨를 확실히 관리한다', gold: 'partial', basis: '관리 도움은 사실이나 강도(확실히) 과장' },

  // ── 공식근거없음·보류 ──
  { claim: '신종 약초가 혈당을 낮춘다', gold: 'unverified', basis: '코퍼스에 대조 근거 없음' },
  { claim: '특정 버섯이 당뇨에 좋다', gold: 'unverified', basis: '해당 성분 공식 근거 없음' },
  { claim: '돼지감자가 당뇨에 좋다', gold: 'unverified', basis: '돼지감자-당뇨 공식 근거 미수록' },
  { claim: '신종 보조제가 콜레스테롤을 낮춘다', gold: 'unverified', basis: '해당 성분 공식 근거 없음' },

  // ── 위험요인·감염경로(추가 커버리지) ──
  { claim: '설탕을 많이 먹으면 당뇨에 걸린다', gold: 'true', basis: '질병청: 당류 과다 섭취는 당뇨 위험요인' },
  { claim: '토마토를 먹으면 코로나에 걸린다', gold: 'false', basis: '감염 경로 룰: 식품은 감염병 감염 경로 아님' },
  { claim: '기립성저혈압은 설탕으로 완치된다', gold: 'false', basis: '식약처 룰: 식품의 질병 치료 표방 불가' },
  { claim: '운동은 비만 관리에 도움이 된다', gold: 'true', basis: '질병청: 신체활동은 비만 관리' },
]
