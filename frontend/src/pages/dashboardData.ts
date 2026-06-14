// 대시보드 데이터 — 실데이터(평가·자산)는 엔진에서, 나머지는 데모 샘플(실연동 전)
import { runEval } from '../engine/eval/run'
import { CLAIM_GRAPH } from '../engine/claimGraph'
import { ONTOLOGY } from '../engine/ontology'
import type { Verdict } from '../engine'

// ── 실데이터 ──
export const evalReport = runEval()

export const f1Avg =
  (['true', 'partial', 'false', 'unverified'] as const).reduce((s, c) => s + evalReport.perClass[c].f1, 0) / 4

export const assetCounts = {
  triples: CLAIM_GRAPH.length,
  terms: ONTOLOGY.length,
  synonyms: ONTOLOGY.reduce((s, e) => s + e.variants.length, 0),
  diseases: ONTOLOGY.filter((e) => e.type === 'disease').length,
  rules: 8, // 식약처·완치·완치부정·대체치료·감염경로·반증·유병률정합성·치명률
}

const dist: Record<Verdict, number> = { true: 0, partial: 0, false: 0, unverified: 0 }
for (const r of evalReport.rows) dist[r.pred] += 1
export const verdictDist = [
  { key: 'true', name: '사실', value: dist.true, color: '#10b981' },
  { key: 'partial', name: '부분과장', value: dist.partial, color: '#f59e0b' },
  { key: 'false', name: '허위', value: dist.false, color: '#f43f5e' },
  { key: 'unverified', name: '보류', value: dist.unverified, color: '#94a3b8' },
]

// ── 데모 샘플 (실데이터 연결 전) ──
export const weeklyMisinfo = [
  { day: '월', count: 12 }, { day: '화', count: 18 }, { day: '수', count: 9 },
  { day: '목', count: 22 }, { day: '금', count: 28 }, { day: '토', count: 41 }, { day: '일', count: 35 },
]

export const diabetesPrevalence = [
  { age: '30대', rate: 4 }, { age: '40대', rate: 9 }, { age: '50대', rate: 17 },
  { age: '60대', rate: 26 }, { age: '70대+', rate: 31 },
]

export const outbreakTrend = [
  { week: '1주', 인플루엔자: 20, 코로나19: 14 }, { week: '2주', 인플루엔자: 32, 코로나19: 18 },
  { week: '3주', 인플루엔자: 48, 코로나19: 22 }, { week: '4주', 인플루엔자: 61, 코로나19: 27 },
]

export const topMisinfo = [
  { rank: 1, claim: '당뇨 완치 △△즙', delta: '▲' },
  { rank: 2, claim: '백신 무용론', delta: '▲' },
  { rank: 3, claim: '건기식 질병치료 표방', delta: '—' },
  { rank: 4, claim: '약 끊고 자연요법', delta: '▲' },
  { rank: 5, claim: '면역력 만능 보조제', delta: '▼' },
]

export const outbreakList = [
  { name: '인플루엔자', level: '주의', trend: '▲ 급증', color: 'text-rose-600' },
  { name: '코로나19', level: '관심', trend: '▲ 증가', color: 'text-amber-600' },
  { name: '수족구병', level: '관심', trend: '— 유지', color: 'text-slate-500' },
]
