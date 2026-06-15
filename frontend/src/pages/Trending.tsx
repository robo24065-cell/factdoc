import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchOutbreak, fetchTopDiseases, fetchTopMisinfo, type OutbreakRow, type TopClaim, type TopDisease } from '../lib/db'
import { preventionHint } from '../lib/prevention'
import { outbreakList } from './dashboardData'

function trendBadge(trend: string | null) {
  if (trend === 'up') return { t: '▲ 증가', c: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40' }
  if (trend === 'down') return { t: '▼ 감소', c: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40' }
  return { t: '— 유지', c: 'bg-slate-100 text-slate-500 dark:bg-slate-800' }
}

const FAKE_TOP = [
  { label: '당뇨가 특정 즙으로 완치된다', q: '당뇨는 △△즙으로 완치된대요' },
  { label: '독감백신은 효과가 없다', q: '독감백신은 효과 없대요' },
  { label: '건강기능식품이 병을 치료한다', q: '이 영양제가 당뇨를 치료한대요' },
  { label: '약 끊고 자연요법만 하면 된다', q: '당뇨에 좋다고 약 끊고 걷기만 하면 된대요' },
]

export default function Trending() {
  const [outbreak, setOutbreak] = useState<OutbreakRow[] | null>(null)
  const [top, setTop] = useState<TopClaim[] | null>(null)
  const [topDz, setTopDz] = useState<TopDisease[]>([])
  const [page, setPage] = useState(0)
  useEffect(() => { fetchOutbreak().then(setOutbreak); fetchTopMisinfo().then(setTop); fetchTopDiseases().then(setTopDz) }, [])
  const fakeRows = top && top.length ? top.map((t) => ({ label: t.claim, q: t.claim })) : FAKE_TOP

  const rows = outbreak && outbreak.length
    ? outbreak.map((o) => ({ name: o.disease, count: o.case_count ?? 0, trend: o.trend }))
    : outbreakList.map((o) => ({ name: o.name, count: null as number | null, trend: o.trend.includes('급증') || o.trend.includes('증가') ? 'up' : 'flat' }))

  return (
    <div>
      <h1 className="mt-2 text-[22px] font-semibold text-slate-900 dark:text-white">지금 조심하세요</h1>
      <p className="mt-1.5 text-sm text-slate-500">유행 중인 감염병과 떠도는 가짜정보를 모았어요.</p>

      {/* 감염병 현황판 디스커버리 배너 */}
      <Link to="/map"
        className="mt-4 flex items-center gap-3 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-sky-50 p-4 transition hover:shadow-md dark:border-blue-900/50 dark:from-blue-950/40 dark:to-slate-900">
        <span className="text-2xl">🗺️</span>
        <span className="flex-1">
          <span className="block text-sm font-semibold text-slate-900 dark:text-white">감염병 발생 현황판 보기</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">전국 시·도별 발생 분포·연도 흐름을 지도로 — 질병관리청 전수신고 데이터</span>
        </span>
        <span className="text-blue-500">›</span>
      </Link>

      {topDz.length > 0 && (
        <>
          <h2 className="mt-6 text-sm font-medium text-slate-700 dark:text-slate-200">🔥 많이 찾는 질병</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {topDz.map((d, i) => (
              <Link key={d.disease} to={`/disease/${encodeURIComponent(d.disease)}`}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <span className="text-xs font-semibold text-blue-500">{i + 1}</span>{d.disease}
                <span className="text-[11px] text-slate-400">{d.count}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {(() => {
        const PER = 5
        const pageCount = Math.max(1, Math.ceil(rows.length / PER))
        const p = Math.min(page, pageCount - 1)
        const pageRows = rows.slice(p * PER, p * PER + PER)
        return (
          <>
            <div className="mt-6 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">🦠 유행 중인 감염병 <span className="text-slate-400">({rows.length})</span></h2>
              <span className="text-[11px] text-slate-400">질병관리청 감염병포털</span>
            </div>
            <div className="mt-2 space-y-2">
              {pageRows.map((r) => {
                const b = trendBadge(r.trend)
                return (
                  <div key={r.name} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-900 dark:text-white">{r.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.c}`}>{b.t}</span>
                    </div>
                    {r.count != null && <p className="mt-0.5 text-xs text-slate-400">이번 주 {r.count.toLocaleString()}건</p>}
                    {(() => { const h = preventionHint(r.name); return (
                      <p className="mt-2 text-sm text-slate-500">{h ? `예방: ${h}` : '증상·예방수칙은 아래 관련 정보에서 확인하세요.'}</p>
                    ) })()}
                    <Link to={`/disease/${encodeURIComponent(r.name)}`}
                      className="mt-3 inline-block text-sm font-medium text-blue-600 dark:text-blue-400">관련 정보 확인하기 →</Link>
                  </div>
                )
              })}
            </div>
            {pageCount > 1 && (
              <div className="mt-3 flex items-center justify-center gap-1">
                <button type="button" disabled={p === 0} onClick={() => setPage(p - 1)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-500 disabled:opacity-30 dark:border-slate-700">‹</button>
                {Array.from({ length: pageCount }, (_, i) => (
                  <button key={i} type="button" onClick={() => setPage(i)}
                    className={`h-8 w-8 rounded-lg text-sm ${i === p ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>{i + 1}</button>
                ))}
                <button type="button" disabled={p >= pageCount - 1} onClick={() => setPage(p + 1)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-500 disabled:opacity-30 dark:border-slate-700">›</button>
              </div>
            )}
          </>
        )
      })()}

      <h2 className="mt-7 text-sm font-medium text-slate-700 dark:text-slate-200">⚠️ 이런 가짜정보 조심하세요</h2>
      <div className="mt-2 space-y-2">
        {fakeRows.map((f, i) => (
          <Link key={f.q} to={`/?q=${encodeURIComponent(f.q)}`}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500 dark:bg-slate-800">{i + 1}</span>
            <span className="flex-1 text-sm text-slate-800 dark:text-slate-100">{f.label}</span>
            <span className="text-slate-300">›</span>
          </Link>
        ))}
      </div>
      <p className="mt-4 text-center text-[11px] text-slate-400">탭하면 바로 검증할 수 있어요</p>
    </div>
  )
}
