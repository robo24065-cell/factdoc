/* ────────────────────────────────────────────────────────────────
   고향잇기 — PinnedDeck: 핀 가로 넘김 (S6 사료 · S11 창구 두 곳만)

   하이재킹 금지의 이행 (확정 설계 그대로):
     · 덱은 **항상 실재하는** overflow-x scroll-snap 행이다 — 손가락 스와이프·
       가로 스크롤이 언제나 통한다. 좌우 단추(≥48px)와 "n/N" 표시, 키보드 ←→ 동반.
     · 핀은 sticky 런웨이(구간 수 × 60vh) 안에서 페이지 scrollY 진행률을
       그 행의 scrollLeft 에 **함수로 사상할 뿐**이다. 페이지 휠은 항상
       페이지를 움직인다 — 휠을 가로채는 코드가 이 파일에 없다.
     · 핀이 잡혀 있는 동안 좌우 단추는 **페이지를** 그 카드의 런웨이 위치로
       움직인다(사상의 단일 진실 소스를 지킨다). 핀이 없으면(reduced-motion)
       행 자체를 가로 스크롤한다.
     · prefers-reduced-motion 이면 런웨이 제거(height auto) — 평범한 가로
       snap 행 + 단추만 남는다.
   ──────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { TYPE, TEXT, FOCUS } from '../../theme/gohyang'
import { useReducedMotion, usePinProgress, prefersReduced } from './motion'

export default function PinnedDeck({
  label, items, segments, className = '',
}: {
  /** 접근성 이름 — "기증 사진", "신청 창구" */
  label: string
  items: ReactNode[]
  /** 런웨이 구간 수(구간당 60vh). 기본 = 카드 수(카드당 스크롤 한 구간).
   *  카드가 아주 많은 덱(S6 사진 24장)은 더 작게 줘 전체 높이를 묶는다. */
  segments?: number
  className?: string
}) {
  const n = items.length
  const seg = Math.max(1, segments ?? n)
  const reduced = useReducedMotion()
  const { ref: runwayRef, progress } = usePinProgress(!reduced && n > 1)
  const rowRef = useRef<HTMLDivElement>(null)
  const [cur, setCur] = useState(0)

  /* ★ 사상은 **카드 단위로 양자화**한다 (실측 지적 2026-08-19).
       연속 사상(progress × max)은 scrollLeft 가 카드 경계에 떨어지는 일이 사실상 없어
       왼쪽에 11번 카드의 오른쪽 절반, 오른쪽에 12번 카드가 함께 보였다 —
       「한 뷰포트에 한 생각」이 깨진다. 게다가 휠 한 노치(120px)가 카드 1.33장을 넘겨
       사진 한 장 앞에 멈출 수가 없었다.
       인덱스로 반올림한 뒤 카드 폭 배수로 사상하면 계수기(n/N)와 화면이 항상 일치하고,
       snap-mandatory 를 떼지 않아도 된다(떼면 위 어긋남이 생긴다). */
  useEffect(() => {
    const row = rowRef.current
    if (!row || progress == null) return
    const w = row.clientWidth
    if (!w || row.scrollWidth - w <= 0) return
    const i = Math.max(0, Math.min(n - 1, Math.round(progress * (n - 1))))
    const target = Math.min(row.scrollWidth - w, i * w)
    if (Math.abs(row.scrollLeft - target) > 1) row.scrollLeft = target
    setCur(i)
  }, [progress, n])

  /* "n/N" 은 행의 실제 위치에서 센다 — 사상이든 수동이든 같은 자리에서 읽는다. */
  const onRowScroll = () => {
    const row = rowRef.current
    if (!row || !row.clientWidth) return
    setCur(Math.max(0, Math.min(n - 1, Math.round(row.scrollLeft / row.clientWidth))))
  }

  const go = (idx: number) => {
    const i = Math.max(0, Math.min(n - 1, idx))
    const row = rowRef.current
    const runway = runwayRef.current
    if (progress != null && runway) {
      /* 핀이 있으면 페이지를 움직인다 — scrollLeft 는 사상이 따라 정한다. */
      const total = runway.offsetHeight - window.innerHeight
      const top = runway.getBoundingClientRect().top + window.scrollY
      const y = top + (n > 1 ? (i / (n - 1)) * Math.max(0, total) : 0)
      window.scrollTo({ top: y, behavior: prefersReduced() ? 'auto' : 'smooth' })
      return
    }
    if (row) row.scrollTo({ left: i * row.clientWidth, behavior: prefersReduced() ? 'auto' : 'smooth' })
  }

  if (n === 0) return null

  const btn = (disabled: boolean) =>
    `inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-1 rounded-md border px-4 text-base font-bold ${FOCUS} ` +
    (disabled
      ? 'cursor-default border-[#eaecef] bg-[#f5f7fa] text-[#b6bcc5]'
      : 'border-[#1a4e9c] bg-[#1a4e9c] text-white hover:bg-[#14407f]')

  return (
    <div
      ref={runwayRef}
      className={className}
      style={reduced ? undefined : { height: `${seg * 60}vh` }}
    >
      <div className={reduced ? '' : 'sticky top-0 flex min-h-[100svh] flex-col justify-center py-4'}>
        {/* ── 실재하는 가로 snap 행 — 핀은 이 행의 scrollLeft 만 만진다 ──
              사상 중에는 snap 을 풀어 둔다: snap-mandatory 가 프로그램 scrollLeft 를
              끊임없이 근처 카드로 되감아 사상과 싸운다(실측 Chromium). 수동 구간에서는
              snap 이 다시 붙어 스와이프가 카드 단위로 떨어진다. */}
        <div
          ref={rowRef}
          onScroll={onRowScroll}
          role="group"
          aria-label={`${label} ${n}장 — 좌우 단추, 키보드 좌우 화살표, 가로 스크롤로 넘길 수 있습니다`}
          aria-roledescription="가로 카드 묶음"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1) }
            if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1) }
          }}
          onFocusCapture={e => {
            /* 안전망 — 어떤 경로로든 화면 밖 카드에 포커스가 앉으면 그 카드로 페이지를 옮긴다.
               (평소에는 아래 inert 가 화면 밖 카드를 포커스 대상에서 빼므로 발동하지 않는다) */
            const row = rowRef.current
            if (!row) return
            const card = (e.target as HTMLElement).closest('[data-deck-card]')
            const i = card ? Number((card as HTMLElement).dataset.deckCard) : -1
            if (i >= 0 && i !== cur) go(i)
          }}
          className={`flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain ${FOCUS}`}
        >
          {items.map((it, i) => (
            /* ★ 화면 밖 카드는 탭 정지점이 아니다 (실측 지적 2026-08-19).
                 ① 포커스와 화면이 어긋났다 — Tab 으로 5번째 카드의 링크에 들어간 뒤 휠 한 노치를
                    주면 사상이 행을 12번째로 밀어, 화면에 없는 사진의 박물관 링크에 Enter 가 갔다
                    (WCAG 2.4.11 위반).
                 ② 사료 덱 하나가 홈 전체 탭 정지점 160개 중 48개를 삼켰다 — 키보드로 다음 씬에
                    가려면 Tab 48회.
               행(role=group, ←→ 키)과 좌우 단추가 계약을 그대로 유지하므로 도달성은 잃지 않는다. */
            <div
              key={i}
              data-deck-card={i}
              inert={i === cur ? undefined : true}
              className="w-full shrink-0 snap-start px-0.5"
              role="group"
              aria-label={`${i + 1} / ${n}`}
            >
              {it}
            </div>
          ))}
        </div>

        {/* ── 좌우 단추 + n/N — 항상 보인다(스크롤 전용 금지) ── */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <button type="button" onClick={() => go(cur - 1)} disabled={cur === 0} className={btn(cur === 0)}>
            <span aria-hidden="true">←</span> 이전
          </button>
          <p className={`text-center ${TYPE.sub} font-bold tabular-nums ${TEXT.ink}`} aria-live="polite">
            {cur + 1} / {n}
          </p>
          <button type="button" onClick={() => go(cur + 1)} disabled={cur === n - 1} className={btn(cur === n - 1)}>
            다음 <span aria-hidden="true">→</span>
          </button>
        </div>
        <p className={`mt-1.5 ${TYPE.cap} ${TEXT.faint}`}>
          {reduced
            ? '좌우 단추나 가로 스크롤로 넘길 수 있습니다.'
            : '아래로 스크롤해도 한 장씩 넘어갑니다. 좌우 단추와 키보드 화살표로도 움직입니다.'}
        </p>
      </div>
    </div>
  )
}
