import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import FontScale from '../components/FontScale'
import { SURFACE, TEXT, TYPE, PROSE, FOCUS, BTN } from '../theme/gohyang'

/* 고향ON 껍데기 — 기록보관소의 종이 위에 놓인 화면.
   ㆍ상단 고지는 지우지 않는다. 이 서비스가 통일부 공식 서비스가 아니라는 사실을
     화면 어디에서도 오해할 수 없게 두는 것이 이 프로젝트의 규약이다.
   ㆍ내비게이션이 곧 접근 경로다. 없애면 지도 화면에 들어갈 길이 사라진다. */

const NAV = [
  { to: '/', label: '고향ON', hint: '지도 · 소멸시계 · 후손', alias: '/gohyang' },
  { to: '/factcheck', label: '팩트체커', hint: '물어보기' },
] as const

function Nav() {
  const { pathname } = useLocation()
  return (
    <nav aria-label="주요 화면" className="flex items-center gap-0.5 rounded-full border border-[#e6ddd0] bg-white/70 p-0.5 dark:border-[#242d38] dark:bg-[#141b23]/70">
      {NAV.map(item => {
        const active = pathname === item.to || ('alias' in item && pathname === item.alias)
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            title={item.hint}
            aria-current={active ? 'page' : undefined}
            className={`${BTN.seg} ${active ? BTN.segOn : BTN.segOff} ${FOCUS}`}
          >
            <span className="whitespace-nowrap">{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

export default function SasilOnLayout() {
  return (
    <div className={`min-h-screen overflow-x-clip ${SURFACE.page}`}>
      {/* 기관 고지 — 무엇이고 무엇이 아닌지 먼저 밝힌다 */}
      <div className="bg-[#1c1917] dark:bg-black">
        <p className={`mx-auto max-w-2xl px-4 py-2 ${TYPE.cap} text-[#b8b0a6] lg:max-w-6xl lg:px-6 xl:max-w-7xl ${PROSE}`}>
          2026년 통일부 공공데이터 활용 공모전 출품 시제품 · 통일부 공식 서비스가 아니며,
          표시되는 모든 값은 공개된 통일부 데이터를 그대로 대조한 결과입니다.
        </p>
      </div>

      <header className={`sticky top-0 z-20 border-b ${SURFACE.hair} bg-[#faf7f2]/85 backdrop-blur-md dark:bg-[#0d1117]/85`}>
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 lg:max-w-6xl lg:px-6 xl:max-w-7xl">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <span className={`text-[1.0625rem] font-semibold tracking-[-0.01em] ${TEXT.ink}`}>
              고향<span className={TEXT.jade}>ON</span>
            </span>
            <span className={`hidden truncate ${TYPE.cap} ${TEXT.faint} sm:inline`}>
              통일부 공공데이터로 읽는 이산가족과 고향
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Nav />
            <FontScale />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-5 lg:max-w-6xl lg:px-6 xl:max-w-7xl">
        <Suspense
          fallback={
            <p className={`flex items-center gap-2 py-24 ${TYPE.sub} ${TEXT.faint}`}>
              <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#d8cebe] border-t-[#8a8279]" />
              불러오는 중…
            </p>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      <footer className="mx-auto w-full max-w-2xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] lg:max-w-6xl lg:px-6 xl:max-w-7xl">
        <p className={`border-t pt-5 ${SURFACE.hair} ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          자료 출처: 통일부 공공데이터 · 본 화면은 아이디어 기획 부문 출품작의 실현가능성 검증용 시제품입니다.
        </p>
      </footer>
    </div>
  )
}
