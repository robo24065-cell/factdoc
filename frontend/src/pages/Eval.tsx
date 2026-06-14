import { runEval, VERDICT_ORDER } from '../engine/eval/run'
import type { Verdict } from '../engine'

const VLABEL: Record<Verdict, string> = { true: '사실', partial: '부분과장', false: '허위', unverified: '보류' }
const pct = (x: number) => `${(x * 100).toFixed(0)}%`

export default function Eval() {
  const r = runEval()

  return (
    <div>
      <h1 className="text-2xl font-medium text-slate-900 dark:text-white">평가 하니스</h1>
      <p className="mt-1 text-sm text-slate-500">
        시드 라벨셋 {r.total}건으로 엔진을 자동 채점 — 정확도·클래스별 P/R/F1·인용 커버리지·혼동행렬.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="판정 정확도" value={pct(r.accuracy)} sub={`${r.correct}/${r.total}`} />
        <Stat label="인용 커버리지" value={pct(r.citationCoverage)} sub="비보류 판정 중 출처 보유" />
        <Stat label="라벨 수" value={`${r.total}`} sub="시드(W2에 200~300건 확장)" />
      </div>

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

      <h2 className="mt-8 text-base font-medium text-slate-900 dark:text-white">혼동 행렬 (행=정답, 열=예측)</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="py-2 pr-4"></th>
              {VERDICT_ORDER.map((p) => <th key={p} className="px-3">{VLABEL[p]}</th>)}
            </tr>
          </thead>
          <tbody>
            {VERDICT_ORDER.map((g) => (
              <tr key={g}>
                <td className="py-1 pr-4 font-medium text-slate-700 dark:text-slate-200">{VLABEL[g]}</td>
                {VERDICT_ORDER.map((p) => (
                  <td key={p} className={`px-3 py-1 text-center ${g === p ? 'font-medium text-emerald-700 dark:text-emerald-400' : r.confusion[g][p] ? 'text-rose-600' : 'text-slate-300 dark:text-slate-600'}`}>
                    {r.confusion[g][p]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-base font-medium text-slate-900 dark:text-white">개별 라벨</h2>
      <div className="mt-2 space-y-1">
        {r.rows.map((row, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg border border-slate-100 p-2 text-sm dark:border-slate-800">
            <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs ${row.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
              {row.ok ? '정답' : '오답'}
            </span>
            <div>
              <p className="text-slate-800 dark:text-slate-100">{row.claim}</p>
              <p className="text-xs text-slate-400">
                정답 {VLABEL[row.gold]} · 예측 {VLABEL[row.pred]} · 근거: {row.basis}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        ⚠ 이 시드 라벨셋은 엔진과 함께 작성되어 자가채점 한계가 있습니다. 발표용 본 평가는 독립 라벨 200~300건 + 2인 코헨 카파 + 무근거 LLM(한국어 59.8%) 비교표로 W2에 산출합니다.
      </p>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-medium text-slate-900 dark:text-white">{value}</p>
      <p className="text-xs text-slate-400">{sub}</p>
    </div>
  )
}
