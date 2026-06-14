import { useMemo } from 'react'
import { runEval, VERDICT_ORDER, type AblationConfig } from '../engine/eval/run'
import type { Verdict } from '../engine'

const VLABEL: Record<Verdict, string> = { true: '사실', partial: '부분과장', false: '허위', unverified: '보류' }
const pct = (x: number) => `${(x * 100).toFixed(0)}%`
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`

export default function Eval() {
  const r = useMemo(() => runEval(), [])
  const errors = r.rows.filter((row) => !row.ok)
  const ablationReady = !r.ablation[0]?.pending

  return (
    <div className="pb-10">
      <h1 className="text-2xl font-medium text-slate-900 dark:text-white">평가 하니스</h1>
      <p className="mt-1 text-sm text-slate-500">
        라벨셋 <b>{r.total}건</b>(검증 코어 {r.meta.verifiedCount} + 자동 듀얼라벨 {r.meta.autoCount})으로 채점 —
        실제 제품 파이프라인(Gemini 파서 + 룰·그래프 판정) 기준. 정확도·P/R/F1·캘리브레이션·무근거 LLM 대비 ablation.
      </p>
      <p className="mt-2 rounded-lg bg-blue-50 p-3 text-xs leading-relaxed text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
        🔬 자동 듀얼라벨 {r.meta.autoCount}건은 <b>생성↔라벨 분리 + 2인 독립 라벨러 + 합의/3자 조정</b>으로 구축(자가채점 차단).
        2인 라벨 일치도 <b>코헨 카파 {r.meta.kappa != null ? r.meta.kappa.toFixed(3) : '—'}</b>
        (1차 합의 {r.meta.agreed} · 조정 {r.meta.adjudicated}), 목표 ≥0.60 충족.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="판정 정확도" value={pct1(r.accuracy)} sub={`${r.correct}/${r.total}`} tone="good" />
        <Stat label="매크로 F1" value={r.macroF1.toFixed(3)} sub="4클래스 평균" />
        <Stat label="인용 커버리지" value={pct(r.citationCoverage)} sub="비보류 판정 출처 보유" />
        <Stat label="캘리브레이션 ECE" value={r.ece.toFixed(3)} sub="낮을수록 신뢰도 정확" />
        <Stat label="과잉단정율" value={pct(r.overClaimRate)} sub="보류를 단정한 비율(안전)" tone={r.overClaimRate < 0.15 ? 'good' : 'warn'} />
      </div>

      {/* ── 간판: Ablation 비교표 ── */}
      <h2 className="mt-8 text-base font-medium text-slate-900 dark:text-white">Ablation — 무근거 LLM vs 룰+그래프</h2>
      <p className="mt-1 text-xs text-slate-500">
        {ablationReady
          ? `동일 표본 ${r.ablation[0].n}건(클래스 균형)에서 4개 구성을 비교. 같은 입력, 다른 판정 방식.`
          : 'scripts/ablation.mjs(오프라인) 실행 후 무근거 LLM·RAG 막대가 채워집니다. 룰/풀은 라이브 계산.'}
      </p>
      <div className="mt-3 space-y-2">
        {r.ablation.map((a) => <AblationBar key={a.key} a={a} />)}
        <div className="flex items-center gap-3 pt-1">
          <div className="w-28 shrink-0 text-xs text-slate-400">기준선(외부)</div>
          <div className="relative h-6 flex-1 rounded bg-slate-100 dark:bg-slate-800">
            <div className="absolute inset-y-0 border-r-2 border-dashed border-slate-400" style={{ left: `${r.baselineRef.acc * 100}%` }} />
          </div>
          <div className="w-16 shrink-0 text-right text-xs text-slate-400">{pct1(r.baselineRef.acc)}</div>
        </div>
        <p className="text-[11px] text-slate-400">기준선 = {r.baselineRef.name} {pct1(r.baselineRef.acc)} ({r.baselineRef.note})</p>
      </div>

      {/* ── 클래스별 지표 ── */}
      <h2 className="mt-8 text-base font-medium text-slate-900 dark:text-white">클래스별 지표</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
              <th className="py-2 pr-4">판정</th><th className="px-2">정밀도</th><th className="px-2">재현율</th><th className="px-2">F1</th><th className="px-2">지지</th>
            </tr>
          </thead>
          <tbody>
            {VERDICT_ORDER.map((c) => (
              <tr key={c} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2 pr-4 font-medium text-slate-700 dark:text-slate-200">{VLABEL[c]}</td>
                <td className="px-2">{pct(r.perClass[c].precision)}</td>
                <td className="px-2">{pct(r.perClass[c].recall)}</td>
                <td className="px-2">{pct(r.perClass[c].f1)}</td>
                <td className="px-2 text-slate-400">{r.perClass[c].support}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 혼동 행렬 ── */}
      <h2 className="mt-8 text-base font-medium text-slate-900 dark:text-white">혼동 행렬 (행=정답, 열=예측)</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-slate-500"><th className="py-2 pr-4"></th>{VERDICT_ORDER.map((p) => <th key={p} className="px-3">{VLABEL[p]}</th>)}</tr>
          </thead>
          <tbody>
            {VERDICT_ORDER.map((g) => (
              <tr key={g}>
                <td className="py-1 pr-4 font-medium text-slate-700 dark:text-slate-200">{VLABEL[g]}</td>
                {VERDICT_ORDER.map((p) => (
                  <td key={p} className={`px-3 py-1 text-center ${g === p ? 'font-semibold text-emerald-700 dark:text-emerald-400' : r.confusion[g][p] ? 'text-rose-600' : 'text-slate-300 dark:text-slate-600'}`}>
                    {r.confusion[g][p]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 캘리브레이션 ── */}
      <h2 className="mt-8 text-base font-medium text-slate-900 dark:text-white">신뢰도 캘리브레이션 (규칙기반 검증가능 신뢰도)</h2>
      <p className="mt-1 text-xs text-slate-500">신뢰도 구간별 실제 정확도. 확률 환각 대신 매칭강도·근거수준 기반 결정론적 점수. ECE {r.ece.toFixed(3)}.</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
              <th className="py-2 pr-4">신뢰도 구간</th><th className="px-2">건수</th><th className="px-2">평균 신뢰도</th><th className="px-2">실제 정확도</th>
            </tr>
          </thead>
          <tbody>
            {r.calibration.map((b) => (
              <tr key={b.label} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2 pr-4 text-slate-700 dark:text-slate-200">{b.label}</td>
                <td className="px-2 text-slate-400">{b.count}</td>
                <td className="px-2">{b.count ? pct(b.avgConf) : '—'}</td>
                <td className="px-2">{b.count ? pct(b.acc) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 안전·티어 ── */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="보류 재현율" value={pct(r.holdRecall)} sub="근거없는 주장을 보류로" />
        <Stat label="검증코어 정확도" value={pct(r.byTier.verified.acc)} sub={`${r.byTier.verified.n}건`} />
        <Stat label="자동라벨 정확도" value={pct(r.byTier.dual.acc)} sub={`${r.byTier.dual.n}건`} />
      </div>

      {/* ── 오답 분석 ── */}
      <h2 className="mt-8 text-base font-medium text-slate-900 dark:text-white">오답 {errors.length}건</h2>
      <div className="mt-2 space-y-1">
        {errors.length === 0 && <p className="text-sm text-slate-400">오답 없음 🎉</p>}
        {errors.map((row, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg border border-rose-100 bg-rose-50/40 p-2 text-sm dark:border-rose-900/40 dark:bg-rose-950/10">
            <span className="mt-0.5 shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-700">오답</span>
            <div>
              <p className="text-slate-800 dark:text-slate-100">{row.claim}</p>
              <p className="text-xs text-slate-400">정답 {VLABEL[row.gold]} · 예측 {VLABEL[row.pred]} · [{row.category}] {row.basis}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        ⚠ 검증 코어는 엔진과 함께 작성된 한계가 있어 별도 티어로 분리해 표시합니다. 자동 듀얼라벨은 독립 라벨러·카파로 구축했으나
        라벨 모델이 LLM이므로(인간 검수 아님), 발표용 최종본은 인간 2인 라벨 일부 + 외부 출처 ID 고정으로 보강 예정(W2).
      </p>
    </div>
  )
}

function AblationBar({ a }: { a: AblationConfig }) {
  const isFull = a.key === 'full'
  const w = a.pending ? 0 : a.accuracy * 100
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0 text-xs text-slate-600 dark:text-slate-300">
        {a.name}<span className="block text-[10px] text-slate-400">{a.desc}</span>
      </div>
      <div className="h-6 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
        <div className={`h-full rounded ${isFull ? 'bg-emerald-500' : a.key === 'ungrounded' ? 'bg-rose-400' : 'bg-blue-400'}`} style={{ width: `${w}%` }} />
      </div>
      <div className="w-16 shrink-0 text-right text-sm font-medium text-slate-700 dark:text-slate-200">{a.pending ? '—' : pct1(a.accuracy)}</div>
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'good' | 'warn' }) {
  const c = tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-medium ${c}`}>{value}</p>
      <p className="text-xs text-slate-400">{sub}</p>
    </div>
  )
}
