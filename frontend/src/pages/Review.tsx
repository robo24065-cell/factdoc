import { useEffect, useState } from 'react'
import { fetchReviewQueue, setTier, type ReviewItem } from '../lib/cache'
import type { Verdict } from '../engine'

const VLABEL: Record<Verdict, { label: string; badge: string }> = {
  true: { label: '사실', badge: 'bg-emerald-100 text-emerald-800' },
  partial: { label: '부분과장', badge: 'bg-amber-100 text-amber-800' },
  false: { label: '허위', badge: 'bg-rose-100 text-rose-800' },
  unverified: { label: '보류', badge: 'bg-slate-200 text-slate-700' },
}

export default function Review() {
  const [items, setItems] = useState<ReviewItem[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  useEffect(() => { fetchReviewQueue().then(setItems) }, [])

  async function change(id: number, tier: 'verified' | 'auto_unverified') {
    setBusy(id)
    await setTier(id, tier)
    const next = await fetchReviewQueue()
    setItems(next)
    setBusy(null)
  }

  const verified = items?.filter((i) => i.tier === 'verified').length ?? 0
  const pending = items?.filter((i) => i.tier === 'auto_unverified').length ?? 0

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-medium text-slate-900 dark:text-white">사람 검토 큐</h1>
      <p className="mt-1 text-sm text-slate-500">
        자동·미검증 판정을 사람이 검토해 ‘검증완료’로 승격합니다(환각 캐시 금지 가드레일). 조회수 높은 순.
      </p>

      {items === null ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Supabase 연결이 필요합니다. (로컬 모드에서는 검토 큐를 사용할 수 없습니다 — 환경변수 설정 후 사용.)
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          아직 검증 기록이 없습니다. ‘검증’ 탭에서 주장을 입력하면 여기에 쌓입니다.
        </div>
      ) : (
        <>
          <div className="mt-6 flex gap-2 text-xs">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">검증완료 {verified}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-500 dark:bg-slate-800">대기 {pending}</span>
          </div>
          <ul className="mt-3 space-y-2">
            {items.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-800 dark:text-slate-100">{it.canonical_claim}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded px-1.5 py-0.5 ${VLABEL[it.verdict].badge}`}>{VLABEL[it.verdict].label}</span>
                    <span className={`rounded px-1.5 py-0.5 ${it.tier === 'verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {it.tier === 'verified' ? '검증완료' : '자동·미검증'}
                    </span>
                    <span className="text-slate-400">조회 {it.query_count}</span>
                  </div>
                </div>
                {it.tier === 'verified' ? (
                  <button type="button" disabled={busy === it.id} onClick={() => change(it.id, 'auto_unverified')}
                    className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    되돌리기
                  </button>
                ) : (
                  <button type="button" disabled={busy === it.id} onClick={() => change(it.id, 'verified')}
                    className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-white dark:text-slate-900">
                    검증완료로 승격
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
