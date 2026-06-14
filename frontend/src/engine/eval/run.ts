// 평가 하니스 — 정확도·클래스별 P/R/F1·매크로F1·인용·캘리브레이션(ECE)·과잉단정·보류적정성·티어·ablation. §13.6
// 실제 제품 파이프라인 반영: Gemini 파서(오프라인 캐시 EVAL_RAW) + 규칙 파서 병합 → 결정론 judge.
import { parseClaim, judge, checkStatClaim } from '../index'
import { rawToTriples, mergeTriples } from '../fromRaw'
import type { Triple, Verdict } from '../types'
import { DATASET, EVAL_META } from './dataset'
import { ABLATION } from './ablation-data'
import { EVAL_RAW } from './eval-triples'

// 제품과 동일: 규칙 트리플 + Gemini 트리플(오프라인 캐시) 병합
function triplesFor(claim: string): Triple[] {
  return mergeTriples(parseClaim(claim), rawToTriples(EVAL_RAW[claim] ?? [], claim))
}

export interface EvalRow {
  claim: string
  gold: Verdict
  pred: Verdict
  ok: boolean
  cited: boolean
  confidence: number
  basis: string
  category: string
  tier: 'verified' | 'dual_labeled'
}

export interface ClassMetric { precision: number; recall: number; f1: number; support: number }
export interface CalibrationBin { label: string; count: number; acc: number; avgConf: number }
export interface AblationConfig { key: string; name: string; desc: string; accuracy: number; n: number; pending?: boolean }

export interface EvalReport {
  rows: EvalRow[]
  total: number
  correct: number
  accuracy: number
  macroF1: number
  citationCoverage: number
  perClass: Record<Verdict, ClassMetric>
  confusion: Record<Verdict, Record<Verdict, number>>
  overClaimRate: number   // gold=보류인데 단정(사실/과장/허위)으로 예측한 비율 (낮을수록 안전)
  holdRecall: number      // gold=보류 재현율 (보류 적정성)
  calibration: CalibrationBin[]
  ece: number
  byTier: { verified: { n: number; acc: number }; dual: { n: number; acc: number } }
  meta: typeof EVAL_META
  ablation: AblationConfig[]
  baselineRef: { name: string; acc: number; note: string }
}

export const VERDICT_ORDER: Verdict[] = ['true', 'partial', 'false', 'unverified']

function emptyConfusion(): Record<Verdict, Record<Verdict, number>> {
  return Object.fromEntries(
    VERDICT_ORDER.map((g) => [g, Object.fromEntries(VERDICT_ORDER.map((p) => [p, 0])) as Record<Verdict, number>]),
  ) as Record<Verdict, Record<Verdict, number>>
}

function perClassFrom(confusion: Record<Verdict, Record<Verdict, number>>): Record<Verdict, ClassMetric> {
  return Object.fromEntries(
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
}

const CAL_BINS = [
  { label: '0–50%', lo: 0, hi: 0.5 },
  { label: '50–70%', lo: 0.5, hi: 0.7 },
  { label: '70–80%', lo: 0.7, hi: 0.8 },
  { label: '80–90%', lo: 0.8, hi: 0.9 },
  { label: '90–100%', lo: 0.9, hi: 1.01 },
]

export function runEval(): EvalReport {
  const rows: EvalRow[] = DATASET.map((l) => {
    const j = checkStatClaim(l.claim) ?? judge(triplesFor(l.claim), l.claim)
    return {
      claim: l.claim, gold: l.gold, pred: j.verdict, ok: j.verdict === l.gold,
      cited: j.citations.length > 0, confidence: j.confidence, basis: l.basis,
      category: l.category, tier: l.tier,
    }
  })

  const correct = rows.filter((r) => r.ok).length
  const accuracy = correct / rows.length

  const nonUnv = rows.filter((r) => r.pred !== 'unverified')
  const citationCoverage = nonUnv.length ? nonUnv.filter((r) => r.cited).length / nonUnv.length : 1

  const confusion = emptyConfusion()
  for (const r of rows) confusion[r.gold][r.pred] += 1
  const perClass = perClassFrom(confusion)
  const macroF1 = VERDICT_ORDER.reduce((s, c) => s + perClass[c].f1, 0) / VERDICT_ORDER.length

  // 과잉단정율: gold=보류인데 무언가로 단정한 비율(안전 지표) / 보류 재현율
  const goldHold = rows.filter((r) => r.gold === 'unverified')
  const overClaimRate = goldHold.length ? goldHold.filter((r) => r.pred !== 'unverified').length / goldHold.length : 0
  const holdRecall = perClass.unverified.recall

  // 캘리브레이션(신뢰도 구간별 정확도) + ECE
  const calibration: CalibrationBin[] = CAL_BINS.map((b) => {
    const inBin = rows.filter((r) => r.confidence >= b.lo && r.confidence < b.hi)
    const acc = inBin.length ? inBin.filter((r) => r.ok).length / inBin.length : 0
    const avgConf = inBin.length ? inBin.reduce((s, r) => s + r.confidence, 0) / inBin.length : 0
    return { label: b.label, count: inBin.length, acc, avgConf }
  })
  const ece = calibration.reduce((s, b) => s + (b.count / rows.length) * Math.abs(b.acc - b.avgConf), 0)

  const vRows = rows.filter((r) => r.tier === 'verified')
  const dRows = rows.filter((r) => r.tier === 'dual_labeled')
  const byTier = {
    verified: { n: vRows.length, acc: vRows.length ? vRows.filter((r) => r.ok).length / vRows.length : 0 },
    dual: { n: dRows.length, acc: dRows.length ? dRows.filter((r) => r.ok).length / dRows.length : 0 },
  }

  // ── Ablation ──
  // 룰만 vs 풀(룰+그래프)은 항상 라이브(결정론) — 클래스 균형 표본에서 '그래프 기여'를 demonstrate.
  // 무근거 LLM / 일반 RAG는 오프라인 Gemini 예측이 있을 때만(없으면 외부 59.8% 기준선으로 대체).
  const balanced = VERDICT_ORDER.flatMap((v) => DATASET.filter((d) => d.gold === v).slice(0, 12))
  const bGold = new Map(balanced.map((d) => [d.claim, d.gold]))
  const accLive = (fn: (c: string) => Verdict) => {
    const cs = [...bGold.keys()]
    return cs.length ? cs.filter((c) => fn(c) === bGold.get(c)).length / cs.length : 0
  }
  const subsetClaims = Object.keys(ABLATION.preds)
  const llmReady = subsetClaims.length > 0
  const goldOf = (c: string) => ABLATION.preds[c].gold as Verdict
  const accOf = (fn: (c: string) => Verdict) => subsetClaims.filter((c) => fn(c) === goldOf(c)).length / subsetClaims.length
  const ablation: AblationConfig[] = [
    llmReady
      ? { key: 'ungrounded', name: '무근거 LLM', desc: 'Gemini · 데이터 없음', n: subsetClaims.length, accuracy: accOf((c) => ABLATION.preds[c].ungrounded as Verdict) }
      : { key: 'ungrounded', name: '무근거 LLM', desc: '쿼터 대기 · 외부 기준선 참고', n: 0, accuracy: 0, pending: true },
    llmReady
      ? { key: 'rag', name: '일반 RAG', desc: '하이브리드 검색 + LLM', n: subsetClaims.length, accuracy: accOf((c) => ABLATION.preds[c].rag as Verdict) }
      : { key: 'rag', name: '일반 RAG', desc: '쿼터 대기', n: 0, accuracy: 0, pending: true },
    { key: 'rules', name: '룰만', desc: '룰 — 클레임그래프 없음', n: balanced.length, accuracy: accLive((c) => (checkStatClaim(c) ?? judge(triplesFor(c), c, { useGraph: false })).verdict) },
    { key: 'full', name: '풀(룰+그래프)', desc: 'FactDoc 엔진', n: balanced.length, accuracy: accLive((c) => (checkStatClaim(c) ?? judge(triplesFor(c), c)).verdict) },
  ]

  return {
    rows, total: rows.length, correct, accuracy, macroF1, citationCoverage, perClass, confusion,
    overClaimRate, holdRecall, calibration, ece, byTier, meta: EVAL_META, ablation,
    baselineRef: { name: '한국어 무근거 LLM(외부)', acc: 0.598, note: 'SNU 500건 벤치마크' },
  }
}
