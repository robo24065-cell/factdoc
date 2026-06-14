import { useState } from 'react'

type VerdictKey = 'true' | 'partial' | 'false' | 'unverified'

const VERDICTS: Record<VerdictKey, { label: string; badge: string; ring: string }> = {
  true: { label: '사실', badge: 'bg-emerald-100 text-emerald-800', ring: 'border-emerald-300' },
  partial: { label: '부분적·과장', badge: 'bg-amber-100 text-amber-800', ring: 'border-amber-300' },
  false: { label: '근거없음·허위', badge: 'bg-rose-100 text-rose-800', ring: 'border-rose-300' },
  unverified: { label: '공식근거없음·보류', badge: 'bg-slate-200 text-slate-700', ring: 'border-slate-300' },
}

type Result = { claim: string; verdict: VerdictKey }

export default function Main() {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  function handleCheck() {
    const claim = input.trim()
    if (!claim) return
    // 판정 엔진(Supabase Edge Function + 코퍼스)은 W1에서 연결. 현재는 UI 미리보기 → 보류.
    setResult({ claim, verdict: 'unverified' })
  }

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
        onClick={handleCheck}
        disabled={!input.trim()}
        className="mt-3 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-white dark:text-slate-900"
      >
        검증
      </button>

      {result && (
        <section className={`mt-8 rounded-xl border bg-white p-5 dark:bg-slate-900 ${VERDICTS[result.verdict].ring}`}>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${VERDICTS[result.verdict].badge}`}>
              {VERDICTS[result.verdict].label}
            </span>
            <span className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-500">자동·미검증</span>
          </div>

          <p className="mt-4 text-base text-slate-900 dark:text-white">“{result.claim}”</p>

          <div className="mt-5 space-y-3 text-sm">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
              <p className="font-medium text-slate-700 dark:text-slate-200">근거 체인 (Why-Trace)</p>
              <p className="mt-1 text-slate-500">
                판정 엔진(룰 + 클레임그래프) 연결 후, 트리플 분해 → 룰 발동 → 근거수준이 여기에 표시됩니다.
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
              <p className="font-medium text-slate-700 dark:text-slate-200">공식 출처</p>
              <p className="mt-1 text-slate-500">질병청·식약처 공식 문서 인용과 원문 링크가 여기에 표시됩니다.</p>
            </div>
          </div>

          <p className="mt-5 border-t border-slate-200 pt-3 text-xs text-slate-400 dark:border-slate-700">
            본 결과는 의료 진단이 아니며 참고용입니다. 증상이 의심되면 전문가와 상담하세요.
          </p>
        </section>
      )}

      <p className="mt-10 text-center text-xs text-slate-400">
        UI 미리보기 — 판정 엔진(Supabase Edge Function)·코퍼스 연결은 W1에서 진행됩니다.
      </p>
    </div>
  )
}
