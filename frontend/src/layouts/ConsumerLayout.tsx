import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { HomeIcon, FireIcon, UserIcon } from '../components/icons'

const TABS = [
  { to: '/', label: '홈', Icon: HomeIcon, end: true },
  { to: '/trending', label: '유행', Icon: FireIcon, end: false },
  { to: '/me', label: '내정보', Icon: UserIcon, end: false },
]

export default function ConsumerLayout() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <span className="text-lg font-medium text-slate-900 dark:text-white">FactDoc</span>
        <span className="text-[11px] text-slate-400">국가 공식데이터 팩트체크</span>
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">
        <Suspense fallback={<div className="py-20 text-center text-sm text-slate-400">불러오는 중…</div>}>
          <Outlet />
        </Suspense>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto grid max-w-md grid-cols-3 border-t border-slate-100 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${isActive ? 'text-blue-600' : 'text-slate-400'}`
            }
          >
            <Icon className="h-6 w-6" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
