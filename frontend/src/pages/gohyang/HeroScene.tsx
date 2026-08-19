/* ────────────────────────────────────────────────────────────────
   S1 표제 · S2 고향 고르기 (GohyangOn.tsx 에서 순수 이동, 동작 무변경)

   S1 — 33,272명이 주인공. 예전 머리글은 기능 설명으로 시작했는데 그건
        만든 사람의 관심사다. 화면을 여는 사람에게 먼저 와야 하는 것은
        **남은 사람이 몇 명인가**다.
   S2 — 이름만으로 들어오는 문. 지도를 읽을 줄 아는 사람만 들어올 수 있는
        화면이면 후손은 못 들어온다.
   ──────────────────────────────────────────────────────────────── */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SURFACE, TYPE, TEXT, BTN, FONT, MEASURE, josa } from '../../theme/gohyang'
import type { Pack, Sel, View } from '../../components/gohyang/pack-types'
import { nf, nf1, ymKo } from '../../components/gohyang/format'
import { FOCUS, PROSE } from '../../components/gohyang/bits'

/* ══════════════════════ S1 — 표제 ══════════════════════ */

export function HeroScene({ pack, view, viewSwitch }: {
  pack: Pack
  view: View
  /** 보기 방식 전환 단추 — 상태는 GohyangOn 이 쥔다. 자리만 여기(표제 바로 아래)다. */
  viewSwitch: ReactNode
}) {
  return (
    <header className={PROSE}>
      <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>통일부 공공데이터 · 이산가족과 고향</p>

      {view === 'step' ? (
        /* 한걸음씩 모드의 표제 — 숫자를 여기서 쏟지 않는다. 첫 카드가 하나씩 말한다. */
        <>
          {/* 「보여 드리겠습니다」도 합쇼체 말 걸기다 — 아래 한눈에 표제와 **같은 자리**이므로
              글꼴도 같아야 한다(FONT 규약: 사람이 남긴 말·표제는 명조).
              붙이지 않으면 보기 방식을 바꾸는 순간 표제 글꼴이 명조↔고딕으로 갈린다(실측 2026-08-20). */}
          <h1 className={`mt-3 ${MEASURE} ${TYPE.h1} ${TEXT.ink}`} style={{ fontFamily: FONT.serif }}>한 걸음씩 보여 드리겠습니다</h1>
          <p className={`mt-3 ${MEASURE} ${TYPE.body} ${TEXT.soft}`}>
            화면 하나에 한 가지씩만 나옵니다. [다음] 단추나 키보드 위·아래 화살표,
            또는 스크롤 어느 것으로든 넘기실 수 있습니다.
          </p>
        </>
      ) : (
        <>
      {/* 말 거는 문장(합쇼체)은 명조 — 수치는 고딕 tabular 그대로(FONT 토큰 규약) */}
      <h1 className={`mt-3 ${MEASURE} ${TYPE.h1} ${TEXT.ink}`} style={{ fontFamily: FONT.serif }}>고향을 기억하는 사람이<br className="hidden sm:block" />
        {' '}
        <span className="whitespace-nowrap">
          <span className={`${TYPE.figure} ${TEXT.stale} align-baseline`} style={{ fontFamily: FONT.gothic }}>
            {nf(pack.isan.latest.overview.cumulative.alive)}
          </span>
          <span className={`ml-1 ${TYPE.h2} ${TEXT.ink}`}>명</span>
        </span>
        {' '}남았습니다
      </h1>

      {/* ★ 기준일은 수치마다 따로 붙는다 — 한 문장에 묶으면 남의 축 날짜를 뒤집어쓴다.
            33,272명은 게시판 공표(HWP, 2026-05-31)이고, 평균 나이는 등록현황 월별 CSV
            (2025-08-31)라 9개월 벌어져 있다. 이 프로젝트 자신의 검증기(validateGuide)가
            「평균 나이 83세(2026년 5월 기준)」를 폐기한다 — 화면이 그 기준을 통과해야 한다. */}
      <p className={`mt-3 ${MEASURE} ${TYPE.body} ${TEXT.soft}`}>
        {ymKo(pack.isan.latest.asOf)} 기준 이산가족 생존 신청자 수입니다.
      </p>
      <ul className={`mt-2 flex ${MEASURE} flex-wrap gap-x-5 gap-y-1.5`}>
        <li className={`${TYPE.sub} ${TEXT.soft}`}>
          평균 나이 <b className={`font-semibold tabular-nums ${TEXT.ink}`}>{nf1(pack.isan.monthly.at(-1)?.avgAge)}세</b>
          {' '}<span className={`${TYPE.cap} tabular-nums ${TEXT.faint}`}>({ymKo(pack.isan.monthly.at(-1)?.month)} 기준 · 등록현황 월별 자료)</span>
        </li>
        <li className={`${TYPE.sub} ${TEXT.soft}`}>
          1만 명 하회 <b className={`font-semibold tabular-nums ${TEXT.ink}`}>{pack.proj.milestoneRange.below10000}년</b>
          {' '}<span className={`${TYPE.cap} tabular-nums ${TEXT.faint}`}>(계산 결과 · 기준 인원 {ymKo(pack.proj.headline.asOf)} 공표)</span>
        </li>
      </ul>
      <p className={`mt-1.5 ${MEASURE} ${TYPE.sub} ${TEXT.faint}`}>아래 지도에서 고향을 누르면 그곳의 이산가족·탈북민·공식 기록·오늘 날씨가 한자리에 모입니다.
        네 자료는 조사한 날짜가 서로 다릅니다. 그래서 값마다 기준일을 함께 적었습니다.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link to="/factcheck" className={BTN.primary}>지도에 없는 것은 물어보세요
        </Link>
        <a href="#extinction" className={BTN.ghost}>기록 골든타임 보기 <span aria-hidden="true">↓</span>
        </a>
        <a href="#descendant" className={BTN.ghost}>후손 다리 <span aria-hidden="true">↓</span>
        </a>
        {/* 후손이 직접 남기는 자리로 바로 간다 — 통계만 읽다 나가지 않게 */}
        <a href="#memory-card" className={BTN.ghost}>기억 카드 만들기 <span aria-hidden="true">↓</span>
        </a>
        <a href="#actions" className={BTN.ghost}>지금 할 수 있는 일 <span aria-hidden="true">↓</span>
        </a>
      </div>
        </>
      )}

      {/* ── 보기 방식 — 같은 데이터, 두 밀도. 선택은 저장되어 다음 방문에도 유지된다 ── */}
      {viewSwitch}
    </header>
  )
}

/* ══════════════════════ S2 — 고향 고르기 진입 ══════════════════════
   지도를 읽을 줄 아는 사람만 들어올 수 있는 화면이면 후손은 못 들어온다.
   후손이 아는 것은 지도가 아니라 **집안에서 들은 고향 이름** 하나다.
   그래서 이름만으로 들어오는 문을 표제 바로 아래에 둔다.

   ★ 물음을 "할아버지 고향"으로 좁히지 않는다(사용자 지적, 2026-08-19).
     할머니가 지워지고, 부모 세대와 1세대 본인이 빠지며, 탈북민에게는
     조부모가 아니라 두고 온 가족의 고향일 수 있다. 화면이 누구의 고향인지
     먼저 단정하면 그 바깥에 있는 사람은 자기 자리가 아니라고 느낀다. */

export function HomePickScene({ pack, oldRanked, sel, unknownHome, onPickOld }: {
  pack: Pack
  oldRanked: Array<{ id: string; name: string; n: number }>
  sel: Sel | null
  /** 주소(?고향=…)에 알 수 없는 이름이 실려 온 경우 그 이름 — 조용히 무시하지 않는다 */
  unknownHome?: string | null
  onPickOld: (id: string) => void
}) {
  return (
    <div className={`mt-8 ${SURFACE.slab} p-5`}>
      <h2 className={`${TYPE.h2} ${TEXT.ink} ${PROSE}`}>어느 고향을 찾으십니까?</h2>
      {unknownHome && (
        <p className={`mt-2 rounded-md border-l-[3px] border-[#b06a00] bg-[#fdf3e3] px-3 py-2 ${TYPE.sub} ${TEXT.stale} ${PROSE}`}>
          주소에 적힌 고향 「{unknownHome}」{josa(unknownHome, '은', '는')} 이 화면이 아는 이름이 아닙니다.
          {' '}아래에서 직접 골라 주십시오.
        </p>
      )}
      <p className={`mt-1 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
        본인의 고향이든, 부모·조부모께서 떠나오신 곳이든, 북에 두고 온 가족이 살던 곳이든 좋습니다.
        {' '}이산가족 출신지는 광복 당시 구행정구역 {nf(pack.map.regionsOld.length)}종으로만 공표됩니다 —
        {' '}지도를 몰라도 이름을 누르면 그곳이 열립니다.
      </p>
      {/* lg 이상에서만 4열 격자 — 무대가 64rem 로 고정되면서 7개가 한 줄에 안 들어가
          「미수복강원」 하나만 둘째 줄에 남았다(실측). 격자로 두면 4+3 으로 갈라지고
          단추 폭이 같아져 세로선도 맞는다. lg 미만은 기존 흐름 배치 그대로다(모바일 무변경). */}
      <div className="mt-3 flex flex-wrap gap-2 lg:grid lg:grid-cols-4">
        {oldRanked.map(o => (
          <button
            key={o.id}
            type="button"
            onClick={() => onPickOld(o.id)}
            aria-pressed={sel?.mode === 'old' && sel.id === o.id}
            className={`inline-flex min-h-[48px] items-center gap-1.5 rounded-md border px-3.5 py-2 ${TYPE.sub} font-medium ${FOCUS} ${
              sel?.mode === 'old' && sel.id === o.id
                ? 'border-[#1a4e9c] bg-[#eef3fb] text-[#1a4e9c] dark:border-[#2f5f9f] dark:bg-[#16202c] dark:text-[#7aa9e8]'
                : `${SURFACE.line} bg-white ${TEXT.ink} hover:border-[#1a4e9c] dark:bg-transparent`
            }`}
          >
            {o.name}
            <span className={`${TYPE.cap} tabular-nums ${TEXT.faint}`}>{o.n > 0 ? `${nf(o.n)}명` : '집계 없음'}</span>
          </button>
        ))}
      </div>
      <p className={`mt-2.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        옆의 인원은 그 고향이 출신지인 이산가족 생존 신청자 수입니다 ({ymKo(pack.isan.latest.asOf)} 기준).
        {' '}「기타」 {nf(pack.isan.latest.survivors.byOrigin.entries.find(e => e.label === '기타')?.n)}명은 이 {nf(pack.map.regionsOld.length)}종에 속하지 않아 여기에 없습니다.
      </p>
    </div>
  )
}
