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

/* ══════════ 글꼴 ══════════
   두 벌을 **역할로** 나눈다. 하나를 고르는 것이 아니다.

     명조 = 사람이 기억해서 남긴 말   — 표제 · 고향 이름 · 답변 · 이름줄
     고딕 = 기계가 공공데이터에서 붙인 값 — 질문 · 수치 · 기준일 · 출처 · 꼬리말

   as-of 규약(기준일이 붙는 것과 안 붙는 것)을 활자로 한 겹 더 부호화하는 것이지
   새 규칙을 만드는 게 아니다. 질문은 우리가 만든 것이므로 고딕이고, 답은 사람의
   것이므로 명조다 — 화면에서 '묻는 쪽'과 '답한 쪽'이 한눈에 갈린다.

   ★ 명조는 19px 미만에 쓰지 않는다.
     1x 화면에서 획이 픽셀 격자 아래로 내려가 회색이 된다(실측 solid-ink 비율:
     14px 명조 9.2% 대 고딕 29.0% · 21px 명조 26.0%). 실사용자 평균 83.0세라
     취향 문제가 아니다. 그래서 42/34/21/19 는 명조, 17/16/15/14 는 고딕이다.

   ★ 이 상수가 화면(HTML)과 그림 파일(canvas)의 **공통 원본**이다.
     canvas 의 ctx.font 은 CSS font 단축 파서를 그대로 쓰므로 같은 문자열을 넘긴다.
     두 벌로 두면 미리보기와 내려받은 PNG 의 줄바꿈이 갈라진다.

   폴백 경로(웹폰트가 막힌 경우): 함초롬바탕(한컴오피스) → 바탕(한국어 Windows
   보조 글꼴) → AppleMyungjo(macOS 선탑재) → 한국어 명조가 없는 기기는 고딕으로
   **명시적으로** 착지시킨다. serif 키워드는 한글 글리프를 못 내므로 어디로
   떨어질지를 우리가 정해 두는 것이다. 명조는 장식이지 의미 전달 수단이 아니다. */
export const FONT = {
  serif: '"Noto Serif KR", "HCR Batang", "함초롬바탕", Batang, "바탕", AppleMyungjo, "Apple SD Gothic Neo", "Malgun Gothic", serif',
  gothic: '"Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif',
} as const

/** document.fonts.load()·check() 에 넘기는 패밀리 — 폴백을 **빼고** 웹폰트 하나만.
 *  폴백을 섞으면 반환 배열이 "웹폰트가 살아 있다"는 신호로 못 쓴다(시스템 글꼴도 함께 세어진다). */
export const WEBFONT_SERIF = '"Noto Serif KR"'

/* ══════════ 활자 ══════════ */
export const TYPE = {
  h1: 'text-[1.625rem] font-bold leading-[1.35] tracking-[-0.02em] sm:text-[2rem]',
  h2: 'text-[1.1875rem] font-bold leading-snug tracking-[-0.01em]',
  h3: 'text-[0.9375rem] font-bold leading-snug',
  body: 'text-[0.9375rem] leading-[1.75]',
  /** 사람이 적은 답변 — 명조로 찍는 자리라 21px 아래로 내리지 않는다(위 글꼴 주석) */
  answer: 'text-[1.3125rem] leading-[1.8]',
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

/* ★ 최소 타깃 — 「누르는 것 ≥48px」의 단일 진실 소스.
   실사용자에 80~90대가 포함되고(평균 83.0세) 손이 떨리는 분이 있다. 42px 단추는
   "작지만 눌린다"가 아니라 "세 번에 한 번 빗나간다"이다. 실측(2026-08-19)에서
   상호작용 요소 165개 중 79개가 48px 미만이었고, 그중에는 고령자용 글자 확대 스위치
   (76×25)까지 들어 있었다 — 접근성 장치가 가장 작은 축에 든 셈이다.

   쓰는 법
     TAP        — 단추·큰 링크. 세로만 묶는다(가로는 라벨이 정한다).
     TAP_SQUARE — 아이콘처럼 라벨이 짧아 가로도 좁아지는 것.
     TAP_INLINE — 본문 안에 섞여 흐르는 출처 링크(「원본↗」). inline-flex 로
                  줄 상자를 48px 로 밀어 올린다 — 히트영역을 겹쳐 띄우는 방식은
                  옆 줄의 다른 링크를 가려서 쓰지 않는다(실측 위험).
   ※ 지도 폴리곤은 이 규약의 예외다. 폴리곤 크기는 지오메트리가 정하므로 늘릴 수 없고,
     대신 같은 화면에 지역명·인원이 적힌 48px 목록 단추를 등가 경로로 둔다. */
export const TAP = 'min-h-[48px]'
export const TAP_SQUARE = 'min-h-[48px] min-w-[48px]'
export const TAP_INLINE = 'inline-flex min-h-[48px] min-w-[48px] items-center justify-center'

export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4e9c] focus-visible:ring-offset-1 dark:focus-visible:ring-[#7aa9e8]'

/** 링크 — 색만으로 표시하지 않고 밑줄을 남긴다(접근성) */
export const LINK =
  'font-medium text-[#1a4e9c] underline decoration-1 underline-offset-[3px] hover:text-[#14407f] dark:text-[#7aa9e8]'

export const BTN = {
  primary: `inline-flex ${TAP} items-center justify-center gap-1.5 rounded border border-[#1a4e9c] bg-[#1a4e9c] px-4 py-2 text-sm font-medium text-white hover:bg-[#14407f] dark:border-[#2f5f9f] ${FOCUS}`,
  ghost: `inline-flex ${TAP} items-center justify-center gap-1.5 rounded border border-[#dcdfe4] bg-white px-3.5 py-2 text-sm font-medium text-[#555555] hover:border-[#1a4e9c] hover:text-[#1a4e9c] dark:border-[#2a2f36] dark:bg-transparent dark:text-[#a4acb6] dark:hover:text-[#7aa9e8] ${FOCUS}`,
  /** 분절 선택 — 정부 누리집의 탭처럼 밑줄로 활성을 표시한다 */
  seg: `relative inline-flex ${TAP} items-center px-3.5 py-2 text-sm font-medium transition`,
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
