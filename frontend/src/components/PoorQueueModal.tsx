// 부실응답 큐 — 전체화면 검토 창. 필터·검색·정렬·체크박스 일괄(삭제/다운로드)·아코디언·페이지네이션.
// 대시보드 패널의 '전체화면' 버튼에서 염. 데이터는 부모가 주입(loadPoorQueue 결과).
import { useEffect, useMemo, useState } from 'react'
import { deletePoorItem, poorQueueCSV, poorQueueTXT, feedbackStats, resetFeedbackStats, type PoorItem } from '../lib/feedback'

type Filt = 'all' | 'poor' | 'looks-ok' | 'pending'
const VB: Record<string, { t: string; c: string }> = {
  poor: { t: '부실 의심', c: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300' },
  'looks-ok': { t: '양호(오클릭?)', c: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
  pending: { t: '검토대기', c: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300' },
}
const PER = 10

function download(name: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href)
}

export default function PoorQueueModal({ items, onClose, onChanged }: { items: PoorItem[]; onClose: () => void; onChanged: () => void }) {
  const [filt, setFilt] = useState<Filt>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'new' | 'old'>('new')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [stVer, setStVer] = useState(0)

  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h) }, [onClose])
  useEffect(() => { setPage(0) }, [filt, q, sort])

  const st = useMemo(() => feedbackStats(), [items, stVer])
  function resetCounts() { if (!confirm('만족·불만족 누계 카운트를 0으로 초기화할까요? (큐 항목은 유지)')) return; resetFeedbackStats(); setStVer((v) => v + 1) }
  const counts = useMemo(() => ({
    all: items.length,
    poor: items.filter((i) => i.aiVerdict === 'poor').length,
    'looks-ok': items.filter((i) => i.aiVerdict === 'looks-ok').length,
    pending: items.filter((i) => i.aiVerdict === 'pending').length,
  }), [items])

  const filtered = useMemo(() => {
    let r = items
    if (filt !== 'all') r = r.filter((i) => i.aiVerdict === filt)
    const kw = q.trim().toLowerCase()
    if (kw) r = r.filter((i) => (i.claim + ' ' + (i.userReason ?? '') + ' ' + i.aiReason).toLowerCase().includes(kw))
    r = [...r].sort((a, b) => (sort === 'new' ? b.ts - a.ts : a.ts - b.ts))
    return r
  }, [items, filt, q, sort])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER))
  const p = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(p * PER, p * PER + PER)

  const selItems = items.filter((i) => sel.has(i.id))
  const allOnPageSelected = pageItems.length > 0 && pageItems.every((i) => sel.has(i.id))
  function toggleSel(id: string) { setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function togglePage() { setSel((s) => { const n = new Set(s); if (allOnPageSelected) pageItems.forEach((i) => n.delete(i.id)); else pageItems.forEach((i) => n.add(i.id)); return n }) }

  async function delSelected() {
    if (!selItems.length) return
    if (!confirm(`선택한 ${selItems.length}건을 삭제할까요?`)) return
    for (const it of selItems) await deletePoorItem(it)
    setSel(new Set()); setStVer((v) => v + 1); onChanged()
  }
  async function delOne(it: PoorItem) { if (!confirm('이 신고를 삭제할까요?')) return; await deletePoorItem(it); setStVer((v) => v + 1); onChanged() }

  const dlBase = selItems.length ? selItems : filtered
  const dlLabel = selItems.length ? `선택 ${selItems.length}건` : `${filtered.length}건`

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="m-auto flex h-[92vh] w-[min(96vw,1100px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">🗂 부실응답 큐 — 전체 검토</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span>사용자 불만족 → AI/규칙 1차 검토 적재 · 👍 {st.up} · 👎 {st.down} · 총 {items.length}건</span>
              <button onClick={resetCounts} title="만족·불만족 누계 0으로 초기화" className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:border-slate-700 dark:hover:bg-slate-800">↺ 카운트 초기화</button>
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">닫기 ✕</button>
        </div>

        {/* 툴바: 필터·검색·정렬 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2.5 dark:border-slate-800">
          {(['all', 'poor', 'pending', 'looks-ok'] as Filt[]).map((f) => (
            <button key={f} onClick={() => setFilt(f)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${filt === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>
              {f === 'all' ? '전체' : VB[f].t} {counts[f]}
            </button>
          ))}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="질문·사유 검색…"
            className="ml-auto w-44 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
          <button onClick={() => setSort((s) => (s === 'new' ? 'old' : 'new'))} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
            {sort === 'new' ? '최신순 ↓' : '오래된순 ↑'}
          </button>
        </div>

        {/* 일괄 작업 바 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/30">
          <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={allOnPageSelected} onChange={togglePage} className="h-3.5 w-3.5 accent-blue-600" />
            이 페이지 전체
          </label>
          <span className="text-slate-400">선택 {sel.size}건</span>
          {sel.size > 0 && <button onClick={() => setSel(new Set())} className="text-slate-400 hover:text-slate-600">해제</button>}
          <button onClick={delSelected} disabled={!sel.size}
            className="rounded-md border border-rose-200 px-2 py-0.5 font-medium text-rose-500 hover:bg-rose-50 disabled:opacity-30 dark:border-rose-900/60 dark:text-rose-300">선택 삭제</button>
          <span className="ml-auto text-slate-400">다운로드 ({dlLabel}):</span>
          <button onClick={() => download(`factdoc_부실응답_${dlBase.length}건.csv`, poorQueueCSV(dlBase), 'text/csv;charset=utf-8')}
            className="rounded-md border border-slate-200 px-2 py-0.5 font-medium text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-300">⬇ 엑셀(CSV)</button>
          <button onClick={() => download(`factdoc_부실응답_${dlBase.length}건.txt`, poorQueueTXT(dlBase), 'text/plain;charset=utf-8')}
            className="rounded-md border border-slate-200 px-2 py-0.5 font-medium text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-300">⬇ 텍스트(TXT)</button>
        </div>

        {/* 리스트 */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {filtered.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">해당하는 신고가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {pageItems.map((it) => {
                const vb = VB[it.aiVerdict] || VB.pending
                const isOpen = open === it.id
                return (
                  <li key={it.id} className={`rounded-xl border bg-white dark:bg-slate-900 ${sel.has(it.id) ? 'border-blue-300 dark:border-blue-800' : 'border-slate-200 dark:border-slate-800'}`}>
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <input type="checkbox" checked={sel.has(it.id)} onChange={() => toggleSel(it.id)} className="h-3.5 w-3.5 shrink-0 accent-blue-600" />
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${vb.c}`}>{vb.t}</span>
                      <button onClick={() => setOpen(isOpen ? null : it.id)} className="flex-1 truncate text-left text-sm text-slate-800 hover:text-blue-600 dark:text-slate-100">{it.claim || '(제목 없음)'}</button>
                      {it.userReason && <span className="hidden shrink-0 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-500 sm:inline dark:bg-rose-950/40 dark:text-rose-300">🙋 {it.userReason.length > 14 ? it.userReason.slice(0, 14) + '…' : it.userReason}</span>}
                      <span className="shrink-0 text-[10px] text-slate-400">{it.ts ? new Date(it.ts).toLocaleDateString() : ''}</span>
                      <button onClick={() => setOpen(isOpen ? null : it.id)} className="shrink-0 text-slate-400 transition" style={{ transform: isOpen ? 'rotate(180deg)' : '' }}>▾</button>
                      <button onClick={() => delOne(it)} className="shrink-0 text-[11px] text-rose-400 hover:text-rose-600">삭제</button>
                    </div>
                    {isOpen && (
                      <div className="border-t border-slate-100 px-3 py-2.5 dark:border-slate-800">
                        {it.userReason && <p className="text-xs font-medium text-rose-600 dark:text-rose-300">🙋 사용자 불만 사유: {it.userReason}</p>}
                        <p className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">🤖 AI 검토: {it.aiReason || '—'}</p>
                        <p className="mt-1 text-[11px] text-slate-400">판정: {it.verdict || '—'} · 일시: {it.ts ? new Date(it.ts).toLocaleString('ko-KR') : '—'}</p>
                        <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">{it.snapshot || '(스냅샷 없음)'}</pre>
                        <a href={`/?q=${encodeURIComponent(it.claim)}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[11px] font-medium text-blue-600 dark:text-blue-400">이 질문 다시 검증해보기 →</a>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* 페이지네이션 */}
        {pageCount > 1 && (
          <div className="flex items-center justify-center gap-1 border-t border-slate-100 px-5 py-2.5 dark:border-slate-800">
            <button disabled={p === 0} onClick={() => setPage(p - 1)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-500 disabled:opacity-30 dark:border-slate-700">‹</button>
            {Array.from({ length: pageCount }, (_, i) => i).filter((i) => Math.abs(i - p) <= 3 || i === 0 || i === pageCount - 1).map((i, idx, arr) => (
              <span key={i} className="flex items-center">
                {idx > 0 && arr[idx - 1] !== i - 1 && <span className="px-1 text-slate-300">…</span>}
                <button onClick={() => setPage(i)} className={`h-8 min-w-8 rounded-lg px-2 text-sm ${i === p ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>{i + 1}</button>
              </span>
            ))}
            <button disabled={p >= pageCount - 1} onClick={() => setPage(p + 1)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-500 disabled:opacity-30 dark:border-slate-700">›</button>
            <span className="ml-2 text-[11px] text-slate-400">{filtered.length}건 · {p + 1}/{pageCount}p</span>
          </div>
        )}
      </div>
    </div>
  )
}
