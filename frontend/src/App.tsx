import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const linkClass = (isActive: boolean) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${
    isActive
      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
  }`

const NAV = [
  { to: '/', label: '검증', end: true },
  { to: '/compare', label: '비교', end: false },
  { to: '/eval', label: '평가', end: false },
  { to: '/review', label: '검토', end: false },
  { to: '/dashboard', label: '대시보드', end: false },
  { to: '/mypage', label: '마이페이지', end: false },
]

function Layout() {
  return (
    <div className="min-h-screen bg-white text-slate-700 dark:bg-slate-950 dark:text-slate-300">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <span className="text-xl font-medium text-slate-900 dark:text-white">FactDoc</span>
            <span className="ml-2 hidden text-xs text-slate-500 sm:inline">
              국가 공식데이터 건강정보 팩트체커
            </span>
          </div>
          <nav className="flex flex-wrap gap-1">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => linkClass(isActive)}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Suspense fallback={<div className="py-20 text-center text-sm text-slate-400">불러오는 중…</div>}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-10 pt-4 text-center text-xs text-slate-400">
        본 서비스는 의료 진단이 아니며 참고용입니다 · 출처: 질병관리청 · 식품의약품안전처
      </footer>
    </div>
  )
}

export default Layout
