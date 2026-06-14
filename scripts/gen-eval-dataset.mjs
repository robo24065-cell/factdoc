// 워크플로(build-eval-dataset) 산출물 → auto-labels.ts(프론트) + dataset.json(ablation용)
// 사용: node scripts/gen-eval-dataset.mjs <workflow-output.json>
import { readFileSync, writeFileSync } from 'node:fs'

const outFile = process.argv[2]
if (!outFile) { console.error('워크플로 결과 파일 경로 필요'); process.exit(1) }
const VERDICTS = ['true', 'partial', 'false', 'unverified']
const parsed = JSON.parse(readFileSync(outFile, 'utf8'))
const result = parsed.result ?? parsed // 백그라운드 작업은 {summary,logs,result} 로 감쌈
const auto = (result.dataset || []).filter((d) => d && d.claim && VERDICTS.includes(d.gold))
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ')

// ── auto-labels.ts ──
const rows = auto.map((d) =>
  `  { claim: '${esc(d.claim)}', gold: '${d.gold}', basis: '${esc(d.basis)}', category: '${esc(d.category)}', sourceType: '${esc(d.source_type || 'none')}', agreement: ${!!d.agreement}, adjudicated: ${!!d.adjudicated} },`,
).join('\n')
const kappa = typeof result.kappa === 'number' ? result.kappa.toFixed(4) : 'null'
const ts = `// 자동 듀얼라벨 평가셋 (멀티에이전트: 생성↔라벨 분리 · 2인 독립 라벨 · 합의/3자 조정 · 코헨 카파).
// build-eval-dataset 워크플로 산출물에서 생성됨. ⚠ 수기 편집 금지 — 워크플로 재실행으로 갱신.
import type { Verdict } from '../types'

export interface AutoLabel {
  claim: string
  gold: Verdict
  basis: string
  category: string
  sourceType: string
  agreement: boolean
  adjudicated: boolean
}

export const AUTO_META = {
  kappa: ${kappa} as number | null,
  total: ${result.total ?? auto.length},
  agreed: ${result.agreed ?? 0},
  adjudicated: ${result.adjudicated ?? 0},
}

export const AUTO_LABELS: AutoLabel[] = [
${rows}
]
`
writeFileSync('frontend/src/engine/eval/auto-labels.ts', ts)

// ── dataset.json (검증 코어 + 자동, 중복 제거) — ablation.mjs 입력 ──
const labelsTs = readFileSync('frontend/src/engine/eval/labels.ts', 'utf8')
const verified = [...labelsTs.matchAll(/\{\s*claim:\s*'([^']*)',\s*gold:\s*'(\w+)'/g)].map((m) => ({ claim: m[1], gold: m[2], category: '코어(검증)', tier: 'verified' }))
const merged = []
const seen = new Set()
for (const r of [...verified, ...auto.map((d) => ({ claim: d.claim, gold: d.gold, category: d.category, tier: 'dual_labeled' }))]) {
  if (seen.has(r.claim)) continue
  seen.add(r.claim)
  merged.push(r)
}
writeFileSync('frontend/src/engine/eval/dataset.json', JSON.stringify(merged, null, 1))

const dist = VERDICTS.map((v) => `${v}:${merged.filter((m) => m.gold === v).length}`).join(' ')
console.log(`auto-labels.ts: ${auto.length}건 (kappa=${kappa}, 합의 ${result.agreed}, 조정 ${result.adjudicated})`)
console.log(`dataset.json(병합): ${merged.length}건  분포[${dist}]  (검증 ${verified.length} + 자동 ${auto.length})`)
