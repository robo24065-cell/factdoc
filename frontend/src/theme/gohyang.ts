/* ────────────────────────────────────────────────────────────────
   고향ON 디자인 토큰 — 화면이 무엇을 말하는지에 색을 맞춘다

   왜 새로 짜는가:
     이 화면은 FactDoc(건강 팩트체커)의 팔레트를 그대로 물려받았다.
     흰 카드 + 파란 강조 + 회색 본문. 정보 서비스로는 무해하지만
     **이 주제에는 맞지 않는다.** 여기서 다루는 것은
     "고향을 기억하는 사람이 몇 명 남았는가"이고, 화면이 그 무게를 져야 한다.

   방향 — 기록보관소(archive)의 종이 + 편집물(editorial)의 큰 활자
     ㆍ바탕은 흰색이 아니라 **따뜻한 종이색**. 오래된 사진·편지가 놓인 자리처럼.
     ㆍ먹색(ink)은 순검정이 아니라 남색이 섞인 잉크. 인쇄물의 검정에 가깝다.
     ㆍ강조는 파랑 하나가 아니라 **두 축**:
         청록(jade)  = 지금 확인되는 것 · 살아 있는 것
         호박(ember) = 시간이 줄어드는 것 · 확인이 끊긴 것
     ㆍ수치는 주인공이다. 큰 숫자를 크게 쓰고 단위는 작게 붙인다.

   지켜야 할 제약 (바꾸면 서비스가 깨진다)
     ① as-of 3상태는 **기능색**이다. live/stale/frozen 이 서로 다른 색·도형·한국어
        라벨로 3중 부호화돼야 한다. 예쁘게 통일하려고 색을 합치지 마라.
     ② 이 서비스의 실사용자에 **80~90대가 포함된다**(생존 신청자 평균 83.0세).
        본문은 rem 계열로 두고, 11px 급은 캡션·출처·기준일에만 쓴다.
        대비는 WCHG AA(4.5:1) 이상을 유지한다 — 종이색 위 먹색은 그 조건에서 골랐다.
     ③ 다크 모드에서도 같은 의미가 유지돼야 한다. 밤에는 종이가 아니라
        **어두운 열람실**이 된다 — 채도를 낮추고 강조만 남긴다.
   ──────────────────────────────────────────────────────────────── */

/* ══════════ 표면 ══════════ */
export const SURFACE = {
  /** 페이지 바탕 — 따뜻한 종이. 다크는 잉크에 가까운 남흑색 */
  page: 'bg-[#faf7f2] dark:bg-[#0d1117]',
  /** 기본 카드 — 종이 위에 놓인 한 장 */
  card: 'rounded-2xl border border-[#e6ddd0] bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)] dark:border-[#232b36] dark:bg-[#151b23] dark:shadow-none',
  /** 강조 카드 — 헤드라인 수치·소멸 시계처럼 무게가 필요한 자리 */
  slab: 'rounded-3xl border border-[#e6ddd0] bg-gradient-to-b from-white to-[#fdfbf7] dark:border-[#232b36] dark:from-[#161d26] dark:to-[#121821]',
  /** 안쪽 구획 — 카드 안의 작은 묶음 */
  inset: 'rounded-xl bg-[#faf7f2] dark:bg-[#111821]',
  /** 구분선 */
  hair: 'border-[#ece4d8] dark:border-[#222a35]',
} as const

/* ══════════ 활자 ══════════
   scale 은 한 화면에 세 단계까지만 쓴다. 네 단계를 쓰면 위계가 사라진다. */
export const TYPE = {
  /** 페이지 제목 */
  h1: 'text-[1.75rem] font-semibold leading-[1.25] tracking-[-0.02em] sm:text-[2.125rem]',
  /** 섹션 제목 */
  h2: 'text-xl font-semibold leading-snug tracking-[-0.01em]',
  /** 카드 제목 */
  h3: 'text-base font-semibold leading-snug',
  /** 본문 — 고령 사용자를 고려해 15px 아래로 내리지 않는다 */
  body: 'text-[0.9375rem] leading-[1.7]',
  /** 보조 본문 */
  sub: 'text-sm leading-[1.65]',
  /** 캡션·출처·기준일 전용. 본문에 쓰지 마라 */
  cap: 'text-[11px] leading-[1.55]',
  /** 수치 — 주인공. tabular-nums 로 자리가 흔들리지 않게 */
  figure: 'text-[2.25rem] font-semibold leading-none tracking-[-0.03em] tabular-nums sm:text-[2.75rem]',
  figureSm: 'text-2xl font-semibold leading-none tracking-[-0.02em] tabular-nums',
  /** 눈에 걸리는 라벨 */
  eyebrow: 'text-[11px] font-semibold uppercase tracking-[0.08em]',
} as const

/* ══════════ 글자색 ══════════ */
export const TEXT = {
  ink: 'text-[#1c1917] dark:text-[#e8edf3]',        // 본문 먹색
  soft: 'text-[#57534e] dark:text-[#9aa7b5]',       // 보조
  faint: 'text-[#8a8279] dark:text-[#6b7684]',      // 캡션
  jade: 'text-[#0f6b5c] dark:text-[#4fd1b5]',
  ember: 'text-[#9a5b12] dark:text-[#f0b45f]',
  seal: 'text-[#6d3f8f] dark:text-[#c39bea]',
} as const

/* ══════════ as-of 3상태 — 기능색. 임의로 바꾸지 마라 ══════════
   같은 의미를 색(hue) · 도형(●▲■) · 한국어 라벨 셋으로 동시에 표현한다.
   색맹·흑백 인쇄·저조도에서도 구분되게 하려는 것이다. */
export const ASOF = {
  live: {
    key: 'live' as const,
    label: '최신',
    glyph: '●',
    chip: 'bg-[#e7f5f1] text-[#0f6b5c] ring-1 ring-[#bfe3da] dark:bg-[#0d2f2a] dark:text-[#4fd1b5] dark:ring-[#1c4d45]',
    bar: 'bg-[#0f6b5c] dark:bg-[#4fd1b5]',
    band: 'bg-[#e7f5f1] dark:bg-[#0d2f2a]',
    edge: 'border-[#bfe3da] dark:border-[#1c4d45]',
    text: TEXT.jade,
  },
  stale: {
    key: 'stale' as const,
    label: '이후 미확인',
    glyph: '▲',
    chip: 'bg-[#fdf1dd] text-[#9a5b12] ring-1 ring-[#f0d9ab] dark:bg-[#332310] dark:text-[#f0b45f] dark:ring-[#5c4220]',
    bar: 'bg-[#c8811f] dark:bg-[#f0b45f]',
    band: 'bg-[#fdf1dd] dark:bg-[#332310]',
    edge: 'border-[#f0d9ab] dark:border-[#5c4220]',
    text: TEXT.ember,
  },
  frozen: {
    key: 'frozen' as const,
    label: '데이터 종료',
    glyph: '■',
    chip: 'bg-[#f1e9f8] text-[#6d3f8f] ring-1 ring-[#ddcaee] dark:bg-[#241832] dark:text-[#c39bea] dark:ring-[#43305c]',
    bar: 'bg-[#6d3f8f] dark:bg-[#c39bea]',
    band: 'bg-[#f1e9f8] dark:bg-[#241832]',
    edge: 'border-[#ddcaee] dark:border-[#43305c]',
    text: TEXT.seal,
  },
} as const

export type AsOfKey = keyof typeof ASOF

/* ══════════ 지도 단계색 ══════════
   순차형(sequential) 한 계열. 종이색에서 잉크로 어두워지는 방향이라
   "값이 클수록 짙다"가 설명 없이 읽힌다. 무채색 대비도 단조 증가한다. */
export const CHORO = ['#f3ece1', '#e3d3bd', '#cdb391', '#b08e68', '#8c6b48', '#5f4630'] as const
export const CHORO_DARK = ['#1b222c', '#26333f', '#35485a', '#456075', '#587a92', '#6f9ab4'] as const
/** 값이 없는 구역 — 0 과 '모름'을 반드시 다르게 칠한다 */
export const CHORO_NONE = 'fill-[#efe8dd] dark:fill-[#161d26]'

/* ══════════ 상호작용 ══════════ */
export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f6b5c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf7f2] dark:focus-visible:ring-[#4fd1b5] dark:focus-visible:ring-offset-[#0d1117]'

export const PRESS = 'transition-transform active:scale-[0.985]'

/** 링크·버튼 — 밑줄은 남긴다. 색만으로 링크를 표시하지 않는다(접근성) */
export const LINK =
  'font-medium text-[#0f6b5c] underline decoration-[#9ecfc4] decoration-1 underline-offset-[3px] hover:decoration-[#0f6b5c] dark:text-[#4fd1b5] dark:decoration-[#2c6b60]'

export const BTN = {
  primary: `inline-flex items-center justify-center gap-1.5 rounded-full bg-[#1c1917] px-4 py-2 text-sm font-medium text-[#faf7f2] hover:bg-[#332e2b] dark:bg-[#e8edf3] dark:text-[#0d1117] dark:hover:bg-white ${FOCUS} ${PRESS}`,
  ghost: `inline-flex items-center justify-center gap-1.5 rounded-full border border-[#e0d6c7] bg-white/70 px-3.5 py-1.5 text-sm font-medium text-[#57534e] hover:border-[#c9bba6] hover:text-[#1c1917] dark:border-[#2a333f] dark:bg-transparent dark:text-[#9aa7b5] dark:hover:text-[#e8edf3] ${FOCUS} ${PRESS}`,
  seg: 'rounded-full px-3.5 py-1.5 text-sm font-medium transition',
  segOn: 'bg-[#1c1917] text-[#faf7f2] shadow-sm dark:bg-[#e8edf3] dark:text-[#0d1117]',
  segOff: 'text-[#7c746a] hover:text-[#1c1917] dark:text-[#8996a5] dark:hover:text-[#e8edf3]',
} as const

/** 한국어 줄바꿈 — 어절 단위로 끊어 읽기 흐름을 지킨다 */
export const PROSE = 'break-keep [word-break:keep-all]'

/* ══════════ 조사 ══════════
   지역명이 데이터에서 오므로 문장에 그대로 붙이면 반드시 어긋난다("현행 개성는").
   한글 음절은 (코드-0xAC00)%28 이 0 이면 받침이 없다. */
export function josa(word: string, withT: string, withoutT: string): string {
  const last = String(word ?? '').trim().slice(-1)
  const c = last.charCodeAt(0)
  if (Number.isNaN(c) || c < 0xac00 || c > 0xd7a3) return withoutT
  return (c - 0xac00) % 28 === 0 ? withoutT : withT
}
