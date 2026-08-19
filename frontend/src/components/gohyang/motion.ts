/* ────────────────────────────────────────────────────────────────
   고향잇기 — 모션 규약 (씬 서사 전환의 단일 진실 소스)

   원칙 (사이트구조.md 개정 · 확정 설계)
     · 스크롤 하이재킹 금지 — 페이지 휠은 항상 페이지를 움직인다.
     · 리빌은 불투명도 + 8px 상승, **1회만**. 다시 숨기지 않는다.
     · prefers-reduced-motion 이면 모션 전부 꺼지고 평범한 배치로 남는다.
     · 이징은 여기 EASE 토큰 한 곳 — 화면 어디서도 cubic-bezier 를 직접 쓰지 않는다.
     · 무모션 구역(지도·패널, 기억 카드)은 이 파일의 어떤 것도 쓰지 않는다 —
       손이 닿는 도구는 움직이지 않는다.
   ──────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from 'react'

/* ══════════ 이징 토큰 ══════════ */
export const EASE = {
  /** 감속 곡선 — 리빌·핀 등 서사 모션 공용 */
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const

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

/* ══════════ 핀 진행률 ══════════
   계약:
     · ref 를 sticky 런웨이(구간 수 × 60vh)에 건다.
     · progress 는 그 런웨이 안에서의 페이지 scrollY 진행률 0~1.
       핀은 이 값을 가로 snap 행의 scrollLeft 로 **사상만** 한다 —
       페이지 휠은 항상 페이지를 움직인다(하이재킹 금지의 이행).
     · enabled=false(reduced-motion)면 null — 런웨이를 해제(height auto)하고
       평범한 가로 snap 행 + 좌우 단추만 남긴다.
   scroll 이벤트는 rAF 로 한 프레임에 한 번만 계산한다 — 값을 만들지 않고 재기만 한다. */
export function usePinProgress(enabled = true): { ref: React.RefObject<HTMLDivElement | null>; progress: number | null } {
  const ref = useRef<HTMLDivElement | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  useEffect(() => {
    if (!enabled) { setProgress(null); return }
    const el = ref.current
    if (!el) { setProgress(null); return }
    let raf = 0
    const measure = () => {
      raf = 0
      const total = el.offsetHeight - window.innerHeight
      if (total <= 0) { setProgress(0); return }
      const top = el.getBoundingClientRect().top
      setProgress(Math.min(1, Math.max(0, -top / total)))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure) }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [enabled])
  return { ref, progress: enabled ? progress : null }
}
