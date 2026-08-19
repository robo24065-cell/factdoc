/* ────────────────────────────────────────────────────────────────
   고향잇기 — 모션 규약 (씬 서사 전환의 단일 진실 소스)

   원칙 (사이트구조.md 개정 · 확정 설계)
     · 스크롤 하이재킹 금지 — 페이지 휠은 항상 페이지를 움직인다.
       단 하나의 예외가 **가로 덱 위의 휠**이다(PinnedDeck). 그것도 「덱이 그 방향으로
       더 갈 수 있을 때만」이라 끝에 닿는 순간 페이지로 넘어간다 — 갇히는 구간이 없다.
       옛 sticky 런웨이(구간 수 × 60vh)는 걷어냈다: 사진 24장 덱이 페이지를 5~6화면
       붙잡아, 사진을 볼 생각이 없는 사람에게 벽이었다(2026-08-20 사용자 지적).
     · 리빌은 불투명도 + 8px 상승, **1회만**. 다시 숨기지 않는다.
     · prefers-reduced-motion 이면 모션 전부 꺼지고 평범한 배치로 남는다.
     · 이징은 여기 EASE 토큰 한 곳 — 화면 어디서도 cubic-bezier 를 직접 쓰지 않는다.
     · 무모션 구역(지도·패널, 기억 카드)은 이 파일의 어떤 것도 쓰지 않는다 —
       손이 닿는 도구는 움직이지 않는다.
   ──────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from 'react'

/* ══════════ 이징 토큰 ══════════ */
export const EASE = {
  /** 감속 곡선 — 리빌·덱 활강 등 서사 모션 공용 */
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const

/** EASE.out 의 네 점 — CSS 문자열과 JS 활강이 **같은 숫자**를 읽게 한다.
 *  곡선을 두 벌 두면 전환(CSS)과 스크롤 활강(JS)의 결이 조용히 갈린다. */
export const EASE_OUT_POINTS = [0.22, 1, 0.36, 1] as const

/** 리빌 한 번의 transition 문자열 — Scene 과 개별 리빌이 같은 값을 쓴다 */
export const REVEAL_TRANSITION = `opacity 700ms ${EASE.out}, transform 700ms ${EASE.out}`
/** 지연 계단 한 단 (ms) — 같은 씬 안의 형제 요소가 이 간격으로 뒤따른다 */
export const REVEAL_STAGGER = 90

export function prefersReduced(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/* smooth 스크롤은 rAF 로 움직여서 백그라운드 탭·저사양 기기에서 멈춘 채 끝나기도 한다(실측).
   잠시 뒤 도착을 확인하고 못 갔으면 즉시 이동한다 — 눌렀는데 안 움직이는 화면이 제일 나쁘다. */
export function scrollToEl(el: HTMLElement | null) {
  if (!el) return
  el.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' })
  window.setTimeout(() => {
    const r = el.getBoundingClientRect()
    if (r.top >= window.innerHeight || r.bottom <= 0) el.scrollIntoView({ block: 'start' })
  }, 700)
}

/* 보기 방식을 갈아탄 직후에는 목적지 구획이 아직 렌더 전일 수 있다 — 생길 때까지 잠깐 기다린다 */
export function scrollToId(id: string, tries = 12) {
  const el = document.getElementById(id)
  if (el) { scrollToEl(el); return }
  if (tries > 0) window.setTimeout(() => scrollToId(id, tries - 1), 120)
}

/* ══════════ 리빌 ══════════
   IntersectionObserver 1회 — 요소가 뷰포트에 들어오면 shown 이 true 로 뒤집히고
   다시는 돌아가지 않는다. reduced-motion·IO 미지원·SSR 은 처음부터 보인다.
   숨김 상태의 스타일(불투명도 0 + 8px 아래)은 쓰는 쪽이 shown 으로 결정한다 —
   Scene.tsx 가 표준 구현이다. */
export function useReveal<T extends HTMLElement = HTMLDivElement>(): { ref: React.RefObject<T | null>; shown: boolean } {
  const ref = useRef<T | null>(null)
  const [shown, setShown] = useState<boolean>(
    () => prefersReduced() || typeof IntersectionObserver === 'undefined',
  )
  useEffect(() => {
    if (shown) return
    const el = ref.current
    if (!el) { setShown(true); return }
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setShown(true)
          io.disconnect()
        }
      },
      /* 아래쪽 8% 를 물리고 나서야 드러난다 — 스크롤에 반응한다는 감각을 주되
         한 화면짜리 씬에서 내용이 늦게 오는 일은 없게 얕게 잡는다 */
      { rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
    // shown 은 한 방향으로만 움직인다 — 처음 false 였을 때만 이 효과가 산다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { ref, shown }
}

/* reduced-motion 을 **반응형으로** 읽는다 — OS 설정을 화면을 열어 둔 채 바꿔도
   핀 런웨이가 즉시 풀려야 한다(정적 prefersReduced() 는 첫 렌더 값에 갇힌다). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(prefersReduced)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const on = () => setReduced(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}

/* ══════════ 덱 활강 (가로 카드 묶음이 한 장 넘어가는 움직임) ══════════

   왜 직접 굴리는가 (2026-08-20 사용자 지적: *"옆으로 넘어가는 모션같은것도 없어서 뭔가 부족하고"*)
     옛 구현은 `row.scrollLeft = target` 직접 대입이라 중간 프레임이 **없었다** — 카드가
     뚝뚝 갈렸다. 네이티브 `scrollTo({behavior:'smooth'})` 는 프레임을 만들지만 이징이
     브라우저 것이라 이 화면의 EASE.out 과 결이 다르고, 곡선을 우리가 못 고른다.
     그래서 rAF 로 EASE.out 을 그대로 샘플링한다 — 리빌(CSS)과 활강(JS)이 한 곡선을 쓴다.

   snap 은 활강 동안만 풀어 둔다. scroll-snap-type: x mandatory 는 프로그램이 만든
   중간 위치를 매 프레임 근처 카드로 되감아 활강과 싸운다(실측 Chromium).
   착지 지점이 정확히 카드 경계라 snap 을 되돌릴 때 튀지 않는다.

   prefers-reduced-motion 이면 곧바로 목적지에 놓는다(behavior:'auto' 와 같은 뜻). */

/** 한 장 넘어가는 데 걸리는 시간. 고령 사용자 기준 — 너무 빠르면 무엇이 지나갔는지 못 읽는다. */
export const DECK_GLIDE_MS = 420

/* cubic-bezier(x1,y1,x2,y2) 를 x→y 로 푸는 최소 구현(뉴턴 6회). EASE_OUT_POINTS 하나만 쓴다. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const fx = (t: number) => ((ax * t + bx) * t + cx) * t
  const dfx = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return (x: number) => {
    let t = x
    for (let i = 0; i < 6; i++) {
      const err = fx(t) - x
      const d = dfx(t)
      if (Math.abs(err) < 1e-5 || d === 0) break
      t -= err / d
    }
    t = Math.min(1, Math.max(0, t))
    return ((ay * t + by) * t + cy) * t
  }
}

/** EASE.out 과 같은 곡선의 JS 판(0~1 → 0~1) */
export const easeOut = cubicBezier(...EASE_OUT_POINTS)

/** 가로 스크롤 컨테이너를 EASE.out 으로 활강시킨다. 돌려주는 함수를 부르면 그 자리에 선다.
 *  (사용자가 손으로 밀기 시작하면 반드시 취소해야 한다 — 두 힘이 겹치면 화면이 떤다.) */
export function glideScrollLeft(el: HTMLElement, to: number, ms = DECK_GLIDE_MS, onLand?: () => void): () => void {
  const from = el.scrollLeft
  const dist = to - from
  if (prefersReduced() || typeof requestAnimationFrame === 'undefined' || Math.abs(dist) < 1) {
    el.scrollLeft = to
    onLand?.()
    return () => {}
  }
  const snap = el.style.scrollSnapType
  el.style.scrollSnapType = 'none'
  let raf = 0
  let stopped = false
  const finish = (land: boolean) => {
    if (stopped) return
    stopped = true
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    if (land) el.scrollLeft = to
    el.style.scrollSnapType = snap
    if (land) onLand?.()
  }
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / ms)
    el.scrollLeft = from + dist * easeOut(p)
    if (p < 1) raf = requestAnimationFrame(step)
    else finish(true)
  }
  raf = requestAnimationFrame(step)
  return () => finish(false)
}
