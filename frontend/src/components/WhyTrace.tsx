// Why-Trace 시각화 — 주장 분해(트리플) → 룰/그래프 발화 경로 → 판정을 한눈에. §13.9 #1
// "LLM이 아니라 룰+클레임그래프가 판정한다"는 차별점을 눈에 보이게(설명가능성).
import type { Judgement, Relation, TraceKind } from '../engine'

const REL_KO: Record<Relation, string> = {
  cures: '완치·치료', prevents: '예방', reduces_risk: '위험 낮춤', increases_risk: '위험 높임',
  manages: '관리·도움', no_effect: '효과 없음', insufficient_evidence: '근거 불충분',
  causes_or_worsens: '유발·악화', diagnoses: '진단', replaces_treatment: '치료 대체',
}

const KIND: Record<TraceKind, { icon: string; dot: string; tag: string }> = {
  normalize: { icon: '🧩', dot: 'bg-slate-400', tag: '분해' },
  rule: { icon: '⚖️', dot: 'bg-violet-500', tag: '룰' },
  graph_match: { icon: '🔗', dot: 'bg-blue-500', tag: '그래프' },
  boundary: { icon: '📏', dot: 'bg-amber-500', tag: '경계' },
  coverage: { icon: '🔍', dot: 'bg-slate-400', tag: '커버리지' },
}

export default function WhyTrace({ j }: { j: Judgement }) {
  // 정규화(트리플) 단계는 칩으로 따로, 나머지는 타임라인
  const steps = j.trace.filter((s) => s.kind !== 'normalize')

  return (
    <div className="space-y-3">
      {/* 1) 주장 분해(트리플) */}
      {j.triples.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-medium text-slate-400">주장 분해</p>
          <div className="flex flex-wrap gap-1.5">
            {j.triples.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
                <span className="font-medium text-slate-700 dark:text-slate-200">{t.subject}</span>
                <span className="text-slate-400">—[{REL_KO[t.relation]}{t.polarity === 'negate' ? '·부정' : ''}]→</span>
                <span className="font-medium text-slate-700 dark:text-slate-200">{t.objectDisease}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 2) 판정 경로 타임라인 */}
      {steps.length > 0 && (
        <ol className="relative ml-1 space-y-2 border-l border-slate-200 pl-4 dark:border-slate-700">
          {steps.map((s, i) => {
            const k = KIND[s.kind]
            return (
              <li key={i} className="relative">
                <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${k.dot}`} />
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500 dark:bg-slate-800">{k.icon} {k.tag}</span>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{s.label}</span>
                  {s.outcome && (
                    <span className="rounded-full bg-slate-900/5 px-1.5 text-[10px] text-slate-600 dark:bg-white/10 dark:text-slate-300">→ {s.outcome}</span>
                  )}
                </div>
                {s.detail && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{s.detail}</p>}
              </li>
            )
          })}
        </ol>
      )}

      <p className="text-[10px] text-slate-400">국가 공식데이터의 룰 + 클레임그래프가 판정합니다 (LLM은 문장 해석·설명만).</p>
    </div>
  )
}
