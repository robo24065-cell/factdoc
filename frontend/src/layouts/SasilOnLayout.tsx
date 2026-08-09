import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import FontScale from '../components/FontScale'

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
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3 lg:max-w-6xl lg:px-6 xl:max-w-7xl">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-lg font-medium text-slate-900 dark:text-white">
              사실은<span className="text-blue-700 dark:text-blue-400">ON</span>
            </span>
            <span className="hidden truncate text-xs text-slate-500 sm:inline">
              통일부 공공데이터 팩트체커
            </span>
          </div>
          <FontScale />
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