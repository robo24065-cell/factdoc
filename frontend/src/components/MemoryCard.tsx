import { useEffect, useMemo, useRef, useState } from 'react'
import { SURFACE, TYPE, TEXT, PROSE, FOCUS, BTN, C, josa } from '../theme/gohyang'
import { useLiveWeather } from '../lib/gohyangWeather'

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
  asOf: { survivors: string; events: string; museum: string }
}

/* ══════════════════════ 질문 ══════════════════════
   질문 문구는 여기 한 곳에만 있다. 화면·그림 파일·인쇄가 모두 이 표를 읽는다
   (두 벌로 두면 인쇄물과 화면의 질문이 갈라진다). */

type QKey = 'event' | 'relic' | 'season' | 'place'
type Voice = 'self' | 'heard'

const QUESTIONS: Record<Voice, Record<QKey, string>> = {
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

const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif'

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []
  for (const para of String(text ?? '').split('\n')) {
    let line = ''
    for (const ch of para) {
      const next = line + ch
      if (ctx.measureText(next).width > maxW && line) {
        out.push(line)
        line = ch
      } else {
        line = next
      }
    }
    out.push(line)
  }
  return out
}

/** 한 벌의 그리기 절차. measure=true 면 칠하지 않고 높이만 잰다. */
function paint(ctx: CanvasRenderingContext2D, m: CardModel, W: number, measure: boolean): number {
  const M = 64
  const maxW = W - M * 2
  let y = 0
  const set = (size: number, weight: string = '400', color: string = C.ink) => {
    ctx.font = `${weight} ${size}px ${FONT}`
    ctx.fillStyle = color
  }
  const line = (text: string, size: number, weight: string, color: string, lead: number, x = M, wrapW = maxW) => {
    set(size, weight, color)
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
  line('고향 기억 카드', 42, '700', C.ink, 46)
  line('고향잇기 — 이산가족 기록을 후손에게 잇습니다', 17, '400', C.faint, 30)
  rule(C.blue, 2)

  line(m.homeName, 34, '700', C.blue, 44)
  line(`이 고향이 원적인 이산가족 생존 신청자 ${nf(m.survivors)}명 (${m.survivorsAsOf} 기준)`, 16, '400', C.faint, 26)

  if (m.elder || m.relation) {
    y += 8
    line(
      [m.elder ? `${m.elderLabel}  ${m.elder}` : '', m.relation ? `관계  ${m.relation}` : ''].filter(Boolean).join('        '),
      19,
      '600',
      C.soft,
      30,
    )
  }
  rule()

  for (const { q, a } of m.qa) {
    y += 12
    line(q, 16, '600', C.faint, 25)
    y += 4
    line(a, 21, '400', C.ink, 34)
  }

  if (m.context.length) {
    y += 22
    const boxTop = y
    let inner = y
    /* 상자 안 높이를 먼저 잰다 — 상자를 먼저 칠하면 글이 상자 밖으로 나간다 */
    ctx.font = `400 15px ${FONT}`
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
    line('이 카드가 참고한 공식 기록', 15, '700', C.soft, 26, M + 18, maxW - 36)
    for (const c of m.context) line(c, 15, '400', C.soft, 23, M + 18, maxW - 36)
    y = boxTop + h + 40
  }

  y += 26
  if (!measure) { ctx.fillStyle = C.line; ctx.fillRect(M, y, maxW, 1) }
  y += 6
  line(`작성 ${m.madeAt} · 이 카드는 이 기기의 브라우저 안에서 만들어졌으며, 내용은 서버로 전송되지 않았습니다.`, 14, '400', C.faint, 24)
  line('기록의 근거는 통일부 공공데이터(이산가족 신청현황·남북관계 연표·남북이산가족 디지털박물관)이며, 답변은 작성자의 기억입니다.', 14, '400', C.faint, 24)
  line('국가 기록으로 남기시려면 통일부 이산가족납북자과 02-2100-5916 (생애기록물 수집 동의·기증 문의)로 이 카드를 첨부해 문의하십시오.', 14, '400', C.faint, 24)
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

function renderPng(m: CardModel): { url: string; bytes: number } | null {
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
    return { url, bytes: Math.round((url.length - url.indexOf(',') - 1) * 0.75) }
  } catch {
    return null
  }
}

/* ══════════════════════ 화면 ══════════════════════ */

export default function MemoryCard({ homes, donations, asOf }: Props) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [restored, setRestored] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [png, setPng] = useState<{ url: string; bytes: number; at: string } | null>(null)
  const [pngFail, setPngFail] = useState(false)
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
    const context: string[] = []
    for (const e of home.events.slice(0, 2)) context.push(`공식 기록에 남은 이 고향 — ${ymdKo(e.date)} ${e.title}`)
    for (const r of home.relics.slice(0, 2)) {
      context.push(`디지털박물관 사료 — ${r.title}${r.producedOn ? ` (${r.producedOn})` : ''}`)
    }
    if (wxRow) {
      context.push(
        `작성 시각 ${wxRow.name}의 기온 ${nf1(wxRow.tempC)}℃` +
          (Number.isFinite(wxRow.maxC) ? ` (최고 ${nf1(wxRow.maxC)}℃ · 최저 ${nf1(wxRow.minC)}℃)` : '') +
          ' — Open-Meteo 실시간 관측',
      )
    }
    context.push(`기준일 — 이산가족 신청현황 ${asOf.survivors} · 연표·기록 ${asOf.events} · 사료 ${asOf.museum}`)
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

  const makePng = () => {
    if (!model) return
    const out = renderPng(model)
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

  return (
    <section id="memory-card" className={`mt-5 scroll-mt-24 ${SURFACE.slab} p-5`}>
      <div className="memcard-noprint">
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>후손이 직접 남기는 자리</p>
        <h3 className={`mt-1 ${TYPE.h2} ${TEXT.ink} ${PROSE}`}>기억 카드 만들기</h3>
        <p className={`mt-1.5 max-w-prose ${TYPE.body} ${TEXT.soft} ${PROSE}`}>
          집안에서 들으신 고향 이야기를 한 장으로 정리해 드립니다. 빈 칸에서 시작하지 않도록{' '}
          <b className={`font-semibold ${TEXT.ink}`}>그 고향의 연표 사건·사료·오늘 날씨를 먼저 보여 드리고</b> 여쭙습니다.
          {' '}모르는 항목은 비워 두셔도 됩니다.
        </p>

        {/* ── 개인정보 고지 — 감추지 않고 도구 바로 위에 둔다 ── */}
        <div className={`mt-3 rounded-md border ${SURFACE.line} bg-white p-3.5`}>
          <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>
            <span aria-hidden="true">◆</span> 적으신 내용은 서버로 보내지 않습니다
          </p>
          <ul className={`mt-1.5 space-y-1 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
            <li>· 입력·미리보기·그림 파일 만들기까지 전부 이 기기의 브라우저 안에서 처리됩니다.</li>
            <li>· 임시 저장 위치는 이 브라우저의 저장소(localStorage) 한 곳뿐이며, 다른 곳으로 전송되지 않습니다.</li>
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
        <div className="memcard-noprint mt-4">
          <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>어느 고향의 기억을 남기시겠습니까?</p>
          <p className={`mt-1 ${TYPE.sub} ${TEXT.faint} ${PROSE}`}>
            이산가족 출신지는 광복 당시 구행정구역 {nf(homes.length)}종으로 공표됩니다. 옆의 인원은 그 고향이 원적인 생존 신청자 수입니다({asOf.survivors} 기준).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {homes.map(h => (
              <button
                key={h.id}
                type="button"
                onClick={() => { set('homeId', h.id); setStep(1) }}
                className={`inline-flex min-h-[52px] items-baseline gap-1.5 rounded-md border px-4 py-2 ${TYPE.sub} font-medium ${FOCUS} ${
                  draft.homeId === h.id ? 'border-[#1a4e9c] bg-[#eef3fb] text-[#1a4e9c]' : `${SURFACE.line} bg-white ${TEXT.ink} hover:border-[#1a4e9c]`
                }`}
              >
                {h.name}
                <span className={`${TYPE.cap} tabular-nums ${TEXT.faint}`}>{h.survivors > 0 ? `${nf(h.survivors)}명` : '집계 없음'}</span>
              </button>
            ))}
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
          <div className={`${SURFACE.card} p-4`}>
            <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>이 기억은 누구의 것입니까?</p>
            <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>고르시는 대로 아래 질문이 바뀝니다.</p>
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
            <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              위는 남북관계 연표·통일부 보도자료에 <b className="font-medium">고향 이름이 적힌 때</b>입니다. 그 무렵 이야기가 아니어도 좋습니다 — 언제 일인지 아시는 대로 적어 주십시오.
            </p>
            <textarea
              rows={3}
              value={draft.event}
              onChange={e => set('event', e.target.value)}
              placeholder="들으신 대로 적어 주십시오. 날짜가 정확하지 않아도 됩니다."
              className={`mt-2 w-full rounded-md border px-3 py-2.5 ${TYPE.body} ${TEXT.ink} ${SURFACE.line} ${FOCUS}`}
            />
            <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>기록 기준일 {asOf.events}.</p>
          </div>

          {/* 사료에서 출발하는 질문 */}
          <div className={`${SURFACE.card} p-4`}>
            <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>이 고향에서 온 디지털박물관 사료 {nf(home.relicsTotal)}건 중</p>
            {home.relics.length ? (
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
                            <a href={r.recordUrl} target="_blank" rel="noreferrer" className={`text-[#1a4e9c] underline underline-offset-2 ${FOCUS}`}>
                              박물관에서 보기<span aria-hidden="true">↗</span>
                            </a>
                          </>
                        )}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
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
              사료 이미지는 저장하지 않고 통일부 박물관 원본을 그대로 참조합니다. 사료 수집 기준일 {asOf.museum}.
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

          {/* 미리보기 = 인쇄되는 바로 그 화면 */}
          <article className={`memcard-print mt-3 rounded-md border bg-white p-6 ${SURFACE.line}`}>
            <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>고향잇기 · 고향 기억 카드</p>
            <h4 className={`mt-1.5 text-[1.5rem] font-bold leading-snug ${TEXT.blue} ${PROSE}`}>{model.homeName}</h4>
            <p className={`mt-1 ${TYPE.sub} ${TEXT.faint} ${PROSE}`}>
              이 고향이 원적인 이산가족 생존 신청자 {nf(model.survivors)}명 ({model.survivorsAsOf} 기준)
            </p>
            {(model.elder || model.relation) && (
              <p className={`mt-2.5 ${TYPE.body} font-semibold ${TEXT.soft} ${PROSE}`}>
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
                    <dt className={`${TYPE.cap} font-semibold ${TEXT.faint} ${PROSE}`}>{r.q}</dt>
                    <dd className={`mt-1 whitespace-pre-wrap text-[1.0625rem] leading-[1.8] ${TEXT.ink} ${PROSE}`}>{r.a}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className={`mt-4 rounded-md border-l-[3px] border-[#dcdfe4] ${SURFACE.inset} p-3.5`}>
              <p className={`${TYPE.cap} font-bold ${TEXT.soft}`}>이 카드가 참고한 공식 기록</p>
              <ul className="mt-1 space-y-1">
                {model.context.map((c, i) => (
                  <li key={i} className={`${TYPE.cap} ${TEXT.soft} ${PROSE}`}>· {c}</li>
                ))}
              </ul>
            </div>

            <p className={`mt-3 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              작성 {model.madeAt} · 이 카드는 이 기기의 브라우저 안에서 만들어졌으며, 내용은 서버로 전송되지 않았습니다.
              {' '}근거 자료는 통일부 공공데이터이며, 답변은 작성자의 기억입니다.
            </p>
          </article>

          {/* 내려받기 · 인쇄 — 두 길을 나란히 둔다 */}
          <div className="memcard-noprint mt-4 flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={makePng} className={`${BTN.primary} min-h-[56px] px-6 text-[1.0625rem]`}>
              그림 파일로 내려받기 (PNG)
            </button>
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
