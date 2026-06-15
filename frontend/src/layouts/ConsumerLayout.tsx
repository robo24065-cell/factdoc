import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { HomeIcon, FireIcon, UserIcon } from '../components/icons'
import FontScale from '../components/FontScale'

const TABS = [
  { to: '/', label: '홈', Icon: HomeIcon, end: true },
  { to: '/trending', label: '유행', Icon: FireIcon, end: false },
  { to: '/me', label: '내정보', Icon: UserIcon, end: false },
]

export default function ConsumerLayout() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="text-lg font-medium text-slate-900 dark:text-white">FactDoc</span>
          <div className="flex items-center gap-2">
            {/* 데스크톱: 상단 네비 */}
            <nav className="hidden gap-1 lg:flex">
              {TABS.map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
            <FontScale />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-4 lg:pb-12">
        <Suspense fallback={<div className="py-20 text-center text-sm text-slate-400">불러오는 중…</div>}>
          <Outlet />
        </Suspense>
      </main>

      {/* 모바일: 하단 탭바 */}
      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto grid max-w-md grid-cols-3 border-t border-slate-100 bg-white/95 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
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
