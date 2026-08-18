/* ────────────────────────────────────────────────────────────────
   고향ON 디자인 토큰 — 통일부 누리집 톤

   왜 이 톤인가:
     이 화면은 통일부 공공데이터를 대조해 보여준다. 사용자가 화면을 보고
     **"관공서가 내놓은 자료"라고 읽어야** 신뢰가 선다. 스타트업 제품처럼
     생기면 "누가 만든 건지 모르는 사이트"가 되고, 그러면 수치의 무게가 죽는다.
     그래서 정부 누리집의 시각 규약을 따른다 — 흰 바탕, 남색 강조,
     각진 모서리, 얇은 회색 선, 날짜가 오른쪽에 붙는 목록.

   지켜야 할 제약 (바꾸면 서비스가 깨진다)
     ① **그림 이모지를 쓰지 않는다.** 기기마다 모양이 달라지고, 흑백 인쇄에서
        뭉개지며, 관공서 화면에서 장식 이모지는 신뢰를 깎는다.
        의미가 필요한 자리에는 기하 도형(● ▲ ■ ◆ ◇)이나 한국어 라벨을 쓴다.
     ② as-of 3상태는 **기능색**이다. live/stale/frozen 이 서로 다른 색·도형·
        한국어 라벨로 3중 부호화돼야 한다. 예쁘게 통일하려고 합치지 마라.
     ③ 실사용자에 **80~90대가 포함된다**(생존 신청자 평균 83.0세).
        본문은 15px 아래로 내리지 않고, 11px 급은 캡션·출처·기준일에만 쓴다.
        대비는 WCAG AA(4.5:1) 이상을 유지한다.
   ──────────────────────────────────────────────────────────────── */

/* ══════════ 색 상수 ══════════
   남색은 통일부 누리집 계열의 청색을 기준으로 잡았다. */
export const C = {
  blue: '#1a4e9c',        // 주 강조 — 제목 밑줄·활성 탭·링크
  blueDeep: '#14407f',
  blueSoft: '#eef3fb',    // 강조 배경
  ink: '#191919',
  soft: '#555555',
  faint: '#767676',       // 흰 바탕 대비 4.54:1 — AA 하한을 지키는 가장 연한 회색
  line: '#dcdfe4',
  lineSoft: '#eaecef',
  wash: '#f5f7fa',        // 구획 배경
} as const

/* ══════════ 표면 ══════════ */
export const SURFACE = {
  page: 'bg-white dark:bg-[#111418]',
  /** 기본 구획 — 각진 모서리와 얇은 선. 그림자를 쓰지 않는다 */
  card: 'rounded-md border border-[#dcdfe4] bg-white dark:border-[#2a2f36] dark:bg-[#181c22]',
  /** 강조 구획 — 머리 수치·소멸 시계처럼 무게가 필요한 자리 */
  slab: 'rounded-md border border-[#c9d5e8] bg-[#f7f9fd] dark:border-[#2b3a52] dark:bg-[#151b24]',
  /** 안쪽 묶음 */
  inset: 'rounded-md bg-[#f5f7fa] dark:bg-[#14181e]',
  hair: 'border-[#eaecef] dark:border-[#252a31]',
  line: 'border-[#dcdfe4] dark:border-[#2a2f36]',
} as const

/* ══════════ 활자 ══════════ */
export const TYPE = {
  h1: 'text-[1.625rem] font-bold leading-[1.35] tracking-[-0.02em] sm:text-[2rem]',
  h2: 'text-[1.1875rem] font-bold leading-snug tracking-[-0.01em]',
  h3: 'text-[0.9375rem] font-bold leading-snug',
  body: 'text-[0.9375rem] leading-[1.75]',
  sub: 'text-sm leading-[1.7]',
  cap: 'text-[11px] leading-[1.6]',
  /** 수치 — 주인공. tabular-nums 로 자리가 흔들리지 않게 */
  figure: 'text-[2.125rem] font-bold leading-none tracking-[-0.03em] tabular-nums sm:text-[2.625rem]',
  figureSm: 'text-[1.375rem] font-bold leading-none tracking-[-0.02em] tabular-nums',
  /** 구획 위에 붙는 작은 분류 라벨 */
  eyebrow: 'text-[11px] font-bold tracking-[0.02em]',
} as const

export const TEXT = {
  ink: 'text-[#191919] dark:text-[#e6e9ed]',
  soft: 'text-[#555555] dark:text-[#a4acb6]',
  faint: 'text-[#767676] dark:text-[#7f8792]',
  blue: 'text-[#1a4e9c] dark:text-[#7aa9e8]',
  live: 'text-[#136c43] dark:text-[#5fc99a]',
  stale: 'text-[#8a5000] dark:text-[#e3ac5b]',
  frozen: 'text-[#4a3f7a] dark:text-[#a99ce0]',
} as const

/* ══════════ as-of 3상태 — 기능색. 임의로 바꾸지 마라 ══════════
   색(hue) · 도형(● ▲ ■) · 한국어 라벨 셋으로 동시에 표현한다.
   색맹·흑백 인쇄·저조도에서도 구분되게 하려는 것이다. */
export const ASOF = {
  live: {
    key: 'live' as const,
    label: '최신',
    glyph: '●',
    chip: 'bg-[#e8f4ee] text-[#136c43] ring-1 ring-[#bcdfcd] dark:bg-[#10281d] dark:text-[#5fc99a] dark:ring-[#1f4a35]',
    bar: 'bg-[#136c43] dark:bg-[#5fc99a]',
    band: 'bg-[#e8f4ee] dark:bg-[#10281d]',
    edge: 'border-[#bcdfcd] dark:border-[#1f4a35]',
    text: TEXT.live,
  },
  stale: {
    key: 'stale' as const,
    label: '이후 미확인',
    glyph: '▲',
    chip: 'bg-[#fdf3e3] text-[#8a5000] ring-1 ring-[#f0dcb4] dark:bg-[#2b1f0c] dark:text-[#e3ac5b] dark:ring-[#54401c]',
    bar: 'bg-[#b06a00] dark:bg-[#e3ac5b]',
    band: 'bg-[#fdf3e3] dark:bg-[#2b1f0c]',
    edge: 'border-[#f0dcb4] dark:border-[#54401c]',
    text: TEXT.stale,
  },
  frozen: {
    key: 'frozen' as const,
    label: '데이터 종료',
    glyph: '■',
    chip: 'bg-[#eeecf7] text-[#4a3f7a] ring-1 ring-[#d3cdea] dark:bg-[#1c1830] dark:text-[#a99ce0] dark:ring-[#3a3260]',
    bar: 'bg-[#4a3f7a] dark:bg-[#a99ce0]',
    band: 'bg-[#eeecf7] dark:bg-[#1c1830]',
    edge: 'border-[#d3cdea] dark:border-[#3a3260]',
    text: TEXT.frozen,
  },
} as const

export type AsOfKey = keyof typeof ASOF

/* ══════════ 지도 단계색 ══════════
   남색 한 계열(순차형). 값이 클수록 짙어지고, 무채색으로 떨어뜨려도
   밝기가 단조 증가해 색맹·흑백에서 순서가 남는다. */
export const CHORO = ['#eef2f8', '#cfdcef', '#a8c2e2', '#7ba1d2', '#4b79bb', '#1a4e9c'] as const
export const CHORO_NONE = 'fill-[#f0f1f3] dark:fill-[#181c22]'

/* ══════════ 상호작용 ══════════ */
export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4e9c] focus-visible:ring-offset-1 dark:focus-visible:ring-[#7aa9e8]'

/** 링크 — 색만으로 표시하지 않고 밑줄을 남긴다(접근성) */
export const LINK =
  'font-medium text-[#1a4e9c] underline decoration-1 underline-offset-[3px] hover:text-[#14407f] dark:text-[#7aa9e8]'

export const BTN = {
  primary: `inline-flex items-center justify-center gap-1.5 rounded border border-[#1a4e9c] bg-[#1a4e9c] px-4 py-2 text-sm font-medium text-white hover:bg-[#14407f] dark:border-[#2f5f9f] ${FOCUS}`,
  ghost: `inline-flex items-center justify-center gap-1.5 rounded border border-[#dcdfe4] bg-white px-3.5 py-2 text-sm font-medium text-[#555555] hover:border-[#1a4e9c] hover:text-[#1a4e9c] dark:border-[#2a2f36] dark:bg-transparent dark:text-[#a4acb6] dark:hover:text-[#7aa9e8] ${FOCUS}`,
  /** 분절 선택 — 정부 누리집의 탭처럼 밑줄로 활성을 표시한다 */
  seg: 'relative px-3.5 py-2 text-sm font-medium transition',
  segOn: 'text-[#1a4e9c] after:absolute after:inset-x-1 after:-bottom-px after:h-[2px] after:bg-[#1a4e9c] dark:text-[#7aa9e8] dark:after:bg-[#7aa9e8]',
  segOff: 'text-[#767676] hover:text-[#191919] dark:text-[#7f8792] dark:hover:text-[#e6e9ed]',
} as const

/** 한국어 줄바꿈 — 어절 단위로 끊어 읽기 흐름을 지킨다 */
export const PROSE = 'break-keep [word-break:keep-all]'

/** 구획 제목 앞에 붙는 남색 세로 막대 — 정부 누리집의 관용 표현 */
export const RULE = 'border-l-[3px] border-[#1a4e9c] pl-2.5 dark:border-[#7aa9e8]'

/* ══════════ 조사 ══════════
   지역명이 데이터에서 오므로 문장에 그대로 붙이면 반드시 어긋난다("현행 개성는").
   한글 음절은 (코드-0xAC00)%28 이 0 이면 받침이 없다. */
export function josa(word: string, withT: string, withoutT: string): string {
  const last = String(word ?? '').trim().slice(-1)
  const c = last.charCodeAt(0)
  if (Number.isNaN(c) || c < 0xac00 || c > 0xd7a3) return withoutT
  return (c - 0xac00) % 28 === 0 ? withoutT : withT
}
