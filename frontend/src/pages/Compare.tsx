import { useState, type ReactNode } from 'react'
import { runPipeline, type Verdict } from '../engine'
import { naiveLLM, naiveRAG } from '../engine/baselines'

const VLABEL: Record<Verdict, { label: string; badge: string }> = {
  true: { label: '사실', badge: 'bg-emerald-100 text-emerald-800' },
  partial: { label: '부분적·과장', badge: 'bg-amber-100 text-amber-800' },
  false: { label: '근거없음·허위', badge: 'bg-rose-100 text-rose-800' },
  unverified: { label: '공식근거없음·보류', badge: 'bg-slate-200 text-slate-700' },
}

const EXAMPLES = [
  '당뇨는 △△즙으로 완치된다',
  '○○건강기능식품이 당뇨를 치료한다',
  '독감백신은 독감을 못 막는다',
  '홍삼이 면역력에 도움이 된다',
]

const Card = ({ title, tone, children }: { title: string; tone: string; children: ReactNode }) => (
  <div className={`rounded-xl border bg-white p-4 dark:bg-slate-900 ${tone}`}>
    <p className="text-sm font-medium text-slate-900 dark:text-white">{title}</p>
    <div className="mt-3 space-y-2 text-sm">{children}</div>
  </div>
)

export default function Compare() {
  const [input, setInput] = useState('당뇨는 △△즙으로 완치된다')
  const [claim, setClaim] = useState('')

  const run = (t: string) => { const c = t.trim(); if (c) { setInput(c); setClaim(c) } }

  const llm = claim ? naiveLLM(claim) : null
  const rag = claim ? naiveRAG(claim) : null
  const fd = claim ? runPipeline(claim) : null
  const v = fd ? VLABEL[fd.verdict] : null

  return (
    <div>
      <h1 className="text-2xl font-medium text-slate-900 dark:text-white">비교 데모</h1>
      <p className="mt-1 text-sm text-slate-500">
        같은 주장을 세 방식으로. <span className="font-medium">LLM은 진실을 판단하지 않습니다 — 룰·클레임그래프가 판정합니다.</span>
      </p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run(input)}
          className="flex-1 rounded-lg border border-slate-300 bg-white p-3 text-base text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
        <button
          type="button"
          onClick={() => run(input)}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"
        >
          비교
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" onClick={() => run(ex)}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
            {ex}
          </button>
        ))}
      </div>

      {claim && (
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="① 무근거 LLM" tone="border-slate-200 dark:border-slate-800">
            <p className="text-slate-700 dark:text-slate-200">{llm?.answer}</p>
            <div className="flex flex-wrap gap-1">
              {llm?.flags.map((f) => (
                <span key={f} className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">{f}</span>
              ))}
            </div>
          </Card>

          <Card title="② 일반 RAG" tone="border-slate-200 dark:border-slate-800">
            {rag?.snippet ? (
              <>
                <p className="text-slate-700 dark:text-slate-200">“{rag.snippet}”</p>
                <p className="text-xs text-slate-400">출처: {rag.source}</p>
              </>
            ) : (
              <p className="text-slate-500">{rag?.note}</p>
            )}
            <p className="rounded bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/30">{rag?.note}</p>
          </Card>

          <Card title="③ FactDoc (룰 + 클레임그래프)" tone="border-2 border-slate-900 dark:border-white">
            {v && fd && (
              <>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-sm font-medium ${v.badge}`}>{v.label}</span>
                  {fd.verdict !== 'unverified' && (
                    <span className="text-xs text-slate-400">신뢰도 {(fd.confidence * 100).toFixed(0)}%</span>
                  )}
                </div>
                <ol className="space-y-1">
                  {fd.trace.filter((s) => s.outcome).map((s, i) => (
                    <li key={i} className="text-xs text-slate-600 dark:text-slate-300">
                      <span className="text-slate-400">{s.label}</span> → {s.outcome}
                    </li>
                  ))}
                </ol>
                {fd.citations[0] && (
                  <p className="text-xs">
                    <a href={fd.citations[0].url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
                      {fd.citations[0].portal} — {fd.citations[0].title}
                    </a>
                  </p>
                )}
                {fd.warning && <p className="rounded bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950/40">⚠ {fd.warning}</p>}
              </>
            )}
          </Card>
        </div>
      )}

      {claim && (
        <p className="mt-6 text-center text-xs text-slate-400">
          차이: ①은 출처·판정 없음 · ②는 출처는 있으나 판정·룰 없음 · ③은 트리플·룰로 4단계 판정 + 근거체인.
        </p>
      )}
    </div>
  )
}
