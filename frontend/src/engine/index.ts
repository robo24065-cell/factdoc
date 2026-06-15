// 판정 파이프라인 진입점. 추후 Supabase Edge Function으로 이식 가능한 순수 모듈.
import { parseClaim } from './parse'
import { judge } from './judge'
import { checkStatClaim } from './stats'
import type { Judgement } from './types'

export function runPipeline(text: string): Judgement {
  const claim = text.trim()
  return checkStatClaim(claim) ?? judge(parseClaim(claim), claim)
}

// ablation config (c) 'RAG+룰' — 룰만 적용(클레임그래프 트리플/반증 매칭 비활성). 풀(d)=runPipeline.
export function runPipelineRulesOnly(text: string): Judgement {
  const claim = text.trim()
  return checkStatClaim(claim) ?? judge(parseClaim(claim), claim, { useGraph: false })
}

export { parseClaim } from './parse'
export { judge } from './judge'
export { classifyIntent } from './intent'
export type { Intent, IntentResult } from './intent'
export { explainLocal } from './explainLocal'
export { checkStatClaim } from './stats'
export { adviceAnswer, guidanceFor } from './guidance'
export { analyzeProduct, targetMatchNote, ingredientsInText } from './ingredients'
export type { ProductAnalysis, IngredientInfo } from './ingredients'
export { findInText } from './ontology'
export { symptomsFor } from './symptoms'
export { foodAnswer, foodAnswerAll } from './food'
export type { FoodResult } from './food'
export { isCureClaim, isBeneficialClaim, isHarmfulClaim, relationHits } from './relationLex'
export { drugAnswer } from './drug'
export type { DrugResult } from './drug'
export type { FoodEffect, FoodLevel } from './food-kb'
export type { Judgement, Verdict, TraceStep, TraceKind, Citation, Triple, Relation, Strength, Polarity } from './types'
