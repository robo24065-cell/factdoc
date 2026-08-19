/* ────────────────────────────────────────────────────────────────
   고향잇기 — Scene: 씬 서사의 무대 틀

   5막 13씬(사이트구조.md 개정)의 공용 틀이다. 기존 구획의 마크업을
   바꾸지 않고 **감싸기만** 한다 — 씬 분해(승격·격하)는 다음 단계 몫.

   맡는 것
     · 무대   — 씬은 **무대 전폭**을 쓴다. 폭을 씬마다 따로 정하지 않는다.
                (2026-08-20 실측: 씬마다 기둥 폭을 주고 가운데로 모았더니 1440px 에서
                 좌측 시작점이 104/208/352 셋으로 갈라져 스크롤 내내 흔들렸다.
                 좌측 레일은 하나여야 한다 — theme/gohyang.ts STAGE 주석 참조.)
                full 이면 min-height 100svh (내용이 넘치면 늘어난다 — 잘라내기 금지)
     · 리빌   — 불투명도 + 8px 상승 1회 (motion.ts useReveal · EASE 토큰)
                reduced-motion 이면 즉시 표시, 모션 없음
     · 꼬리   — 가정·한계·출처 줄 (캡션급, 접지 않음). 읽는 폭(MEASURE)으로 줄이되
                **왼쪽 레일에 붙인 채** 줄인다 — 가운데로 모으면 레일이 하나 더 생긴다.
     · 이음새 — seam: 다음 씬으로 건네는 마지막 한 문장 (말 걸기 = 명조·합쇼체)
     · 스크롤 단서 — "↓ 계속"

   맡지 않는 것
     · 내용의 밀도·순서 (씬 파일이 정한다)
     · 핀 가로 넘김 (PinnedDeck 이 맡는다 — S6·S11 두 곳만)
   ──────────────────────────────────────────────────────────────── */

import type { CSSProperties, ReactNode } from 'react'
import { FONT, TYPE, TEXT, PROSE, MEASURE } from '../../theme/gohyang'
import { useReveal, prefersReduced, REVEAL_TRANSITION, REVEAL_STAGGER } from './motion'

type SceneProps = {
  /** 앵커 id — extinction · descendant · actions 등 기존 딥링크가 그대로 살아야 한다 */
  id?: string
  /** 씬 한 개 = 뷰포트 한 개. 내용이 넘치면 늘어난다(잘라내기 금지) */
  full?: boolean
  /** 리빌 켜기 — 무모션 구역(지도·패널, 기억 카드)은 false */
  reveal?: boolean
  /** 지연 계단 — 같은 화면에 함께 드러나는 씬의 차례 (0, 1, 2 …) */
  step?: number
  className?: string
  /** 꼬리 — 가정·한계·출처 줄. 캡션급으로 내려앉되 접지 않는다 */
  tail?: ReactNode
  /** 이음새 — 씬 꼬리 마지막 줄. 다음 씬으로 건네는 한 문장(합쇼체 = 명조) */
  seam?: string
  /** 스크롤 단서 "↓ 계속" */
  cue?: boolean
  children: ReactNode
}

export default function Scene({
  id, full = false, reveal = true, step = 0, className = '', tail, seam, cue = false,
  children,
}: SceneProps) {
  const { ref, shown } = useReveal<HTMLDivElement>()
  const animate = reveal && !prefersReduced()

  /* 숨김 → 표시는 인라인 스타일 한 벌로만 움직인다. 표시가 끝난 뒤에는
     transform 을 남기지 않는다 — 조상의 transform 은 내부 fixed/tooltip 좌표를 깨뜨린다. */
  const style: CSSProperties | undefined = animate
    ? shown
      ? { transition: REVEAL_TRANSITION, transitionDelay: step ? `${step * REVEAL_STAGGER}ms` : undefined }
      : { opacity: 0, transform: 'translateY(8px)', transition: REVEAL_TRANSITION }
    : undefined

  return (
    <div
      id={id}
      ref={animate ? ref : undefined}
      style={style}
      /* 검증 하니스가 씬을 셀 수 있게 표를 남긴다 — 씬이 조용히 사라지거나 이음새가
         빠져도 오류가 나지 않는 종류의 사고라 화면에서 직접 세야 한다(nk-verify-deck). */
      data-scene=""
      data-seam={seam || undefined}
      className={`${full ? 'flex min-h-[100svh] flex-col justify-center' : ''} ${className}`.trim() || undefined}
    >
      <div className="w-full">
        {children}

        {tail && (
          <div className={`mt-4 ${MEASURE} ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{tail}</div>
        )}

        {seam && (
          <p
            className={`mt-6 ${MEASURE} text-[1.1875rem] leading-[1.8] ${TEXT.soft} ${PROSE}`}
            style={{ fontFamily: FONT.serif }}
          >
            {seam}
          </p>
        )}

        {cue && (
          <p className={`mt-4 ${TYPE.cap} font-semibold tracking-wide ${TEXT.faint}`} aria-hidden="true">
            ↓ 계속
          </p>
        )}
      </div>
    </div>
  )
}
