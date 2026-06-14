// 판정 파이프라인 진입점. 추후 Supabase Edge Function으로 이식 가능한 순수 모듈.
import { parseClaim } from './parse'
import { judge } from './judge'
import type { Judgement } from './types'

export function runPipeline(text: string): Judgement {
  const claim = text.trim()
  const triples = parseClaim(claim)
  return judge(triples, claim)
}

export type { Judgement, Verdict, TraceStep, Citation } from './types'
