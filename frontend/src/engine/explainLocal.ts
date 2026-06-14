// 결정론적 설명문 — 판정 + 발동한 룰/근거에서 사람 말로 즉시 생성(LLM 불필요).
// Gemini가 다운/쿼터소진이어도 항상 진짜 답을 준다. Gemini 설명이 오면 그걸로 교체(더 자연스러움).
import type { Judgement } from './types'
import { guidanceFor } from './guidance'

export function explainLocal(j: Judgement): string {
  const has = (label: string) => j.trace.some((s) => s.label.includes(label))
  const src = j.citations[0]?.portal
  const cite = src ? ` (출처: ${src})` : ''
  const disease = j.triples[0]?.objectDisease

  // 룰 기반(가장 구체적인 것부터)
  if (has('식약처 룰'))
    return `식품·건강기능식품은 질병을 직접 치료하거나 예방한다고 표방할 수 없어요(식품의약품안전처 기준). 그래서 이 주장은 공식 근거상 사실로 보기 어렵습니다${cite}.`
  if (has('완치 룰(부정)'))
    return `${disease ?? '이 질환'}은(는) 공식적으로 '완치'가 아니라 꾸준한 '관리' 대상으로 봅니다. "완치되지 않는다"는 이 주장은 국가 공식 입장과 일치해요${cite}.`
  if (has('완치 룰'))
    return `${disease ?? '이 질환'}은(는) 비가역 만성질환이라, 공식적으로는 '완치'가 아니라 꾸준한 '관리'만 인정돼요. 그래서 완치된다는 주장은 사실이 아닙니다${cite}.`
  if (has('감염 경로 룰'))
    return `일반 식품을 먹는 것은 해당 감염병의 감염 경로가 아니에요. 그래서 이 주장은 공식 근거상 사실이 아닙니다.`
  if (has('대체치료'))
    return `약이나 병원 치료를 임의로 끊고 대체하라는 주장은 표준치료에 어긋나 위험할 수 있어요. 방향이 일부 맞더라도 과장된 주장입니다${cite}.`
  if (has('반증 매칭'))
    return `국가 공식 근거는 이 주장과 반대 방향을 가리켜요. 그래서 사실로 보기 어렵습니다${cite}.`
  if (has('정합성 검사')) {
    if (j.verdict === 'true') return `주장한 수치가 질병관리청 공식 통계와 대체로 부합해요${cite}.`
    if (j.verdict === 'partial') return `방향은 맞지만 수치가 공식 통계보다 과장(또는 축소)됐어요${cite}.`
    return `주장한 수치가 질병관리청 공식 통계와 크게 어긋나요(과대/과소). 사실로 보기 어렵습니다${cite}.`
  }

  // 판정 기반(클레임그래프 매칭 등)
  if (j.verdict === 'true')
    return `질병관리청·식약처 등 국가 공식 자료와 방향·강도가 일치해요. 사실로 볼 수 있습니다${cite}.`
  if (j.verdict === 'partial')
    return `핵심 방향은 맞지만 강도나 조건이 과장됐어요. 일부만 맞는 주장입니다${cite}.`
  if (j.verdict === 'false')
    return `국가 공식 근거와 맞지 않아 사실로 보기 어렵습니다${cite}.`

  // 보류 — 질환이 인식되면 차가운 '확인 어려움' 대신 표준 관리 안내를 제공
  if (disease) {
    const g = guidanceFor(disease)
    if (g) return `이 주장 자체를 뒷받침할 공식 근거는 분명치 않지만, 참고로 ${g.text} 정확한 진단·처방은 전문가와 상담하세요.`
  }
  return `${disease ? `'${disease}' 관련 ` : ''}이 주장에 대조할 국가 공식 근거가 아직 없어 사실 여부를 단정하기 어려워요. 근거가 없다는 건 효과를 보장하지도, 부정하지도 않는다는 뜻이에요. 정확한 정보는 전문가와 상담하세요.`
}
