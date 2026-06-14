import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { judge, parseClaim, type Judgement, type Verdict } from '../engine'
import { geminiTriples } from '../lib/parseRemote'
import { logQuery } from '../lib/db'
import { getCachedVerdict, cacheVerdict } from '../lib/cache'

const VUI: Record<Verdict, { label: string; sub: string; text: string; bg: string; accent: string }> = {
  true: { label: '사실이에요', sub: '국가 공식 근거와 일치해요', text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-950/30', accent: 'bg-emerald-500' },
  partial: { label: '일부만 맞아요', sub: '과장되었거나 조건이 빠졌어요', text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-950/30', accent: 'bg-amber-500' },
  false: { label: '사실이 아니에요', sub: '국가 공식 근거와 달라요', text: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-50 dark:bg-rose-950/30', accent: 'bg-rose-500' },
  unverified: { label: '확인이 어려워요', sub: '공식 데이터에 근거가 없어요', text: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800/60', accent: 'bg-slate-400' },
}

const EXAMPLES = ['당뇨는 △△즙으로 완치된대요', '이 영양제가 당뇨를 치료한대요', '홍삼이 면역력에 좋대요', '독감백신은 효과 없대요']

export default function Home() {
  const [params] = useSearchParams()
  const [input, setInput] = useState('')
  const [result, setResult] = useState<Judgement | null>(null)
  const [hit, setHit] = useState(false)
  const [loading, setLoading] = useState(false)

  async function check(text: string) {
    const claim = text.trim()
    if (!claim) return
    setLoading(true)
    const cached = await getCachedVerdict(claim)
    if (cached) {
      setResult(cached.judgement); setHit(true) // 캐시 히트(중복 질문)는 로그/집계 안 함
    } else {
      // 규칙 파서 + Gemini 파서 결합(중복 제거) → 룰·그래프 판정
      const seen = new Set<string>()
      const triples = [...parseClaim(claim), ...(await geminiTriples(claim))].filter((t) => {
        const k = `${t.subject}|${t.relation}|${t.objectDisease}|${t.polarity}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      const j = judge(triples, claim)
      setResult(j); setHit(false); void cacheVerdict(claim, j); void logQuery(claim, j.verdict)
    }
    setLoading(false)
  }

  useEffect(() => {
    const q = params.get('q')
    if (q) { setInput(q); void check(q) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  function share() {
    if (!result) return
    const text = `[FactDoc] "${result.claimText}" → ${VUI[result.verdict].label}\n국가 공식데이터로 확인했어요.`
    if (typeof navigator !== 'undefined' && navigator.share) navigator.share({ text }).catch(() => {})
    else navigator.clipboard?.writeText(text).catch(() => {})
  }

  const vui = result ? VUI[result.verdict] : null
  const steps = result ? result.trace.filter((s) => s.outcome && s.kind !== 'normalize') : []

  return (
    <div>
      <h1 className="mt-2 text-[22px] font-semibold leading-snug text-slate-900 dark:text-white">건강 정보,<br />진짜일까요?</h1>
      <p className="mt-1.5 text-sm text-slate-500">TV·유튜브·단톡방에서 본 건강 주장을 국가 공식 데이터로 확인해드려요.</p>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          placeholder="예: 당뇨는 △△즙으로 완치된대요"
          className="w-full resize-none rounded-xl bg-transparent p-2 text-base text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
        />
        <button
          type="button"
          onClick={() => check(input)}
          disabled={!input.trim() || loading}
          className="mt-1 w-full rounded-xl bg-blue-600 py-3.5 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-40"
        >
          {loading ? '확인 중…' : '확인하기'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" onClick={() => { setInput(ex); check(ex) }}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            {ex}
          </button>
        ))}
      </div>

      {result && vui && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className={`flex items-center gap-3 p-4 ${vui.bg}`}>
            <div className={`h-11 w-1.5 rounded-full ${vui.accent}`} />
            <div>
              <p className={`text-lg font-semibold ${vui.text}`}>{vui.label}</p>
              <p className="text-xs text-slate-500">{vui.sub}</p>
            </div>
            {hit && <span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">빠른 응답</span>}
          </div>

          <div className="p-4">
            <p className="text-xs text-slate-400">입력한 내용</p>
            <p className="mt-1 text-slate-800 dark:text-slate-100">“{result.claimText}”</p>

            {result.warning && (
              <div className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">⚠ {result.warning}</div>
            )}

            {steps.length > 0 && (
              <details className="group mt-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium text-slate-700 dark:text-slate-200 [&::-webkit-details-marker]:hidden">
                  왜 이렇게 판정했나요?
                  <span className="text-slate-400 transition group-open:rotate-180">▾</span>
                </summary>
                <ol className="space-y-2 border-t border-slate-100 p-3 text-sm dark:border-slate-800">
                  {steps.map((s, i) => (
                    <li key={i} className="text-slate-600 dark:text-slate-300">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{s.label}</span>
                      {s.detail && <span className="text-slate-500"> · {s.detail}</span>}
                    </li>
                  ))}
                </ol>
              </details>
            )}

            {result.citations.length > 0 && (
              <details className="group mt-2 rounded-xl border border-slate-200 dark:border-slate-800">
                <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium text-slate-700 dark:text-slate-200 [&::-webkit-details-marker]:hidden">
                  공식 출처 {result.citations.length}곳
                  <span className="text-slate-400 transition group-open:rotate-180">▾</span>
                </summary>
                <ul className="space-y-1 border-t border-slate-100 p-3 text-sm dark:border-slate-800">
                  {result.citations.map((c, i) => (
                    <li key={i}>
                      <a href={c.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">{c.portal} — {c.title}</a>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <button type="button" onClick={share}
              className="mt-4 w-full rounded-xl bg-amber-300 py-3 text-sm font-semibold text-amber-900 active:scale-[0.99]">
              카카오톡으로 공유하기
            </button>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{result.disclaimer}</p>
          </div>
        </div>
      )}
    </div>
  )
}
