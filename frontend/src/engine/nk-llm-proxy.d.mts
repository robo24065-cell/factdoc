// nk-llm-proxy.mjs 타입 선언 — 브라우저용 LLM 어댑터(/api/llm 프록시 경유).
// 값의 진실은 nk-llm-proxy.mjs 다. 어댑터 인터페이스는 nk-llm.mjs 와 같다.
import type { GuideResult } from './nk-guide.mjs'

export function probe(): Promise<boolean>
export function hasKeys(): boolean
export function normalizeWithLLM(q: string, ruleResult: any): Promise<any>
export function timeWithLLM(q: string, ruleTime: any): Promise<any>
export function rerankWithLLM(q: string, items: any[]): Promise<any>
export function intentWithLLM(q: string): Promise<any>
/** 고향 안내인 — 검증 실패·호출 실패 전부 null (호출부가 규칙 문장으로 되돌린다) */
export function guideWithLLM(facts: unknown): Promise<GuideResult | null>
export const llmAdapter: any
