import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchOutbreak, fetchTopMisinfo, type OutbreakRow, type TopClaim } from '../lib/db'
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
  useEffect(() => { fetchOutbreak().then(setOutbreak); fetchTopMisinfo().then(setTop) }, [])
  const fakeRows = top && top.length ? top.map((t) => ({ label: t.claim, q: t.claim })) : FAKE_TOP

  const rows = outbreak && outbreak.length
    ? outbreak.map((o) => ({ name: o.disease, count: o.case_count ?? 0, trend: o.trend }))
    : outbreakList.map((o) => ({ name: o.name, count: null as number | null, trend: o.trend.includes('급증') || o.trend.includes('증가') ? 'up' : 'flat' }))

  return (
    <div>
      <h1 className="mt-2 text-[22px] font-semibold text-slate-900 dark:text-white">지금 조심하세요</h1>
      <p className="mt-1.5 text-sm text-slate-500">유행 중인 감염병과 떠도는 가짜정보를 모았어요.</p>

      <h2 className="mt-6 text-sm font-medium text-slate-700 dark:text-slate-200">🦠 유행 중인 감염병</h2>
      <div className="mt-2 space-y-2">
        {rows.map((r) => {
          const b = trendBadge(r.trend)
          return (
            <div key={r.name} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900 dark:text-white">{r.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.c}`}>{b.t}</span>
              </div>
              {r.count != null && <p className="mt-0.5 text-xs text-slate-400">이번 주 {r.count.toLocaleString()}건</p>}
              <p className="mt-2 text-sm text-slate-500">예방수칙: 손 씻기 · 기침 예절 · 예방접종 (질병청 권고)</p>
              <Link to={`/disease/${encodeURIComponent(r.name)}`}
                className="mt-3 inline-block text-sm font-medium text-blue-600 dark:text-blue-400">관련 정보 확인하기 →</Link>
            </div>
          )
        })}
      </div>

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
