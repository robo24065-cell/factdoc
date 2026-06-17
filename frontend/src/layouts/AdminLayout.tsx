import { Suspense, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { isAdmin, login, logout } from '../lib/admin'
import { ShieldIcon } from '../components/icons'

const NAV = [
  { to: '/admin', label: '대시보드', end: true },
  { to: '/admin/strategy', label: '전략 분석', end: false },
  { to: '/admin/review', label: '검토 큐', end: false },
  { to: '/admin/eval', label: '평가', end: false },
  { to: '/admin/compare', label: '비교 데모', end: false },
]

export default function AdminLayout() {
  const [authed, setAuthed] = useState(isAdmin())
  const [pw, setPw] = useState('')
  const [err, setErr] = useState(false)

  if (!authed) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-6">
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <ShieldIcon className="h-5 w-5" />
            <h1 className="text-lg font-medium">관리자 로그인</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">운영자 전용 콘솔입니다.</p>
          <input
            type="password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setErr(false) }}
            onKeyDown={(e) => e.key === 'Enter' && (login(pw) ? setAuthed(true) : setErr(true))}
            placeholder="비밀번호"
            className="mt-4 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          {err && <p className="mt-2 text-xs text-rose-600">비밀번호가 올바르지 않습니다.</p>}
          <button
            type="button"
            onClick={() => (login(pw) ? setAuthed(true) : setErr(true))}
            className="mt-3 w-full rounded-xl bg-slate-900 py-3 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"
          >
            로그인
          </button>
          <Link to="/" className="mt-4 block text-center text-xs text-slate-400 hover:text-slate-600">← 사용자 화면으로</Link>
          <p className="mt-4 text-[11px] text-slate-400">데모 게이트 — 운영 시 Supabase Auth + 역할 기반 RLS로 교체</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex shrink-0 items-center gap-2">
            <ShieldIcon className="h-5 w-5 text-slate-500" />
            <span className="font-medium text-slate-900 dark:text-white">FactDoc 관리자</span>
          </div>
          {/* 모바일: 줄바꿈 대신 가로 스크롤(탭 5개+이상이면 자연스럽게) */}
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `shrink-0 rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
            <Link to="/" className="ml-2 shrink-0 rounded-md px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">사용자 화면</Link>
            <button type="button" onClick={() => { logout(); setAuthed(false) }} className="shrink-0 rounded-md px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">로그아웃</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Suspense fallback={<div className="py-20 text-center text-sm text-slate-400">불러오는 중…</div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
