import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import FontScale from '../components/FontScale'

/* 두 화면을 오갈 길 — 이게 없어서 지도 화면에 들어갈 방법이 아예 없었다.
   고향ON 이 메인이고, 팩트체커는 그 옆에 둔다. 예전 주소 /gohyang 도 메인과 같은 화면이라
   두 경로 모두에서 '고향ON' 이 선택된 것으로 보여야 한다. */
const NAV = [
  { to: '/', label: '고향ON', sub: '지도·소멸시계·후손', alsoActiveOn: '/gohyang' },
  { to: '/factcheck', label: '사실은ON 팩트체커', sub: '물어보기' },
] as const

function Nav() {
  return (
    <nav aria-label="주요 화면" className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
      {NAV.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) => {
            const active =
              isActive ||
              ('alsoActiveOn' in item && item.alsoActiveOn === window.location.pathname)
            return `rounded-lg px-2.5 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              active
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`
          }}
        >
          <span className="whitespace-nowrap">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export default function SasilOnLayout() {
  return (
    <div className="min-h-screen overflow-x-clip bg-slate-50 dark:bg-slate-950">
      {/* 기관 고지 — 이 서비스가 무엇이고 무엇이 아닌지 먼저 밝힌다 */}
      <div className="bg-slate-900 dark:bg-black">
        <p className="mx-auto max-w-2xl px-4 py-1.5 text-[11px] leading-relaxed text-slate-300 lg:max-w-6xl lg:px-6 xl:max-w-7xl">
          2026년 통일부 공공데이터 활용 공모전 출품 시제품 · 통일부 공식 서비스가 아니며,
          표시되는 모든 값은 공개된 통일부 데이터를 그대로 대조한 결과입니다.
        </p>
      </div>

      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 lg:max-w-6xl lg:px-6 xl:max-w-7xl">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-lg font-medium text-slate-900 dark:text-white">
              고향<span className="text-blue-700 dark:text-blue-400">ON</span>
            </span>
            <span className="hidden truncate text-xs text-slate-500 sm:inline">
              통일부 공공데이터로 읽는 이산가족과 고향
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Nav />
            <FontScale />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-12 pt-4 lg:max-w-6xl lg:px-6 xl:max-w-7xl">
        <Suspense fallback={<div className="py-20 text-center text-sm text-slate-400">불러오는 중…</div>}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="mx-auto w-full max-w-2xl px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:max-w-6xl lg:px-6 xl:max-w-7xl">
        <p className="break-keep border-t border-slate-100 pt-4 text-[11px] leading-relaxed text-slate-400 dark:border-slate-800">
          자료 출처: 통일부 공공데이터 · 본 화면은 아이디어 기획 부문 출품작의 실현가능성 검증용 시제품입니다.
        </p>
      </footer>
    </div>
  )
}