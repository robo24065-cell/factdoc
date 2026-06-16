import { useEffect, useMemo, useState } from 'react'
import { fetchReviewQueue, setTier, setVerdict, deleteCached, flagForReview, type ReviewItem } from '../lib/cache'
import type { Verdict } from '../engine'

const VLABEL: Record<Verdict, { label: string; badge: string; chip: string }> = {
  true: { label: '사실', badge: 'bg-emerald-100 text-emerald-800', chip: 'bg-emerald-600 text-white' },
  partial: { label: '부분과장', badge: 'bg-amber-100 text-amber-800', chip: 'bg-amber-500 text-white' },
  false: { label: '허위', badge: 'bg-rose-100 text-rose-800', chip: 'bg-rose-600 text-white' },
  unverified: { label: '보류', badge: 'bg-slate-200 text-slate-700', chip: 'bg-slate-600 text-white' },
}
const VERDICTS: Verdict[] = ['true', 'partial', 'false', 'unverified']
const STALE_DAYS = 30
const isStale = (createdAt: string) => { const d = Date.parse(createdAt); return Number.isFinite(d) && Date.now() - d > STALE_DAYS * 86400000 }

// AI 1차 검토 후기 — 항목 상태로 권장 액션 산출(배포 시 review-answer AI로 업그레이드, 현재는 규칙).
function aiHint(it: ReviewItem): { note: string; tone: 'warn' | 'ok' | 'info' } {
  if (it.needs_review) return { note: `재검토 플래그 — ${it.review_reason || '재확인 필요'}`, tone: 'warn' }
  if (it.tier === 'verified' && isStale(it.created_at)) return { note: '검증완료 후 30일 경과 — 정기 재검증 권장', tone: 'warn' }
  if (it.verdict === 'unverified' && it.query_count >= 3) return { note: `수요 높은 보류(조회 ${it.query_count}) — 코퍼스 보강 후 검증 승격 1순위`, tone: 'warn' }
  if (it.verdict === 'unverified') return { note: '근거 없는 보류 — 코퍼스 커버리지 확인 대상', tone: 'info' }
  if (it.tier === 'verified') return { note: '사람 검증완료 — 조치 불필요', tone: 'ok' }
  return { note: '자동 판정 — 스팟체크 후 ✓승격 가능해 보임', tone: 'ok' }
}
const HINT_C: Record<string, string> = { warn: 'text-amber-700 dark:text-amber-300', ok: 'text-emerald-700 dark:text-emerald-300', info: 'text-slate-500 dark:text-slate-400' }

type Filter = 'all' | 'flagged' | 'pending' | 'verified'

export default function Review() {
  const [items, setItems] = useState<ReviewItem[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')

  useEffect(() => { fetchReviewQueue().then(setItems) }, [])
  async function refresh() { setItems(await fetchReviewQueue()) }
  async function run(id: number, fn: () => Promise<unknown>) { setBusy(id); await fn(); await refresh(); setBusy(null) }

  const counts = useMemo(() => ({
    all: items?.length ?? 0,
    flagged: items?.filter((i) => i.needs_review).length ?? 0,
    pending: items?.filter((i) => i.tier === 'auto_unverified').length ?? 0,
    verified: items?.filter((i) => i.tier === 'verified').length ?? 0,
  }), [items])

  const shown = useMemo(() => {
    let r = items ?? []
    if (filter === 'flagged') r = r.filter((i) => i.needs_review)
    else if (filter === 'pending') r = r.filter((i) => i.tier === 'auto_unverified')
    else if (filter === 'verified') r = r.filter((i) => i.tier === 'verified')
    const kw = q.trim().toLowerCase()
    if (kw) r = r.filter((i) => i.canonical_claim.toLowerCase().includes(kw))
    return r
  }, [items, filter, q])

  const TABS: { k: Filter; label: string; c: string }[] = [
    { k: 'all', label: '전체', c: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
    { k: 'flagged', label: '재검토', c: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
    { k: 'pending', label: '대기', c: 'bg-slate-100 text-slate-500 dark:bg-slate-800' },
    { k: 'verified', label: '검증완료', c: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  ]

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-medium text-slate-900 dark:text-white">사람 검토 큐</h1>
      <p className="mt-1 text-sm text-slate-500">판정 교정·검증완료 승격·재검토·삭제. 빠른 판정은 아래 색 버튼을 누르세요.</p>

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
          {/* 필터 탭 + 검색 */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {TABS.map((t) => (
              <button key={t.k} onClick={() => setFilter(t.k)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${filter === t.k ? 'bg-blue-600 text-white' : t.c}`}>
                {t.label} {counts[t.k]}
              </button>
            ))}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="주장 검색…"
              className="ml-auto w-40 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" />
          </div>

          {shown.length === 0 ? (
            <p className="mt-8 text-center text-sm text-slate-400">해당하는 항목이 없습니다.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {shown.map((it) => {
                const stale = it.tier === 'verified' && isStale(it.created_at)
                const hint = aiHint(it)
                return (
                  <li key={it.id} className={`rounded-2xl border bg-white p-3.5 shadow-sm dark:bg-slate-900 ${it.needs_review ? 'border-rose-200 dark:border-rose-900/60' : 'border-slate-200 dark:border-slate-800'}`}>
                    {/* 줄1: 현재 판정 배지 + 클레임 + 메타 */}
                    <div className="flex items-start gap-2.5">
                      <span className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${VLABEL[it.verdict].badge}`}>{VLABEL[it.verdict].label}</span>
                      <p className="flex-1 text-sm leading-snug text-slate-800 dark:text-slate-100">{it.canonical_claim}</p>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${it.tier === 'verified' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{it.tier === 'verified' ? '✓ 검증완료' : '자동·미검증'}</span>
                        <span className="text-[10px] text-slate-400">조회 {it.query_count}{stale ? ' · 오래됨' : ''}</span>
                      </div>
                    </div>

                    {/* 줄2: AI 1차 검토 후기 */}
                    <p className={`mt-2 text-[11px] ${HINT_C[hint.tone]}`}>🤖 AI 검토: {hint.note}</p>

                    {/* 줄3: 판정 교정 + 액션(구분선으로 그룹) */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                      {VERDICTS.map((v) => (
                        <button key={v} type="button" disabled={busy === it.id} onClick={() => run(it.id, () => setVerdict(it.id, v))}
                          className={`rounded-md px-2 py-1 text-xs font-medium transition disabled:opacity-40 ${it.verdict === v ? VLABEL[v].chip : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'}`}>
                          {VLABEL[v].label}
                        </button>
                      ))}
                      <span className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-slate-700" />
                      {it.tier === 'verified' ? (
                        <button type="button" disabled={busy === it.id} onClick={() => run(it.id, () => setTier(it.id, 'auto_unverified'))}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300">되돌리기</button>
                      ) : (
                        <button type="button" disabled={busy === it.id} onClick={() => run(it.id, () => setTier(it.id, 'verified'))}
                          className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-white dark:text-slate-900">✓ 승격</button>
                      )}
                      <button type="button" disabled={busy === it.id}
                        onClick={() => { const r = window.prompt('재검토 사유', stale ? '오래된 항목 정기 재검토' : '재확인 필요'); if (r) run(it.id, () => flagForReview(it.id, r)) }}
                        className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-40 dark:border-amber-900 dark:text-amber-300">재검토</button>
                      <button type="button" disabled={busy === it.id}
                        onClick={() => { if (window.confirm('삭제할까요?')) run(it.id, () => deleteCached(it.id)) }}
                        className="ml-auto rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-500 hover:bg-rose-50 disabled:opacity-40 dark:border-rose-900/60 dark:text-rose-300">삭제</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-slate-400">색 판정 버튼 = 즉시 교정+검증완료 처리. 탭/검색으로 필요한 항목만 골라 관리하세요.</p>
        </>
      )}
    </div>
  )
}
