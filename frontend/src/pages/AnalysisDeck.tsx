import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SURFACE, TYPE, TEXT, PROSE, FOCUS, BTN, C, CHORO } from '../theme/gohyang'

/* ────────────────────────────────────────────────────────────────
   분석 덱 (/deck) — 재본 것과, 재보지 못한 것

   이 화면의 요지는 "우리가 무엇을 발견했는가"가 아니라
   **"무엇을 재봤고 그중 무엇이 성립하지 않았는가"** 다.
   그래서 판정이 「약함」·「불가」인 카드도 숨기지 않고 같은 크기로 넘긴다.
   감추면 남는 카드가 전부 성공처럼 보이고, 그 순간 이 덱은 근거가 아니라 홍보물이 된다.

   설계 규칙
     · 카드 한 장 = 질문 하나 + 그래프(또는 표) 하나 + 한 줄 결론 + 기준일 + 한계.
     · 넘기는 길 두 개 — 큰 단추(56px 이상)와 키보드 ←→. 진행은 "3 / 21"로 늘 보인다.
     · 그래프는 SVG 로 직접 그린다(외부 차트 라이브러리 없음). ExtinctionClock 과 같은 방식이다:
       viewBox 로 좌표를 잡고, 손가락·커서·키보드로 짚으면 그 지점의 값이 뜬다.
     · 선은 색만으로 구분하지 않는다 — 색·파선 무늬·범례 3중 부호화(흑백 인쇄·색맹 대응).
     · 세로축이 0 에서 시작하지 않을 때는 그렇다고 화면에 적는다(평균연령처럼 좁은 구간).
     · 장식 이모지를 쓰지 않는다. 판정 구분도 도형(● ▲ ■) + 한국어 라벨 + 색 3중이다.

   데이터: scripts/nk-analysis.mjs → 북한자료-api/analysis.json
           → scripts/nk-gohyang-pack.mjs 가 public/gohyang/analysis.json 으로 복사.
   화면은 계산하지 않는다. 좌표를 그리고, 그 카드가 스스로 밝힌 한계를 같이 읽어 줄 뿐이다.
   ──────────────────────────────────────────────────────────────── */

/* ══════════════════════ 타입 ══════════════════════ */

type Verdict = '성립' | '약함' | '불가'
type Coord = { x: number | string; y: number; label?: string }
/** 좌표 배열의 키가 points 인 계열과 rows 인 계열이 둘 다 있다 — 화면은 둘 다 읽는다 */
type Series = { key: string; label: string; unit?: string; points?: Coord[]; rows?: Coord[] }
type Finding = { label: string; value: string; note?: string }
type Card = {
  id: string
  title: string
  question: string
  verdict: Verdict
  rejectWhy?: string
  method: string
  n: number
  findings: Finding[]
  series?: Series[]
  table?: Array<Record<string, string | number | null>>
  caveats: string[]
  asOf: string
}
type Source = {
  name: string
  kind?: string
  org?: string
  landing?: string
  download?: string
  url?: string
  urls?: string[]
  file?: string
  asOf?: string
  accessedAt?: string
  coverageEnd?: string
  items?: number
  note?: string
  usedBy?: string[]
}
type Analysis = {
  builtAt: string
  generator: string
  note: string
  asOfByLane: Record<string, string>
  sources: Source[]
  corpus?: { builtAt: string; records: number; datasets: number }
  cards: Card[]
  meta: {
    tried: number
    accepted: number
    weak: number
    rejectedCount: number
    rejected: Array<{ id: string; why: string }>
    stats?: { note?: string; methods?: string[] }
    principles?: string[]
  }
}

/* ══════════════════════ 상수 ══════════════════════ */

const PACK = '/gohyang'

/* 판정 — as-of 3상태(live/stale/frozen)와 **다른 축**이다. 그래서 기능색(초록·주황·보라)을
   빌려 쓰지 않고 남색·먹색 계열로만 만든다. 두 축이 같은 색을 쓰면 화면에서 섞인다. */
const VERDICT: Record<Verdict, { glyph: string; label: string; chip: string; blurb: string }> = {
  성립: {
    glyph: '●',
    label: '성립',
    chip: 'bg-[#eef3fb] text-[#1a4e9c] ring-1 ring-[#cfdcef]',
    blurb: '데이터로 재어졌고 결론이 남는 카드입니다.',
  },
  약함: {
    glyph: '▲',
    label: '약함',
    chip: 'bg-white text-[#555555] ring-1 ring-[#dcdfe4]',
    blurb: '방향은 보이지만 표본이 얇습니다. 단독 근거로 쓰면 안 되고, 성립 카드 옆의 대조로만 읽어야 합니다.',
  },
  불가: {
    glyph: '■',
    label: '불가',
    chip: 'bg-[#f5f7fa] text-[#767676] ring-1 ring-[#dcdfe4]',
    blurb: '이 자료로는 답할 수 없다고 판정한 카드입니다. 무엇이 없어서 못 했는지가 이 카드의 내용입니다.',
  },
}

/* 계열 구분 — 색 + 파선 무늬. 다섯 벌이면 한 판에 들어가는 최대 계열 수(5종)를 덮는다.
   전부 theme 의 색 상수다. 새 색을 만들지 않는다. */
const LINES = [
  { color: C.blue, dash: undefined as string | undefined },
  { color: C.ink, dash: '7 4' },
  { color: CHORO[4], dash: '2 3' },
  { color: C.soft, dash: '11 4 2 4' },
  { color: C.faint, dash: '1 4' },
] as const
const BARS = [C.blue, CHORO[2], CHORO[4], C.faint, CHORO[3]] as const

/* ══════════════════════ 유틸 ══════════════════════ */

function nf(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n.toLocaleString('ko-KR') : '—'
}
/* 자릿수는 값의 크기가 정한다. 원자료가 0.121·1.878 처럼 소수 셋째 자리까지 의미를 갖는
   밀도 값이라, 작은 값에서 자리를 깎으면 카드 본문의 수치와 그래프의 수치가 어긋난다.
   반대로 꼬리 0(4.30)은 없는 정밀도를 있는 것처럼 보이게 하므로 떼어 낸다. */
function nfAuto(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  if (a >= 1000) return Math.round(v).toLocaleString('ko-KR')
  const digits = a >= 100 ? 1 : a >= 10 ? 2 : 3
  return String(Number(v.toFixed(digits)))
}
/** '2026-05-31' → '2026년 5월 31일' */
function ymdKo(d?: string | null): string {
  const m = String(d ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return String(d ?? '')
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`
}
const isDateStr = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(v)
const coordsOf = (s: Series): Coord[] => s.points ?? s.rows ?? []

/** 원자료 문장에 마크다운 강조(**…**)가 섞여 있다 — 별표를 화면에 그대로 흘리지 않는다 */
function Md({ text }: { text: string }) {
  const parts = String(text ?? '').split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <b key={i} className={`font-semibold ${TEXT.ink}`}>
            {p}
          </b>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

/** 눈금 — 사람이 읽는 자리(1·2·5 배수)에서 끊는다 */
function niceTicks(min: number, max: number, want = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min, max].filter(Number.isFinite)
  const raw = (max - min) / want
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 0.01; v += step) out.push(Number(v.toFixed(6)))
  return out
}
function tickText(v: number, unit: string): string {
  if (unit === '명' && Math.abs(v) >= 10000) return `${Number((v / 10000).toFixed(1))}만`
  return nfAuto(v)
}

/* ══════════════════════ 그래프 — 판(panel) 나누기 ══════════════════════
   같은 단위끼리만 한 판에 겹친다. 단위가 다르면 겹치지 않고 판을 나눈다
   (원자료 caveat 이 "두 계열을 같은 축에 겹치지 않았다"고 적어 둔 카드가 있다).
   단위가 비어 있는 계열은 서로 비교할 근거가 없으므로 각자 한 판을 쓴다. */

type XKind = 'date' | 'year' | 'month' | 'num'
type Panel = { id: string; kind: 'line' | 'bar' | 'scatter'; unit: string; xKind: XKind; series: Series[] }

function xKindOf(pts: Coord[]): XKind {
  if (pts.some(p => isDateStr(p.x))) return 'date'
  const nums = pts.map(p => Number(p.x)).filter(Number.isFinite)
  if (nums.length !== pts.length) return 'num'
  if (nums.length === 12 && nums.every(n => Number.isInteger(n) && n >= 1 && n <= 12)) return 'month'
  if (nums.every(n => n >= 1900 && n <= 2100)) return 'year'
  return 'num'
}
function toT(x: number | string): number {
  if (typeof x === 'number') return x
  const m = String(x).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/)
  if (m) return Number(m[1]) + (Number(m[2]) - 1) / 12 + (m[3] ? (Number(m[3]) - 1) / 365 : 0)
  const n = Number(x)
  return Number.isFinite(n) ? n : NaN
}
function xLabel(x: number | string, kind: XKind): string {
  if (kind === 'date') {
    const m = String(x).match(/^(\d{4})-(\d{2})/)
    return m ? `${m[1]}년 ${Number(m[2])}월` : String(x)
  }
  if (kind === 'year') return `${x}년`
  if (kind === 'month') return `${x}월`
  return String(x)
}

function panelsOf(card: Card): Panel[] {
  const out: Panel[] = []
  for (const s of card.series ?? []) {
    const pts = coordsOf(s)
    if (!pts.length) continue
    const isScatter = pts.every(p => typeof p.x === 'number' && typeof p.label === 'string')
    const cat = !isScatter && pts.every(p => typeof p.x === 'string' && !isDateStr(p.x))
    const kind: Panel['kind'] = isScatter ? 'scatter' : cat ? 'bar' : 'line'
    const unit = String(s.unit ?? '').trim()
    const xKind = kind === 'line' ? xKindOf(pts) : 'num'
    /* 단위가 있고 같은 종류·같은 x축이면 앞 판에 겹친다. 단위가 없으면 무조건 새 판이다. */
    const last = out[out.length - 1]
    if (unit && last && last.kind === kind && last.unit === unit && last.xKind === xKind && kind !== 'scatter') {
      last.series.push(s)
    } else {
      out.push({ id: `${card.id}-${s.key}`, kind, unit, xKind, series: [s] })
    }
  }
  return out
}

/* ══════════════════════ 꺾은선 판 ══════════════════════ */

function LinePanel({ panel, cardTitle }: { panel: Panel; cardTitle: string }) {
  const W = 640
  const H = panel.series.length > 2 ? 250 : 220
  const PAD = { l: 54, r: 16, t: 14, b: 30 }
  const svgRef = useRef<SVGSVGElement>(null)

  const data = useMemo(
    () =>
      panel.series.map(s =>
        coordsOf(s)
          .map(p => ({ t: toT(p.x), y: p.y, raw: p.x }))
          .filter(d => Number.isFinite(d.t) && Number.isFinite(d.y))
          .sort((a, b) => a.t - b.t),
      ),
    [panel],
  )
  const xsAll = useMemo(() => [...new Set(data.flat().map(d => d.t))].sort((a, b) => a - b), [data])
  const ysAll = data.flat().map(d => d.y)
  const x0 = xsAll[0] ?? 0
  const x1 = xsAll[xsAll.length - 1] ?? 1
  const dataMin = Math.min(...ysAll)
  const dataMax = Math.max(...ysAll)
  /* 세로축을 늘 0에서 시작하면 평균연령(80.8~83.0)처럼 좁은 구간이 평평해져 아무것도 안 보인다.
     구간이 좁을 때만 0을 버리고, 버렸다는 사실을 그림 아래에 적는다. */
  const zoomed = dataMin > 0 && dataMax - dataMin < dataMax * 0.35
  const yLo = zoomed ? dataMin - (dataMax - dataMin) * 0.18 : Math.min(0, dataMin)
  const yHi = dataMax + (dataMax - yLo) * 0.08 || 1

  const px = (t: number) => PAD.l + ((t - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r)
  const py = (v: number) => H - PAD.b - ((v - yLo) / (yHi - yLo || 1)) * (H - PAD.t - PAD.b)

  const [cur, setCur] = useState(xsAll.length - 1)
  const [holding, setHolding] = useState(false)
  useEffect(() => { setCur(xsAll.length - 1) }, [xsAll.length])
  const pick = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r || !r.width) return
    const vx = ((clientX - r.left) / r.width) * W
    let best = 0
    let bd = Infinity
    xsAll.forEach((t, i) => {
      const d = Math.abs(px(t) - vx)
      if (d < bd) { bd = d; best = i }
    })
    setCur(best)
  }

  const curT = xsAll[Math.max(0, Math.min(cur, xsAll.length - 1))]
  const readout = panel.series.map((s, i) => {
    const hit = data[i].find(d => d.t === curT)
    return { label: s.label, v: hit ? hit.y : null, raw: hit ? hit.raw : null }
  })
  const yTicks = niceTicks(yLo, yHi, 4)
  const xTicks = useMemo(() => {
    if (xsAll.length <= 6) return xsAll
    const want = 5
    const step = (xsAll.length - 1) / (want - 1)
    return Array.from({ length: want }, (_, i) => xsAll[Math.round(i * step)])
  }, [xsAll])
  const rawOf = (t: number) => {
    for (const rows of data) {
      const hit = rows.find(d => d.t === t)
      if (hit) return hit.raw
    }
    return t
  }

  const boxH = 20 + readout.length * 16
  const boxW = 210
  const cx = px(curT)
  const boxX = Math.min(Math.max(cx - boxW / 2, PAD.l), W - PAD.r - boxW)
  const boxY = PAD.t + 4

  const aria = `${cardTitle}. ${panel.series
    .map((s, i) => {
      const rows = data[i]
      const a = rows[0]
      const b = rows[rows.length - 1]
      return `${s.label}: ${xLabel(a?.raw ?? '', panel.xKind)} ${nfAuto(a?.y ?? NaN)}에서 ${xLabel(b?.raw ?? '', panel.xKind)} ${nfAuto(b?.y ?? NaN)}`
    })
    .join('. ')}`

  return (
    <figure className="mt-3">
      {/* 범례 — 색과 파선 무늬를 같이 보여 준다. 색만으로 가르지 않는다 */}
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {panel.series.map((s, i) => (
          <li key={s.key} className={`flex items-center gap-1.5 ${TYPE.cap} ${TEXT.soft}`}>
            <svg width="26" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="26" y2="4" stroke={LINES[i % LINES.length].color} strokeWidth="2.5" strokeDasharray={LINES[i % LINES.length].dash} />
            </svg>
            {s.label}
          </li>
        ))}
      </ul>

      <div className="mt-1 overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[520px] touch-none select-none"
          role="img"
          aria-label={aria}
          tabIndex={0}
          onPointerDown={e => { setHolding(true); pick(e.clientX); (e.target as Element).setPointerCapture?.(e.pointerId) }}
          onPointerMove={e => { if (holding || e.pointerType === 'mouse') pick(e.clientX) }}
          onPointerUp={() => { setHolding(false) }}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault()
              e.stopPropagation()
              setCur(i => Math.max(0, Math.min(xsAll.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1))))
            }
          }}
        >
          {yTicks.map(v => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={py(v)} y2={py(v)} stroke={C.lineSoft} strokeWidth={1} />
              <text x={PAD.l - 6} y={py(v) + 4} textAnchor="end" fontSize="11" fill={C.faint} className="tabular-nums">
                {tickText(v, panel.unit)}
              </text>
            </g>
          ))}
          {xTicks.map(t => (
            <text key={t} x={px(t)} y={H - PAD.b + 18} textAnchor="middle" fontSize="11" fill={C.faint} className="tabular-nums">
              {xLabel(rawOf(t), panel.xKind)}
            </text>
          ))}
          <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke={C.line} strokeWidth={1} />

          {data.map((rows, i) => (
            <path
              key={panel.series[i].key}
              d={rows.map((d, j) => `${j ? 'L' : 'M'}${px(d.t).toFixed(1)},${py(d.y).toFixed(1)}`).join(' ')}
              fill="none"
              stroke={LINES[i % LINES.length].color}
              strokeDasharray={LINES[i % LINES.length].dash}
              strokeWidth={2.2}
              strokeLinejoin="round"
            />
          ))}
          {/* 관측점이 적은 계열은 점을 찍어 준다 — 선만 있으면 몇 개를 재었는지 안 보인다 */}
          {data.map((rows, i) =>
            rows.length <= 20
              ? rows.map(d => (
                  <circle key={`${i}-${d.t}`} cx={px(d.t)} cy={py(d.y)} r={2.6} fill={LINES[i % LINES.length].color} />
                ))
              : null,
          )}

          {Number.isFinite(curT) && (
            <g>
              <line x1={cx} x2={cx} y1={PAD.t} y2={H - PAD.b} stroke={C.blue} strokeWidth={1} strokeDasharray="3 3" />
              {readout.map((r, i) =>
                r.v == null ? null : <circle key={i} cx={cx} cy={py(r.v)} r={4.5} fill="#ffffff" stroke={LINES[i % LINES.length].color} strokeWidth={2.4} />,
              )}
              <rect x={boxX} y={boxY} width={boxW} height={boxH} rx={4} fill="#ffffff" stroke={C.line} />
              <text x={boxX + 9} y={boxY + 14} fontSize="11" fill={C.faint}>
                {xLabel(rawOf(curT), panel.xKind)}
              </text>
              {readout.map((r, i) => (
                <text key={i} x={boxX + 9} y={boxY + 30 + i * 16} fontSize="12" fill={C.ink} className="tabular-nums">
                  <tspan fill={LINES[i % LINES.length].color}>■ </tspan>
                  {r.v == null ? '자료 없음' : `${nfAuto(r.v)}${panel.unit}`}
                </text>
              ))}
            </g>
          )}
        </svg>
      </div>
      <figcaption className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        {panel.unit ? `단위 ${panel.unit} · ` : ''}관측점 {nf(xsAll.length)}개 · 손가락이나 커서로 짚으면 그 시점의 값이 나옵니다(그래프에 초점을 두고 좌우 화살표로도 움직입니다).
        {zoomed && ' 세로축이 0에서 시작하지 않습니다 — 변화 폭이 좁아 확대한 축입니다.'}
      </figcaption>
    </figure>
  )
}

/* ══════════════════════ 가로 막대 판 ══════════════════════
   고향 이름·시대 구간처럼 **범주**가 x인 계열. 라벨이 긴 한국어라
   왼쪽 기둥에 밀어 넣으면 잘린다 — 라벨을 막대 위에 한 줄로 얹는다. */

function BarPanel({ panel, cardTitle }: { panel: Panel; cardTitle: string }) {
  const W = 640
  const cats = coordsOf(panel.series[0]).map(p => String(p.x))
  const rowH = 20 + panel.series.length * 17
  const H = 6 + cats.length * rowH
  const BAR_X = 6
  const BAR_MAX = W - BAR_X - 96
  const max = Math.max(...panel.series.flatMap(s => coordsOf(s).map(p => Math.abs(p.y))), 1)
  const valueOf = (s: Series, cat: string) => coordsOf(s).find(p => String(p.x) === cat)?.y ?? null

  const aria = `${cardTitle}. ${panel.series
    .map(s => `${s.label}: ${cats.map(c => `${c} ${nfAuto(valueOf(s, c) ?? NaN)}`).join(', ')}`)
    .join('. ')}`

  return (
    <figure className="mt-3">
      {/* 계열이 하나뿐이어도 이름표를 지우지 않는다 — 막대가 무엇을 재는지가 이름표에만 있다 */}
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {panel.series.map((s, i) => (
          <li key={s.key} className={`flex items-center gap-1.5 ${TYPE.cap} ${TEXT.soft}`}>
            <span aria-hidden="true" className="inline-block h-3 w-3 rounded-[2px]" style={{ backgroundColor: BARS[i % BARS.length], outline: `1px solid ${C.line}` }} />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="mt-1 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[520px]" role="img" aria-label={aria}>
          {cats.map((cat, r) => {
            const top = r * rowH
            return (
              <g key={cat}>
                <text x={BAR_X} y={top + 14} fontSize="12" fill={C.ink}>
                  {cat}
                </text>
                {panel.series.map((s, i) => {
                  const v = valueOf(s, cat)
                  const w = v == null ? 0 : (Math.abs(v) / max) * BAR_MAX
                  const y = top + 19 + i * 17
                  return (
                    <g key={s.key}>
                      <rect x={BAR_X} y={y} width={Math.max(v == null ? 0 : 1.5, w)} height={12} rx={1.5} fill={BARS[i % BARS.length]} stroke={i === 0 ? 'none' : C.line} strokeWidth={i === 0 ? 0 : 0.8} />
                      <text x={BAR_X + Math.max(w, 2) + 7} y={y + 10.5} fontSize="12" fill={v == null ? C.faint : C.soft} className="tabular-nums">
                        {v == null ? '집계 없음' : `${nfAuto(v)}${panel.unit}`}
                      </text>
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>
      </div>
      <figcaption className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        {panel.unit ? `단위 ${panel.unit} · ` : ''}범주 {nf(cats.length)}개 · 막대 길이는 같은 판 안에서만 비교됩니다.
      </figcaption>
    </figure>
  )
}

/* ══════════════════════ 흩뿌림 판 ══════════════════════ */

function ScatterPanel({ panel, cardTitle }: { panel: Panel; cardTitle: string }) {
  const s = panel.series[0]
  const pts = coordsOf(s).map(p => ({ x: Number(p.x), y: p.y, label: p.label ?? '' }))
  const W = 640
  const H = 300
  const PAD = { l: 58, r: 20, t: 14, b: 34 }
  const xMax = Math.max(...pts.map(p => p.x)) * 1.12
  const yMax = Math.max(...pts.map(p => p.y)) * 1.15
  const px = (v: number) => PAD.l + (v / (xMax || 1)) * (W - PAD.l - PAD.r)
  const py = (v: number) => H - PAD.b - (v / (yMax || 1)) * (H - PAD.t - PAD.b)
  const [ux, uy] = String(panel.unit || ' / ').split('/').map(t => t.trim())

  return (
    <figure className="mt-3">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[520px]"
          role="img"
          aria-label={`${cardTitle}. ${pts.map(p => `${p.label} 가로 ${nf(p.x)} 세로 ${nf(p.y)}`).join(', ')}`}
        >
          {niceTicks(0, yMax, 4).map(v => (
            <g key={`y${v}`}>
              <line x1={PAD.l} x2={W - PAD.r} y1={py(v)} y2={py(v)} stroke={C.lineSoft} strokeWidth={1} />
              <text x={PAD.l - 6} y={py(v) + 4} textAnchor="end" fontSize="11" fill={C.faint} className="tabular-nums">
                {nfAuto(v)}
              </text>
            </g>
          ))}
          {niceTicks(0, xMax, 4).map(v => (
            <text key={`x${v}`} x={px(v)} y={H - PAD.b + 18} textAnchor="middle" fontSize="11" fill={C.faint} className="tabular-nums">
              {nfAuto(v)}
            </text>
          ))}
          <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke={C.line} strokeWidth={1} />
          <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} stroke={C.line} strokeWidth={1} />
          {/* 라벨이 겹치면 이름이 서로를 지운다 — 이미 놓인 라벨·다른 점과 부딪히면 위아래로 비켜 놓는다.
              글자폭은 한글 12px 기준으로 어림한다(정확한 측정 없이도 겹침만 피하면 된다). */}
          {(() => {
            const dots = pts.map(p => ({ x: px(p.x), y: py(p.y) }))
            const boxes: Array<{ x0: number; x1: number; y: number }> = []
            return pts.map((p, i) => {
              const cx = dots[i].x
              const cy = dots[i].y
              const right = cx < W * 0.7
              const w = p.label.length * 12
              const x0 = right ? cx + 9 : cx - 9 - w
              const x1 = x0 + w
              let dy = 4
              for (let guard = 0; guard < 8; guard++) {
                const y = cy + dy
                const hitLabel = boxes.some(b => b.x1 > x0 && b.x0 < x1 && Math.abs(b.y - y) < 13)
                const hitDot = dots.some((d, j) => j !== i && d.x > x0 - 6 && d.x < x1 + 6 && Math.abs(d.y - y) < 9)
                if (!hitLabel && !hitDot) break
                dy = dy > 0 ? -dy - 9 : -dy + 9
              }
              boxes.push({ x0, x1, y: cy + dy })
              return (
                <g key={p.label}>
                  <circle cx={cx} cy={cy} r={5} fill={C.blue} />
                  {Math.abs(dy - 4) > 1 && (
                    <line x1={cx + (right ? 6 : -6)} y1={cy} x2={cx + (right ? 8 : -8)} y2={cy + dy - 4} stroke={C.line} strokeWidth={1} />
                  )}
                  <text x={cx + (right ? 9 : -9)} y={cy + dy} textAnchor={right ? 'start' : 'end'} fontSize="12" fill={C.soft}>
                    {p.label}
                  </text>
                </g>
              )
            })
          })()}
        </svg>
      </div>
      <figcaption className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        가로축 {ux || '값'} · 세로축 {uy || '값'} · 점 {nf(pts.length)}개. 점이 7개뿐이라 선을 얹지 않았습니다 — 눈으로 추세를 잇지 마십시오.
      </figcaption>
    </figure>
  )
}

/* ══════════════════════ 표 ══════════════════════ */

/* 표 머리 — 원자료의 열 이름이 영문인 표가 섞여 있다. 화면에서는 한국어로 읽히게 한다
   (값은 손대지 않는다 — 이름표만 붙인다). */
const COL_KO: Record<string, string> = {
  axis: '축', key: '항목', month: '월', delta: '증감', monthlyMedianAbs: '월 증감 중앙값', ratio: '중앙값 대비 배수',
  date: '날짜', event: '사건', region: '고향', era: '시대', n: '건수',
}

function DataTable({ rows }: { rows: Array<Record<string, string | number | null>> }) {
  const cols = Object.keys(rows[0] ?? {})
  return (
    <div className={`mt-3 overflow-x-auto rounded-md border ${SURFACE.line}`}>
      <table className="w-full min-w-[520px] border-collapse">
        <thead>
          <tr className="bg-[#f5f7fa]">
            {cols.map(c => (
              <th key={c} scope="col" className={`whitespace-nowrap border-b px-2.5 py-2 text-left ${TYPE.cap} font-bold ${TEXT.soft} ${SURFACE.hair}`}>
                {COL_KO[c] ?? c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map(c => {
                const v = r[c]
                const num = typeof v === 'number'
                return (
                  <td
                    key={c}
                    className={`border-b px-2.5 py-2 ${TYPE.cap} ${SURFACE.hair} ${num ? `text-right tabular-nums ${TEXT.ink}` : TEXT.soft}`}
                  >
                    {v == null ? '—' : num ? nfAuto(v) : String(v)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** 고향 × 시대 교차표 — 「칸이 비어 있다」가 이 카드의 내용이라, 빈 칸이 보이는 모양으로 세운다 */
function PivotTable({ rows }: { rows: Array<Record<string, string | number | null>> }) {
  const regions = [...new Set(rows.map(r => String(r.region)))]
  const eras = [...new Set(rows.map(r => String(r.era)))]
  const at = (rg: string, er: string) => {
    const hit = rows.find(r => String(r.region) === rg && String(r.era) === er)
    return typeof hit?.n === 'number' ? hit.n : 0
  }
  const thin = rows.filter(r => typeof r.n === 'number' && r.n < 10).length
  const zero = rows.filter(r => typeof r.n === 'number' && r.n === 0).length
  return (
    <div className="mt-3">
      <div className={`overflow-x-auto rounded-md border ${SURFACE.line}`}>
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className="bg-[#f5f7fa]">
              <th scope="col" className={`border-b px-2.5 py-2 text-left ${TYPE.cap} font-bold ${TEXT.soft} ${SURFACE.hair}`}>
                고향 \ 시대
              </th>
              {eras.map(e => (
                <th key={e} scope="col" className={`border-b px-2 py-2 text-right ${TYPE.cap} font-bold ${TEXT.soft} ${SURFACE.hair}`}>
                  {e}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {regions.map(rg => (
              <tr key={rg}>
                <th scope="row" className={`whitespace-nowrap border-b px-2.5 py-2 text-left ${TYPE.cap} font-semibold ${TEXT.ink} ${SURFACE.hair}`}>
                  {rg}
                </th>
                {eras.map(e => {
                  const v = at(rg, e)
                  return (
                    <td
                      key={e}
                      className={`border-b px-2 py-2 text-right ${TYPE.cap} tabular-nums ${SURFACE.hair} ${
                        v === 0 ? 'bg-[#f5f7fa] text-[#767676]' : v < 10 ? 'bg-[#f5f7fa] text-[#555555]' : TEXT.ink
                      }`}
                    >
                      {v}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        회색 칸은 10건 미만입니다 — {nf(rows.length)}칸 중 {nf(thin)}칸, 그중 {nf(zero)}칸은 0건입니다. 한두 건이 비율을 좌우하므로 이 표로 지역 간 비교를 하지 않습니다.
      </p>
    </div>
  )
}

/* ══════════════════════ 카드 ══════════════════════ */

function CardFigure({ card }: { card: Card }) {
  const panels = useMemo(() => panelsOf(card), [card])
  const isPivot = Boolean(card.table?.length) && ['region', 'era', 'n'].every(k => k in (card.table![0] ?? {}))

  if (!panels.length && !card.table?.length) {
    return (
      <div className={`mt-3 rounded-md border border-dashed ${SURFACE.line} ${SURFACE.inset} p-4`}>
        <p className={`${TYPE.h3} ${TEXT.soft} ${PROSE}`}>그릴 그래프가 없습니다</p>
        <p className={`mt-1 ${TYPE.sub} ${TEXT.faint} ${PROSE}`}>
          계산이 성립하지 않아 좌표가 만들어지지 않은 카드입니다. 빈 그래프를 그려 넣지 않고, 아래 실측값과 사유만 싣습니다.
        </p>
      </div>
    )
  }
  return (
    <>
      {panels.map(p =>
        p.kind === 'line' ? (
          <LinePanel key={p.id} panel={p} cardTitle={card.title} />
        ) : p.kind === 'bar' ? (
          <BarPanel key={p.id} panel={p} cardTitle={card.title} />
        ) : (
          <ScatterPanel key={p.id} panel={p} cardTitle={card.title} />
        ),
      )}
      {card.table?.length ? isPivot ? <PivotTable rows={card.table} /> : <DataTable rows={card.table} /> : null}
    </>
  )
}

function SourceLine({ sources, card }: { sources: Source[]; card: Card }) {
  const used = sources.filter(s => (s.usedBy ?? []).includes(card.id))
  const href = (s: Source) => s.landing ?? s.url ?? s.urls?.[0] ?? null
  return (
    <div className={`mt-4 border-t pt-3 ${SURFACE.hair}`}>
      <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>이 분석이 쓴 자료</p>
      {used.length === 0 ? (
        <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          이 카드에는 자료 연결이 따로 기록돼 있지 않습니다. 위의 「어떻게 쟀는가」가 쓴 자료를 밝히고 있으며, 전체 목록은 이 화면 맨 아래 「이 덱이 쓴 자료 전부」에 있습니다.
        </p>
      ) : (
        <ul className="mt-1 space-y-1">
          {used.map(s => (
            <li key={s.name} className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              · {s.name}
              {s.org ? ` — ${s.org}` : ''}
              {s.asOf ? ` · 기준 ${s.asOf}` : s.coverageEnd ? ` · 수록 종료 ${s.coverageEnd}` : ''}
              {href(s) && (
                <>
                  {' '}
                  <a href={href(s)!} target="_blank" rel="noreferrer" className={`text-[#1a4e9c] underline underline-offset-2 ${FOCUS}`}>
                    원본<span aria-hidden="true">↗</span>
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DeckCard({ card, index, total, sources }: { card: Card; index: number; total: number; sources: Source[] }) {
  const v = VERDICT[card.verdict] ?? VERDICT['불가']
  return (
    <article className={`${SURFACE.card} p-5 sm:p-7`} aria-label={`${index + 1} / ${total} — ${card.title}`}>
      {/* ── 머리: 번호 · 판정 · 표본 · 기준일 ── */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className={`${TYPE.eyebrow} tabular-nums ${TEXT.faint}`}>
          {index + 1} / {total}
        </span>
        <span className={`rounded px-2 py-0.5 ${TYPE.cap} font-bold ${v.chip}`}>
          <span aria-hidden="true">{v.glyph}</span> <span className="sr-only">판정: </span>
          {v.label}
        </span>
        <span className={`rounded px-2 py-0.5 ${TYPE.cap} font-semibold tabular-nums ${SURFACE.inset} ${TEXT.soft}`}>표본 n = {nf(card.n)}</span>
        <span className={`rounded px-2 py-0.5 ${TYPE.cap} font-semibold tabular-nums ${SURFACE.inset} ${TEXT.soft}`}>기준일 {card.asOf}</span>
      </div>

      {/* ── 질문 ── */}
      <h2 className={`mt-3 ${TYPE.h2} ${TEXT.ink} ${PROSE}`}>{card.question}</h2>

      {/* ── 한 줄 결론 ── */}
      <p className={`mt-2.5 border-l-[3px] border-[#1a4e9c] pl-3 text-[1.0625rem] font-bold leading-snug ${TEXT.blue} ${PROSE}`}>{card.title}</p>
      <p className={`mt-1.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{v.blurb}</p>

      {/* ── 그래프/표 ── */}
      <CardFigure card={card} />

      {/* ── 불가 사유 — 판정이 불가면 이것이 카드의 본문이다 ── */}
      {card.rejectWhy && (
        <div className={`mt-4 rounded-md border ${SURFACE.line} ${SURFACE.inset} p-4`}>
          <p className={`${TYPE.eyebrow} ${TEXT.soft}`}>왜 답할 수 없는가</p>
          <p className={`mt-1 ${TYPE.body} ${TEXT.soft} ${PROSE}`}>
            <Md text={card.rejectWhy} />
          </p>
        </div>
      )}

      {/* ── 실측값 ── */}
      {card.findings.length > 0 && (
        <div className="mt-4">
          <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>실측값</p>
          <dl className={`mt-1 divide-y ${SURFACE.hair}`}>
            {card.findings.map((f, i) => (
              <div key={i} className="py-2.5 sm:flex sm:items-baseline sm:gap-4">
                <dt className={`shrink-0 sm:w-44 ${TYPE.sub} font-semibold ${TEXT.soft} ${PROSE}`}>{f.label}</dt>
                <dd className="min-w-0 flex-1">
                  <p className={`${TYPE.body} font-semibold tabular-nums ${TEXT.ink} ${PROSE}`}>{f.value}</p>
                  {f.note && (
                    <p className={`mt-0.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
                      <Md text={f.note} />
                    </p>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* ── 방법 ── */}
      <details className={`mt-4 rounded-md border ${SURFACE.line} p-3.5`}>
        <summary className={`cursor-pointer list-none ${TYPE.sub} font-semibold ${TEXT.blue} [&::-webkit-details-marker]:hidden ${FOCUS}`}>
          어떻게 쟀는가 <span aria-hidden="true">▾</span>
        </summary>
        <p className={`mt-2 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
          <Md text={card.method} />
        </p>
      </details>

      {/* ── 한계 — 접어 두지 않는다 ── */}
      {card.caveats.length > 0 && (
        <div className={`mt-3 rounded-md border ${SURFACE.line} ${SURFACE.inset} p-4`}>
          <p className={`${TYPE.eyebrow} ${TEXT.soft}`}>이 수치의 한계 {nf(card.caveats.length)}가지</p>
          <ul className="mt-1.5 space-y-1.5">
            {card.caveats.map((c, i) => (
              <li key={i} className={`${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
                · <Md text={c} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── 출처 ── */}
      <SourceLine sources={sources} card={card} />
    </article>
  )
}

/* ══════════════════════ 화면 ══════════════════════ */

export default function AnalysisDeck() {
  const [data, setData] = useState<Analysis | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [cur, setCur] = useState(0)
  const topRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    fetch(`${PACK}/analysis.json`)
      .then(r => {
        if (!r.ok) throw new Error(`analysis.json 로드 실패 (${r.status})`)
        return r.json()
      })
      .then((j: Analysis) => { if (alive) setData(j) })
      .catch(e => { if (alive) setErr(e?.message ?? '분석 자료를 불러오지 못했습니다.') })
    return () => { alive = false }
  }, [])

  /* 주소에 카드 번호를 남긴다 — 기획서·발표에서 특정 카드를 그대로 가리킬 수 있어야 한다 */
  const restored = useRef(false)
  useEffect(() => {
    if (!data || restored.current) return
    restored.current = true
    const q = new URLSearchParams(window.location.search).get('카드')
    if (!q) return
    const i = data.cards.findIndex(c => c.id === q)
    if (i >= 0) setCur(i)
  }, [data])

  const total = data?.cards.length ?? 0
  const card = data?.cards[cur]

  const go = (i: number) => {
    if (!data) return
    const n = Math.max(0, Math.min(data.cards.length - 1, i))
    setCur(n)
    const id = data.cards[n]?.id
    if (id && typeof window !== 'undefined') {
      const u = new URL(window.location.href)
      u.searchParams.set('카드', id)
      window.history.replaceState(null, '', u.toString())
    }
    topRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
  }

  /* 키보드 ←→ — 큰 단추와 같은 일을 한다. 입력 칸 안에서는 가로채지 않는다 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const t = e.target as HTMLElement | null
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || t.tagName === 'svg')) return
      e.preventDefault()
      go(cur + (e.key === 'ArrowRight' ? 1 : -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, data])

  if (err) {
    return (
      <div className={`${SURFACE.card} p-6`}>
        <p className={`${TYPE.h2} ${TEXT.ink} ${PROSE}`}>분석 자료를 불러오지 못했습니다.</p>
        <p className={`mt-1.5 ${TYPE.body} ${TEXT.soft} ${PROSE}`}>{err}</p>
        <p className={`mt-1.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          <code>node scripts/nk-gohyang-pack.mjs</code> 를 실행해 <code>frontend/public/gohyang/analysis.json</code> 을 채운 뒤 새로고침하세요.
        </p>
      </div>
    )
  }
  if (!data || !card) {
    return (
      <p className={`flex items-center gap-2 py-20 ${TYPE.sub} ${TEXT.faint}`}>
        <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#dcdfe4] border-t-[#767676]" />
        분석 자료를 불러오는 중
      </p>
    )
  }

  /* 넘김 단추 — 한걸음씩 모드의 [이전]/[다음]과 같은 크기·같은 색이다.
     Tailwind 는 소스에 문자 그대로 있는 클래스만 만들어서 색을 변수로 넣을 수 없다.
     쓰인 값은 전부 theme 의 팔레트이고, 비활성 회색만 GohyangOn 의 단추와 같은 값을 맞춰 뒀다. */
  const navBtn = (disabled: boolean) =>
    `inline-flex min-h-[56px] min-w-[104px] items-center justify-center gap-1.5 rounded-md border px-5 text-[1.0625rem] font-bold ${FOCUS} ` +
    (disabled
      ? 'cursor-default border-[#eaecef] bg-[#f5f7fa] text-[#b6bcc5]'
      : 'border-[#1a4e9c] bg-[#1a4e9c] text-white hover:bg-[#14407f]')

  return (
    <div className="pb-4">
      {/* ── 표제 ── */}
      <header className={PROSE} ref={topRef}>
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>통일부 공공데이터 · 이산가족 자료 분석</p>
        <h1 className={`mt-3 ${TYPE.h1} ${TEXT.ink}`}>재본 것과, 재보지 못한 것</h1>
        <p className={`mt-3 max-w-3xl ${TYPE.body} ${TEXT.soft}`}>
          보유한 통일부 자료만으로 {nf(data.meta.tried)}가지를 재봤습니다. 그중 성립 {nf(data.meta.accepted)}건 · 약함 {nf(data.meta.weak)}건 ·
          {' '}불가 {nf(data.meta.rejectedCount)}건입니다. <b className={`font-semibold ${TEXT.ink}`}>성립하지 않은 카드도 지우지 않고 그대로 넘깁니다</b> —
          {' '}무엇이 재어졌고 무엇이 재어지지 않았는지가 이 덱의 내용이기 때문입니다.
        </p>
        <p className={`mt-2 max-w-3xl ${TYPE.sub} ${TEXT.faint}`}>
          {data.note} · 산출 {data.builtAt} · <code>{data.generator}</code>
          {data.corpus ? ` · 코퍼스 ${nf(data.corpus.records)}건 / ${nf(data.corpus.datasets)}종 (${data.corpus.builtAt})` : ''}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link to="/" className={BTN.ghost}>
            고향잇기 화면으로
          </Link>
          <a href="#deck-index" className={BTN.ghost}>
            카드 {nf(total)}장 목차 <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div className={`mt-4 rounded-md border ${SURFACE.line} ${SURFACE.inset} p-3.5`}>
          <p className={`${TYPE.cap} ${TEXT.soft} ${PROSE}`}>
            <b className="font-semibold">이 화면의 수치는 통일부가 공표한 통계가 아니라 본 시제품이 공개 자료를 계산한 결과입니다.</b>{' '}
            각 카드의 「어떻게 쟀는가」와 「한계」를 함께 읽어야 합니다. 유의성은 표본이 7~19개로 작아 전부 정확검정으로 계산했고, 판정할 수 없는 것은 「불가」로 적었습니다.
          </p>
        </div>
      </header>

      {/* ── 진행 표시 + 넘김 단추 (카드 위) ── */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <button type="button" onClick={() => go(cur - 1)} disabled={cur === 0} className={navBtn(cur === 0)}>
          <span aria-hidden="true">←</span> 이전
        </button>
        <div className="min-w-0 text-center" aria-live="polite">
          <p className={`text-[1.0625rem] font-bold tabular-nums ${TEXT.ink}`}>
            {cur + 1} / {total}
          </p>
          <p className={`truncate ${TYPE.cap} ${TEXT.faint}`}>
            {VERDICT[card.verdict]?.label} · {card.title}
          </p>
        </div>
        <button type="button" onClick={() => go(cur + 1)} disabled={cur === total - 1} className={navBtn(cur === total - 1)}>
          다음 <span aria-hidden="true">→</span>
        </button>
      </div>

      {/* ── 카드 ── */}
      <div className="mt-3">
        <DeckCard card={card} index={cur} total={total} sources={data.sources} />
      </div>

      {/* ── 넘김 단추 (카드 아래) ── */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" onClick={() => go(cur - 1)} disabled={cur === 0} className={navBtn(cur === 0)}>
          <span aria-hidden="true">←</span> 이전
        </button>
        <p className={`${TYPE.cap} ${TEXT.faint} ${PROSE} text-center`}>키보드 좌우 화살표로도 넘길 수 있습니다.</p>
        <button type="button" onClick={() => go(cur + 1)} disabled={cur === total - 1} className={navBtn(cur === total - 1)}>
          다음 <span aria-hidden="true">→</span>
        </button>
      </div>

      {/* ── 목차 — 21장을 한눈에. 감춘 카드가 없다는 것을 이 목록이 보인다 ── */}
      <section id="deck-index" className={`mt-8 scroll-mt-24 ${SURFACE.card} p-5`}>
        <h2 className={`${TYPE.h2} ${TEXT.ink} ${PROSE}`}>카드 {nf(total)}장 전부</h2>
        <p className={`mt-1 ${TYPE.sub} ${TEXT.faint} ${PROSE}`}>
          판정별로 색과 도형이 다릅니다 — ● 성립 {nf(data.meta.accepted)} · ▲ 약함 {nf(data.meta.weak)} · ■ 불가 {nf(data.meta.rejectedCount)}.
        </p>
        <ol className={`mt-3 divide-y ${SURFACE.hair}`}>
          {data.cards.map((c, i) => {
            const v = VERDICT[c.verdict] ?? VERDICT['불가']
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === cur ? 'true' : undefined}
                  className={`flex w-full flex-wrap items-baseline gap-x-2.5 gap-y-1 py-2.5 text-left ${FOCUS} ${i === cur ? 'bg-[#eef3fb]' : ''}`}
                >
                  <span className={`w-7 shrink-0 text-right ${TYPE.cap} tabular-nums ${TEXT.faint}`}>{i + 1}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 ${TYPE.cap} font-bold ${v.chip}`}>
                    <span aria-hidden="true">{v.glyph}</span> {v.label}
                  </span>
                  <span className={`min-w-0 flex-1 ${TYPE.sub} ${i === cur ? `font-semibold ${TEXT.blue}` : TEXT.ink} ${PROSE}`}>{c.title}</span>
                  <span className={`shrink-0 ${TYPE.cap} tabular-nums ${TEXT.faint}`}>기준 {c.asOf}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </section>

      {/* ── 계열별 기준일 ── */}
      <section className={`mt-6 ${SURFACE.card} p-5`}>
        <h2 className={`${TYPE.h2} ${TEXT.ink} ${PROSE}`}>계열별 기준일</h2>
        <p className={`mt-1 ${TYPE.sub} ${TEXT.faint} ${PROSE}`}>
          한 덱 안에 있다고 같은 시점의 값이 아닙니다. 기준일이 다른 계열을 이은 카드는 카드 안에 그 사실이 적혀 있습니다.
        </p>
        <ul className={`mt-3 divide-y ${SURFACE.hair}`}>
          {Object.entries(data.asOfByLane).map(([lane, at]) => (
            <li key={lane} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
              <span className={`min-w-0 flex-1 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>{lane}</span>
              <span className={`shrink-0 ${TYPE.sub} tabular-nums ${TEXT.ink}`}>{ymdKo(at)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 원칙과 방법 ── */}
      {(data.meta.principles?.length || data.meta.stats?.methods?.length) && (
        <section className={`mt-6 ${SURFACE.card} p-5`}>
          <h2 className={`${TYPE.h2} ${TEXT.ink} ${PROSE}`}>이 분석이 지킨 것</h2>
          {data.meta.principles?.length ? (
            <ul className="mt-2 space-y-1.5">
              {data.meta.principles.map((p, i) => (
                <li key={i} className={`${TYPE.sub} ${TEXT.soft} ${PROSE}`}>· {p}</li>
              ))}
            </ul>
          ) : null}
          {data.meta.stats?.methods?.length ? (
            <>
              <p className={`mt-4 ${TYPE.eyebrow} ${TEXT.faint}`}>쓴 통계 방법</p>
              <ul className="mt-1 space-y-1">
                {data.meta.stats.methods.map((m, i) => (
                  <li key={i} className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>· {m}</li>
                ))}
              </ul>
              {data.meta.stats.note && <p className={`mt-1.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{data.meta.stats.note}</p>}
            </>
          ) : null}
        </section>
      )}

      {/* ── 이 덱이 쓴 자료 전부 ── */}
      <section className={`mt-6 ${SURFACE.card} p-5`}>
        <h2 className={`${TYPE.h2} ${TEXT.ink} ${PROSE}`}>이 덱이 쓴 자료 전부 {nf(data.sources.length)}종</h2>
        <ul className={`mt-3 divide-y ${SURFACE.hair}`}>
          {data.sources.map(s => {
            const href = s.landing ?? s.url ?? s.urls?.[0] ?? null
            return (
              <li key={s.name} className="py-2.5">
                <p className={`${TYPE.sub} ${TEXT.ink} ${PROSE}`}>
                  {s.name}
                  {s.org ? <span className={`ml-1.5 ${TYPE.cap} ${TEXT.faint}`}>{s.org}</span> : null}
                </p>
                <p className={`mt-0.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
                  {s.asOf ? `기준 ${s.asOf}` : s.coverageEnd ? `수록 종료 ${s.coverageEnd}` : '기준일 표기 없음'}
                  {s.accessedAt ? ` · 접근 ${s.accessedAt}` : ''}
                  {typeof s.items === 'number' ? ` · ${nf(s.items)}건` : ''}
                  {s.usedBy?.length ? ` · 쓰인 카드 ${nf(s.usedBy.length)}장` : ''}
                  {href && (
                    <>
                      {' · '}
                      <a href={href} target="_blank" rel="noreferrer" className={`text-[#1a4e9c] underline underline-offset-2 ${FOCUS}`}>
                        원본<span aria-hidden="true">↗</span>
                      </a>
                    </>
                  )}
                </p>
                {s.note && <p className={`mt-0.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{s.note}</p>}
              </li>
            )
          })}
        </ul>
        <p className={`mt-3 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          북한 관련 정보 특성상 공식자료에 수록되지 않은 사실이 존재할 수 있습니다. 통일의식조사 계열만 통일부 자료가 아닙니다(서울대학교 통일평화연구원).
        </p>
      </section>
    </div>
  )
}
