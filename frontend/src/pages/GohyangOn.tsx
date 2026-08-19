import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { coverageEndOf, datasetLabel } from '../engine/nk-search.mjs'

/* ────────────────────────────────────────────────────────────────
   고향잇기 — 지도 위의 as-of

   사실은ON 이 "이 답이 언제 것인지"를 문장으로 말한다면,
   이 화면은 같은 것을 **공간**으로 말한다.
   지도 한 장 위에 기준일이 서로 다른 4개 계열이 겹쳐 있고,
   그 격차 자체가 이 서비스가 보여주려는 것이다.

     이산가족 신청현황(HWP)   2026-05-31   ← 가장 최신
     지역 기록(연표·동향)      2026-08-11
     이산가족 등록현황(CSV)    2025-08-31   ← 같은 통계인데 9개월 늦다
     기상 관측(NOAA GSOD)      2025-08-24
     탈북민 재북 출신지        2020-03-31
     이산가족 연표(CSV)        2021-12-16
     개성공단 / 금강산           종료 확정

   화면 원칙은 SasilOn.tsx 와 같다.
   ① emerald/amber/violet 은 as-of 3상태 전용색 (정보=blue, 중립=slate)
   ② 색 없이도 상태가 읽히도록 색·도형·한국어 라벨 다중 부호화
   ③ 노인이 읽을 문장은 rem 계열. text-[11px] 는 캡션·출처·기준일에만.
   ④ 수치는 전부 실측 — 화면에서 만들어 내는 값이 없다.
      조인만 하고, 없는 값은 '없다'고 쓴다.

   ★ 씬 전환 1단계 (2026-08-19) — 파일 분해는 순수 이동, 동작 무변경:
     타입 → components/gohyang/pack-types.ts
     유틸 → components/gohyang/format.ts · 공통 조각 → bits.tsx
     패널·사료 조인 → model.ts · 모션 규약 → motion.ts · 씬 틀 → Scene.tsx
     구획 → pages/gohyang/{HeroScene,MapScene,ClockScene,OpinionScene,
                            MuseumScene,DescendantScenes,ActionScenes,SourcesScene}
     이 파일에 남는 것: 팩 fetch · mode/sel/view 상태 · URL 동기화 ·
     ViewSwitch · StepMode(한걸음씩 — 무접촉) · 씬 나열.
   ──────────────────────────────────────────────────────────────── */

/* 팔레트·활자는 theme/gohyang.ts 가 단일 진실 소스다. */
import { SURFACE, TYPE, TEXT, BTN, josa } from '../theme/gohyang'
import type { Level, Mode, Pack, PathItem, Sel, View } from '../components/gohyang/pack-types'
import { PACK } from '../components/gohyang/pack-types'
import { nf, nf1, ymKo, ymdKo, clean, plain, notice } from '../components/gohyang/format'
import { FOCUS, CARD, PROSE, AsOfPill } from '../components/gohyang/bits'
import { membersOf, buildPanel, museumFor, DONATION_FIRST } from '../components/gohyang/model'
import { prefersReduced, scrollToId } from '../components/gohyang/motion'
import Scene from '../components/gohyang/Scene'

/* 씬 파일 — 구획별 컴포넌트 (씬 전환 2/2: 5막 13씬으로 분해 완료) */
import { HeroScene, HomePickScene } from './gohyang/HeroScene'
import MapScene, { GuideBox, MuseumCard } from './gohyang/MapScene'
import ClockScene from './gohyang/ClockScene'
import OpinionScene from './gohyang/OpinionScene'
import MuseumScene from './gohyang/MuseumScene'
import { DescendantFlipScene, DescendantEvidenceScene } from './gohyang/DescendantScenes'
import MemoryScene from './gohyang/MemoryScene'
import { DonateScene, ChannelsScene, ClosedScene } from './gohyang/ActionScenes'
import SourcesScene from './gohyang/SourcesScene'

/* 고향 도우미(페르소나 AI) — 한걸음씩 모드의 카드 힌트가 쓴다 */
import { buildGuideFacts, cardHint } from '../engine/nk-guide.mjs'
/* 기상은 화면이 직접 부르는 유일한 계열 — 지도와 기억 카드가 같은 호출을 쓴다 */
import { useLiveWeather } from '../lib/gohyangWeather'

const VIEW_KEY = 'gohyang_view'

/* ══════════════════════ 값이 보이는 추이 그래프 ══════════════════════
   "그래프가 모형만 보여주고 이 지점이 몇 명인지 모르겠다"는 지적(실측 2026-08-19)의 답.

   데스크톱 호버와 모바일 터치를 **한 코드로** 처리한다 — Pointer Events 는 마우스·터치·펜을
   같은 이벤트로 준다. 따로 만들면 한쪽이 반드시 낡는다.
   · 손가락/커서를 올린 지점에서 가장 가까운 실제 관측점을 찾아 세로선·점·말풍선을 띄운다.
   · 터치 중에는 세로 스크롤을 막는다(touch-action: none) — 안 막으면 화면이 같이 밀린다.
   · 키보드 ←→ 로도 움직인다. 포인터가 없는 사람에게도 값이 닿아야 한다.
   · 손을 떼면 **마지막 실측값**으로 돌아간다. 아무것도 안 한 상태에서도 숫자가 하나는 보이게. */
type Pt = { t: number; v: number; label: string; kind: 'real' | 'proj' }

function TrendChart({
  pts, yMax, x0, x1, height = 190, unit = '명', ariaLabel,
}: {
  pts: Pt[]; yMax: number; x0: number; x1: number
  height?: number; unit?: string; ariaLabel: string
}) {
  const W = 640, H = height
  const PAD = { l: 10, r: 10, t: 14, b: 26 }
  const svgRef = useRef<SVGSVGElement>(null)
  const lastReal = useMemo(() => {
    for (let i = pts.length - 1; i >= 0; i--) if (pts[i].kind === 'real') return i
    return pts.length - 1
  }, [pts])
  const [cur, setCur] = useState<number>(lastReal)
  const [active, setActive] = useState(false)
  useEffect(() => { setCur(lastReal) }, [lastReal])

  const px = (t: number) => PAD.l + ((t - x0) / (x1 - x0)) * (W - PAD.l - PAD.r)
  const py = (v: number) => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b)

  const pathOf = (kind: Pt['kind']) => {
    const seg = pts.filter(p => p.kind === kind)
    return seg.map((p, i) => `${i ? 'L' : 'M'}${px(p.t).toFixed(1)},${py(p.v).toFixed(1)}`).join(' ')
  }

  /* 화면 좌표 → 가장 가까운 관측점. viewBox 를 쓰므로 화면 폭으로 환산해야 한다. */
  const pick = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r || !r.width) return
    const vx = ((clientX - r.left) / r.width) * W
    let best = 0, bd = Infinity
    pts.forEach((p, i) => { const d = Math.abs(px(p.t) - vx); if (d < bd) { bd = d; best = i } })
    setCur(best)
  }

  const c = pts[cur]
  const cx = c ? px(c.t) : 0
  const cy = c ? py(c.v) : 0
  const boxW = 132, boxH = 40
  const boxX = Math.min(Math.max(cx - boxW / 2, 2), W - boxW - 2)
  const boxY = cy - boxH - 10 < PAD.t ? cy + 12 : cy - boxH - 10

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        style={{ height }}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onPointerDown={e => { setActive(true); pick(e.clientX); (e.target as Element).setPointerCapture?.(e.pointerId) }}
        onPointerMove={e => { if (active || e.pointerType === 'mouse') pick(e.clientX) }}
        onPointerUp={() => { setActive(false); setCur(lastReal) }}
        onPointerLeave={() => { if (!active) setCur(lastReal) }}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); setCur(i => Math.max(0, i - 1)) }
          if (e.key === 'ArrowRight') { e.preventDefault(); setCur(i => Math.min(pts.length - 1, i + 1)) }
        }}
      >
        <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="#dcdfe4" />
        <path d={pathOf('real')} fill="none" stroke="#1a4e9c" strokeWidth="2.5" />
        {pts.some(p => p.kind === 'proj') && (
          <path d={pathOf('proj')} fill="none" stroke="#767676" strokeWidth="2" strokeDasharray="5 4" />
        )}
        {c && (
          <>
            <line x1={cx} y1={PAD.t} x2={cx} y2={H - PAD.b} stroke="#1a4e9c" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={cx} cy={cy} r="5" fill="#fff" stroke={c.kind === 'proj' ? '#767676' : '#1a4e9c'} strokeWidth="2.5" />
            <g>
              <rect x={boxX} y={boxY} width={boxW} height={boxH} rx="4" fill="#ffffff" stroke="#dcdfe4" />
              <text x={boxX + 8} y={boxY + 16} fontSize="11" fill="#767676">{c.label}</text>
              <text x={boxX + 8} y={boxY + 33} fontSize="15" fontWeight="700" fill="#191919">
                {c.v.toLocaleString('ko-KR')}{unit}
                {c.kind === 'proj' ? ' (계산)' : ''}
              </text>
            </g>
          </>
        )}
      </svg>
      <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        그래프를 손가락으로 짚거나 커서를 올리면 그 시점의 값이 나옵니다. 키보드 좌우 화살표로도 움직입니다.
      </p>
    </div>
  )
}

/* ══════════════════════ 보기 방식 전환 ══════════════════════
   "저런 정보가 한번에 쏟아지면 머리를 아파하는 노인 층과 어린이 층을 위한" 모드가
   따로 있다는 것을, 그 노인·어린이가 직접 찾을 수 있어야 한다.
   그래서 표제 바로 아래에 큰 단추 두 개로 둔다(최소 터치 영역 44px 이상). */

function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div role="group" aria-label="보기 방식 고르기" className="mt-6 grid gap-2.5 sm:grid-cols-2 sm:max-w-2xl">
      {([
        ['all', '한눈에 보기', '지도·통계·연표가 한 화면에 모두 나옵니다'],
        ['step', '한걸음씩 보기', '큰 글씨로, 한 번에 한 가지씩만 나옵니다'],
      ] as const).map(([k, label, desc]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          aria-pressed={view === k}
          className={`min-h-[64px] rounded-md border px-5 py-3.5 text-left ${FOCUS} ${
            view === k
              ? 'border-[#1a4e9c] bg-[#eef3fb] dark:border-[#2f5f9f] dark:bg-[#16202c]'
              : `${SURFACE.line} bg-white hover:border-[#1a4e9c] dark:bg-transparent`
          }`}
        >
          <span className={`block text-[1.0625rem] font-bold ${view === k ? TEXT.blue : TEXT.ink}`}>
            {view === k ? '● ' : '○ '}{label}
          </span>
          <span className={`mt-0.5 block ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{desc}</span>
        </button>
      ))}
    </div>
  )
}

/* ══════════════════════ 한걸음씩 모드 ══════════════════════

   같은 데이터를 **한 번에 하나씩만** 보여준다. 새 데이터는 없다 — 밀도만 다르다.

   설계 규칙
     · 한 카드에 수치 1~2개까지만. 문장은 짧은 쉬운 말 하나로 노인·어린이 둘 다 읽힌다
       (문구를 두 벌 관리하면 반드시 한쪽이 낡는다).
     · 순서는 사람이 궁금해하는 순서다: ①몇 명 남았나 →②어디가 고향인가 →③오늘 그곳 날씨
       →④무슨 일이 있었나 →⑤그곳의 사진 →⑥몇 년 남았나 →⑦후손이 할 수 있는 일 →⑧출처.
     · 넘기는 길이 세 개다 — [이전]/[다음] 큰 단추(56px), 키보드 ↑↓, 스크롤(snap).
       스크롤 전용으로 만들면 접근성이 깨진다. IntersectionObserver 는 진행 표시만 맡는다.
     · prefers-reduced-motion 이면 smooth 스크롤을 끈다.
     · 활자는 대시보드보다 한 급 위(STEP_TYPE). 색·표면은 theme 토큰 그대로다. */

const STEPS = [
  { id: 'count', title: '몇 분이 남아 계십니까' },
  { id: 'region', title: '고향이 어디십니까' },
  { id: 'weather', title: '그 고향의 오늘 날씨' },
  { id: 'events', title: '그 고향의 최근 기록' },
  { id: 'museum', title: '그 고향에서 온 기록물' },
  { id: 'clock', title: '앞으로 몇 년 남았습니까' },
  { id: 'action', title: '지금 하실 수 있는 일' },
  { id: 'sources', title: '이 화면이 쓴 자료' },
] as const
type StepId = (typeof STEPS)[number]['id']

/* 본문 활자 한 급 위 — 크기만 다르고 색은 전부 TEXT 토큰을 쓴다 */
const STEP_TYPE = {
  title: 'text-[1.5rem] font-bold leading-snug sm:text-[1.75rem]',
  body: 'text-[1.125rem] leading-[1.9] sm:text-[1.1875rem]',
  cap: 'text-[0.9375rem] leading-[1.75]',
  figure: 'text-[3.25rem] font-bold leading-none tracking-[-0.03em] tabular-nums sm:text-[4rem]',
} as const

/* GuideBox next.target → 카드 번호 */
const STEP_TARGET: Record<string, number> = { weather: 2, events: 3, museum: 4, clock: 5, action: 6 }

/* 카드마다 붙는 도우미 한 문장 — 전부 규칙 문장(nk-guide.cardHint). 이 모드의 안내 역할이다. */
function StepHint({ id, facts }: { id: StepId; facts: unknown }) {
  const line = cardHint(id, facts) as string
  if (!line) return null
  return (
    <div className={`mt-auto rounded-md border border-dashed ${SURFACE.line} ${SURFACE.inset} px-4 py-3`} role="note">
      <p className={`${TYPE.cap} font-semibold ${TEXT.faint}`}>고향 안내인</p>
      <p className={`mt-1 ${STEP_TYPE.cap} ${TEXT.soft} ${PROSE}`}>{line}</p>
      <p className={`mt-1.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>이 안내문은 위 자료만 근거로 자동 작성됐습니다.</p>
    </div>
  )
}

function StepMode({ pack, oldRanked, onExit }: {
  pack: Pack
  oldRanked: Array<{ id: string; name: string; n: number }>
  onExit: (anchor?: string) => void
}) {
  const [cur, setCur] = useState(0)
  const [home, setHome] = useState<Sel | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Array<HTMLElement | null>>([])
  const touchX = useRef<number | null>(null)   // 사료 묶음 가로 스와이프 시작점

  const isan = pack.isan
  const homeName = home && home.mode === 'old' ? (oldRanked.find(o => o.id === home.id)?.name ?? '') : ''
  const homeFacts = useMemo(() => (home ? buildGuideFacts(home, pack) : null), [home, pack])
  const baseFacts = useMemo(
    () => ({ aliveTotal: { n: isan.latest.overview.cumulative.alive, asOf: isan.latest.asOf } }),
    [isan],
  )
  const panel = useMemo(() => (home ? buildPanel(home, pack) : null), [home, pack])
  const museum = useMemo(() => (home ? museumFor(home, pack) : null), [home, pack])
  /* 한걸음씩 모드의 사료는 **묶음으로 넘긴다.**
     이 모드는 카드 하나가 화면 하나라, 목록을 아래로 펼치면(더 보기) 스냅 구조가
     무너지고 노인·어린이가 길을 잃는다. 그래서 6장씩 끊어 좌우로 넘긴다 —
     화면 높이는 그대로 두고 [이전 6장]/[다음 6장] 큰 단추와 손가락 스와이프로만
     움직인다. 6장에서 멈춰 있고 더 볼 방법이 없던 문제(실측 지적)의 답이다. */
  const museumAll = useMemo(
    () => (museum ? [...museum.hometown, ...museum.venue, ...museum.historic] : []),
    [museum],
  )
  const MUSEUM_PER_PAGE = 6
  const [mPage, setMPage] = useState(0)
  const mPages = Math.max(1, Math.ceil(museumAll.length / MUSEUM_PER_PAGE))
  useEffect(() => { setMPage(0) }, [home])
  const museumRows = museumAll.slice(mPage * MUSEUM_PER_PAGE, mPage * MUSEUM_PER_PAGE + MUSEUM_PER_PAGE)
  const wxNames = home ? membersOf(home, pack.region) : []
  const { rows: wx, state: wxState } = useLiveWeather(wxNames)

  const go = (i: number) => {
    const n = Math.max(0, Math.min(STEPS.length - 1, i))
    const box = boxRef.current
    const el = cardRefs.current[n]
    /* scrollIntoView 는 snap-mandatory 컨테이너에서 간헐적으로 원위치로 되튄다(실측: Chromium).
       카드의 스냅 위치를 직접 계산해 컨테이너만 스크롤한다 — 페이지는 움직이지 않는다. */
    if (box && el) {
      const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
      box.scrollTo({ top, behavior: prefersReduced() ? 'auto' : 'smooth' })
      /* smooth 는 rAF 로 움직인다 — 백그라운드 탭·저사양 기기에서 멈춘 채 끝날 수 있다(실측).
         잠시 뒤 도착을 확인하고, 못 갔으면 즉시 이동한다. 단추가 눌렀는데 안 넘어가는 화면이
         노인 사용자에게 주는 혼란이 부드러운 움직임보다 훨씬 크다. */
      window.setTimeout(() => {
        if (Math.abs(box.scrollTop - top) > 4) box.scrollTo({ top })
      }, 600)
    }
    setCur(n)
  }
  /* 한걸음씩에서도 두 지도를 다 고를 수 있어야 한다(실측 지적 2026-08-19).
     구행정구역만 주면 탈북민 출신지(현행 13종)로 들어오는 사람이 자기 고향을 못 찾는다. */
  const [stepMode, setStepMode] = useState<Mode>('old')
  /* 현행은 지역명(key)으로 고른다 — 대시보드의 Sel 과 같은 형태여야 패널이 붙는다 */
  const modernRanked = useMemo(
    () => Object.keys(pack.region.regions).sort((a, b) => a.localeCompare(b, 'ko')),
    [pack],
  )
  const pickHome = (v: string) => {
    setHome(stepMode === 'old' ? { mode: 'old', id: v } : { mode: 'modern', key: v })
    go(2)
  }

  /* 스크롤로 넘겨도 '지금 몇 번째'가 따라오게 — 한 장씩 고정은 CSS snap-mandatory 가 맡고,
     IntersectionObserver 는 현재 카드 번호만 센다. */
  useEffect(() => {
    const root = boxRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const i = Number((e.target as HTMLElement).dataset.step)
          if (Number.isFinite(i)) setCur(i)
        }
      },
      { root, threshold: 0.6 },
    )
    cardRefs.current.forEach(el => el && io.observe(el))
    return () => io.disconnect()
  }, [])

  /* 키보드 ↑↓ — 스크롤 전용으로 만들면 접근성이 깨진다. 반드시 키보드로도 넘어간다. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(e.key)) return
      const t = e.target as HTMLElement | null
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return
      e.preventDefault()
      go(cur + (e.key === 'ArrowDown' || e.key === 'PageDown' ? 1 : -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur])

  const needHome = (
    <div>
      <p className={`${STEP_TYPE.body} ${TEXT.soft} ${PROSE}`}>먼저 고향을 골라 주세요. 그래야 그 고향의 자료를 모아 보여 드릴 수 있습니다.</p>
      <p className="mt-4">
        <button type="button" onClick={() => go(1)} className={`${BTN.primary} min-h-[56px] px-7 text-[1.0625rem]`}>
          고향 고르러 가기
        </button>
      </p>
    </div>
  )

  function renderBody(id: StepId): ReactNode {
    switch (id) {
      case 'count':
        return (
          <div>
            <p className={`${STEP_TYPE.figure} ${TEXT.stale}`}>
              {nf(isan.latest.overview.cumulative.alive)}
              <span className="ml-2 align-baseline text-[1.75rem] font-bold">명</span>
            </p>
            <p className={`mt-4 max-w-prose ${STEP_TYPE.body} ${TEXT.soft} ${PROSE}`}>
              북녘 고향의 가족을 찾겠다고 등록하신 분 가운데, 지금 살아 계신 분의 수입니다.
              {' '}{ymKo(isan.latest.asOf)}에 센 숫자입니다.
            </p>
            <p className={`mt-2 max-w-prose ${STEP_TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              평균 나이는 {nf1(isan.monthly.at(-1)?.avgAge)}세입니다.
            </p>
            <p className="mt-3"><AsOfPill level="live" /></p>
          </div>
        )
      case 'region':
        return (
          <div>
            <p className={`max-w-prose ${STEP_TYPE.body} ${TEXT.soft} ${PROSE}`}>
              집안에서 들은 고향 이름을 눌러 주세요.
            </p>
            <div role="group" aria-label="지도 종류" className="mt-4 flex flex-wrap gap-2.5">
              {([['old', '광복 당시 이름', '이산가족 고향은 이 이름으로 적혀 있습니다'],
                 ['modern', '지금 이름', '탈북민 출신지는 이 이름으로 적혀 있습니다']] as const).map(([k, label, hint]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStepMode(k)}
                  aria-pressed={stepMode === k}
                  title={hint}
                  className={`min-h-[56px] rounded-md border px-5 py-3 text-left ${FOCUS} ${
                    stepMode === k
                      ? 'border-[#1a4e9c] bg-[#eef3fb] dark:border-[#2f5f9f] dark:bg-[#16202c]'
                      : `${SURFACE.line} bg-white dark:bg-transparent`
                  }`}
                >
                  <span className={`block text-[1.125rem] font-bold ${stepMode === k ? TEXT.blue : TEXT.ink}`}>
                    {stepMode === k ? '● ' : '○ '}{label}
                  </span>
                  <span className={`block ${STEP_TYPE.cap} ${TEXT.faint}`}>{hint}</span>
                </button>
              ))}
            </div>
            <div role="group" aria-label="고향 고르기" className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {(stepMode === 'old'
                ? oldRanked.map(o => ({ v: o.id, name: o.name }))
                : modernRanked.map(k => ({ v: k, name: k }))
              ).map(o => {
                const on = home
                  ? (home.mode === 'old' ? home.id === o.v : home.key === o.v) && home.mode === stepMode
                  : false
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => pickHome(o.v)}
                    aria-pressed={on}
                    className={`min-h-[56px] rounded-md border px-4 py-3 text-[1.125rem] font-medium ${FOCUS} ${
                      on
                        ? 'border-[#1a4e9c] bg-[#eef3fb] text-[#1a4e9c] dark:border-[#2f5f9f] dark:bg-[#16202c] dark:text-[#7aa9e8]'
                        : `${SURFACE.line} bg-white ${TEXT.ink} hover:border-[#1a4e9c] dark:bg-transparent`
                    }`}
                  >
                    {o.name}
                  </button>
                )
              })}
            </div>
            {home && homeFacts != null && (
              <div className="mt-4">
                <GuideBox pack={pack} sel={home} onGo={t => go(STEP_TARGET[t] ?? 0)} />
              </div>
            )}
          </div>
        )
      case 'weather': {
        if (!home) return needHome
        const w = wx[0]
        return (
          <div>
            {wxState === 'loading' && (
              <p className={`${STEP_TYPE.body} ${TEXT.faint} ${PROSE}`}>지금 그곳의 날씨를 받아오는 중입니다…</p>
            )}
            {wxState === 'ok' && w && (
              <>
                <p className={`${STEP_TYPE.figure} ${TEXT.ink}`}>
                  {nf1(w.tempC)}
                  <span className="ml-1 align-baseline text-[1.75rem] font-bold">℃</span>
                </p>
                <p className={`mt-4 max-w-prose ${STEP_TYPE.body} ${TEXT.soft} ${PROSE}`}>
                  지금 {w.name} 하늘 아래의 기온입니다.
                  {Number.isFinite(w.maxC) && <> 오늘 낮에는 {nf1(w.maxC)}도까지 오릅니다.</>}
                </p>
                <p className="mt-3"><AsOfPill level="live" /></p>
                <p className={`mt-2 ${TYPE.cap} ${TEXT.faint}`}>출처 Open-Meteo (무료·인증 없음)</p>
              </>
            )}
            {(wxState === 'fail' || wxState === 'idle') && (
              <p className={`max-w-prose ${STEP_TYPE.body} ${TEXT.soft} ${PROSE}`}>
                지금은 날씨를 받아오지 못했습니다. 이 칸만 비고, 다른 자료는 그대로입니다.
              </p>
            )}
          </div>
        )
      }
      case 'events': {
        if (!home || !panel) return needHome
        const ev = panel.events.slice(0, 3)
        return (
          <div>
            {ev.length ? (
              <ol className="space-y-4">
                {ev.map((e, i) => (
                  <li key={`${e.date}-${i}`} className={`border-l-[3px] border-[#1a4e9c] pl-3.5 dark:border-[#7aa9e8] ${PROSE}`}>
                    <time className={`${STEP_TYPE.cap} font-semibold tabular-nums ${TEXT.blue}`} dateTime={e.date}>{ymdKo(e.date)}</time>
                    <p className={`mt-0.5 ${STEP_TYPE.body} ${TEXT.ink}`}>{clean(e.title)}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={`max-w-prose ${STEP_TYPE.body} ${TEXT.soft} ${PROSE}`}>날짜가 확인되는 최근 기록이 없습니다.</p>
            )}
            <p className={`mt-4 max-w-prose ${STEP_TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              통일부 공식 기록에 {homeName || '이 지역'}{josa(homeName || '이 지역', '이', '가')} 언급된 것 가운데 가장 최근 세 건입니다.
            </p>
          </div>
        )
      }
      case 'museum': {
        if (!home || !museum) return needHome
        return (
          <div>
            {museumRows.length ? (
              <>
                {/* 손가락으로도 넘길 수 있게 — 가로 스와이프를 묶음 넘김으로 옮긴다 */}
                <div
                  onTouchStart={e => { touchX.current = e.touches[0]?.clientX ?? null }}
                  onTouchEnd={e => {
                    const x0 = touchX.current; touchX.current = null
                    const x1 = e.changedTouches[0]?.clientX
                    if (x0 == null || x1 == null) return
                    const dx = x1 - x0
                    if (Math.abs(dx) < 48) return          // 세로 스크롤과 다투지 않게 문턱을 둔다
                    setMPage(p => Math.max(0, Math.min(mPages - 1, p + (dx < 0 ? 1 : -1))))
                  }}
                >
                  <ul className="grid gap-3 sm:grid-cols-3">
                    {museumRows.map(r => <MuseumCard key={r.iId} r={r} mark={null} />)}
                  </ul>
                </div>

                {mPages > 1 && (
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setMPage(p => Math.max(0, p - 1))}
                      disabled={mPage === 0}
                      className={`${BTN.ghost} min-h-[52px] px-5 text-base disabled:opacity-35`}
                    >
                      ← 이전 {MUSEUM_PER_PAGE}장
                    </button>
                    <p className={`shrink-0 text-center ${STEP_TYPE.cap} ${TEXT.soft}`} aria-live="polite">
                      <b className={`block text-base font-bold tabular-nums ${TEXT.ink}`}>
                        {mPage * MUSEUM_PER_PAGE + 1}–{mPage * MUSEUM_PER_PAGE + museumRows.length}
                      </b>
                      / 모두 {nf(museumAll.length)}장
                    </p>
                    <button
                      type="button"
                      onClick={() => setMPage(p => Math.min(mPages - 1, p + 1))}
                      disabled={mPage >= mPages - 1}
                      className={`${BTN.primary} min-h-[52px] px-5 text-base disabled:opacity-35`}
                    >
                      다음 {MUSEUM_PER_PAGE}장 →
                    </button>
                  </div>
                )}

                <p className={`mt-4 max-w-prose ${STEP_TYPE.cap} ${TEXT.faint} ${PROSE}`}>
                  이 고향에 걸린 기록물은 모두 {nf(museum.total)}건입니다. 사진은 박물관 원본을 그대로 불러온 것이며,
                  보이지 않으면 박물관이 외부 참조를 막은 것입니다.
                </p>
              </>
            ) : (
              <p className={`max-w-prose ${STEP_TYPE.body} ${TEXT.soft} ${PROSE}`}>
                이 고향의 기록물은 아직 공개 목록에서 확인되지 않았습니다. 없다는 뜻이 아니라, 공개된 자료의 글에서
                이 지역 이름이 확인되지 않았다는 뜻입니다.
              </p>
            )}
          </div>
        )
      }
      case 'clock': {
        /* 이 카드가 거의 비어 있었다(실측 지적 2026-08-19). 두 가지를 더 놓는다 —
           전체 수치와 **고른 고향의 수치**. 지역 몫은 추정하지 않는다:
           등록현황 월별 98개월에 고향별(origin) 열이 실재하므로 그대로 읽는다. */
        const mFirst = isan.monthly[0]
        const mLast = isan.monthly.at(-1)
        const key = panel?.isanKey ?? null
        const rFirst = key && mFirst ? mFirst.origin[key.monthlyKey] : null
        const rLast = key && mLast ? mLast.origin[key.monthlyKey] : null
        const rNow = key
          ? isan.latest.survivors.byOrigin.entries.find(e => e.label === key.latestKey)?.n ?? null
          : null
        const dropPct = (a?: number | null, b?: number | null) =>
          a && b ? Math.round((1 - b / a) * 100) : null

        /* 전체 추이 그래프 — 값이 보이게 TrendChart 를 쓴다(호버·터치·키보드 공통) */
        const tOf = (iso: string) => {
          const mm = iso.match(/^(\d{4})-(\d{2})/)
          return mm ? Number(mm[1]) + (Number(mm[2]) - 1) / 12 : NaN
        }
        const chartPts: Pt[] = [
          ...isan.monthly.map(m => ({ t: tOf(m.month), v: m.total, label: ymKo(m.month), kind: 'real' as const })),
          ...pack.proj.byYear.map(r => ({ t: tOf(r.asOf), v: r.expected, label: `${r.year}년 (계산)`, kind: 'proj' as const })),
        ].filter(q => Number.isFinite(q.t))

        return (
          <div>
            <p className={`${STEP_TYPE.figure} ${TEXT.ink}`}>
              {pack.proj.milestoneRange.below10000}
              <span className="ml-2 align-baseline text-[1.75rem] font-bold">년</span>
            </p>
            <p className={`mt-3 max-w-prose ${STEP_TYPE.body} ${TEXT.soft} ${PROSE}`}>
              이 무렵이 되면, 살아 계신 신청자가 1만 명보다 적어질 것으로 계산됩니다.
            </p>

            {/* 지금 숫자 — 전체와 그 고향을 나란히 */}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className={`${SURFACE.inset} p-4`}>
                <p className={`${STEP_TYPE.cap} ${TEXT.faint}`}>지금 전체</p>
                <p className={`mt-1 ${TYPE.figureSm} ${TEXT.ink}`}>
                  {nf(isan.latest.overview.cumulative.alive)}<span className="ml-1 text-base font-bold">명</span>
                </p>
                <p className={`mt-1 ${STEP_TYPE.cap} ${TEXT.faint}`}>{ymKo(isan.latest.asOf)} 기준</p>
              </div>
              <div className={`${SURFACE.inset} p-4`}>
                <p className={`${STEP_TYPE.cap} ${TEXT.faint}`}>
                  {key ? `이 고향(${key.name}) 출신` : '이 고향 출신'}
                </p>
                {rNow != null ? (
                  <>
                    <p className={`mt-1 ${TYPE.figureSm} ${TEXT.blue}`}>
                      {nf(rNow)}<span className="ml-1 text-base font-bold">명</span>
                    </p>
                    <p className={`mt-1 ${STEP_TYPE.cap} ${TEXT.faint}`}>
                      전체의 {Math.round((rNow / isan.latest.overview.cumulative.alive) * 100)}%
                    </p>
                  </>
                ) : (
                  <p className={`mt-1 ${STEP_TYPE.cap} ${TEXT.faint} ${PROSE}`}>
                    이 고향은 출신지 통계에 따로 집계되지 않습니다.
                  </p>
                )}
              </div>
            </div>

            {/* 지나온 8년 — 여기까지는 계산이 아니라 실제로 센 값이다 */}
            <div className={`mt-3 ${SURFACE.card} p-4`}>
              <p className={`${STEP_TYPE.cap} font-bold ${TEXT.ink}`}>지나온 8년 (실제로 센 값)</p>
              <p className={`mt-1.5 ${STEP_TYPE.body} ${TEXT.soft} ${PROSE}`}>
                전체는 {ymKo(mFirst?.month)} {nf(mFirst?.total)}명에서
                {' '}{ymKo(mLast?.month)} {nf(mLast?.total)}명으로 줄었습니다
                {' '}(<b className={`font-bold ${TEXT.ink}`}>{dropPct(mFirst?.total, mLast?.total)}% 감소</b>).
              </p>
              {rFirst != null && rLast != null && (
                <p className={`mt-2 ${STEP_TYPE.body} ${TEXT.soft} ${PROSE}`}>
                  {key!.name} 출신은 {nf(rFirst)}명에서 {nf(rLast)}명으로 줄었습니다
                  {' '}(<b className={`font-bold ${TEXT.blue}`}>{dropPct(rFirst, rLast)}% 감소</b>).
                </p>
              )}
              <div className="mt-3">
                <TrendChart
                  pts={chartPts}
                  yMax={62000}
                  x0={2017.4}
                  x1={2050.7}
                  height={190}
                  ariaLabel="전체 생존 신청자 추이와 앞으로의 추계"
                />
              </div>
              <p className={`mt-1 ${STEP_TYPE.cap} ${TEXT.faint} ${PROSE}`}>
                진한 선은 실제로 센 값(2017~2025), 점선은 앞으로의 계산입니다.
              </p>
            </div>

            <p className={`mt-3 max-w-prose ${STEP_TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              앞으로의 숫자는 통일부 발표가 아니라 이 화면이 통계청 생명표로 계산한 값입니다.
              {' '}지나온 값은 통일부가 매월 공표한 실제 수치입니다.
            </p>
            <p className="mt-3">
              <span className={`rounded-full border border-[#dcdfe4] px-2.5 py-1 ${TYPE.cap} font-semibold ${TEXT.faint} dark:border-[#2a2f36]`}>
                앞으로의 값 — 공식 통계 아님 · 계산 결과
              </span>
            </p>
          </div>
        )
      }
      case 'action': {
        const actionable = pack.paths.paths.filter(p => p.actionable)
        const donation = DONATION_FIRST.map(pid => actionable.find(p => p.id === pid)).filter((p): p is PathItem => Boolean(p))
        return (
          <div>
            <p className={`max-w-prose ${STEP_TYPE.body} ${TEXT.soft} ${PROSE}`}>
              집안에 남은 사진과 편지를 나라에 맡기는 일부터 하실 수 있습니다.
            </p>
            <ul className="mt-4 space-y-3">
              {donation.map(p => (
                <li key={p.id} className={`${SURFACE.card} p-5`}>
                  <p className={`text-[1.125rem] font-bold ${TEXT.ink} ${PROSE}`}>{plain(p.title)}</p>
                  <p className={`mt-1.5 ${STEP_TYPE.cap} ${TEXT.soft} ${PROSE}`}>{plain(p.what)}</p>
                  <p className="mt-3">
                    <a href={p.applyUrl || p.url} target="_blank" rel="noreferrer" className={`${BTN.primary} min-h-[52px] px-6 text-[1.0625rem]`}>
                      신청·안내 페이지 열기 <span aria-hidden="true">↗</span>
                    </a>
                  </p>
                </li>
              ))}
            </ul>
            <p className={`mt-4 max-w-prose ${STEP_TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              지금 열려 있는 창구는 모두 {nf(actionable.length)}곳입니다({pack.paths.builtAt} 확인).
            </p>
            <p className="mt-2">
              <button type="button" onClick={() => onExit('actions')} className={`${BTN.ghost} min-h-[48px]`}>
                전체 목록을 「한눈에 보기」에서 보기
              </button>
            </p>
          </div>
        )
      }
      case 'sources': {
        /* 연표·보도·동향·개황은 합산 계열 — 한 줄에 하나의 기준일이 성립하지 않아 네 줄로 가른다.
           배지 단계도 하드코딩하지 않고 notice() 가 기준일에서 계산한다(낡으면 stale 로 뒤집힌다). */
        const recRow = (id: 'timeline' | 'briefing' | 'nkinfoTrend' | 'nkinfoOverview', org: string) => {
          const end = coverageEndOf(id) ?? pack.region.builtAt
          return { name: `${datasetLabel(id)} (${org})`, end, fresh: notice(end, 'live').level as Level }
        }
        const rows: Array<{ name: string; end: string; fresh: Level; outside?: boolean }> = [
          { name: '이산가족 신청 현황 공표 (통일부)', end: isan.latest.asOf, fresh: 'live' },
          { name: '등록현황 월별 통계 (공공데이터포털)', end: isan.monthly.at(-1)?.month ?? '', fresh: 'live' },
          recRow('timeline', '통일부'),
          recRow('briefing', '통일부'),
          recRow('nkinfoTrend', '북한정보포털'),
          recRow('nkinfoOverview', '북한정보포털'),
          { name: '디지털박물관 공개 사료 (통일부)', end: pack.paths.meta.measured?.archiveNewestProducedOn ?? pack.museum.builtAt, fresh: 'stale' },
          { name: '통일의식조사 (서울대학교 — 통일부 자료 아님)', end: pack.opinion.reports.at(-1)?.fieldPeriod?.to ?? '', fresh: 'stale', outside: true },
        ]
        return (
          <div>
            <p className={`max-w-prose ${STEP_TYPE.body} ${TEXT.soft} ${PROSE}`}>
              이 화면의 모든 숫자는 아래 자료에서 왔습니다. 자료마다 기준일이 다릅니다.
            </p>
            <ul className={`mt-4 divide-y ${SURFACE.hair}`}>
              {rows.map(s => (
                <li key={s.name} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 py-3">
                  <AsOfPill level={s.fresh} size="sm" />
                  <span className={`min-w-0 flex-1 ${STEP_TYPE.cap} ${TEXT.soft} ${PROSE}`}>{s.name}</span>
                  <span className={`shrink-0 ${TYPE.cap} tabular-nums ${TEXT.faint}`}>기준 {s.end || '미상'}</span>
                </li>
              ))}
            </ul>
            <p className={`mt-3 max-w-prose ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              북한 관련 정보 특성상 공식자료에 수록되지 않은 사실이 존재할 수 있습니다.
              원본 링크 전부는 「한눈에 보기」 맨 아래에 있습니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button type="button" onClick={() => go(0)} className={`${BTN.ghost} min-h-[48px]`}>처음으로 돌아가기</button>
              <button type="button" onClick={() => onExit()} className={`${BTN.ghost} min-h-[48px]`}>한눈에 보기로 전환</button>
            </div>
          </div>
        )
      }
    }
  }

  const stepBtn = (disabled: boolean) =>
    `inline-flex min-h-[56px] min-w-[104px] items-center justify-center gap-1 rounded-md border px-6 text-[1.125rem] font-bold ${FOCUS} ` +
    (disabled
      ? `cursor-default border-[#eaecef] bg-[#f5f7fa] text-[#b6bcc5] dark:border-[#252a31] dark:bg-[#14181e] dark:text-[#39414c]`
      : 'border-[#1a4e9c] bg-[#1a4e9c] text-white hover:bg-[#14407f] dark:border-[#2f5f9f]')

  return (
    <div className="mt-6">
      {/* ── 진행 표시 + 큰 단추 — 카드 위에 항상 보인다 ── */}
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => go(cur - 1)} disabled={cur === 0} className={stepBtn(cur === 0)}>
          <span aria-hidden="true">↑</span> 이전
        </button>
        <div className="min-w-0 text-center" aria-live="polite">
          <p className={`text-[1.0625rem] font-bold tabular-nums ${TEXT.ink}`}>{cur + 1} / {STEPS.length}</p>
          <p className={`truncate ${TYPE.cap} ${TEXT.faint}`}>{STEPS[cur].title}</p>
        </div>
        <button type="button" onClick={() => go(cur + 1)} disabled={cur === STEPS.length - 1} className={stepBtn(cur === STEPS.length - 1)}>
          다음 <span aria-hidden="true">↓</span>
        </button>
      </div>

      {/* ── 카드 묶음 — snap 으로 한 장씩 고정. 키보드·단추로도 같은 곳에 간다 ── */}
      <div
        ref={boxRef}
        className={`mt-3 h-[min(76vh,720px)] snap-y snap-mandatory overflow-y-auto overscroll-contain ${SURFACE.card}`}
        aria-label={`한걸음씩 보기 — 카드 ${STEPS.length}장`}
      >
        {STEPS.map((s, i) => (
          <section
            key={s.id}
            ref={el => { cardRefs.current[i] = el }}
            data-step={i}
            aria-label={`${i + 1} / ${STEPS.length} — ${s.title}`}
            className={`flex h-full snap-start flex-col gap-5 overflow-y-auto border-b p-5 last:border-0 sm:p-8 ${SURFACE.hair}`}
          >
            <div>
              <p className={`${TYPE.eyebrow} ${TEXT.faint} tabular-nums`}>{i + 1} / {STEPS.length}</p>
              <h3 className={`mt-1.5 ${STEP_TYPE.title} ${TEXT.ink} ${PROSE}`}>{s.title}</h3>
            </div>
            {renderBody(s.id)}
            <StepHint id={s.id} facts={homeFacts ?? baseFacts} />
          </section>
        ))}
      </div>

      <p className={`mt-2.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        [이전]·[다음] 단추, 키보드 위·아래 화살표, 스크롤 어느 것으로든 넘길 수 있습니다.
      </p>
    </div>
  )
}

export default function GohyangOn() {
  const [pack, setPack] = useState<Pack | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('old')
  const [sel, setSel] = useState<Sel | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  /* 보기 방식 — localStorage 에 저장해 다시 와도 유지한다. 저장 실패(사생활 모드)는 무해하다. */
  const [view, setView] = useState<View>(() => {
    try { return localStorage.getItem(VIEW_KEY) === 'step' ? 'step' : 'all' } catch { return 'all' }
  })
  function switchView(v: View, anchor?: string) {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* 저장 실패해도 이번 방문에는 적용된다 */ }
    if (anchor) {
      window.setTimeout(() => scrollToId(anchor), 60)
    } else {
      window.scrollTo({ top: 0, behavior: prefersReduced() ? 'auto' : 'smooth' })
    }
  }

  /* 데이터는 scripts/nk-gohyang-pack.mjs 가 public/gohyang/ 로 복사해 둔 것을 받는다.
     8개 파일 합계 약 1.4MB(gzip 약 177KB) — 검색 인덱스(13.5MB)와 달리 통째로 받아도 부담이 없다.
     박물관 사료만 5.4MB → 771KB 로 **행을 골라** 줄였다(지역 태그가 붙은 1,445건). 계산은 팩이 하지 않는다.
     하나라도 실패하면 화면을 절반만 그리지 않고 오류를 말한다(없는 값을 0으로 그리면 거짓말이 된다). */
  useEffect(() => {
    let alive = true
    const grab = (n: string) =>
      fetch(`${PACK}/${n}.json`).then(r => {
        if (!r.ok) throw new Error(`${n}.json 로드 실패 (${r.status})`)
        return r.json()
      })
    Promise.all([
      grab('map'), grab('region'), grab('isan'), grab('projection'), grab('descendant'),
      grab('museum'), grab('paths'), grab('opinion'), grab('museum-sections'),
    ])
      .then(([map, region, isan, proj, desc, museum, paths, opinion, tour]) => {
        if (alive) setPack({ map, region, isan, proj, desc, museum, paths, opinion, tour })
      })
      .catch(e => { if (alive) setErr(e?.message ?? '데이터를 불러오지 못했습니다.') })
    return () => { alive = false }
  }, [])

  /* 모드를 바꾸면 선택을 같은 지역으로 옮긴다 —
     현행 평양 ↔ 구 평안남도처럼 서로 대응 관계가 있으므로 선택을 버리지 않는다. */
  function switchMode(next: Mode) {
    setMode(next)
    if (!pack || !sel) return
    if (next === 'old' && sel.mode === 'modern') {
      const k = pack.region.regions[sel.key]?.isanOrigin?.key
      setSel(k ? { mode: 'old', id: k } : null)
    } else if (next === 'modern' && sel.mode === 'old') {
      const first = membersOf(sel, pack.region)[0]
      setSel(first ? { mode: 'modern', key: first } : null)
    }
  }

  /* 선택을 주소에 남긴다 — 공유받은 사람이 그 고향 화면으로 바로 들어와야
     공유가 의미를 가진다. 히스토리를 더럽히지 않게 replaceState 를 쓴다. */
  function syncUrl(s: Sel | null) {
    if (typeof window === 'undefined') return
    const u = new URL(window.location.href)
    if (s) u.searchParams.set('고향', s.mode === 'old' ? s.id : s.key)
    else u.searchParams.delete('고향')
    window.history.replaceState(null, '', u.toString())
  }

  function select(s: Sel) {
    setSel(s)
    syncUrl(s)
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      window.setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
    }
  }

  /* ★ 주소로 들어온 사람을 그 자리까지 데려간다 (실측 지적 2026-08-19).
       예전에는 ?고향=… 로 들어오면 지역만 조용히 열리고 화면은 맨 위 표제에 그대로 섰다 —
       열린 패널(#g-weather)은 문서 y=2,124px, 전체 높이 21,514px 이라 스스로 찾을 수 없다.
       클릭 경로 select() 에만 스크롤이 있었고 복원 경로는 그 함수를 타지 않았다.
       ① 아는 고향이면 그 패널로, ② 모르는 이름이면 고향 고르기 씬으로 보내고 한 줄 고지를 남긴다,
       ③ #앵커(#extinction 등)도 같은 자리에서 처리한다 — 앵커가 살아 있어도 주소로 못 가면 없는 것과 같다.
       scrollToId 는 목적지가 아직 렌더 전이면 기다렸다 간다(motion.ts). */
  const restored = useRef(false)
  const [unknownHome, setUnknownHome] = useState<string | null>(null)
  useEffect(() => {
    if (!pack || restored.current) return
    restored.current = true
    const v = new URLSearchParams(window.location.search).get('고향')
    if (v) {
      if (pack.map.regionsOld.some(o => o.id === v)) {
        setMode('old'); setSel({ mode: 'old', id: v })
        window.setTimeout(() => scrollToId('g-weather'), 60)
        return
      }
      if (pack.region.regions[v]) {
        setMode('modern'); setSel({ mode: 'modern', key: v })
        window.setTimeout(() => scrollToId('g-weather'), 60)
        return
      }
      /* 아무 표시 없이 무시하면 "눌렀는데 아무 일도 없다"가 된다 — 고르는 자리로 보내고 이유를 적는다 */
      setUnknownHome(v)
      window.setTimeout(() => scrollToId('home-pick'), 60)
    }
  }, [pack])

  /* #앵커도 같은 규칙으로 움직인다 — 콜드 로드(/#extinction)든, 모바일 하단 탭처럼
     라우터가 해시만 바꾸는 경우든 한 자리에서 처리한다(pushState 는 hashchange 를 쏘지 않는다). */
  const { hash } = useLocation()
  useEffect(() => {
    if (!pack) return
    const h = decodeURIComponent(String(hash).replace(/^#/, ''))
    if (h) window.setTimeout(() => scrollToId(h), 60)
  }, [hash, pack])

  /* 구행정구역 7종을 생존자 수 내림차순으로 — 고향 찾기 진입과 선택 전 안내가 같은 목록을 쓴다.
     아무 데이터도 만들지 않고 실측 순서만 매긴다. */
  const oldRanked = useMemo(() => {
    if (!pack) return []
    const byOrigin = new Map(pack.isan.latest.survivors.byOrigin.entries.map(e => [e.label, e.n]))
    return pack.map.regionsOld
      .map(o => {
        const m = Object.keys(pack.region.regions).find(k => pack.region.regions[k].isanOrigin?.key === o.id)
        const key = m ? pack.region.regions[m].isanOrigin?.latestKey : undefined
        return { id: o.id, name: o.name, n: key ? (byOrigin.get(key) ?? 0) : 0 }
      })
      .sort((a, b) => b.n - a.n)
  }, [pack])
  const topOld = oldRanked.slice(0, 4)

  if (err) {
    return (
      <div className={`${CARD} p-6`}>
        <p className={`text-base font-semibold text-slate-900 dark:text-white ${PROSE}`}>지도 데이터를 불러오지 못했습니다.
        </p>
        <p className={`mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>{err}</p>
        <p className={`mt-1.5 text-[11px] leading-relaxed text-slate-400 ${PROSE}`}>
          <code>node scripts/nk-gohyang-pack.mjs</code> 를 실행해 <code>frontend/public/gohyang/</code> 를 채운 뒤 새로고침하세요.
        </p>
      </div>
    )
  }

  if (!pack) {
    return (
      <p className="flex items-center gap-2 py-20 text-sm text-slate-500">
        <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />지도·지역 자료를 불러오는 중…
      </p>
    )
  }

  return (
    <div className="pb-4">
      {/* ── S1 표제 — 33,272명이 주인공. ViewSwitch 는 상태만 여기서 쥐고 자리는 표제 밑이다.
            이음새·스크롤 단서는 씬 서사(한눈에)에서만 붙는다 — 한걸음씩은 무접촉. ── */}
      <Scene
        reveal={false}
        seam={view === 'all' ? '그분들의 고향은 일곱 이름으로 기록되어 있습니다.' : undefined}
        cue={view === 'all'}
      >
        <HeroScene pack={pack} view={view} viewSwitch={<ViewSwitch view={view} onChange={v => switchView(v)} />} />
      </Scene>

      {view === 'step' && (
        <StepMode pack={pack} oldRanked={oldRanked} onExit={anchor => switchView('all', anchor)} />
      )}

      {view === 'all' && (
      <>

      {/* ── S2 고향 고르기 — 이름만으로 들어오는 문 ── */}
      <Scene id="home-pick" className="scroll-mt-24">
        <HomePickScene
          pack={pack}
          oldRanked={oldRanked}
          sel={sel}
          unknownHome={unknownHome}
          onPickOld={id => { setMode('old'); setUnknownHome(null); select({ mode: 'old', id }) }}
        />
      </Scene>

      {/* ── S3 지도 + 패널 — 도구 씬(씬 규칙 면제). 무모션 구역(리빌 없음) ── */}
      <Scene
        reveal={false}
        seam="고향의 오늘을 보셨습니다. 이 기록에는 시한이 있습니다."
        cue
      >
        <MapScene
          pack={pack}
          mode={mode}
          sel={sel}
          panelRef={panelRef}
          topOld={topOld}
          onSwitchMode={switchMode}
          onSelect={select}
          onClose={() => { setSel(null); syncUrl(null) }}
          onPickOld={id => { setMode('old'); select({ mode: 'old', id }) }}
        />
      </Scene>

      {/* ── S4 기록 골든타임 — 2038~2041 이 주인공 ── */}
      <Scene id="extinction" full column="wide" className="mt-8 scroll-mt-24">
        <ClockScene isan={pack.isan} proj={pack.proj} />
      </Scene>

      {/* ── S5 통일의식 — 기록 골든타임 **바로 아래**.
             두 곡선을 나란히 두는 것이 요지라 사이에 다른 구획을 끼우지 않는다(그래서 S4에는 이음새가 없다).
             출처가 다르므로(서울대 통일평화연구원) 배지·문장으로 갈라 표시한다. */}
      <Scene full column="wide" className="mt-6" seam="숫자는 줄어들지만, 남겨 주신 것이 있습니다." cue>
        <OpinionScene opinion={pack.opinion} isan={pack.isan} />
      </Scene>

      {/* ── S6 사료 핀 — 기증 사진 1장 전폭, 핀 가로(두 곳 중 하나).
             "얼마 안 남았다"를 본 사람이 "무엇이 남아 있나"를 보고, 그다음 "무엇을 할까"로 간다. */}
      <Scene
        id="museum-tour"
        className="mt-8 scroll-mt-24"
        seam="이 사진들을 맡기신 분들은 1세대였습니다. 다음은 누구입니까."
        cue
      >
        <MuseumScene pack={pack} />
      </Scene>

      {/* ── S7 후손 반전 — "언제까지 남아 있는가" 다음 질문이 "그 다음은 누구인가"다 ── */}
      <Scene
        id="descendant"
        full
        column="wide"
        className="mt-8 scroll-mt-24"
        seam="이어받을 뜻은 1세대의 평가로 확인되었습니다. 통일부 조사에는 그다음 답도 적혀 있습니다."
        cue
      >
        <DescendantFlipScene desc={pack.desc} />
      </Scene>

      {/* ── S8 근거 — 59.9%: 이 화면이 하는 일을 이산가족이 먼저 요청했다 ── */}
      <Scene full column="narrative" className="mt-6" seam="그 요청에 오늘 답할 수 있는 자리를 여기 두었습니다." cue>
        <DescendantEvidenceScene desc={pack.desc} isan={pack.isan} />
      </Scene>

      {/* ── S9 기억 카드 — 도구 씬(무모션). 견본이 먼저, #memory-card 앵커는 도구 안에 산다 ── */}
      <Scene reveal={false} column="wide" className="mt-8" seam="만드신 카드를 맡길 곳이 있습니다." cue>
        <MemoryScene pack={pack} isan={pack.isan} />
      </Scene>

      {/* ── S10 기증 — 진단 다음에 행동. 기증 2경로가 맨 앞이다 ── */}
      <Scene
        id="actions"
        column="wide"
        full
        className="mt-6 scroll-mt-24"
        seam="기증 말고도 가족 이름으로 신청할 수 있는 창구가 여덟 곳 더 있습니다."
        cue
      >
        <DonateScene paths={pack.paths} desc={pack.desc} />
      </Scene>

      {/* ── S11 창구 핀 — 열린 8경로, 카드당 스크롤 한 구간(핀 두 곳 중 둘째) ── */}
      <Scene column="wide" className="mt-6" seam="열려 있는 곳을 보셨습니다. 닫혀 있는 곳도 그대로 적습니다." cue>
        <ChannelsScene paths={pack.paths} />
      </Scene>

      {/* ── S12 정직 — 닫힌 것 11가지 ── */}
      <Scene full column="narrative" className="mt-6" seam="여기 적힌 모든 수치에는 기준일이 있습니다.">
        <ClosedScene paths={pack.paths} />
      </Scene>

      {/* ── S13 출처 — 압축 1뷰포트, 마지막 줄은 팩트체커 유도 ── */}
      <Scene column="wide" className="mt-8">
        <SourcesScene pack={pack} />
      </Scene>
      </>
      )}
    </div>
  )
}
