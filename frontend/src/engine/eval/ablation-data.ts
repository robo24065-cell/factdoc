// 빌드 산출물: scripts/ablation.mjs (오프라인 1회). 무근거 LLM / 일반 RAG 예측. ⚠ 수기 편집 금지.
// (Gemini 무료 RPM 경합으로 1차 산출이 오염되어 pending 처리 — 다른 Gemini 작업 종료 후 단독 재실행 예정)
export interface AblationPred { gold: string; ungrounded: string; rag: string }
export const ABLATION = {
  generatedAtNote: 'pending — re-run scripts/ablation.mjs when Gemini idle',
  classCap: 0,
  subsetSize: 0,
  preds: {} as Record<string, AblationPred>,
} as {
  generatedAtNote: string; classCap: number; subsetSize: number; preds: Record<string, AblationPred>
}
