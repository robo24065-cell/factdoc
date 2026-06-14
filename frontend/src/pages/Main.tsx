import { useState } from 'react'
import { runPipeline, type Judgement, type Verdict } from '../engine'
import { logQuery } from '../lib/db'

const VERDICTS: Record<Verdict, { label: string; badge: string; ring: string }> = {
  true: { label: '사실', badge: 'bg-emerald-100 text-emerald-800', ring: 'border-emerald-300' },
  partial: { label: '부분적·과장', badge: 'bg-amber-100 text-amber-800', ring: 'border-amber-300' },
  false: { label: '근거없음·허위', badge: 'bg-rose-100 text-rose-800', ring: 'border-rose-300' },
  unverified: { label: '공식근거없음·보류', badge: 'bg-slate-200 text-slate-700', ring: 'border-slate-300' },
}

const KIND_LABEL: Record<string, string> = {
  normalize: '정규화', rule: '룰', graph_match: '그래프', boundary: '경계', coverage: '커버리지',
}

const EXAMPLES = [
  '당뇨는 △△즙으로 완치된다',
  '○○건강기능식품이 당뇨를 치료한다',
  '홍삼이 면역력에 도움이 된다',
  '당뇨에 좋다고 약 끊고 걷기만 하면 된다',
  '신종 약초가 혈당을 낮춘다',
]

export default function Main() {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<Judgement | null>(null)

  function check(text: string) {
    const claim = text.trim()
    if (!claim) return
    const j = runPipeline(claim)
    setResult(j)
    void logQuery(claim, j.verdict) // Supabase query_log 적재(비차단)
  }

  const v = result ? VERDICTS[result.verdict] : null

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-medium text-slate-900 dark:text-white">건강 주장 검증</h1>
      <p className="mt-1 text-sm text-slate-500">
        LLM은 진실을 판단하지 않습니다 — 국가 공식데이터의 룰·클레임그래프가 판정합니다.
      </p>

      <label htmlFor="claim" className="mt-8 block text-sm font-medium text-slate-700 dark:text-slate-300">
        검증할 건강 주장을 입력하세요
      </label>
      <textarea
        id="claim"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={3}
        placeholder="예: 당뇨는 △△즙으로 완치된다"
        className="mt-2 w-full resize-none rounded-lg border border-slate-300 bg-white p-3 text-base text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
      />
      <button
        type="button"
        onClick={() => check(input)}
        disabled={!input.trim()}
        className="mt-3 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-white dark:text-slate-900"
      >
        검증
      </button>

      <div className="mt-4 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => { setInput(ex); check(ex) }}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {ex}
          </button>
        ))}
      </div>

      {result && v && (
        <section className={`mt-8 rounded-xl border bg-white p-5 dark:bg-slate-900 ${v.ring}`}>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${v.badge}`}>{v.label}</span>
            <span className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-500">자동·미검증</span>
            {result.verdict !== 'unverified' && (
              <span className="text-xs text-slate-400">신뢰도 {(result.confidence * 100).toFixed(0)}%</span>
            )}
          </div>

          <p className="mt-4 text-base text-slate-900 dark:text-white">“{result.claimText}”</p>

          {result.warning && (
            <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
              ⚠ {result.warning}
            </div>
          )}

          <div className="mt-5">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">근거 체인 (Why-Trace)</p>
            <ol className="mt-2 space-y-2">
              {result.trace.map((s, i) => (
                <li key={i} className="flex gap-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
                  <span className="mt-0.5 shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {KIND_LABEL[s.kind] ?? s.kind}
                  </span>
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-100">
                      {s.label}{s.outcome ? ` → ${s.outcome}` : ''}
                    </p>
                    {s.detail && <p className="mt-0.5 text-slate-500">{s.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {result.citations.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">공식 출처</p>
              <ul className="mt-2 space-y-1 text-sm">
                {result.citations.map((c, i) => (
                  <li key={i}>
                    <a href={c.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
                      {c.portal} — {c.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-5 border-t border-slate-200 pt-3 text-xs text-slate-400 dark:border-slate-700">
            {result.disclaimer}
          </p>
        </section>
      )}

      <p className="mt-10 text-center text-xs text-slate-400">
        엔진: 룰 + 클레임그래프 트리플 매칭(결정론) · 파서는 현재 규칙기반 스텁(추후 Gemini) · 시드 코퍼스(당뇨)
      </p>
    </div>
  )
}
