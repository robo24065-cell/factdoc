// 평가 하니스 — 정확도·클래스별 P/R/F1·인용 커버리지·혼동행렬. CLAUDE.md §13.6
import { runPipeline } from '../index'
import type { Verdict } from '../types'
import { LABELS } from './labels'

export interface EvalRow {
  claim: string
  gold: Verdict
  pred: Verdict
  ok: boolean
  cited: boolean
  basis: string
}

export interface ClassMetric { precision: number; recall: number; f1: number; support: number }

export interface EvalReport {
  rows: EvalRow[]
  total: number
  correct: number
  accuracy: number
  citationCoverage: number  // 비보류 판정 중 출처 1개 이상 비율
  perClass: Record<Verdict, ClassMetric>
  confusion: Record<Verdict, Record<Verdict, number>>
}

export const VERDICT_ORDER: Verdict[] = ['true', 'partial', 'false', 'unverified']

export function runEval(): EvalReport {
  const rows: EvalRow[] = LABELS.map((l) => {
    const j = runPipeline(l.claim)
    return { claim: l.claim, gold: l.gold, pred: j.verdict, ok: j.verdict === l.gold, cited: j.citations.length > 0, basis: l.basis }
  })

  const correct = rows.filter((r) => r.ok).length
  const accuracy = correct / rows.length

  const nonUnv = rows.filter((r) => r.pred !== 'unverified')
  const citationCoverage = nonUnv.length ? nonUnv.filter((r) => r.cited).length / nonUnv.length : 1

  const confusion = Object.fromEntries(
    VERDICT_ORDER.map((g) => [g, Object.fromEntries(VERDICT_ORDER.map((p) => [p, 0])) as Record<Verdict, number>]),
  ) as Record<Verdict, Record<Verdict, number>>
  for (const r of rows) confusion[r.gold][r.pred] += 1

  const perClass = Object.fromEntries(
    VERDICT_ORDER.map((c) => {
      const tp = confusion[c][c]
      const fp = VERDICT_ORDER.reduce((s, g) => s + (g !== c ? confusion[g][c] : 0), 0)
      const fn = VERDICT_ORDER.reduce((s, p) => s + (p !== c ? confusion[c][p] : 0), 0)
      const support = VERDICT_ORDER.reduce((s, p) => s + confusion[c][p], 0)
      const precision = tp + fp ? tp / (tp + fp) : 0
      const recall = tp + fn ? tp / (tp + fn) : 0
      const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0
      return [c, { precision, recall, f1, support }]
    }),
  ) as Record<Verdict, ClassMetric>

  return { rows, total: rows.length, correct, accuracy, citationCoverage, perClass, confusion }
}
