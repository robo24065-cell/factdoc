import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import FontScale from '../components/FontScale'
import { SURFACE, TEXT, TYPE, PROSE, FOCUS, BTN, C, STAGE, STAGE_WIDE } from '../theme/gohyang'

/* 고향잇기 껍데기 — 통일부 누리집의 구조를 따른다.
     ① 최상단 안내 띠(고지)  ② 흰 머리글 + 가로 주메뉴  ③ 본문  ④ 바닥글
   ㆍ고지는 지우지 않는다. 이 서비스가 통일부 공식 서비스가 아니라는 사실을
     화면 어디에서도 오해할 수 없게 두는 것이 이 프로젝트의 규약이다.
   ㆍ주메뉴가 곧 접근 경로다. 없애면 지도 화면에 들어갈 길이 사라진다.
   ㆍ장식 이모지를 쓰지 않는다 — 관공서 화면에서 신뢰를 깎는다. */

const NAV = [
  { to: '/', label: '고향잇기', alias: '/gohyang' },
  { to: '/deck', label: '분석' },
  { to: '/factcheck', label: '사실은ON 팩트체커' },
] as const

/* 하단 탭 4개 — 라벨은 「무엇을 보는 곳인가」로 적는다(기능 이름이 아니라).
   가운데 둘은 홈의 씬 앵커로 간다: 홈이 한 스크롤 서사라 그 안의 자리로 데려가야 한다.
   장식 이모지 금지 — 기하 도형만 쓴다(theme/gohyang.ts 제약 ①). */
const BOTTOM_TABS = [
  { to: '/', match: '/', label: '고향', glyph: '●' },
  { to: '/#extinction', match: '/', label: '골든타임', glyph: '▲' },
  { to: '/#actions', match: '/', label: '할 수 있는 일', glyph: '■' },
  { to: '/factcheck', match: '/factcheck', label: '팩트체커', glyph: '◆' },
] as const

export default function SasilOnLayout() {
  const { pathname } = useLocation()

  /* ★ 무대 — 고지 띠·머리글·주메뉴·본문·바닥글이 **같은 좌우 레일**을 쓴다.
       레일이 갈리면 주메뉴 밑줄과 표제의 시작점이 어긋나 화면이 흔들린다(theme/gohyang.ts STAGE).
       고향잇기 홈만 새 무대(64rem)로 옮긴다 — 팩트체커·분석은 기존 폭을 유지해
       이번 정렬 작업이 그 화면들의 실측을 흔들지 않게 한다. */
  const home = pathname === '/' || pathname === '/gohyang'
  const stage = home ? STAGE : STAGE_WIDE

  return (
    <div className={`min-h-screen overflow-x-clip ${SURFACE.page}`}>
      {/* ① 최상단 고지 띠 */}
      <div className={`border-b bg-[#f5f7fa] ${SURFACE.hair} dark:bg-[#14181e]`}>
        <p className={`${stage} py-1.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          이 화면은 <b className="font-semibold">2026년 통일부 공공데이터 활용 공모전 출품 시제품</b>입니다.
          {' '}통일부 공식 서비스가 아니며, 표시되는 모든 값은 공개된 통일부 데이터를 그대로 대조한 결과입니다.
        </p>
      </div>

      {/* ② 머리글 — 제목줄과 주메뉴줄을 분리한다(정부 누리집 관용 구조) */}
      <header className={`sticky top-0 z-20 border-b bg-white/95 backdrop-blur ${SURFACE.line} dark:bg-[#111418]/95`}>
        <div className={`${stage} flex items-center justify-between gap-4 py-3`}>
          <NavLink to="/" className={`flex min-h-[48px] min-w-0 items-center gap-2.5 ${FOCUS}`}>
            <span className={`text-[1.125rem] font-bold tracking-[-0.02em] ${TEXT.ink}`}>
              고향<span style={{ color: C.blue }}>잇기</span>
            </span>
            <span className={`hidden truncate ${TYPE.cap} ${TEXT.faint} sm:inline`}>
              고향을 축으로 이산가족 기록을 후손에게 잇습니다
            </span>
          </NavLink>
          <FontScale />
        </div>

        <nav aria-label="주요 화면" className={`${stage} border-t ${SURFACE.hair}`}>
          <ul className="-mb-px flex items-center gap-1">
            {NAV.map(item => {
              const active = pathname === item.to || ('alias' in item && pathname === item.alias)
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    aria-current={active ? 'page' : undefined}
                    className={`${BTN.seg} ${active ? BTN.segOn : BTN.segOff} ${FOCUS}`}
                  >
                    {item.label}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>
      </header>

      {/* ③ 본문 — 모바일에서는 하단 고정 탭(72px)에 가리지 않게 여백을 더 준다 */}
      <main className={`${stage} pb-28 pt-6 lg:pb-16`}>
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

      {/* ⑤ 모바일 하단 고정 탭 — 사이트구조.md 규정: 「하단 고정 탭 4개, 라벨 포함, 터치 영역 56px.
             엄지가 닿는 곳에 있어야 한다. 상단 햄버거 메뉴는 노인 사용자에게 보이지 않는 것과 같다.」
             홈이 씬 서사(문서 높이 2만 픽셀 이상)로 바뀌면서 상단 sticky 머리글 하나로만
             다녀야 했다 — 그 자리를 여기서 메운다. 인쇄에는 나가지 않는다. */}
      <nav
        aria-label="빠른 이동"
        className={`fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 backdrop-blur lg:hidden print:hidden ${SURFACE.line}`}
      >
        <ul className="mx-auto grid max-w-2xl grid-cols-4">
          {BOTTOM_TABS.map(t => {
            const on = pathname === t.match && !t.to.includes('#')
            return (
              <li key={t.to}>
                <NavLink
                  to={t.to}
                  end={t.match === '/' && !t.to.includes('#')}
                  aria-current={on ? 'page' : undefined}
                  className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-2 text-center ${FOCUS} ${
                    on ? TEXT.blue : TEXT.soft
                  }`}
                >
                  <span aria-hidden="true" className="text-[13px] leading-none">{t.glyph}</span>
                  <span className={`${TYPE.cap} font-semibold leading-tight`}>{t.label}</span>
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* ④ 바닥글 */}
      <footer className={`border-t bg-[#f5f7fa] ${SURFACE.hair} dark:bg-[#14181e]`}>
        <div className={`${stage} py-6`}>
          <p className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
            자료 출처: 통일부 공공데이터 · 본 화면은 아이디어 기획 부문 출품작의 실현가능성 검증용 시제품입니다.
            {' '}북한 관련 정보 특성상 공식자료에 수록되지 않은 사실이 존재할 수 있습니다.
          </p>
        </div>
      </footer>
    </div>
  )
}
