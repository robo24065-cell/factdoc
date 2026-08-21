import { useEffect, useMemo, useRef, useState } from 'react'
import { SURFACE, TYPE, TEXT, PROSE, FOCUS, BTN, C, FONT, WEBFONT_SERIF, josa } from '../theme/gohyang'
import { useLiveWeather } from '../lib/gohyangWeather'
import { wrapLines } from '../lib/wrapLines.mjs'

/* ────────────────────────────────────────────────────────────────
   기억 카드 만들기 — 후손이 직접 무언가를 남기는 자리

   왜 필요한가 (사용자 지적, 2026-08-19)
     후손 다리는 지금까지 **통계와 링크 목록**이었다. "이어받고 싶어 하는데 수단이 없다"고
     진단만 하고, 정작 후손이 자기 집안의 기억을 남길 자리는 화면에 없었다.

   왜 빈 칸을 주지 않는가
     "고향에 대해 아는 것을 적으십시오"라고 빈 상자를 주면 아무도 못 쓴다.
     그래서 **우리 데이터가 질문을 만든다** — 그 고향의 연표 사건, 그 고향에서 온 사료,
     그 고향의 오늘 날씨를 먼저 보여 주고 "이 무렵 들으신 이야기가 있습니까"라고 묻는다.
     기억은 백지가 아니라 단서에서 나온다.

   ★ 개인정보를 서버로 보내지 않는다 — 타협 대상이 아니다.
     · 입력은 전부 브라우저 안에서만 처리한다. 전송 코드가 이 파일에 없다.
     · 임시 저장은 이 기기의 localStorage 한 곳뿐이고, 화면에 그 사실을 적는다.
     · 그림 파일은 canvas 로 이 기기에서 그린다(업로드 없음).
     · 지우는 단추를 같은 화면에 둔다. 남긴 것을 못 지우면 그건 수집이다.

   ★ 내려받기가 막히는 환경을 위해 **인쇄 경로를 반드시 함께** 둔다.
     관공서·요양시설 PC 는 다운로드가 정책으로 막혀 있는 경우가 많고,
     이 화면의 실사용자는 종이를 더 편하게 여긴다.

   문장 규약 — 담담한 높임말. 슬픔을 연출하지 않는다.
     "그리운 고향의 아픈 기억" 같은 말을 쓰지 않는다. 사실을 묻고, 답을 그대로 싣는다.
   ──────────────────────────────────────────────────────────────── */

/* ══════════════════════ 바깥에서 받는 것 ══════════════════════
   이 부품은 계산하지 않는다. 화면(GohyangOn)이 데이터 팩에서 뽑아 넘겨준 것만 쓴다. */

export type MemoryRelic = {
  iId: number
  title: string
  producedOn: string | null
  imgSrc: string | null
  recordUrl: string | null
  /** 구(舊)도명 표기로 걸린 사료 — 지역 확정이 아니라 "이 표기로 적힌 사료가 있다"는 표시 */
  historic?: boolean
}
export type MemoryHome = {
  id: string
  name: string
  /** 그 고향이 원적인 이산가족 생존 신청자 수 */
  survivors: number
  /** 현행 행정구역 이름 — 실시간 기상 호출 축 */
  members: string[]
  events: Array<{ date: string; title: string }>
  eventsTotal: number
  relics: MemoryRelic[]
  relicsTotal: number
}
export type MemoryDonation = {
  id: string
  title: string
  org: string
  what: string
  url: string
  contact: string
}
type Props = {
  homes: MemoryHome[]
  donations: MemoryDonation[]
  /** events = 연표 계열의 coverageEnd(자료가 어디까지 담겼는가) ·
   *  museumCollected = 우리가 사료 수집을 돌린 날(자료의 기준일이 아니다).
   *  두 날짜는 종류가 다르므로 이름도 갈라 둔다 — 나란히 놓고 같은 이름을 붙이면
   *  「수집일」이 「기준일」로 읽힌다. */
  asOf: { survivors: string; events: string; museumCollected: string }
}

/* ══════════════════════ 질문 ══════════════════════
   질문 문구는 여기 한 곳에만 있다. 화면·그림 파일·인쇄가 모두 이 표를 읽는다
   (두 벌로 두면 인쇄물과 화면의 질문이 갈라진다). */

type QKey = 'event' | 'relic' | 'season' | 'place'
type Voice = 'self' | 'heard'

/* S9 견본 카드(MemoryScene)가 같은 질문 문구를 읽는다 — 두 벌로 두면 견본과 실물이 갈라진다 */
export const QUESTIONS: Record<Voice, Record<QKey, string>> = {
  /* 고향을 직접 기억하시는 분 — 겪으신 일을 그대로 여쭙는다 */
  self: {
    place: '고향에서 기억나시는 마을·거리·산·강 이름이 있으십니까? 정확하지 않아도 됩니다.',
    event: '그 무렵 고향에서 있었던 일 가운데 기억나시는 것을 적어 주십시오.',
    relic: '고향에서 가져오셨거나 지금 간직하고 계신 사진·물건이 있습니까?',
    season: '고향의 어느 계절이 가장 자주 떠오르십니까?',
  },
  /* 집안 어른께 전해 들으신 분 — 조카·사촌도 같은 자격이라 「어른」으로만 부른다 */
  heard: {
    place: '집안 어른께서 말씀하신 마을·거리·산·강 이름이 있습니까? 정확하지 않아도 됩니다.',
    event: '그 무렵 집안에서 들으신 이야기가 있습니까?',
    relic: '그 시절 사진이나 물건이 댁에 있습니까? 있다면 무엇인지 적어 주십시오.',
    season: '어떤 계절의 이야기를 들으셨습니까?',
  },
}

/* 이름 칸의 이름표도 목소리를 따라간다 — 본인이 적는데 「들려주신 분」이면 어긋난다 */
const WHO: Record<Voice, { heading: string; note: string; nameLabel: string; relLabel: string | null; cardLabel: string }> = {
  self: {
    heading: '이 기억의 주인',
    note: '비워 두셔도 됩니다. 적으신 내용은 이 기기 밖으로 나가지 않습니다.',
    nameLabel: '성함 (선택)',
    relLabel: null,
    cardLabel: '기록하신 분',
  },
  heard: {
    heading: '이 기억을 들려주신 분',
    note: '비워 두셔도 됩니다. 적으신 내용은 이 기기 밖으로 나가지 않습니다.',
    nameLabel: '성함 (선택)',
    relLabel: '적으시는 분과의 관계 (선택)',
    cardLabel: '들려주신 분',
  },
}

type Draft = {
  homeId: string
  voice: Voice
  elder: string
  relation: string
  place: string
  event: string
  relic: string
  season: string
  savedAt: string
}
const EMPTY: Draft = { homeId: '', voice: 'heard', elder: '', relation: '', place: '', event: '', relic: '', season: '', savedAt: '' }
const STORE_KEY = 'gohyang_memory_card_v1'

const FIELD_KEYS: QKey[] = ['place', 'event', 'relic', 'season']

/* ══════════════════════ 표제·꼬리말 ══════════════════════
   ★ QUESTIONS 표와 같은 이유로 한 곳에만 둔다 — 두 벌로 두면 인쇄물과 그림 파일이 갈라진다.
     실제로 갈라져 있었다: PNG 에는 표제·부제와 꼬리말 3줄이 있는데 미리보기(=인쇄 대상)에는
     42px 표제도 없고 꼬리말은 한 줄로 줄어 **기증 문의 전화번호가 통째로 빠졌다**.
     내려받기가 막힌 PC 를 위해 둔 것이 인쇄 경로인데, 정작 그 사용자가 쥐는 종이에
     기증 창구가 없었다. */
export const CARD_TITLE = '고향 기억 카드'
export const CARD_SUB = '고향잇기 — 이산가족 기록을 후손에게 잇습니다'
const FOOTER = (madeAt: string): string[] => [
  `작성 ${madeAt} · 이 카드는 이 기기의 브라우저 안에서 만들어졌으며, 내용은 서버로 전송되지 않았습니다.`,
  '이 카드가 쓴 통일부 공공데이터는 이산가족 신청현황 하나이며, 작성 화면에서 보신 연표 사건·다른 집안 사료는 기억을 돕는 참고였을 뿐 이 카드에 실리지 않았습니다. 답변은 작성자의 기억입니다.',
  '국가 기록으로 남기시려면 통일부 이산가족납북자과 02-2100-5916 (생애기록물 수집 동의·기증 문의)로 이 카드를 첨부해 문의하십시오.',
]

/* ══════════════════════ 유틸 ══════════════════════ */

const nf = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n.toLocaleString('ko-KR') : '—'
}
const nf1 = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n.toFixed(1) : '—'
}
function ymdKo(d?: string | null): string {
  const m = String(d ?? '').match(/^(\d{4})[-.](\d{2})[-.](\d{2})/)
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : String(d ?? '')
}
function nowStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const today = () => nowStamp().slice(0, 10)

/* ══════════════════════ 그림 파일 ══════════════════════
   canvas 로 이 기기에서 그린다. 서버로 보내지 않는다.
   한 번은 재 보고(measure) 한 번은 그린다 — 답이 길어져도 잘리지 않게 높이를 먼저 정한다. */

type CardModel = {
  homeName: string
  survivors: number
  survivorsAsOf: string
  elder: string
  elderLabel: string
  relation: string
  qa: Array<{ q: string; a: string }>
  context: string[]
  madeAt: string
}

/* ══════════ 글꼴 두 벌 ══════════
   상수는 theme/gohyang.ts 한 곳에만 둔다(QUESTIONS 표를 한 곳에만 둔 것과 같은 이유).
   화면과 캔버스가 같은 문자열을 읽어야 글꼴 자체가 갈라지지 않는다.

   ★ 다만 **줄바꿈까지 같아지지는 않는다.** 미리보기는 브라우저의 줄바꿈 알고리즘
     (word-break:keep-all)을 쓰고 캔버스는 wrapLines() 를 쓴다. 우리가 맞출 수 있는 것은
     "단어를 쪼개지 않는다"·"줄 앞에 공백을 남기지 않는다" 두 가지이고, 거기까지만 맞춘다.
     예전 주석은 두 경로의 줄바꿈이 갈라지지 않는다고 적혀 있었는데 사실이 아니었다.

     serif  = 사람이 기억해서 남긴 말   — 표제 42 · 고향 이름 34 · 답변 21 · 이름줄 19
     gothic = 기계가 데이터에서 붙인 값 — 부제 17 · 수치 16 · 질문 16 · 쓴 자료 15 · 꼬리말 14

   급수의 경계가 곧 의미의 경계다. 명조는 19px 아래로 내려가면 1x 화면에서 획이 무너진다. */
type Fam = 'serif' | 'gothic'
const famCss = (f: Fam) => (f === 'serif' ? FONT.serif : FONT.gothic)

/* ── 웹폰트 예열 ──
   캔버스는 웹폰트 로드를 **스스로 촉발하지 않는다**. 스타일시트가 붙어 파싱까지 끝나도
   document.fonts.load() 를 부르기 전까지는 폴백 폭으로 잰다(실측: 같은 문장이
   로드 전 738.45px → 로드 후 697.54px, 5.5% 차이). measure 패스가 폴백 폭으로 높이를
   정하고 paint 패스가 명조로 그리면 줄이 갈리고 카드 아래가 비거나 잘린다.
   오류가 안 나서 눈에 안 띄는 종류의 사고라 그리기 직전에 반드시 await 한다. */

/** 캔버스가 쓰는 (굵기 × 웹폰트 패밀리) 조합. 크기는 face 선택에 영향이 없어 대표값만 적는다.
 *  고딕은 시스템 글꼴이라 FontFaceSet 에 없다 — 부를 필요가 없고 불러도 빈 배열이 온다. */
const SERIF_SPECS = [
  `400 21px ${WEBFONT_SERIF}`,
  `600 19px ${WEBFONT_SERIF}`,
  `700 34px ${WEBFONT_SERIF}`,
] as const

/** load() 는 unicode-range 교집합만 보므로 길이는 의미가 없다. 중복만 걷어 낸다.
 *  NFC 정규화는 필수 — 맥에서 붙여넣은 NFD 한글은 조합형 자모(U+1100~11FF)로 들어오는데
 *  Google 서브셋의 그 블록 커버리지는 0% 라, 정규화하지 않으면 그 글자만 다른 글꼴로 튄다. */
const uniqChars = (s: string) => [...new Set(String(s ?? '').normalize('NFC'))].join('')

/**
 * 명조 웹폰트를 실제로 그릴 문자열로 불러온다. 돌아온 값이 true 일 때만 명조로 그려진다.
 *
 * 판정식이 두 조건인 이유: 스타일시트 자체가 막히면 @font-face 규칙이 하나도 없어
 * load() 가 빈 배열을 즉시 돌려주는데, 그때 check() 는 "로드할 게 없으니 준비됐다"며
 * true 를 준다(실측). check() 단독으로는 차단을 절대 못 잡는다.
 * 타임아웃은 "실패는 안 하는데 느린" 프록시 대비용이지 차단 감지용이 아니다.
 *
 * 실패해도 예외를 밖으로 내보내지 않는다 — 글꼴만 떨어지고 카드는 그대로 나와야 한다.
 */
async function loadSerif(text: string, ms = 2500): Promise<boolean> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  if (!fonts || typeof fonts.load !== 'function') return false
  const chars = uniqChars(text)
  /* 둘째 인자를 생략하면 기본값이 공백 한 칸이라 한글 서브셋이 사실상 안 온다
     (실측: 인자 없이 2 faces, 문장을 넘기면 9 faces). '조용한 폴백'의 진짜 원인이다. */
  if (!chars) return false
  try {
    const faces = await Promise.race([
      Promise.all(SERIF_SPECS.map(s => fonts.load(s, chars))).then(a => a.flat()),
      new Promise<never>((_, rj) => { setTimeout(() => rj(new Error('font-timeout')), ms) }),
    ])
    return faces.length > 0 && SERIF_SPECS.every(s => fonts.check(s, chars))
  } catch {
    return false   // 차단·지연 → 시스템 명조(없으면 고딕)로 그대로 간다
  }
}

/** 그 카드에서 **명조로 그릴** 문자열만 모은다 — 고딕으로 갈 질문·기준일은 뺀다 */
function serifTextOf(m: CardModel): string {
  return (
    '고향 기억 카드관계' +
    m.homeName +
    m.elderLabel +
    m.elder +
    m.relation +
    m.qa.map(r => r.a).join('') +
    '0123456789'
  )
}

/* 줄바꿈 규칙은 lib/wrapLines.mjs 한 곳에 있다 —
   눈으로 확인하기 어려운 사고를 내는 자리라 브라우저 없이 node 가 곧바로 재게 떼어 뒀다
   (scripts/nk-verify-deck.mjs 가 가짜 measureText 로 같은 함수를 시험한다).
   전에는 이 파일에서 한 글자씩 붙였고, 그래서 'ABC 123' 이 'ABC 12' / '3' 으로 쪼개지고
   넘친 공백이 다음 줄 첫 글자가 되어 한 칸 들여쓴 것처럼 보였다. */

/** 한 벌의 그리기 절차. measure=true 면 칠하지 않고 높이만 잰다. */
function paint(ctx: CanvasRenderingContext2D, m: CardModel, W: number, measure: boolean): number {
  const M = 64
  const maxW = W - M * 2
  let y = 0
  const set = (size: number, weight: string, color: string, fam: Fam) => {
    ctx.font = `${weight} ${size}px ${famCss(fam)}`
    ctx.fillStyle = color
  }
  /* fam 이 필수 인자인 것은 일부러다 — 새 줄을 넣을 때 명조·고딕 중 어느 쪽인지
     반드시 정하게 만든다. 기본값을 두면 급수와 의미의 대응이 조용히 무너진다. */
  const line = (text: string, size: number, weight: string, color: string, lead: number, fam: Fam, x = M, wrapW = maxW) => {
    set(size, weight, color, fam)
    for (const ln of wrapLines(ctx, text, wrapW)) {
      y += lead
      if (!measure) ctx.fillText(ln, x, y)
    }
  }
  const rule = (color: string = C.line, h = 1) => {
    y += 14
    if (!measure) { ctx.fillStyle = color; ctx.fillRect(M, y, maxW, h) }
    y += 6
  }

  /* 머리 — 남색 띠 하나. 정부 누리집 관용 표현이고 흑백 인쇄에서도 남는다 */
  if (!measure) { ctx.fillStyle = C.blue; ctx.fillRect(0, 0, W, 10) }
  y = 40
  line(CARD_TITLE, 42, '700', C.ink, 46, 'serif')
  line(CARD_SUB, 17, '400', C.faint, 30, 'gothic')   // 서비스 라벨은 기계 쪽
  rule(C.blue, 2)

  line(m.homeName, 34, '700', C.blue, 44, 'serif')
  line(`이 고향이 원적인 이산가족 생존 신청자 ${nf(m.survivors)}명 (${m.survivorsAsOf} 기준)`, 16, '400', C.faint, 26, 'gothic')

  if (m.elder || m.relation) {
    y += 8
    line(
      [m.elder ? `${m.elderLabel}  ${m.elder}` : '', m.relation ? `관계  ${m.relation}` : ''].filter(Boolean).join('        '),
      19,
      '600',
      C.soft,
      30,
      'serif',
    )
  }
  rule()

  /* 질문은 고딕, 답은 명조 — 이 한 줄이 이 배분의 핵심이다.
     질문은 우리가 만든 것이고 답은 사람의 것이라, 글꼴이 갈리면
     '묻는 쪽'과 '답한 쪽'이 한눈에 나뉜다. */
  for (const { q, a } of m.qa) {
    y += 12
    line(q, 16, '600', C.faint, 25, 'gothic')
    y += 4
    line(a, 21, '400', C.ink, 34, 'serif')
  }

  if (m.context.length) {
    y += 22
    const boxTop = y
    let inner = y
    /* 상자 안 높이를 먼저 잰다 — 상자를 먼저 칠하면 글이 상자 밖으로 나간다 */
    ctx.font = `400 15px ${famCss('gothic')}`   // 아래 line() 과 같은 글꼴로 재야 상자 높이가 맞는다
    let h = 22
    for (const c of m.context) h += wrapLines(ctx, c, maxW - 36).length * 23
    if (!measure) {
      ctx.fillStyle = C.wash
      ctx.fillRect(M, boxTop, maxW, h + 40)
      ctx.fillStyle = C.line
      ctx.fillRect(M, boxTop, 3, h + 40)
    }
    inner += 12
    y = inner
    line('이 카드가 쓴 자료', 15, '700', C.soft, 26, 'gothic', M + 18, maxW - 36)
    for (const c of m.context) line(c, 15, '400', C.soft, 23, 'gothic', M + 18, maxW - 36)
    y = boxTop + h + 40
  }

  y += 26
  if (!measure) { ctx.fillStyle = C.line; ctx.fillRect(M, y, maxW, 1) }
  y += 6
  for (const f of FOOTER(m.madeAt)) line(f, 14, '400', C.faint, 24, 'gothic')
  y += 40
  return y
}

/** 그려서 data URL 을 돌려준다. 실패하면 null — 화면은 인쇄 경로로 안내한다. */
/* 고향 이름에서 색조를 정한다 — 난수를 쓰지 않아 같은 고향은 늘 같은 종이가 된다. */
function paperHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  // 미색~담청 사이만 쓴다. 원색이 나오면 공문서 톤이 깨진다.
  return 26 + (h % 5) * 42
}

/* 한지 느낌의 바탕 — 사진이 아니라 결이다. 재현하지 않으므로 기록과 혼동될 수 없다. */
function paintPaper(ctx: CanvasRenderingContext2D, W: number, H: number, homeName: string) {
  const hue = paperHue(homeName)
  const g = ctx.createLinearGradient(0, 0, W * 0.35, H)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.55, `hsl(${hue} 38% 97.4%)`)
  g.addColorStop(1, `hsl(${hue} 34% 95.4%)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  /* 섬유결 — 결정적인 의사난수라 다시 그려도 같은 종이가 나온다 */
  let seed = 0
  for (let i = 0; i < homeName.length; i++) seed = (seed * 131 + homeName.charCodeAt(i)) % 100000
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  ctx.save()
  ctx.globalAlpha = 0.10
  ctx.strokeStyle = `hsl(${hue} 24% 46%)`
  ctx.lineWidth = 0.7
  for (let i = 0; i < 420; i++) {
    const x = rnd() * W
    const y = rnd() * H
    const len = 8 + rnd() * 34
    const dy = (rnd() - 0.5) * 3
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + len, y + dy)
    ctx.stroke()
  }
  ctx.restore()

  /* 아래쪽에 아주 옅은 색면 하나 — 여백이 허전해 보이지 않게만 */
  ctx.save()
  ctx.globalAlpha = 0.5
  const b = ctx.createLinearGradient(0, H - 240, 0, H)
  b.addColorStop(0, 'rgba(255,255,255,0)')
  b.addColorStop(1, `hsl(${hue} 36% 93.4%)`)
  ctx.fillStyle = b
  ctx.fillRect(0, H - 240, W, 240)
  ctx.restore()
}

async function renderPng(m: CardModel): Promise<{ url: string; bytes: number; serif: boolean } | null> {
  /* ★ measure 패스보다 **앞**에서 기다린다.
     여기서 기다리지 않으면 need 높이는 폴백 폭으로 잡히고 그림은 명조로 그려져
     줄이 갈린다. 아래 두 패스는 이 await 뒤에서 **동기적으로** 연달아 돌므로
     그 사이에 글꼴 상태가 바뀔 수 없다 — 그것이 두 패스를 맞추는 유일한 장치다.
     false 여도 그냥 진행한다. 글꼴만 떨어지고 카드는 나온다. */
  const serif = await loadSerif(serifTextOf(m))
  try {
    const W = 1000
    const dpr = 2
    const probe = document.createElement('canvas')
    probe.width = W
    probe.height = 10
    const pctx = probe.getContext('2d')
    if (!pctx) return null
    /* 높이는 내용에 맞춘다 — A4 비율로 고정하면 답이 짧을 때 아래가 절반이나 비어
       "덜 만들어진 종이"처럼 보인다. 대신 최소 높이를 두어 쪽지처럼 납작해지지도 않게 한다. */
    const need = Math.max(1000, Math.ceil(paint(pctx, m, W, true)))

    const cv = document.createElement('canvas')
    cv.width = W * dpr
    cv.height = need * dpr
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    ctx.scale(dpr, dpr)
    paintPaper(ctx, W, need, m.homeName)
    ctx.textBaseline = 'alphabetic'
    paint(ctx, m, W, false)
    const url = cv.toDataURL('image/png')
    if (!url.startsWith('data:image/png')) return null
    return { url, bytes: Math.round((url.length - url.indexOf(',') - 1) * 0.75), serif }
  } catch {
    return null
  }
}

/* ══════════════════════ 화면 ══════════════════════ */

export default function MemoryCard({ homes, donations, asOf }: Props) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [restored, setRestored] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [png, setPng] = useState<{ url: string; bytes: number; at: string; serif: boolean } | null>(null)
  const [pngFail, setPngFail] = useState(false)
  const [pngBusy, setPngBusy] = useState(false)
  const loaded = useRef(false)

  /* 이어 쓰기 — 작성 중이던 내용이 있으면 그대로 살려 낸다 */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY)
      if (raw) {
        const d = { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) }
        setDraft(d)
        if (d.savedAt) setRestored(d.savedAt)
        if (d.homeId) setStep(1)
      }
    } catch { /* 사생활 모드 등 — 저장이 없어도 새로 쓰면 된다 */ }
    loaded.current = true
  }, [])

  /* 명조 예열 — 1단계(고향 고르기)에서 미리 부른다.
     (a) 3단계 미리보기가 고딕으로 떴다가 명조로 튀지 않고
     (b) PNG 를 만들 때 loadSerif() 가 캐시에서 즉시 resolve 해 기다림이 없다.
     여기 넘기는 것은 **고정 문구와 고향 이름뿐**이다 — 사용자가 적은 글자는 넣지 않는다.
     실패해도 아무 일도 하지 않는다. 카드는 시스템 명조로 그대로 나온다. */
  useEffect(() => {
    void loadSerif(
      '고향 기억 카드관계' +
        homes.map(h => h.name).join('') +
        Object.values(WHO).map(w => w.cardLabel).join('') +
        '0123456789',
    )
  }, [homes])

  /* 저장 — 이 기기의 localStorage 한 곳뿐이다. 전송하는 코드는 이 파일에 없다. */
  useEffect(() => {
    if (!loaded.current) return
    if (!draft.homeId && !draft.elder && !draft.place && !draft.event && !draft.relic && !draft.season) return
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...draft, savedAt: nowStamp() })) } catch { /* 저장 실패는 무해하다 */ }
  }, [draft])

  const home = homes.find(h => h.id === draft.homeId) ?? null
  const { rows: wx, state: wxState } = useLiveWeather(home ? home.members : [])
  const wxRow = wx[0] ?? null

  const voice: Voice = draft.voice === 'self' ? 'self' : 'heard'   // 옛 임시저장본에는 이 칸이 없다
  const Q = QUESTIONS[voice]
  const answered = FIELD_KEYS.filter(k => draft[k].trim()).length
  const set = (k: keyof Draft, v: string) => setDraft(d => ({ ...d, [k]: v }))

  const model: CardModel | null = useMemo(() => {
    if (!home) return null
    const qa = FIELD_KEYS.filter(k => draft[k].trim()).map(k => ({ q: Q[k], a: draft[k].trim() }))
    /* ★ 완성 카드의 상자에는 이 카드가 **실제로 쓴** 자료만 담는다 (2026-08-19 사용자 지적).
       연표 사건·다른 집안이 기증한 사료는 작성 화면(2단계)의 기억 단서일 뿐이고,
       적으신 내용과 대조하거나 매칭한 것이 아니다. 그것을 「참고한 기록」이라고
       카드에 실으면 제목이 거짓이 되고, 더 나쁘게는 남의 집안 사료 제목(기증자 성함 포함)이
       이 집안의 카드에 인쇄되어 몇 년 뒤 그 집 기록으로 오인된다.
       카드가 실제로 쓴 것: 생존 신청자 수(신청현황)와 작성 시각의 실측 기온 둘뿐이다. */
    const context: string[] = []
    if (wxRow) {
      context.push(
        `작성 시각 ${wxRow.name}의 기온 ${nf1(wxRow.tempC)}℃` +
          (Number.isFinite(wxRow.maxC) ? ` (최고 ${nf1(wxRow.maxC)}℃ · 최저 ${nf1(wxRow.minC)}℃)` : '') +
          ' — Open-Meteo 실시간 관측',
      )
    }
    context.push(`기준일 — 이산가족 신청현황 ${asOf.survivors}`)
    return {
      homeName: home.name,
      survivors: home.survivors,
      survivorsAsOf: asOf.survivors,
      elder: draft.elder.trim(),
      elderLabel: WHO[voice].cardLabel,
      relation: WHO[voice].relLabel ? draft.relation.trim() : '',
      qa,
      context,
      madeAt: nowStamp(),
    }
  }, [home, draft, wxRow, asOf])

  const fileName = `고향기억카드_${home?.name ?? '고향'}_${today()}.png`

  /* 글꼴을 기다리느라 비동기다. 누른 뒤 아무 반응이 없어 보이면 안 되므로
     그동안 단추를 잠그고 말을 바꾼다(주 사용자가 고령이다). */
  const makePng = async () => {
    if (!model || pngBusy) return
    setPngBusy(true)
    let out: Awaited<ReturnType<typeof renderPng>> = null
    try {
      out = await renderPng(model)
    } finally {
      setPngBusy(false)
    }
    if (!out) { setPngFail(true); setPng(null); return }
    setPngFail(false)
    setPng({ ...out, at: nowStamp() })
    try {
      const a = document.createElement('a')
      a.href = out.url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch { /* 내려받기가 막힌 환경 — 아래 링크와 인쇄 경로가 남는다 */ }
  }

  const clearAll = () => {
    try { localStorage.removeItem(STORE_KEY) } catch { /* 지울 것이 없으면 그만이다 */ }
    setDraft(EMPTY)
    setRestored(null)
    setPng(null)
    setStep(0)
  }

  const STEPS = ['고향 고르기', '질문에 답하기', '미리보기 · 내려받기'] as const

  /* 목소리 고르기 — 1단계 맨 앞과 2단계 양쪽에 같은 것을 둔다.
     1단계에 두는 이유: 두 갈래를 **글을 받기 전에** 보여야 1세대 당사자가 배제되지 않는다.
     2단계에도 남기는 이유: 답을 적다가 "이건 내 이야기인데" 하고 바꿀 수 있어야 한다. */
  const VoicePicker = ({ heading }: { heading: string }) => (
    <div className={`${SURFACE.card} p-4`}>
      <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>{heading}</p>
      <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>고르시는 대로 여쭙는 말이 바뀝니다.</p>
      <div role="group" aria-label="기억의 주인 고르기" className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        {([
          ['self', '제가 고향을 기억합니다', '고향에서 지내신 일을 직접 적으십니다'],
          ['heard', '집안 어른께 들었습니다', '자녀·손자녀뿐 아니라 조카·사촌도 적으실 수 있습니다'],
        ] as Array<[Voice, string, string]>).map(([v, label, hint]) => (
          <button
            key={v}
            type="button"
            onClick={() => set('voice', v)}
            aria-pressed={voice === v}
            className={`min-h-[56px] rounded-md border px-3.5 py-2.5 text-left ${FOCUS} ${
              voice === v ? 'border-[#1a4e9c] bg-[#eef3fb]' : SURFACE.line
            }`}
          >
            <span className={`block ${TYPE.body} font-semibold ${voice === v ? TEXT.blue : TEXT.ink}`}>{label}</span>
            <span className={`mt-0.5 block ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{hint}</span>
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <section id="memory-card" className={`mt-5 scroll-mt-24 ${SURFACE.slab} p-5`}>
      <div className="memcard-noprint">
        {/* ★ 도입부에서 1세대 당사자를 배제하지 않는다.
            안에는 「제가 고향을 기억합니다」가 있는데 그것이 2단계에 가서야 나오는 바람에,
            여기서 「후손이 …」·「들으신 이야기를 …」로 시작하면 정작 고향을 직접 기억하시는
            분은 그 존재를 알기 전에 「이건 후손용이구나」 하고 나가게 된다.
            이 화면 위쪽은 이미 「조카와 사촌도 같은 자격으로」라고 폭을 넓혀 두었다. */}
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>직접 남기는 자리</p>
        <h3 className={`mt-1 ${TYPE.h2} ${TEXT.ink} ${PROSE}`}>기억 카드 만들기</h3>
        <p className={`mt-1.5 max-w-prose ${TYPE.body} ${TEXT.soft} ${PROSE}`}>
          고향의 기억을 한 장으로 정리해 드립니다.{' '}
          <b className={`font-semibold ${TEXT.ink}`}>고향을 직접 기억하시는 분도, 집안 어른께 들으신 분도</b> 쓰실 수 있습니다.
          {' '}빈 칸에서 시작하지 않도록 그 고향의 연표 사건·사료·오늘 날씨를 먼저 보여 드리고 여쭙습니다.
          {' '}모르는 항목은 비워 두셔도 됩니다.
        </p>

        {/* ── 개인정보 고지 — 감추지 않고 도구 바로 위에 둔다 ── */}
        <div className={`mt-3 rounded-md border ${SURFACE.line} bg-white p-3.5`}>
          <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>
            <span aria-hidden="true">◆</span> 적으신 내용은 서버로 보내지 않습니다
          </p>
          <ul className={`mt-1.5 space-y-1 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
            <li>· 입력·미리보기·그림 파일 만들기까지 전부 이 기기의 브라우저 안에서 처리됩니다.</li>
            <li>· 임시 저장 위치는 이 브라우저의 저장소 한 곳뿐이며, 다른 곳으로 전송되지 않습니다.</li>
            <li>· 아래 「이 기기에서 지우기」를 누르면 저장된 내용이 즉시 사라집니다.</li>
          </ul>
        </div>

        {restored && (
          <div className={`mt-3 rounded-md border ${SURFACE.line} ${SURFACE.inset} p-3.5`}>
            <p className={`${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
              작성 중이던 내용을 불러왔습니다 (<span className="tabular-nums">{restored}</span> 저장). 이어서 쓰시면 됩니다.
            </p>
          </div>
        )}

        {/* ── 진행 표시 ── */}
        <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="작성 순서">
          {STEPS.map((s, i) => (
            <li key={s} className={`${TYPE.cap} ${i === step ? `font-bold ${TEXT.blue}` : TEXT.faint}`}>
              <span aria-hidden="true">{i === step ? '●' : '○'}</span> {i + 1}. {s}
              {i < STEPS.length - 1 && <span aria-hidden="true" className="ml-2">›</span>}
            </li>
          ))}
        </ol>
      </div>

      {/* ── 1단계: 고향 고르기 ── */}
      {step === 0 && (
        <div className="memcard-noprint mt-4 space-y-4">
          <VoicePicker heading="이 기억은 누구의 것입니까?" />
          <div>
            <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>어느 고향의 기억을 남기시겠습니까?</p>
            {/* 인원 칩을 뗐다 — 고르는 데 필요한 정보가 아니고, 이 자리에서는
                「남은 사람 수 순위」로만 기능한다. 같은 수치는 선택 뒤 미리보기에
                기준일과 함께 그대로 다시 나오므로 as-of 는 손상되지 않는다. */}
            <p className={`mt-1 ${TYPE.sub} ${TEXT.faint} ${PROSE}`}>
              이산가족 출신지는 광복 당시 구행정구역 {nf(homes.length)}종으로 공표됩니다. 고향을 고르시면 그 고향의 자료를 먼저 보여 드립니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {homes.map(h => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => { set('homeId', h.id); setStep(1) }}
                  className={`inline-flex min-h-[52px] items-center rounded-md border px-4 py-2 ${TYPE.sub} font-medium ${FOCUS} ${
                    draft.homeId === h.id ? 'border-[#1a4e9c] bg-[#eef3fb] text-[#1a4e9c]' : `${SURFACE.line} bg-white ${TEXT.ink} hover:border-[#1a4e9c]`
                  }`}
                >
                  {h.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 2단계: 질문에 답하기 ── */}
      {step === 1 && home && (
        <div className="memcard-noprint mt-4 space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>{home.name}의 기억을 여쭙겠습니다</p>
            <button type="button" onClick={() => setStep(0)} className={`${BTN.ghost} min-h-[44px]`}>
              고향 다시 고르기
            </button>
          </div>

          {/* 누가 적으시는가 — 이 선택이 아래 질문 네 개의 말을 바꾼다 */}
          <VoicePicker heading="이 기억은 누구의 것입니까?" />

          {/* 이름 — 이름표가 위 선택을 따라간다 */}
          <div className={`${SURFACE.card} p-4`}>
            <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>{WHO[voice].heading}</p>
            <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{WHO[voice].note}</p>
            <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={`${TYPE.sub} font-medium ${TEXT.soft}`}>{WHO[voice].nameLabel}</span>
                <input
                  type="text"
                  value={draft.elder}
                  onChange={e => set('elder', e.target.value)}
                  placeholder="예: 김○○"
                  className={`mt-1 w-full rounded-md border px-3 py-2.5 ${TYPE.body} ${TEXT.ink} ${SURFACE.line} ${FOCUS}`}
                />
              </label>
              {WHO[voice].relLabel && (
                <label className="block">
                  <span className={`${TYPE.sub} font-medium ${TEXT.soft}`}>{WHO[voice].relLabel}</span>
                  <input
                    type="text"
                    value={draft.relation}
                    onChange={e => set('relation', e.target.value)}
                    placeholder="예: 할아버지, 어머니, 큰아버지, 이모"
                    className={`mt-1 w-full rounded-md border px-3 py-2.5 ${TYPE.body} ${TEXT.ink} ${SURFACE.line} ${FOCUS}`}
                  />
                </label>
              )}
            </div>
          </div>

          {/* 마을·거리 이름 */}
          <div className={`${SURFACE.card} p-4`}>
            <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>{Q.place}</p>
            <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              {home.name}
              {josa(home.name, '은', '는')} 현행 행정구역으로 {home.members.join('·')}에 해당합니다. 옛 지명 그대로 적으셔도 됩니다.
            </p>
            <textarea
              rows={2}
              value={draft.place}
              onChange={e => set('place', e.target.value)}
              placeholder="예: 재령벌, 신천 온천, 큰내"
              className={`mt-2 w-full rounded-md border px-3 py-2.5 ${TYPE.body} ${TEXT.ink} ${SURFACE.line} ${FOCUS}`}
            />
          </div>

          {/* 연표 사건에서 출발하는 질문 */}
          <div className={`${SURFACE.card} p-4`}>
            <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>이 고향이 공식 기록에 나온 {nf(home.eventsTotal)}번 가운데</p>
            {home.events.length ? (
              <ul className={`mt-1.5 space-y-1.5 border-l-[3px] border-[#1a4e9c] pl-3`}>
                {home.events.slice(0, 2).map(e => (
                  <li key={`${e.date}-${e.title}`} className={`${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
                    <b className={`font-semibold tabular-nums ${TEXT.ink}`}>{ymdKo(e.date)}</b> — {e.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`mt-1.5 ${TYPE.sub} ${TEXT.faint} ${PROSE}`}>이 고향으로 걸리는 연표 사건이 자료에 없습니다. 그래도 들으신 이야기가 있으면 적어 주십시오.</p>
            )}
            <p className={`mt-3 ${TYPE.h3} ${TEXT.ink} ${PROSE}`}>{Q.event}</p>
            {/* 사건 목록은 남북관계 연표 레코드만 모은 것이다(보도자료는 건수만 센다).
                출처를 정확히 적어야 아래 기준일이 그 출처의 것으로 읽힌다. */}
            <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              위는 <b className="font-medium">남북관계 연표에 고향 이름이 적힌 때</b>입니다. 그 무렵 이야기가 아니어도 좋습니다 — 언제 일인지 아시는 대로 적어 주십시오.
            </p>
            <textarea
              rows={3}
              value={draft.event}
              onChange={e => set('event', e.target.value)}
              placeholder="들으신 대로 적어 주십시오. 날짜가 정확하지 않아도 됩니다."
              className={`mt-2 w-full rounded-md border px-3 py-2.5 ${TYPE.body} ${TEXT.ink} ${SURFACE.line} ${FOCUS}`}
            />
            <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>남북관계 연표 기준일 {asOf.events}.</p>
          </div>

          {/* 사료에서 출발하는 질문 */}
          <div className={`${SURFACE.card} p-4`}>
            <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>이 고향에서 온 디지털박물관 사료 {nf(home.relicsTotal)}건 중</p>
            {home.relics.length ? (
              <>
                {/* ★ 이 사료는 **다른 집안의** 기증품이다 — 단서로만 보이고 완성 카드에는 싣지 않는다.
                    카드에 실으면 남의 집안 기록이 이 집안의 카드로 인쇄되어 뒷날 오인된다. */}
                <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
                  다른 집안이 맡기신 기록입니다 — 기억을 떠올리는 참고로만 보십시오.
                </p>
              <ul className="mt-1.5 space-y-2">
                {home.relics.slice(0, 2).map(r => (
                  <li key={r.iId} className="flex items-start gap-3">
                    {r.imgSrc && (
                      <img
                        src={r.imgSrc}
                        alt=""
                        loading="lazy"
                        className={`h-16 w-16 shrink-0 rounded border object-cover ${SURFACE.line}`}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                      />
                    )}
                    <span className="min-w-0">
                      <span className={`block ${TYPE.sub} ${TEXT.ink} ${PROSE}`}>{r.title}</span>
                      <span className={`block ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
                        {r.producedOn ? `${r.producedOn} 생산` : '생산연도 미상'}
                        {r.historic ? ' · 구(舊)도명 표기로 걸린 사료' : ''}
                        {r.recordUrl && (
                          <>
                            {' · '}
                            <a href={r.recordUrl} target="_blank" rel="noreferrer" className={`inline-flex min-h-[48px] min-w-[48px] items-center justify-center px-1 text-[#1a4e9c] underline underline-offset-2 ${FOCUS}`}>
                              박물관에서 보기<span aria-hidden="true">↗</span>
                            </a>
                          </>
                        )}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              </>
            ) : (
              <p className={`mt-1.5 ${TYPE.sub} ${TEXT.faint} ${PROSE}`}>이 고향으로 걸리는 공개 사료가 없습니다.</p>
            )}
            <p className={`mt-3 ${TYPE.h3} ${TEXT.ink} ${PROSE}`}>{Q.relic}</p>
            <textarea
              rows={3}
              value={draft.relic}
              onChange={e => set('relic', e.target.value)}
              placeholder="예: 할아버지 사진 두 장, 편지 한 통, 놋그릇"
              className={`mt-2 w-full rounded-md border px-3 py-2.5 ${TYPE.body} ${TEXT.ink} ${SURFACE.line} ${FOCUS}`}
            />
            <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              사료 이미지는 저장하지 않고 통일부 박물관 원본을 그대로 참조합니다. 사료 수집일 {asOf.museumCollected} (자료의 기준일이 아니라 저희가 목록을 받아 온 날입니다).
            </p>
          </div>

          {/* 오늘 날씨에서 출발하는 질문 */}
          <div className={`${SURFACE.card} p-4`}>
            <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>지금 이 시각 그곳의 날씨</p>
            {wxState === 'ok' && wxRow ? (
              <p className={`mt-1 ${TYPE.body} ${TEXT.soft} ${PROSE}`}>
                {wxRow.name} <b className={`font-semibold tabular-nums ${TEXT.ink}`}>{nf1(wxRow.tempC)}℃</b>
                {Number.isFinite(wxRow.maxC) && <span className={`ml-1 ${TYPE.cap} tabular-nums ${TEXT.faint}`}>최고 {nf1(wxRow.maxC)} · 최저 {nf1(wxRow.minC)}</span>}
                {wxRow.at && <span className={`ml-1 ${TYPE.cap} tabular-nums ${TEXT.faint}`}>{wxRow.at.slice(5, 16).replace('-', '월 ').replace('T', '일 ')} 평양시각</span>}
              </p>
            ) : wxState === 'loading' ? (
              <p className={`mt-1 ${TYPE.sub} ${TEXT.faint}`}>오늘 날씨를 불러오는 중</p>
            ) : (
              <p className={`mt-1 ${TYPE.sub} ${TEXT.faint} ${PROSE}`}>오늘 날씨를 불러오지 못했습니다. 그래도 계절 이야기는 적으실 수 있습니다.</p>
            )}
            <p className={`mt-3 ${TYPE.h3} ${TEXT.ink} ${PROSE}`}>{Q.season}</p>
            <textarea
              rows={3}
              value={draft.season}
              onChange={e => set('season', e.target.value)}
              placeholder="예: 겨울에 강이 얼면 썰매를 탔다고 하셨습니다"
              className={`mt-2 w-full rounded-md border px-3 py-2.5 ${TYPE.body} ${TEXT.ink} ${SURFACE.line} ${FOCUS}`}
            />
            <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>날씨만은 저장하지 않고 화면을 열 때마다 새로 받습니다(Open-Meteo).</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={() => setStep(2)} className={`${BTN.primary} min-h-[56px] px-6 text-[1.0625rem]`}>
              미리보기 <span aria-hidden="true">→</span>
            </button>
            <span className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{answered}개 항목을 적으셨습니다. 비워 둔 항목은 카드에 실리지 않습니다.</span>
          </div>
        </div>
      )}

      {/* ── 3단계: 미리보기 · 내려받기 · 인쇄 ── */}
      {step === 2 && home && model && (
        <div className="mt-4">
          <div className="memcard-noprint flex flex-wrap items-center justify-between gap-2">
            <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>이대로 만들어 드릴까요?</p>
            <button type="button" onClick={() => setStep(1)} className={`${BTN.ghost} min-h-[44px]`}>
              내용 고치기
            </button>
          </div>

          {/* 미리보기 = 인쇄되는 바로 그 화면.
              글꼴 배분은 PNG(paint())와 **같은 상수·같은 규칙**이다. 미리보기가 명조로 뜨면
              브라우저가 그때 서브셋을 받아 두므로, 뒤이어 PNG 를 만들 때 loadSerif() 가
              캐시에서 즉시 resolve 한다 — "미리보기와 내려받기가 같아 보인다"의 실질적 장치다.
              바탕은 고딕(기계가 붙인 값)으로 깔고, 사람이 남긴 말에만 명조를 얹는다. */}
          <article
            className={`memcard-print mt-3 rounded-md border bg-white p-6 ${SURFACE.line}`}
            style={{ fontFamily: FONT.gothic }}
          >
            {/* 표제·부제는 PNG(paint())와 같은 상수·같은 글꼴 배분이다 —
                두 경로의 첫인상을 맞춘다(전에는 미리보기에만 42px 표제가 없었다) */}
            <h4 className={`text-[1.75rem] font-bold leading-snug ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
              {CARD_TITLE}
            </h4>
            <p className={`mt-1 ${TYPE.sub} ${TEXT.faint} ${PROSE}`}>{CARD_SUB}</p>
            <div className={`mt-2.5 border-t-2 border-[#1a4e9c]`} aria-hidden="true" />
            <h5 className={`mt-3 text-[1.5rem] font-bold leading-snug ${TEXT.blue} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
              {model.homeName}
            </h5>
            <p className={`mt-1 ${TYPE.sub} ${TEXT.faint} ${PROSE}`}>
              이 고향이 원적인 이산가족 생존 신청자 {nf(model.survivors)}명 ({model.survivorsAsOf} 기준)
            </p>
            {(model.elder || model.relation) && (
              /* 이름줄 19px — 명조를 쓸 수 있는 하한이다. 이 아래로 내리면 1x 화면에서 획이 무너진다 */
              <p className={`mt-2.5 text-[1.1875rem] font-semibold leading-[1.7] ${TEXT.soft} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
                {model.elder && <>{model.elderLabel} {model.elder}</>}
                {model.elder && model.relation && <span className="mx-2" aria-hidden="true">·</span>}
                {model.relation && <>관계 {model.relation}</>}
              </p>
            )}

            {model.qa.length === 0 ? (
              <p className={`mt-4 ${TYPE.body} ${TEXT.faint} ${PROSE}`}>아직 적으신 내용이 없습니다. 「내용 고치기」에서 한 가지만 적으셔도 카드가 됩니다.</p>
            ) : (
              <dl className={`mt-4 divide-y ${SURFACE.hair}`}>
                {model.qa.map((r, i) => (
                  <div key={i} className="py-3">
                    {/* 질문은 고딕(우리가 만든 것) · 답은 명조(사람의 것). PNG 의 16/21px 과 같은 급수다 */}
                    <dt className={`text-[1rem] font-semibold leading-[1.6] ${TEXT.faint} ${PROSE}`}>{r.q}</dt>
                    <dd
                      className={`mt-1 whitespace-pre-wrap ${TYPE.answer} ${TEXT.ink} ${PROSE}`}
                      style={{ fontFamily: FONT.serif }}
                    >
                      {r.a}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <div className={`mt-4 rounded-md border-l-[3px] border-[#dcdfe4] ${SURFACE.inset} p-3.5`}>
              <p className={`${TYPE.cap} font-bold ${TEXT.soft}`}>이 카드가 쓴 자료</p>
              <ul className="mt-1 space-y-1">
                {model.context.map((c, i) => (
                  <li key={i} className={`${TYPE.cap} ${TEXT.soft} ${PROSE}`}>· {c}</li>
                ))}
              </ul>
            </div>

            {/* ★ PNG 와 같은 꼬리말 3줄. 특히 셋째 줄(기증 문의 전화)이 빠지면
                내려받기가 막힌 PC 에서 인쇄한 종이에 기증 창구가 없어진다. */}
            <div className={`mt-3 space-y-1 border-t pt-2.5 ${SURFACE.hair}`}>
              {FOOTER(model.madeAt).map((f, i) => (
                <p key={i} className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{f}</p>
              ))}
            </div>
          </article>

          {/* 내려받기 · 인쇄 — 두 길을 나란히 둔다 */}
          <div className="memcard-noprint mt-4 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => { void makePng() }}
              disabled={pngBusy}
              aria-busy={pngBusy}
              className={`${BTN.primary} min-h-[56px] px-6 text-[1.0625rem] disabled:opacity-70`}
            >
              그림 파일로 내려받기
            </button>
            {pngBusy && <span className={`${TYPE.sub} ${TEXT.faint}`}>카드를 그리는 중입니다</span>}
            <button type="button" onClick={() => window.print()} className={`${BTN.ghost} min-h-[56px] px-6 text-[1.0625rem]`}>
              인쇄하기
            </button>
            <button type="button" onClick={clearAll} className={`${BTN.ghost} min-h-[44px]`}>
              이 기기에서 지우기
            </button>
          </div>

          {png && (
            <p className={`memcard-noprint mt-2 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
              그림 파일 한 장을 만들었습니다 (약 {nf(Math.round(png.bytes / 1024))}KB · {png.at}).
              {' '}내려받기가 자동으로 시작되지 않으면{' '}
              <a
                href={png.url}
                download={fileName}
                data-memcard-png="1"
                className={`font-medium text-[#1a4e9c] underline underline-offset-2 ${FOCUS}`}
              >
                여기를 눌러 저장
              </a>
              하십시오. 그래도 막히는 환경이면 위의 <b className="font-semibold">인쇄하기</b>를 쓰십시오.
            </p>
          )}
          {pngFail && (
            <p className={`memcard-noprint mt-2 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
              이 브라우저에서는 그림 파일을 만들지 못했습니다. <b className="font-semibold">인쇄하기</b>로 종이나 PDF로 남기실 수 있습니다.
            </p>
          )}

          {/* 기증 경로 — 만든 카드를 국가 기록으로 넘기는 자리 */}
          <div className={`memcard-noprint mt-5 ${SURFACE.card} p-4`}>
            <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>이 기록을 국가 기록으로 남기시려면</p>
            <p className={`mt-1 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
              내려받으신 카드는 아래 기증 창구에 문의하실 때 <b className={`font-semibold ${TEXT.ink}`}>첨부 자료로 함께 내실 수 있습니다</b>.
              {' '}사진·편지 원본이 있으시면 그것이 우선입니다 — 이 카드는 그 자료가 어느 고향의 무엇인지 설명하는 쪽지 역할을 합니다.
            </p>
            <ul className="mt-3 space-y-3">
              {donations.map(d => (
                <li key={d.id} className={`${SURFACE.inset} p-3.5`}>
                  <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>{d.title}</p>
                  <p className={`mt-1 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>{d.what}</p>
                  <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>주관 {d.org} · 문의 {d.contact}</p>
                  <p className="mt-2.5">
                    <a href={d.url} target="_blank" rel="noreferrer" className={`${BTN.primary} min-h-[48px]`}>
                      기증 안내 페이지 열기 <span aria-hidden="true">↗</span>
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}
