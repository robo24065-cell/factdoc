/* ────────────────────────────────────────────────────────────────
   고향잇기 — PinnedDeck: 가로 카드 덱 (S6 사료 · S11 창구 두 곳만)

   ★ 2026-08-20 재설계 — 사용자 실사용 지적 세 가지가 그대로 설계다.
     ① *"덱 안에서 스크롤 할때 옆으로 넘어가는거지, 외부에서 옆으로 넘길려면
        그냥 아래로 가는게 낫지."*
     ② *"옆으로 넘어가는 모션같은것도 없어서 뭔가 부족하고."*
     ③ *"수십개 다 넘길때까지 아래로 못넘기는것도 스트레스."*

   그래서 바뀐 것
     · **sticky 런웨이를 걷어냈다.** 옛 구현은 (구간 수 × 60vh) 런웨이 안에서 페이지
       scrollY 진행률을 행의 scrollLeft 에 사상했다 — 사진 24장 덱이 페이지를 4.8화면
       붙잡았다(실측). 사진을 볼 생각이 없는 사람에게 그건 벽이다. 이제 덱은 한 화면
       안에 자리 잡고, 페이지 세로 스크롤은 덱을 **그냥 지나쳐** 아래로 간다.
     · **가로 이동은 덱과의 상호작용에서만 나온다** — 손가락 밀기(네이티브 overflow-x) ·
       좌우 단추(≥48px) · 키보드 ←→ · 포인터가 덱 위에 있을 때의 휠.
     · **휠의 계약(갇히지 않기의 이행)** — 2026-08-20 2차 실측으로 한 조항이 더 붙었다.
         - 가로 성분이 우세한 휠(트랙패드 가로 스와이프)은 같은 accX 에 모아 피치의 30%
           마다 한 장씩 넘긴다. 네이티브에 맡기면 snap-mandatory 가 반 장 미만을 되감아
           **아무 일도 일어나지 않는다**(실측: deltaX 120 을 5연타해도 0px).
         - 세로 의도가 뚜렷한 휠은, 덱이 **그 방향으로 더 갈 수 있고 예산이 남았을 때만**
           가로로 돌린다. 그때만 preventDefault. 끝에 닿거나 예산이 떨어지면 그 즉시
           preventDefault 를 하지 않으므로 같은 휠 동작이 페이지를 내린다(scroll chaining).
         - **예산(WHEEL_BUDGET)** — 한 제스처가 덱에서 가져갈 수 있는 최대 장수. 끝까지
           가는 데 22회가 들던 사진 24장 덱을 4회로 끊는다. 자세한 근거는 상수 주석에.
         - 휠의 **세기를 버리지 않는다** — deltaY 300 한 번은 세 장이다(옛 구현은 한 장).
     · **넘어가는 움직임이 실재한다** — motion.ts 의 EASE.out 을 rAF 로 샘플링하는
       glideScrollLeft. 옛 `row.scrollLeft = target` 직접 대입에는 중간 프레임이 없었다.
       prefers-reduced-motion 이면 즉시 이동(behavior:'auto' 와 같은 뜻).
     · 진행 표시(n / N) · 좌우 단추 · 키보드 · 화면 밖 카드 inert 는 그대로 살아 있다.
   ──────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { TYPE, TEXT, FOCUS } from '../../theme/gohyang'
import { useReducedMotion, glideScrollLeft } from './motion'

/** 마우스 휠 한 노치(≈100~120px)가 카드 한 장. 트랙패드의 잔 델타는 여기 모아 한 장으로 떨어진다. */
const WHEEL_STEP = 90

/** ★ 한 제스처가 덱에서 가져갈 수 있는 최대 장수 — **덱이 페이지를 붙잡는 총량의 상한**이다.
 *
 *  왜 상한이 필요한가 (실측 2026-08-20, 1280×900 홈 맨 위→맨 아래, delta=100):
 *    포인터가 덱 밖(x=64)이면 128회로 바닥에 닿는데, 화면 한가운데(x=640)면 156회가 든다.
 *    덱 무대가 화면의 80%×73%를 덮으므로 「마우스를 가운데 두는 기본 자세」가 곧 갇힘
 *    경로였다 — 사진 24장 덱에서 22회, 창구 8장 덱에서 6회 동안 페이지가 1px도 안 내려갔다.
 *    끝에 닿으면 놓아주는 계약(canGo)은 지켜지고 있었지만, **끝까지 가는 데 22회**가 든다는
 *    사실이 사용자 지적 ③(*"수십개 다 넘길때까지 아래로 못넘기는것도 스트레스"*)이었다.
 *
 *  그래서 예산을 둔다. 한 제스처가 이 장수를 다 쓰면 그 뒤 같은 방향 휠은 preventDefault 를
 *  놓는다 — 끝에 닿았을 때와 **완전히 같은 경로**로 페이지가 이어진다(갇히는 프레임 0).
 *  덱 둘을 합쳐도 x=640 경로가 128+8 회를 넘지 않는다.
 *
 *  예산이 다시 차는 자리(= 「덱을 보겠다」는 뜻이 확인되는 자리)
 *    · 손이 덱에 닿을 때(pointerdown·touchstart — 좌우 단추를 누르는 것도 여기 든다)
 *    · 키보드 ←→·Home·End
 *    · 휠 방향이 바뀔 때(되돌아 보는 것)
 *    · 휠이 GESTURE_GAP_MS 이상 끊겼다 다시 굴러올 때(사진을 보다가 다시 굴리는 손)
 *  굴려서 페이지를 지나가는 손은 이 넷 중 어디에도 걸리지 않으므로 상한이 그대로 걸린다. */
const WHEEL_BUDGET = 4

/** 이만큼 끊기면 새 제스처다. 지나가려고 굴리는 손은 30~120ms 간격이라 여기 걸리지 않는다. */
const GESTURE_GAP_MS = 700

export default function PinnedDeck({
  label, items, peek = 0, hint, className = '',
}: {
  /** 접근성 이름 — "기증 사진", "신청 창구" */
  label: string
  items: ReactNode[]
  /** 다음 카드가 옆으로 얼마나 엿보이는가(0~0.3). 가로로 더 있다는 것을 **보여주는** 유일한 단서다.
   *  사진(S6)은 얇게, 정보 카드(S11)는 두껍게 — 카드 성격이 다르다. */
  peek?: number
  /** 덱 아래 한 줄 안내를 덮어쓴다(기본 문구는 아래) */
  hint?: string
  className?: string
}) {
  const n = items.length
  const reduced = useReducedMotion()
  const rowRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [cur, setCur] = useState(0)

  /* 활강 중에는 scrollLeft 가 목적지보다 뒤에 있다. 가장자리 판정·다음 목적지는
     **목적지 기준**으로 세야 한다 — 아니면 빠른 휠이 같은 카드를 두 번 노린다. */
  const aimRef = useRef<number | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)
  const glidingRef = useRef(false)
  const accRef = useRef(0)
  /** 가로 델타는 따로 모은다 — 세로와 단위(노치 대 콘텐츠 px)가 다르다 */
  const accXRef = useRef(0)
  /** 이 제스처가 아직 가져갈 수 있는 장수 */
  const budgetRef = useRef(WHEEL_BUDGET)
  const lastWheelRef = useRef(0)
  const dirRef = useRef(0)

  /** 「덱을 보겠다」는 뜻이 확인된 자리에서만 예산이 다시 찬다 */
  const refill = useCallback(() => {
    budgetRef.current = WHEEL_BUDGET
    accRef.current = 0
    accXRef.current = 0
  }, [])

  const stop = useCallback(() => {
    cancelRef.current?.()
    cancelRef.current = null
    glidingRef.current = false
    aimRef.current = null
    accRef.current = 0
    accXRef.current = 0
  }, [])

  /* 카드 간격(피치)은 실제 배치에서 잰다 — peek 이 카드 폭을 줄이므로 clientWidth 로 세면 어긋난다.
     ★ 목적지는 i × 피치가 아니라 **그 카드가 실제로 놓인 자리**(offsetLeft)다.
       피치는 소수(예: 952.32px)라 곱셈으로 만들면 23번째 카드에서 7px 어긋난다(실측).
     ★ 잰 값은 캐시한다. 활강은 매 프레임 scrollLeft 를 쓰는데, 그 사이에 자식 24개의
       위치를 다시 읽으면 프레임마다 강제 리플로가 끼어 저사양 기기에서 활강이 끊긴다.
       카드 폭은 행 폭과 카드 수에만 달려 있으므로 그 둘이 그대로면 다시 재지 않는다. */
  const cacheRef = useRef<{ cw: number; count: number; pitch: number; max: number; pos: number[] } | null>(null)

  const metrics = () => {
    const row = rowRef.current
    if (!row || row.children.length === 0) return null
    const cw = row.clientWidth
    const count = row.children.length
    let c = cacheRef.current
    if (!c || c.cw !== cw || c.count !== count) {
      const kids = Array.from(row.children) as HTMLElement[]
      const pitch = kids.length > 1
        ? kids[1].getBoundingClientRect().left - kids[0].getBoundingClientRect().left
        : cw
      if (!pitch) return null
      const base = kids[0].offsetLeft
      c = {
        cw, count, pitch,
        max: Math.max(0, row.scrollWidth - cw),
        pos: kids.map(k => k.offsetLeft - base),
      }
      cacheRef.current = c
    }
    const m = c
    const posOf = (i: number) =>
      Math.min(m.max, Math.max(0, m.pos[Math.max(0, Math.min(m.pos.length - 1, i))]))
    return { row, pitch: m.pitch, max: m.max, posOf }
  }

  /** 지금 눈이 보고 있는(또는 곧 도착할) 카드 번호 */
  const indexAt = (m: NonNullable<ReturnType<typeof metrics>>) => {
    const at = aimRef.current ?? m.row.scrollLeft
    return Math.max(0, Math.min(n - 1, Math.round(at / m.pitch)))
  }

  const go = useCallback((idx: number) => {
    const m = metrics()
    if (!m) return
    const i = Math.max(0, Math.min(n - 1, idx))
    const to = m.posOf(i)
    cancelRef.current?.()
    aimRef.current = to
    glidingRef.current = true
    setCur(i)
    cancelRef.current = glideScrollLeft(m.row, to, undefined, () => {
      /* 도착하면 목적지를 놓는다 — 그다음 판정은 실제 위치가 진실이다 */
      glidingRef.current = false
      aimRef.current = null
    })
    // n 은 items 길이 — 렌더마다 같은 값이면 같은 함수다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n])

  /* "n / N" 은 행의 실제 위치에서 센다 — 휠이든 손가락이든 단추든 같은 자리에서 읽는다.
     ★ 우리가 굴린 것이 아닌 이동(손가락 밀기·트랙패드 가로 스와이프·브라우저 복원)이면
       목적지 기억을 버린다. 안 버리면 손으로 10번 카드까지 민 사람이 휠을 굴렸을 때
       옛 목적지(1번) 기준으로 계산해 화면이 뒤로 튄다(실측 2026-08-20). */
  const onRowScroll = () => {
    const m = metrics()
    if (!m) return
    if (!glidingRef.current) aimRef.current = null
    setCur(Math.max(0, Math.min(n - 1, Math.round(m.row.scrollLeft / m.pitch))))
  }

  /* ── 덱 위의 휠 ──────────────────────────────────────────────
     이 파일에서 유일하게 페이지를 붙잡는 곳이고, 붙잡는 조건이 곧 안전장치다. */
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || n <= 1) return

    const onWheel = (e: WheelEvent) => {
      const m = metrics()
      if (!m || m.max <= 0) return
      const ax = Math.abs(e.deltaX)
      const ay = Math.abs(e.deltaY)

      /* ① 가로 성분이 우세한 휠(트랙패드 가로 스와이프) — 페이지를 붙잡을 수 없는 축이므로
            예산 밖이다. 옛 구현은 「네이티브에 맡긴다」며 손을 뗐는데, 맡긴 결과가
            **아무 일도 일어나지 않음**이었다: snap-mandatory 가 카드 반 장(피치 952px 의
            476px) 미만을 매번 되감는다(실측 — deltaX 120 을 30ms 간격 5연타해도 0px).
            그래서 가로 델타도 모아서 넘긴다. 문턱은 노치가 아니라 **피치의 30%** 다 —
            가로 델타는 콘텐츠 px 단위라 세로 노치(90)와 같은 자로 재면 10배 빨라진다. */
      if (ax > ay) {
        const dx = e.deltaX > 0 ? 1 : -1
        e.preventDefault()
        if (accXRef.current * dx < 0) accXRef.current = 0
        accXRef.current += e.deltaX
        const step = Math.max(WHEEL_STEP, m.pitch * 0.3)
        const k = Math.trunc(Math.abs(accXRef.current) / step)
        if (!k) return
        accXRef.current -= k * step * dx
        go(indexAt(m) + k * dx)
        return
      }
      if (!ay) return

      /* ② 세로 의도가 뚜렷한 휠 — 덱이 그 방향으로 더 갈 수 있고 **예산이 남았을 때만**
            가로로 돌린다. 둘 중 하나라도 아니면 preventDefault 를 하지 않으므로
            같은 휠이 그대로 페이지를 움직인다(scroll chaining · 갇히는 프레임 0). */
      const dir = e.deltaY > 0 ? 1 : -1
      const now = e.timeStamp || Date.now()
      if (dirRef.current !== dir || now - lastWheelRef.current > GESTURE_GAP_MS) refill()
      dirRef.current = dir
      lastWheelRef.current = now

      const at = aimRef.current ?? m.row.scrollLeft
      const canGo = dir > 0 ? at < m.max - 1 : at > 1
      if (!canGo || budgetRef.current <= 0) { accRef.current = 0; return }

      e.preventDefault()
      accRef.current += e.deltaY
      if (Math.abs(accRef.current) < WHEEL_STEP) return
      /* ★ 세기를 버리지 않는다 — deltaY 300 짜리 한 번은 세 장이다. 예전에는 accRef 를
           통째로 비우고 무조건 한 장만 갔다(210 이 버려졌다). 활강 시간은 늘리지 않으므로
           여러 장이 한 번에 미끄러진다 — 빨리 굴리는 사람일수록 덱을 빨리 지난다. */
      let k = Math.trunc(Math.abs(accRef.current) / WHEEL_STEP)
      accRef.current -= k * WHEEL_STEP * dir
      if (k > budgetRef.current) { k = budgetRef.current; accRef.current = 0 }
      budgetRef.current -= k
      go(indexAt(m) + k * dir)
    }

    /* 손이 닿는 순간 활강을 멈춘다 — 두 힘이 겹치면 화면이 떤다.
       손이 닿았다는 것은 「이 덱을 보겠다」는 뜻이므로 예산도 다시 찬다(좌우 단추 포함). */
    const onHand = () => { stop(); refill() }

    stage.addEventListener('wheel', onWheel, { passive: false })
    stage.addEventListener('pointerdown', onHand, { passive: true })
    stage.addEventListener('touchstart', onHand, { passive: true })
    return () => {
      stage.removeEventListener('wheel', onWheel)
      stage.removeEventListener('pointerdown', onHand)
      stage.removeEventListener('touchstart', onHand)
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, go, stop, refill])

  /* 창 크기가 바뀌면 카드 폭이 바뀐다 — 보고 있던 카드에 다시 정렬한다(반 장 걸침 방지) */
  useEffect(() => {
    const onResize = () => {
      cacheRef.current = null
      const m = metrics()
      if (!m) return
      stop()
      m.row.scrollLeft = m.posOf(Math.round(m.row.scrollLeft / m.pitch))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (n === 0) return null

  const btn = (disabled: boolean) =>
    `inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-1 rounded-md border px-4 text-base font-bold ${FOCUS} ` +
    (disabled
      ? 'cursor-default border-[#eaecef] bg-[#f5f7fa] text-[#b6bcc5]'
      : 'border-[#1a4e9c] bg-[#1a4e9c] text-white hover:bg-[#14407f]')

  return (
    <div className={className}>
      {/* 무대 — 런웨이가 없다. 이 묶음이 통째로 한 화면 안에 든다. 휠은 이 무대 위에서만 듣는다
          (검증 하니스가 row.parentElement 를 무대로, 그 부모를 바깥 칸으로 읽는다) */}
      <div ref={stageRef} className="flex flex-col justify-center">
        {/* ── 실재하는 가로 snap 행 — 손가락·트랙패드가 언제나 통한다 ── */}
        <div
          ref={rowRef}
          onScroll={onRowScroll}
          role="group"
          aria-label={`${label} ${n}장 — 좌우 단추, 키보드 좌우 화살표, 덱 위에서 휠을 굴려 넘길 수 있습니다`}
          aria-roledescription="가로 카드 묶음"
          tabIndex={0}
          onKeyDown={e => {
            /* 키로 넘기는 것도 「이 덱을 보겠다」는 뜻이다 — 휠 예산이 다시 찬다 */
            if (e.key === 'ArrowLeft') { e.preventDefault(); refill(); go(cur - 1) }
            if (e.key === 'ArrowRight') { e.preventDefault(); refill(); go(cur + 1) }
            if (e.key === 'Home') { e.preventDefault(); refill(); go(0) }
            if (e.key === 'End') { e.preventDefault(); refill(); go(n - 1) }
          }}
          onFocusCapture={e => {
            /* 안전망 — 어떤 경로로든 화면 밖 카드에 포커스가 앉으면 그 카드로 옮긴다.
               (평소에는 아래 inert 가 화면 밖 카드를 포커스 대상에서 뺀다) */
            const card = (e.target as HTMLElement).closest('[data-deck-card]')
            const i = card ? Number((card as HTMLElement).dataset.deckCard) : -1
            if (i >= 0 && i !== cur) go(i)
          }}
          className={`flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain ${FOCUS}`}
        >
          {items.map((it, i) => (
            /* ★ 화면 밖 카드는 탭 정지점이 아니다 (실측 지적 2026-08-19).
                 ① 포커스와 화면이 어긋나면 화면에 없는 사진의 박물관 링크에 Enter 가 간다(WCAG 2.4.11).
                 ② 사료 덱 하나가 홈 전체 탭 정지점의 3할을 삼켰다 — 다음 씬까지 Tab 48회.
               행(role=group, ←→ 키)과 좌우 단추가 도달 경로를 그대로 유지한다. */
            <div
              key={i}
              data-deck-card={i}
              inert={i === cur ? undefined : true}
              style={peek > 0 ? { width: `${(1 - peek) * 100}%` } : undefined}
              className={`shrink-0 snap-start px-0.5 ${peek > 0 ? '' : 'w-full'}`}
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
          {hint ?? (reduced
            ? '좌우 단추나 키보드 화살표로 넘길 수 있습니다. 아래로 스크롤하면 다음 내용으로 넘어갑니다.'
            : `좌우 단추·키보드 화살표로, 또는 이 덱 위에서 휠을 굴려 옆으로 넘길 수 있습니다. 휠은 한 번에 ${WHEEL_BUDGET}장까지만 옆으로 가고 그다음부터는 그대로 아래로 내려갑니다.`)}
        </p>
      </div>
    </div>
  )
}
