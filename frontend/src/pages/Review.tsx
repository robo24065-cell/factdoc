import { useEffect, useState } from 'react'
import { fetchReviewQueue, setTier, setVerdict, deleteCached, flagForReview, type ReviewItem } from '../lib/cache'
import type { Verdict } from '../engine'

const VLABEL: Record<Verdict, { label: string; badge: string }> = {
  true: { label: '사실', badge: 'bg-emerald-100 text-emerald-800' },
  partial: { label: '부분과장', badge: 'bg-amber-100 text-amber-800' },
  false: { label: '허위', badge: 'bg-rose-100 text-rose-800' },
  unverified: { label: '보류', badge: 'bg-slate-200 text-slate-700' },
}
const VERDICTS: Verdict[] = ['true', 'partial', 'false', 'unverified']
const STALE_DAYS = 30

function isStale(createdAt: string): boolean {
  const d = Date.parse(createdAt)
  return Number.isFinite(d) && Date.now() - d > STALE_DAYS * 86400000
}

export default function Review() {
  const [items, setItems] = useState<ReviewItem[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  useEffect(() => { fetchReviewQueue().then(setItems) }, [])
  async function refresh() { setItems(await fetchReviewQueue()) }
  async function run(id: number, fn: () => Promise<unknown>) { setBusy(id); await fn(); await refresh(); setBusy(null) }

  const verified = items?.filter((i) => i.tier === 'verified').length ?? 0
  const pending = items?.filter((i) => i.tier === 'auto_unverified').length ?? 0
  const flagged = items?.filter((i) => i.needs_review).length ?? 0

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-medium text-slate-900 dark:text-white">사람 검토 큐</h1>
      <p className="mt-1 text-sm text-slate-500">
        판정 교정·검증완료 승격·삭제·재검토. 재검토 필요/조회수 높은 순.
      </p>

      {items === null ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Supabase 연결이 필요합니다. (로컬 모드에서는 검토 큐를 사용할 수 없습니다.)
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          아직 검증 기록이 없습니다. 사용자 ‘홈’에서 주장을 검증하면 여기에 쌓입니다.
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">재검토 {flagged}</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">검증완료 {verified}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-500 dark:bg-slate-800">대기 {pending}</span>
          </div>

          <ul className="mt-3 space-y-2">
            {items.map((it) => {
              const stale = it.tier === 'verified' && isStale(it.created_at)
              return (
                <li key={it.id} className={`rounded-xl border p-3 ${it.needs_review ? 'border-rose-300 bg-rose-50/40 dark:border-rose-900 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-800'}`}>
                  <p className="text-sm text-slate-800 dark:text-slate-100">{it.canonical_claim}</p>

                  {it.needs_review && it.review_reason && (
                    <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">⟳ 재검토 사유: {it.review_reason}</p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${VLABEL[it.verdict].badge}`}>{VLABEL[it.verdict].label}</span>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${it.tier === 'verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {it.tier === 'verified' ? '검증완료' : '자동·미검증'}
                    </span>
                    {stale && <span className="rounded px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700">오래됨 · 재검토 권장</span>}
                    <span className="text-xs text-slate-400">조회 {it.query_count}</span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={it.verdict}
                      disabled={busy === it.id}
                      onChange={(e) => run(it.id, () => setVerdict(it.id, e.target.value as Verdict))}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      {VERDICTS.map((v) => <option key={v} value={v}>판정: {VLABEL[v].label}</option>)}
                    </select>

                    {it.tier === 'verified' ? (
                      <button type="button" disabled={busy === it.id} onClick={() => run(it.id, () => setTier(it.id, 'auto_unverified'))}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                        되돌리기
                      </button>
                    ) : (
                      <button type="button" disabled={busy === it.id} onClick={() => run(it.id, () => setTier(it.id, 'verified'))}
                        className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-white dark:text-slate-900">
                        승격
                      </button>
                    )}

                    <button type="button" disabled={busy === it.id}
                      onClick={() => { const r = window.prompt('재검토 사유를 입력하세요', stale ? '오래된 항목 정기 재검토' : '재확인 필요'); if (r) run(it.id, () => flagForReview(it.id, r)) }}
                      className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-40 dark:border-amber-900 dark:text-amber-300">
                      재검토
                    </button>

                    <button type="button" disabled={busy === it.id}
                      onClick={() => { if (window.confirm('이 항목을 삭제할까요?')) run(it.id, () => deleteCached(it.id)) }}
                      className="rounded-lg border border-rose-300 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:border-rose-900 dark:text-rose-300">
                      삭제
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-[11px] text-slate-400">판정 변경/승격하면 검증완료 처리됩니다. ‘재검토’는 검증완료를 다시 대기로 되돌리고 사유를 남깁니다.</p>
        </>
      )}
    </div>
  )
}
