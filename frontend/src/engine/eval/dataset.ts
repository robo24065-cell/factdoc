// 통합 평가셋 = 검증 코어(수기·엔진과 동시 작성) + 자동 듀얼라벨(독립 라벨러·카파). §13.1 검증 티어 철학과 동일.
import type { Verdict } from '../types'
import { LABELS } from './labels'
import { AUTO_LABELS, AUTO_META } from './auto-labels'

export type EvalTier = 'verified' | 'dual_labeled'

export interface EvalLabel {
  claim: string
  gold: Verdict
  basis: string
  category: string
  tier: EvalTier
  sourceType?: string
  agreement?: boolean
  adjudicated?: boolean
}

const VERIFIED: EvalLabel[] = LABELS.map((l) => ({
  claim: l.claim,
  gold: l.gold,
  basis: l.basis,
  category: '코어(검증)',
  tier: 'verified',
}))

const AUTO: EvalLabel[] = AUTO_LABELS.map((a) => ({
  claim: a.claim,
  gold: a.gold,
  basis: a.basis,
  category: a.category,
  tier: 'dual_labeled',
  sourceType: a.sourceType,
  agreement: a.agreement,
  adjudicated: a.adjudicated,
}))

// 중복 제거(검증 코어 우선)
const seen = new Set<string>()
export const DATASET: EvalLabel[] = [...VERIFIED, ...AUTO].filter((l) => {
  const k = l.claim.trim()
  if (seen.has(k)) return false
  seen.add(k)
  return true
})

export const EVAL_META = {
  kappa: AUTO_META.kappa,
  verifiedCount: VERIFIED.length,
  autoCount: AUTO.length,
  agreed: AUTO_META.agreed,
  adjudicated: AUTO_META.adjudicated,
  total: DATASET.length,
}
