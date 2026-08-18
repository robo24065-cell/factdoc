import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import FontScale from '../components/FontScale'
import { SURFACE, TEXT, TYPE, PROSE, FOCUS, BTN, C } from '../theme/gohyang'

/* 고향ON 껍데기 — 통일부 누리집의 구조를 따른다.
     ① 최상단 안내 띠(고지)  ② 흰 머리글 + 가로 주메뉴  ③ 본문  ④ 바닥글
   ㆍ고지는 지우지 않는다. 이 서비스가 통일부 공식 서비스가 아니라는 사실을
     화면 어디에서도 오해할 수 없게 두는 것이 이 프로젝트의 규약이다.
   ㆍ주메뉴가 곧 접근 경로다. 없애면 지도 화면에 들어갈 길이 사라진다.
   ㆍ장식 이모지를 쓰지 않는다 — 관공서 화면에서 신뢰를 깎는다. */

const NAV = [
  { to: '/', label: '고향ON', alias: '/gohyang' },
  { to: '/factcheck', label: '사실은ON 팩트체커' },
] as const

export default function SasilOnLayout() {
  const { pathname } = useLocation()

  return (
    <div className={`min-h-screen overflow-x-clip ${SURFACE.page}`}>
      {/* ① 최상단 고지 띠 */}
      <div className={`border-b bg-[#f5f7fa] ${SURFACE.hair} dark:bg-[#14181e]`}>
        <p className={`mx-auto max-w-2xl px-4 py-1.5 ${TYPE.cap} ${TEXT.faint} lg:max-w-6xl lg:px-6 xl:max-w-7xl ${PROSE}`}>
          이 화면은 <b className="font-semibold">2026년 통일부 공공데이터 활용 공모전 출품 시제품</b>입니다.
          {' '}통일부 공식 서비스가 아니며, 표시되는 모든 값은 공개된 통일부 데이터를 그대로 대조한 결과입니다.
        </p>
      </div>

      {/* ② 머리글 — 제목줄과 주메뉴줄을 분리한다(정부 누리집 관용 구조) */}
      <header className={`sticky top-0 z-20 border-b bg-white/95 backdrop-blur ${SURFACE.line} dark:bg-[#111418]/95`}>
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3 lg:max-w-6xl lg:px-6 xl:max-w-7xl">
          <NavLink to="/" className={`flex min-w-0 items-baseline gap-2.5 ${FOCUS}`}>
            <span className={`text-[1.125rem] font-bold tracking-[-0.02em] ${TEXT.ink}`}>
              고향<span style={{ color: C.blue }}>ON</span>
            </span>
            <span className={`hidden truncate ${TYPE.cap} ${TEXT.faint} sm:inline`}>
              통일부 공공데이터로 읽는 이산가족과 고향
            </span>
          </NavLink>
          <FontScale />
        </div>

        <nav aria-label="주요 화면" className={`mx-auto max-w-2xl border-t px-4 lg:max-w-6xl lg:px-6 xl:max-w-7xl ${SURFACE.hair}`}>
          <ul className="-mb-px flex items-center gap-1">
            {NAV.map(item => {
              const active = pathname === item.to || ('alias' in item && pathname === item.alias)
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    aria-current={active ? 'page' : undefined}
                    className={`${BTN.seg} ${active ? BTN.segOn : BTN.segOff} ${FOCUS} inline-block`}
                  >
                    {item.label}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>
      </header>

      {/* ③ 본문 */}
      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 lg:max-w-6xl lg:px-6 xl:max-w-7xl">
        <Suspense
          fallback={
            <p className={`flex items-center gap-2 py-24 ${TYPE.sub} ${TEXT.faint}`}>
              <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#dcdfe4] border-t-[#767676]" />
              불러오는 중
            </p>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      {/* ④ 바닥글 */}
      <footer className={`border-t bg-[#f5f7fa] ${SURFACE.hair} dark:bg-[#14181e]`}>
        <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:max-w-6xl lg:px-6 xl:max-w-7xl">
          <p className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
            자료 출처: 통일부 공공데이터 · 본 화면은 아이디어 기획 부문 출품작의 실현가능성 검증용 시제품입니다.
            {' '}북한 관련 정보 특성상 공식자료에 수록되지 않은 사실이 존재할 수 있습니다.
          </p>
        </div>
      </footer>
    </div>
  )
}
