// 빌드 산출물: scripts/ablation.mjs (오프라인 1회). 무근거 LLM / 일반 RAG 예측. ⚠ 수기 편집 금지.
// (Gemini 무료 쿼터가 배치 도중 재소진되어 LLM 예측이 429→unverified로 오염됨 → pending 처리.
//  쿼터가 완전히 리셋된 시점에 scripts/ablation.mjs 4(작은 표본)로 단독 재실행 필요.)
export interface AblationPred { gold: string; ungrounded: string; rag: string }
export const ABLATION = {
  generatedAtNote: 'pending — re-run scripts/ablation.mjs when Gemini fully reset',
  classCap: 0,
  subsetSize: 0,
  preds: {} as Record<string, AblationPred>,
} as {
  generatedAtNote: string; classCap: number; subsetSize: number; preds: Record<string, AblationPred>
}
