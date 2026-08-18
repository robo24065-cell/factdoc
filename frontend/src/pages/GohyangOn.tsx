import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, MouseEvent as ReactMouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { asOfNotice, type NkRecord, type Notice } from '../engine/nk-search.mjs'

/* ────────────────────────────────────────────────────────────────
   고향ON — 지도 위의 as-of

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
   ──────────────────────────────────────────────────────────────── */

/* ══════════════════════ 타입 ══════════════════════ */

type Level = 'live' | 'stale' | 'frozen'
type Tone = 'emerald' | 'amber' | 'violet' | 'blue' | 'slate'

type MapRegion = { id: string; name: string; nameEn: string; path: string; centroid: [number, number] }
type MapMissing = { id: string; absorbedIn: string; note: string }
type MapOld = {
  id: string; name: string; members: string[]; paths: string[]; centroid: [number, number]
  missing?: MapMissing[]; marker?: { cx: number; cy: number; r: number }; note?: string
}
type MapCity = { name: string; x: number; y: number; regionId: string }
type NkMapData = {
  builtAt: string
  sources: Array<{ name: string; url?: string; license?: string; note?: string; retrieved?: string }>
  projection: { note: string }
  viewBox: string
  regionsModern: MapRegion[]
  regionsOld: MapOld[]
  crosswalk: { map: Record<string, { name: string; modern: string[]; missing?: MapMissing[] }>; note: string }
  cities: MapCity[]
}

type Weather = {
  station: string; stationEn: string; date: string
  tempC: number | null; maxC: number | null; minC: number | null; prcpMm: number | null; usedYear: number
}
type RegionInfo = {
  id: string
  mapRegionId: string | null
  mapNote?: string
  aliases: string[]
  events: { total: number; latest: Array<{ date: string; title: string }> }
  briefings: number
  trends: number
  overviews: number
  frozen: { topic: string; reason: string; since: string } | null
  defectorOrigin: { male: number; female: number; total: number; asOf: string; cumulativeSince: string } | null
  isanOrigin: { key: string; name: string; monthlyKey: string; latestKey: string } | null
  weather: Weather[]
}
type RegionSource = { name: string; url?: string; file?: string; urls?: string[]; asOf?: string; coverageEnd?: string }
type NkRegionData = {
  builtAt: string
  sources: RegionSource[]
  regions: Record<string, RegionInfo>
  cities: Array<{ name: string; region: string; mentions: { timeline: number; briefing: number; trend: number } }>
  meta: {
    weather: { latestObsDate: string; yearAvailability: Record<string, string>; asOfNote: string; stations: number }
    matching: { caveats: string[]; kangwonRule: string }
    isanNote: string
  }
}

type IsanMonthly = { month: string; avgAge: number; origin: Record<string, number>; total: number }
type Entry = { label: string; n: number; pct: number }
type Breakdown = { entries: Entry[]; total: number; totalPct: number }
type IsanSnapshot = {
  asOf: string
  postId?: number
  title?: string
  postedAt?: string
  attachment?: string
  boardUrl?: string
  boardTotalPosts?: number
  overview: { cumulative: { applicants: number; alive: number; deceased: number } }
  survivors: { total: number; byAge: Breakdown; byOrigin: Breakdown; byGender: Breakdown }
  previousMonths?: IsanSnapshot[]
}
type IsanSource = { name: string; kind: string; landing: string; org: string; asOf: string; note?: string }
type IsanData = {
  builtAt: string
  sources: IsanSource[]
  boards: { request: { url: string; totalPosts: number }; exchange: { url: string; totalPosts: number } }
  monthly: IsanMonthly[]
  latest: IsanSnapshot
  exchange: { asOf: string; attachment: string; boardUrl: string; byYear: Array<{ year: number }> }
  chronology: Array<{ era: string; date: string; event: string }>
}

type ProjYear = { year: number; asOf: string; expected: number; expectedCalibrated: number }
type ProjData = {
  builtAt: string
  sources: Array<{ name: string; org?: string; url?: string; usedYear?: string; asOf?: string }>
  headline: { asOf: string; survivors: number; survivors2030: string; survivors2040: string; below10000Year: string; note: string }
  method: { summary: string; scenarios: { expected: string; expectedCalibrated: string } }
  assumptions: string[]
  lifeTable: { year: number | string; tblId: string; published: string }
  byYear: ProjYear[]
  milestoneRange: { note: string; below20000: string; below10000: string; below5000: string; below1000: string }
}

/* 후손 세대 — 제4차 실태조사(2024)의 후손 문항.
    이 데이터의 성격을 화면이 반드시 밝혀야 한다: 후손 본인에게 물은 게 아니라
     **자손이 있는 1세대 4,042명이 자기 자손을 평가한** 값이다. */
type DescGap = {
  id: string; title: string
  a: { label: string; pct: number }
  b: { label: string; pct: number }
  gapPp: number; reading: string
}
type DescData = {
  builtAt: string
  sources: Array<{ name: string; url?: string; asOf?: string; note?: string }>
  survey: {
    name: string; publishedAt: string; agency: string
    bases: { full: number; deep: number; withDescendants: number }
    cadence: { before: number; after: number; reason: string }
  }
  descendants: {
    wantsCrossGenerationExchange: { gen1: number; descendants: number; base: number; note: string }
    identity: { base: number; respondent: string; items: Array<{ label: string; pct: number }> }
  }
  recordPrograms: { base: number; 기록및공감대: Array<{ label: string; pct: number }>; 위로사업: Array<{ label: string; pct: number }> }
  homeland: { visitDemandTrend: { 2021: number; 2024: number; deltaPp: number } }
  gaps: DescGap[]
  scale: { gen1Cumulative: number; withDescendantsRate: number; assumptions: string[]; estimate: { ownersOfDescendants: number; phrase: string } }
  caveats: string[]
}

type Pack = { map: NkMapData; region: NkRegionData; isan: IsanData; proj: ProjData; desc: DescData }

/* 지도 모드 — 현행 행정구역 / 광복 당시 구행정구역(= 이산가족 '고향' 축) */
type Mode = 'modern' | 'old'
type Sel = { mode: 'modern'; key: string } | { mode: 'old'; id: string }

/* ══════════════════════ 상수 (SasilOn 과 같은 팔레트) ══════════════════════ */

/* 팔레트·활자는 theme/gohyang.ts 가 단일 진실 소스다.
   아래는 이 화면이 쓰는 이름으로 옮겨 붙인 얇은 층이다 —
   기존 JSX 수백 곳을 건드리지 않고 껍데기만 갈아입히려고 이렇게 둔다. */
import { SURFACE, TYPE, TEXT, ASOF, PROSE as T_PROSE, FOCUS as T_FOCUS, BTN, josa } from '../theme/gohyang'

const FOCUS = T_FOCUS
const CARD = SURFACE.card
const PROSE = T_PROSE

/* 색의 역할을 다시 정했다.
    as-of 3상태(jade/ember/seal)만 **기능색**이고, 나머지는 전부 종이·먹색이다.
     예전에는 정보 카드까지 파랑이라 화면 전체가 파랗고, 정작 중요한
     '이 자료가 언제 것인가'가 묻혔다. 중립을 늘려서 기능색이 눈에 들어오게 한다. */
const TONE: Record<Tone, { band: string; accent: string; text: string; soft: string; chip: string }> = {
  emerald: {
    band: ASOF.live.band, accent: ASOF.live.bar,
    text: ASOF.live.text, soft: 'bg-[#f4faf7] dark:bg-[#0f231a]',
    chip: ASOF.live.chip,
  },
  amber: {
    band: ASOF.stale.band, accent: ASOF.stale.bar,
    text: ASOF.stale.text, soft: 'bg-[#fdf8ee] dark:bg-[#241a0a]',
    chip: ASOF.stale.chip,
  },
  violet: {
    band: ASOF.frozen.band, accent: ASOF.frozen.bar,
    text: ASOF.frozen.text, soft: 'bg-[#f6f4fb] dark:bg-[#181428]',
    chip: ASOF.frozen.chip,
  },
  // 정보 계열 — 파랑을 버리고 종이/먹으로 간다
  blue: {
    band: 'bg-[#f5f7fa] dark:bg-[#14181e]', accent: 'bg-[#1a4e9c] dark:bg-[#7aa9e8]',
    text: TEXT.ink, soft: 'bg-[#f9fafc] dark:bg-[#14181e]',
    chip: 'bg-[#eef3fb] text-[#1a4e9c] ring-1 ring-[#cfdcef] dark:bg-[#16202c] dark:text-[#7aa9e8] dark:ring-[#27364a]',
  },
  slate: {
    band: 'bg-[#f5f7fa] dark:bg-[#14181e]', accent: 'bg-[#b6bcc5] dark:bg-[#39414c]',
    text: TEXT.soft, soft: 'bg-[#f9fafc] dark:bg-[#14181e]',
    chip: 'bg-[#eef1f5] text-[#555555] ring-1 ring-[#dcdfe4] dark:bg-[#1a1f26] dark:text-[#a4acb6] dark:ring-[#2a2f36]',
  },
}

/* as-of 3상태 — 색·도형·라벨 3중 부호화. 이모지 대신 도형 글리프를 쓴다:
   이모지는 기기마다 모양이 달라지고 흑백 인쇄에서 뭉개진다. */
const AS_OF: Record<Level, { tone: Tone; icon: string; label: string; verb: string; edge: string }> = {
  live: {
    tone: 'emerald', icon: ASOF.live.glyph, label: ASOF.live.label,
    verb: '현재 시점까지 확인되는 자료입니다.',
    edge: 'border-l-[3px] border-solid border-[#136c43] dark:border-[#5fc99a]',
  },
  stale: {
    tone: 'amber', icon: ASOF.stale.glyph, label: ASOF.stale.label,
    verb: '이 시점 이후의 상황은 확인되지 않았습니다. 아래 값은 당시의 값이며 현재 값이 아닙니다. — 없다는 뜻이 아니라 모른다는 뜻입니다.',
    edge: 'border-l-[3px] border-dashed border-[#b06a00] dark:border-[#e3ac5b]',
  },
  frozen: {
    tone: 'violet', icon: ASOF.frozen.glyph, label: ASOF.frozen.label,
    verb: '활동 자체가 종료되어 이 시점 이후의 데이터는 존재하지 않습니다. 아래 값이 확정된 최종값입니다.',
    edge: 'border-l-[3px] border-double border-[#4a3f7a] dark:border-[#a99ce0]',
  },
}

/* 단계별 채색 — Tailwind 는 소스에 **문자 그대로** 있는 클래스만 생성한다.
   `fill-[${hex}]` 같은 동적 조합은 빌드에서 사라지므로 정적 문자열 표로 둔다.
   종이색 → 먹색으로 어두워지는 한 계열이라 "짙을수록 크다"가 설명 없이 읽히고,
   무채색으로 떨어뜨려도 밝기가 단조 증가해 색맹·흑백에서도 순서가 남는다. */
const CHORO = [
  'fill-[#f0f1f3] dark:fill-[#181c22]',   // 0 — 해당 축에 집계 항목 없음
  'fill-[#cfdcef] dark:fill-[#1d2937]',
  'fill-[#a8c2e2] dark:fill-[#27384d]',
  'fill-[#7ba1d2] dark:fill-[#345170]',
  'fill-[#4b79bb] dark:fill-[#456f9b]',
  'fill-[#1a4e9c] dark:fill-[#5b8dc7]',
]
const CHORO_SWATCH = [
  'bg-[#f0f1f3] dark:bg-[#181c22]',
  'bg-[#cfdcef] dark:bg-[#1d2937]',
  'bg-[#a8c2e2] dark:bg-[#27384d]',
  'bg-[#7ba1d2] dark:bg-[#345170]',
  'bg-[#4b79bb] dark:bg-[#456f9b]',
  'bg-[#1a4e9c] dark:bg-[#5b8dc7]',
]

const PACK = '/gohyang'

/* ══════════════════════ 유틸 ══════════════════════ */

function nf(v: unknown): string {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('ko-KR') : '—'
}
function nf1(v: unknown): string {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) : '—'
}
/* '2026-05-31' → '2026년 5월' */
function ymKo(d?: string | null): string {
  const m = String(d ?? '').match(/^(\d{4})-(\d{2})/)
  return m ? `${m[1]}년 ${Number(m[2])}월` : '기준일 미상'
}
/* '2025-08-24' → '2025년 8월 24일' */
function ymdKo(d?: string | null): string {
  const m = String(d ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : '일자 미상'
}
function gapText(days?: number | null): string {
  if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) return '0개월'
  let y = Math.floor(days / 365.25)
  let mo = Math.round((days - y * 365.25) / 30.44)
  if (mo >= 12) { y += 1; mo = 0 }
  if (y <= 0) return `${Math.max(1, mo)}개월`
  return mo >= 1 ? `${y}년 ${mo}개월` : `${y}년`
}
/* 원자료 정제 — 연표 제목에 전각 쉼표(U+FF0C)가 그대로 들어 있다
   (조사 처리 josa() 는 theme/gohyang.ts 에 있다 — 화면 전체가 같은 규칙을 쓴다) */
function clean(s?: string | null): string {
  return String(s ?? '')
    .replace(/，/g, ', ').replace(/．/g, '. ')
    .replace(/～/g, '~').replace(/－/g, '-').replace(/･/g, '·')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/* 기준일 문구는 엔진 asOfNotice 하나만 쓴다 — 재구현하면 엔진이 문구를 고칠 때 화면만 갈라진다.
   (asOfNotice 가 읽는 필드는 coverageEnd / freshness / frozenReason 셋뿐이다) */
function notice(coverageEnd: string, freshness: Level, frozenReason?: string | null): Notice {
  const rec = { coverageEnd, freshness, frozenReason: frozenReason ?? null } as unknown as NkRecord
  const n = asOfNotice(rec, new Date())
  return { ...n, level: (n.level === 'live' || n.level === 'frozen' ? n.level : 'stale') as Level }
}

/* ══════════════════════ 공통 조각 ══════════════════════ */

function AsOfPill({ level, size = 'md' }: { level: Level; size?: 'md' | 'sm' }) {
  const m = AS_OF[level]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${TONE[m.tone].chip} ${
        size === 'sm' ? 'text-[11px]' : 'text-xs'
      }`}
    >
      <span aria-hidden="true">{m.icon}</span>
      <span className="sr-only">자료 기준 등급: </span>
      {m.label}
    </span>
  )
}

function AsOfLine({ n, verbose = false }: { n: Notice; verbose?: boolean }) {
  const lv = n.level as Level
  const m = AS_OF[lv]
  const T = TONE[m.tone]
  return (
    <div className={`rounded-xl ${m.edge} ${T.soft} p-2.5`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <AsOfPill level={lv} size="sm" />
        {lv !== 'live' && (n.gapDays ?? 0) > 30 && (
          <span className="text-[11px] tabular-nums text-slate-500">
            {lv === 'frozen' ? '종료 후' : '미확인'} {gapText(n.gapDays)} 경과
          </span>
        )}
      </div>
      <p className={`mt-1 text-sm font-medium leading-relaxed ${PROSE} ${T.text}`}>{n.text}</p>
      {verbose && <p className={`mt-1 text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>{m.verb}</p>}
    </div>
  )
}

/* 원문 링크 — SasilOn 의 RecordLink 관례. 실제 웹페이지가 있을 때만 붙이고,
   없으면 '원본 링크 미제공'이라고 쓴다(있는 척하지 않는다). */
function OutLink({ href, children }: { href?: string | null; children: ReactNode }) {
  if (!href) return <span className="text-[11px] text-slate-400">원본 링크 미제공</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1 rounded text-[11px] text-blue-600 underline underline-offset-2 dark:text-blue-400 ${FOCUS}`}
    >
      {children}
      <span aria-hidden="true">↗</span>
    </a>
  )
}

function ClauseTag({ children }: { children: ReactNode }) {
  return (
    <span className="mt-0.5 shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] font-semibold tracking-wider text-slate-500 dark:border-slate-600 dark:text-slate-400">
      {children}
    </span>
  )
}

/* 구획 — 정부 누리집의 관용 표현을 따른다: 분류 라벨 + 남색 세로 막대 + 제목.
   그림 아이콘은 쓰지 않는다(§토큰 제약 ①). 위계는 활자 굵기와 선으로만 만든다. */
function Block({ tag, tone, title, sub, children }: {
  tag: string; tone: Tone; title: string; sub?: string | null; children: ReactNode
}) {
  const T = TONE[tone]
  return (
    <section className={`overflow-hidden ${CARD}`}>
      <div className={`flex items-start gap-2.5 border-b p-4 ${SURFACE.hair} ${T.band}`}>
        <ClauseTag>{tag}</ClauseTag>
        <div className={`h-9 w-[3px] shrink-0 ${T.accent}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className={`${TYPE.h2} ${PROSE} ${T.text}`}>{title}</h2>
          {sub && <p className={`mt-1 ${TYPE.sub} ${TEXT.faint} ${PROSE}`}>{sub}</p>}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

/* ══════════════════════ 패널 모델 ══════════════════════
   현행 1개 지역이든 구행정구역 1개(=현행 2~3개 묶음)든 같은 모양으로 만든다.
   화면이 두 갈래로 갈라지지 않게, 합치는 일을 여기서 한 번만 한다. */

type PanelModel = {
  kind: Mode
  title: string
  sub: string
  memberNames: string[]
  note: string | null
  weather: Array<Weather & { region: string }>
  frozen: Array<{ region: string; topic: string; reason: string; since: string }>
  defector: { male: number; female: number; total: number; asOf: string; cumulativeSince: string } | null
  defectorMissing: string[]
  isanKey: { key: string; name: string; monthlyKey: string; latestKey: string } | null
  events: Array<{ date: string; title: string }>
  eventsTotal: number
  briefings: number
  trends: number
  overviews: number
}

function membersOf(sel: Sel, region: NkRegionData): string[] {
  if (sel.mode === 'modern') return region.regions[sel.key] ? [sel.key] : []
  return Object.keys(region.regions).filter(k => region.regions[k].isanOrigin?.key === sel.id)
}

function buildPanel(sel: Sel, pack: Pack): PanelModel | null {
  const names = membersOf(sel, pack.region)
  if (!names.length) return null
  const infos = names.map(n => pack.region.regions[n])

  const oldDef = sel.mode === 'old' ? pack.map.regionsOld.find(o => o.id === sel.id) : null
  if (sel.mode === 'old' && !oldDef) return null

  const events = infos
    .flatMap((r, i) => r.events.latest.map(e => ({ ...e, region: names[i] })))
    .filter((e, i, arr) => arr.findIndex(x => x.date === e.date && x.title === e.title) === i)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  const defParts = infos.filter(r => r.defectorOrigin)
  const defector = defParts.length
    ? {
        male: defParts.reduce((s, r) => s + (r.defectorOrigin?.male ?? 0), 0),
        female: defParts.reduce((s, r) => s + (r.defectorOrigin?.female ?? 0), 0),
        total: defParts.reduce((s, r) => s + (r.defectorOrigin?.total ?? 0), 0),
        asOf: defParts[0].defectorOrigin!.asOf,
        cumulativeSince: defParts[0].defectorOrigin!.cumulativeSince,
      }
    : null

  return {
    kind: sel.mode,
    title: sel.mode === 'old' ? oldDef!.name : sel.key,
    sub:
      sel.mode === 'old'
        ? `광복 당시 구행정구역 · 현행 ${names.join('·')}`
        : `현행 행정구역${infos[0].mapNote ? ` · ${infos[0].mapNote}` : ''}`,
    memberNames: names,
    note: sel.mode === 'old' ? (oldDef!.note ?? null) : (infos[0].mapNote ?? null),
    weather: infos.flatMap((r, i) => (r.weather ?? []).map(w => ({ ...w, region: names[i] }))),
    frozen: infos.flatMap((r, i) => (r.frozen ? [{ ...r.frozen, region: names[i] }] : [])),
    defector,
    defectorMissing: names.filter(n => !pack.region.regions[n].defectorOrigin),
    isanKey: infos.find(r => r.isanOrigin)?.isanOrigin ?? null,
    events,
    eventsTotal: infos.reduce((s, r) => s + r.events.total, 0),
    briefings: infos.reduce((s, r) => s + r.briefings, 0),
    trends: infos.reduce((s, r) => s + r.trends, 0),
    overviews: infos.reduce((s, r) => s + r.overviews, 0),
  }
}

/* ══════════════════════ 지도 ══════════════════════ */

type Shape = {
  key: string           // 선택 키 (modern=지역명, old=구역id)
  label: string
  paths: string[]
  marker?: { cx: number; cy: number; r: number }
  centroid: [number, number]
  value: number | null  // 채색 지표 (null = 해당 축에 집계 항목 없음)
  step: number
  tipRows: string[]
}

function tone(v: number | null, max: number): number {
  if (v == null || v <= 0 || max <= 0) return 0
  /* 제곱근 눈금 — 함경북도 19,760 이 나머지를 전부 눌러 버려서
     선형으로 칠하면 다른 10곳이 한 색이 된다(실측). */
  const t = Math.sqrt(v / max)
  return Math.min(5, Math.max(1, Math.ceil(t * 5)))
}

function useShapes(pack: Pack | null, mode: Mode): { shapes: Shape[]; max: number; metric: string; metricAsOf: string } {
  return useMemo(() => {
    if (!pack) return { shapes: [], max: 0, metric: '', metricAsOf: '' }
    const byOrigin = new Map(pack.isan.latest.survivors.byOrigin.entries.map(e => [e.label, e]))

    if (mode === 'old') {
      const raw = pack.map.regionsOld.map(o => {
        const memberNames = Object.keys(pack.region.regions).filter(k => pack.region.regions[k].isanOrigin?.key === o.id)
        const latestKey = memberNames.map(n => pack.region.regions[n].isanOrigin?.latestKey).find(Boolean)
        const e = latestKey ? byOrigin.get(latestKey) : undefined
        return { o, memberNames, value: e ? e.n : null, pct: e ? e.pct : null }
      })
      const max = Math.max(...raw.map(r => r.value ?? 0), 1)
      return {
        metric: '이 지역이 고향인 이산가족 생존 신청자',
        metricAsOf: pack.isan.latest.asOf,
        max,
        shapes: raw.map(({ o, memberNames, value, pct }) => ({
          key: o.id,
          label: o.name,
          paths: o.paths,
          marker: o.marker,
          centroid: o.centroid,
          value,
          step: tone(value, max),
          tipRows: [
            value == null ? '이산가족 생존자 — 집계 항목 없음' : `이산가족 생존자 ${nf(value)}명 (${nf1(pct)}%)`,
            `현행 ${memberNames.join('·') || '대응 구역 없음'}`,
          ],
        })),
      }
    }

    const raw = Object.keys(pack.region.regions).map(name => {
      const r = pack.region.regions[name]
      const geo = r.mapRegionId ? pack.map.regionsModern.find(m => m.id === r.mapRegionId) : null
      const city = pack.map.cities.find(c => c.name === name)
      return { name, r, geo, city }
    })
    const max = Math.max(...raw.map(x => x.r.defectorOrigin?.total ?? 0), 1)
    return {
      metric: '탈북민 재북 출신지 (누적)',
      metricAsOf: raw.find(x => x.r.defectorOrigin)?.r.defectorOrigin?.asOf ?? '',
      max,
      shapes: raw
        .filter(x => x.geo || x.city)
        .map(({ name, r, geo, city }) => ({
          key: name,
          label: name,
          paths: geo ? [geo.path] : [],
          marker: geo ? undefined : { cx: city!.x, cy: city!.y, r: 11 },
          centroid: (geo ? geo.centroid : [city!.x, city!.y]) as [number, number],
          value: r.defectorOrigin?.total ?? null,
          step: tone(r.defectorOrigin?.total ?? null, max),
          tipRows: [
            r.defectorOrigin ? `탈북민 출신 ${nf(r.defectorOrigin.total)}명` : '탈북민 출신지 — 집계 항목 없음',
            `연표 ${nf(r.events.total)}건 · 보도 ${nf(r.briefings)}건 · 동향 ${nf(r.trends)}건`,
          ],
        })),
    }
  }, [pack, mode])
}

function NkMapView({
  pack, mode, sel, onSelect,
}: {
  pack: Pack; mode: Mode; sel: Sel | null; onSelect: (s: Sel) => void
}) {
  const { shapes, max, metric, metricAsOf } = useShapes(pack, mode)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; key: string } | null>(null)
  const selKey = sel ? (sel.mode === 'modern' ? sel.key : sel.id) : null
  const hovered = tip ? shapes.find(s => s.key === tip.key) : null

  const move = (e: ReactMouseEvent, key: string) => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return
    setTip({ x: Math.min(Math.max(e.clientX - r.left, 96), Math.max(96, r.width - 96)), y: e.clientY - r.top, key })
  }
  const pick = (key: string) => onSelect(mode === 'modern' ? { mode: 'modern', key } : { mode: 'old', id: key })

  /* 도시 표시 — 현행 지도에서만. 남포·개성은 별도 폴리곤이 없어 이 점이 유일한 클릭 지점이다. */
  const cities = mode === 'modern' ? pack.map.cities : []
  const cityTarget = (c: MapCity) =>
    pack.region.regions[c.name]
      ? c.name
      : Object.keys(pack.region.regions).find(k => pack.region.regions[k].mapRegionId === c.regionId) ?? null

  return (
    <div>
      <div ref={wrapRef} className="relative">
        <svg
          viewBox={pack.map.viewBox}
          preserveAspectRatio="xMidYMid meet"
          className="h-auto w-full max-h-[68vh] select-none"
          role="group"
          aria-label={`북한 ${mode === 'old' ? '광복 당시 구행정구역' : '현행 행정구역'} 지도. 지역 ${shapes.length}곳. 각 지역을 선택하면 오른쪽에 상세 정보가 열립니다.`}
          onMouseLeave={() => setTip(null)}
        >
          {shapes.map(s => {
            const on = s.key === selKey
            const hot = tip?.key === s.key
            return (
              <g
                key={s.key}
                tabIndex={0}
                role="button"
                aria-label={`${s.label}. ${s.tipRows.join('. ')}`}
                aria-pressed={on}
                className={`cursor-pointer outline-none ${FOCUS}`}
                onClick={() => pick(s.key)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(s.key) }
                }}
                onMouseMove={e => move(e, s.key)}
                onMouseEnter={e => move(e, s.key)}
                onFocus={() => setTip({ x: s.centroid[0], y: 0, key: s.key })}
                onBlur={() => setTip(t => (t?.key === s.key ? null : t))}
              >
                {s.paths.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    fillRule="evenodd"
                    className={`${CHORO[s.step]} ${
                      on
                        ? 'stroke-blue-800 dark:stroke-blue-300'
                        : hot
                          ? 'stroke-slate-900 dark:stroke-white'
                          : 'stroke-white dark:stroke-slate-900'
                    } transition-[stroke]`}
                    strokeWidth={on ? 3 : hot ? 2 : 0.8}
                    strokeLinejoin="round"
                  />
                ))}
                {s.marker && (
                  <circle
                    cx={s.marker.cx}
                    cy={s.marker.cy}
                    r={s.marker.r}
                    fillRule="evenodd"
                    className={`${CHORO[s.step]} ${on ? 'stroke-blue-800 dark:stroke-blue-300' : 'stroke-slate-500'}`}
                    strokeWidth={on ? 3 : 1.6}
                    strokeDasharray="4 3"
                  />
                )}
                {/* 라벨 — 폴리곤이 없는 마커형도 이름이 보여야 클릭 대상이 된다 */}
                <text
                  x={s.centroid[0]}
                  y={s.centroid[1]}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className={`pointer-events-none text-[15px] font-semibold ${
                    s.step >= 4 ? 'fill-white' : 'fill-slate-700 dark:fill-slate-100'
                  }`}
                  style={{ paintOrder: 'stroke', strokeWidth: s.step >= 4 ? 0 : 3 }}
                >
                  {s.label}
                </text>
              </g>
            )
          })}

          {cities.map(c => {
            const target = cityTarget(c)
            const own = pack.region.regions[c.name] != null
            if (!target) return null
            return (
              <g
                key={c.name}
                className={`cursor-pointer outline-none ${FOCUS}`}
                tabIndex={own ? 0 : -1}
                role={own ? 'button' : undefined}
                aria-label={own ? `${c.name} — 별도 지역 데이터가 있습니다` : undefined}
                onClick={() => pick(target)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(target) }
                }}
                onMouseMove={e => move(e, target)}
              >
                <circle cx={c.x} cy={c.y} r={own ? 6 : 4} className="fill-slate-900 stroke-white dark:fill-white dark:stroke-slate-900" strokeWidth={1.5} />
                <text
                  x={c.x + 9}
                  y={c.y + 4}
                  className="pointer-events-none text-[13px] fill-slate-600 dark:fill-slate-300"
                  style={{ paintOrder: 'stroke', strokeWidth: 3 }}
                >
                  {c.name}
                </text>
              </g>
            )
          })}
        </svg>

        {hovered && tip && (
          <div
            className="pointer-events-none absolute z-20 w-48 -translate-x-1/2 -translate-y-[115%] rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
            style={{ left: tip.x, top: Math.max(tip.y, 8) }}
            role="status"
          >
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{hovered.label}</p>
            {hovered.tipRows.map((t, i) => (
              <p key={i} className={`mt-0.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>{t}</p>
            ))}
            <p className="mt-1 text-[11px] text-blue-600 dark:text-blue-400">눌러서 자세히 보기 →</p>
          </div>
        )}
      </div>

      {/* 범례 — 무엇으로 칠했는지, 그 값이 언제 것인지 */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
        <span className={`text-[11px] font-medium text-slate-600 dark:text-slate-300 ${PROSE}`}>색 = {metric}
        </span>
        <span className="flex items-center gap-1" aria-hidden="true">
          <span className="text-[11px] tabular-nums text-slate-400">0</span>
          {CHORO_SWATCH.slice(1).map(c => <span key={c} className={`h-3 w-5 rounded-sm ${c}`} />)}
          <span className="text-[11px] tabular-nums text-slate-400">{nf(max)}명</span>
        </span>
        {metricAsOf && <span className="text-[11px] tabular-nums text-slate-500">기준 {ymKo(metricAsOf)}</span>}
        <AsOfPill level={notice(metricAsOf || pack.region.builtAt, 'live').level as Level} size="sm" />
      </div>
    </div>
  )
}

/* ══════════════════════ 미니 추이 (출신지 월별) ══════════════════════ */

/* ══════════════════════ 실시간 기상 ══════════════════════

   왜 NOAA 를 안 쓰고 따로 부르는가 — 실측했다(2026-08-19):
     GSOD  /access/2026/            → HTTP 404
     ISD   /global-hourly/2026/     → HTTP 404
     KN 27지점 최신 관측            → 2025-08-24 (1년 정지)
   기상청 계열은 북한관측·ASOS·apihub 전부 로그인이 걸려 있어 익명으로 못 받는다.

   그래서 **Open-Meteo** 를 쓴다 — 키·로그인·신청 없이 익명 호출이 되고,
   13개 지역을 한 번의 요청으로 받는다(실측 1.2초 · 7.7KB).

    빌드에 굽지 않고 **브라우저가 직접** 부른다. 기상은 빌드 시점의 값을 저장하는 순간
     그 자체로 stale 이 되는 유일한 계열이라, as-of 를 지키는 방법이 '실시간'이다.
     네트워크가 죽으면 조용히 감추고 NOAA 최종 관측만 남긴다(LLM 4원칙 ④와 같은 태도). */

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'

/* 지역 대표 지점 — 도 소재지·주요 도시 좌표. 지도 centroid 는 SVG 좌표라 쓸 수 없다. */
const REGION_LATLON: Record<string, [number, number]> = {
  평양: [39.019, 125.738], 남포: [38.737, 125.408], 개성: [37.970, 126.554], 라선: [42.256, 130.294],
  평안남도: [39.238, 125.876], 평안북도: [40.104, 124.398], 자강도: [40.969, 126.585],
  황해남도: [38.044, 125.715], 황해북도: [38.507, 126.640], 강원도: [39.147, 127.444],
  함경남도: [39.918, 127.536], 함경북도: [41.795, 129.775], 량강도: [41.396, 128.180],
}

type LiveWx = { name: string; tempC: number; maxC: number; minC: number; prcpMm: number; at: string }

/** 선택한 지역들의 현재 기상. 실패·미지원은 null 로 두고 화면에서 감춘다. */
function useLiveWeather(names: string[]): { rows: LiveWx[]; state: 'idle' | 'loading' | 'ok' | 'fail' } {
  const [rows, setRows] = useState<LiveWx[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle')
  const key = names.join('|')

  useEffect(() => {
    const targets = names.filter(n => REGION_LATLON[n])
    if (!targets.length) { setRows([]); setState('idle'); return }
    let alive = true
    setState('loading')
    const q = new URLSearchParams({
      latitude: targets.map(n => REGION_LATLON[n][0]).join(','),
      longitude: targets.map(n => REGION_LATLON[n][1]).join(','),
      current: 'temperature_2m,precipitation',
      daily: 'temperature_2m_max,temperature_2m_min',
      timezone: 'Asia/Pyongyang',
      forecast_days: '1',
    })
    fetch(`${OPEN_METEO}?${q}`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then((j: unknown) => {
        if (!alive) return
        // 지점이 1곳이면 객체, 여러 곳이면 배열로 온다
        const arr = (Array.isArray(j) ? j : [j]) as Array<{
          current?: { temperature_2m?: number; precipitation?: number; time?: string }
          daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] }
        }>
        const out: LiveWx[] = []
        arr.forEach((x, i) => {
          const t = x?.current?.temperature_2m
          if (typeof t !== 'number' || !targets[i]) return
          out.push({
            name: targets[i],
            tempC: t,
            maxC: x?.daily?.temperature_2m_max?.[0] ?? NaN,
            minC: x?.daily?.temperature_2m_min?.[0] ?? NaN,
            prcpMm: x?.current?.precipitation ?? 0,
            at: x?.current?.time ?? '',
          })
        })
        setRows(out)
        setState(out.length ? 'ok' : 'fail')
      })
      .catch(() => { if (alive) { setRows([]); setState('fail') } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { rows, state }
}

function LiveWeatherRows({ names }: { names: string[] }) {
  const { rows, state } = useLiveWeather(names)
  if (state === 'loading') {
    return <p className="text-[11px] text-slate-400">현재 기상을 불러오는 중…</p>
  }
  if (state !== 'ok') return null  // 실패하면 조용히 사라진다 — 아래 NOAA 최종 관측이 남는다

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div className="flex items-center gap-2">
        <AsOfPill level="live" size="sm" />
        <span className={`text-sm font-semibold ${TONE.emerald.text} ${PROSE}`}>지금 이 시각 고향의 날씨</span>
      </div>
      <ul className="mt-2 space-y-1">
        {rows.map(w => (
          <li key={w.name} className="flex items-baseline justify-between gap-2">
            <span className={`text-sm text-slate-600 dark:text-slate-300 ${PROSE}`}>
              {w.name}
              <span className="ml-1 text-[11px] text-slate-400">
                {w.at ? `${w.at.slice(5, 10).replace('-', '월 ')}일 ${w.at.slice(11, 16)} 평양시각` : ''}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <b className="text-base font-semibold tabular-nums text-slate-900 dark:text-white">{nf1(w.tempC)}℃</b>
              {Number.isFinite(w.maxC) && (
                <span className="ml-1 text-[11px] tabular-nums text-slate-400">최고 {nf1(w.maxC)} · 최저 {nf1(w.minC)}</span>
              )}
              {w.prcpMm > 0 && <span className="ml-1 text-[11px] tabular-nums text-blue-600">비 {nf1(w.prcpMm)}㎜</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className={`mt-2 text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>고향을 눈으로 볼 수는 없어도, <b className="font-medium">오늘 그곳이 더운지 추운지는 알 수 있습니다.</b>
        {' '}이 값만은 저장하지 않고 화면을 열 때마다 새로 받습니다.
      </p>
      <p className="mt-1.5">
        <span className="text-[11px] text-slate-400">출처 Open-Meteo (무료·인증 없음) · </span>
        <OutLink href="https://open-meteo.com/">원본 API</OutLink>
      </p>
    </div>
  )
}

function Spark({ rows, label }: { rows: Array<{ month: string; v: number }>; label: string }) {
  if (rows.length < 2) return null
  const W = 320, H = 72, P = 4
  const max = Math.max(...rows.map(r => r.v))
  const x = (i: number) => P + (i / (rows.length - 1)) * (W - P * 2)
  const y = (v: number) => H - P - (v / (max || 1)) * (H - P * 2)
  const line = rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r.v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(rows.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`
  const first = rows[0], last = rows[rows.length - 1]
  const drop = first.v > 0 ? Math.round((1 - last.v / first.v) * 100) : 0
  return (
    <figure className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
        aria-label={`${label} 월별 추이. ${ymKo(first.month)} ${nf(first.v)}명에서 ${ymKo(last.month)} ${nf(last.v)}명으로 ${drop}% 감소.`}>
        <path d={area} className="fill-blue-500/15" />
        <path d={line} fill="none" className="stroke-blue-600 dark:stroke-blue-400" strokeWidth={2} strokeLinejoin="round" />
        <circle cx={x(rows.length - 1)} cy={y(last.v)} r={3} className="fill-blue-600 dark:fill-blue-400" />
      </svg>
      <figcaption className="mt-1 flex items-baseline justify-between text-[11px] tabular-nums text-slate-500">
        <span>{ymKo(first.month)} {nf(first.v)}명</span>
        <span className="font-medium text-slate-600 dark:text-slate-300">-{drop}%</span>
        <span>{ymKo(last.month)} {nf(last.v)}명</span>
      </figcaption>
    </figure>
  )
}

/* ══════════════════════ 우측 패널 ══════════════════════ */

function StatRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 py-1.5 last:border-0 dark:border-slate-800">
      <span className={`text-sm text-slate-600 dark:text-slate-300 ${PROSE}`}>{label}</span>
      <span className="shrink-0 text-right">
        <b className="text-base font-semibold tabular-nums text-slate-900 dark:text-white">{value}</b>
        {sub && <span className="ml-1 text-[11px] text-slate-400">{sub}</span>}
      </span>
    </div>
  )
}

function RegionPanel({ pack, sel, onClose }: { pack: Pack; sel: Sel; onClose: () => void }) {
  const p = useMemo(() => buildPanel(sel, pack), [sel, pack])
  const [allEvents, setAllEvents] = useState(false)
  useEffect(() => { setAllEvents(false) }, [sel])

  if (!p) {
    return (
      <div className={`${CARD} p-4`}>
        <p className={`text-sm text-slate-600 dark:text-slate-300 ${PROSE}`}>선택한 구역에 연결된 지역 데이터가 없습니다.
        </p>
      </div>
    )
  }

  const isan = pack.isan
  const originEntry = p.isanKey ? isan.latest.survivors.byOrigin.entries.find(e => e.label === p.isanKey!.latestKey) : undefined
  const monthlyRows = p.isanKey
    ? isan.monthly.map(m => ({ month: m.month, v: m.origin[p.isanKey!.monthlyKey] ?? 0 })).filter(r => Number.isFinite(r.v))
    : []
  const csvAsOf = isan.monthly.at(-1)?.month ?? ''

  /* 기록(연표·보도·동향)의 기준일 — nk-region 이 스캔한 동향 원본의 coverageEnd */
  const recordEnd = pack.region.sources.find(s => s.coverageEnd)?.coverageEnd ?? pack.region.builtAt
  const recNotice = notice(recordEnd, 'live')
  const wxNotice = notice(pack.region.meta.weather.latestObsDate, 'stale')
  const isanNotice = notice(isan.latest.asOf, 'live')
  const csvNotice = notice(csvAsOf, 'live')
  const defNotice = p.defector ? notice(p.defector.asOf, 'stale') : null

  const events = allEvents ? p.events : p.events.slice(0, 8)

  return (
    <div className="space-y-4">
      {/* ── 머리 ── */}
      <div className={`${CARD} p-4`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-blue-700 dark:text-blue-400">
              {p.kind === 'old' ? '광복 당시 구행정구역 (이산가족 고향 축)' : '현행 행정구역'}
            </p>
            <h2 className={`mt-0.5 text-2xl font-semibold leading-snug text-slate-900 dark:text-white ${PROSE}`}>{p.title}</h2>
            <p className={`mt-0.5 text-sm leading-relaxed text-slate-500 ${PROSE}`}>{p.sub}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-500 dark:border-slate-700 ${FOCUS}`}
          >닫기
          </button>
        </div>
        {p.note && (
          <p className={`mt-2 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/50 ${PROSE}`}>{p.note}
          </p>
        )}
      </div>

      {/* ──  종료 공지가 있으면 무엇보다 먼저 ──
          주제 단위 frozen 은 데이터셋 단위보다 우선한다. 통계가 없어서가 아니라
          '활동이 끝나서 없다'는 것을 먼저 말해야 한다. */}
      {p.frozen.map(f => {
        const n = notice(f.since, 'frozen', f.reason)
        return (
          <div key={f.topic} className={`overflow-hidden ${CARD}`}>
            <div className={`flex items-center gap-2 p-3 ${TONE.violet.band}`}>
              <AsOfPill level="frozen" />
              <span className={`text-sm font-semibold ${TONE.violet.text} ${PROSE}`}>
                {f.region} — {f.topic === 'econ.kaesong' ? '개성공단' : f.topic === 'econ.kumgang' ? '금강산 관광' : f.topic}
              </span>
            </div>
            <div className="p-3">
              <AsOfLine n={n} verbose />
            </div>
          </div>
        )
      })}

      {/* ── 날씨 ── */}
      <Block
        tag="관측"
        tone="slate"
        title="최근 확인된 기상 관측"
        sub={`실시간 관측 + NOAA 관측지점 ${p.weather.length}곳`}
      >
        {/* ① 지금 — 브라우저가 직접 부른다. 기상만은 실시간이어야 as-of 가 지켜진다. */}
        <div className="mb-3">
          <LiveWeatherRows names={membersOf(sel, pack.region)} />
        </div>

        {/* ② 마지막으로 확인된 지상 관측 — 실측 정지 상태를 감추지 않는다 */}
        {p.weather.length === 0 ? (
          <p className={`text-sm text-slate-600 dark:text-slate-300 ${PROSE}`}>이 구역에 현행 관측지점이 없습니다.</p>
        ) : (
          <>
            <ul className="space-y-1">
              {p.weather.map(w => (
                <li key={`${w.station}-${w.date}`} className="flex items-baseline justify-between gap-2 border-b border-slate-100 py-1.5 last:border-0 dark:border-slate-800">
                  <span className={`text-sm text-slate-600 dark:text-slate-300 ${PROSE}`}>
                    {w.station}
                    <span className="ml-1 text-[11px] text-slate-400">{ymdKo(w.date)} 관측</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <b className="text-base font-semibold tabular-nums text-slate-900 dark:text-white">{nf1(w.tempC)}℃</b>
                    <span className="ml-1 text-[11px] tabular-nums text-slate-400">최고 {nf1(w.maxC)} · 최저 {nf1(w.minC)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <AsOfLine n={wxNotice} verbose />
            </div>
            <p className={`mt-2 text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>
              {pack.region.meta.weather.asOfNote}
            </p>
            <p className="mt-1.5">
              <span className="text-[11px] text-slate-400">출처 NOAA Global Summary of the Day · </span>
              <OutLink href="https://www.ncei.noaa.gov/data/global-summary-of-the-day/">원본 데이터</OutLink>
            </p>
          </>
        )}
      </Block>

      {/* ── 이산가족: 이 지역이 고향인 생존 신청자 ── */}
      <Block
        tag="이산가족"
        tone="blue"
        title="이 지역이 고향인 생존 신청자"
        sub={p.isanKey ? `이산가족 출신지 축 「${p.isanKey.name}」 기준` : '대응하는 출신지 항목이 없습니다'}
      >
        {originEntry ? (
          <>
            <p className={`text-3xl font-semibold tabular-nums text-slate-900 dark:text-white`}>
              {nf(originEntry.n)}
              <span className="ml-1 text-base font-medium text-slate-500">명</span>
              <span className="ml-2 text-sm font-medium text-slate-400">전체 생존자의 {nf1(originEntry.pct)}%</span>
            </p>
            <div className="mt-2">
              <AsOfLine n={isanNotice} verbose />
            </div>
            <p className="mt-1.5">
              <span className="text-[11px] text-slate-400">통일부 「{isan.latest.title}」 ({isan.latest.postedAt} 게시) ·{' '}
              </span>
              <OutLink href={isan.latest.attachment}>공표 원문(HWP)</OutLink>
              <span className="text-[11px] text-slate-400"> · </span>
              <OutLink href={isan.latest.boardUrl}>게시판 {nf(isan.latest.boardTotalPosts)}건</OutLink>
            </p>

            {/*  같은 통계인데 채널이 둘이고 기준일이 9개월 다르다 — 이 화면이 보여주려는 것 */}
            {monthlyRows.length > 1 && (
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className={`text-sm font-medium text-slate-700 dark:text-slate-200 ${PROSE}`}>월별 추이 — 공공데이터포털 등록현황 CSV
                </p>
                <Spark rows={monthlyRows} label={`${p.isanKey?.name ?? p.title} 출신 생존자`} />
                <div className="mt-2">
                  <AsOfLine n={csvNotice} />
                </div>
                <p className={`mt-1.5 rounded-lg bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-100 ${PROSE}`}>위 <b className="font-semibold">{nf(originEntry.n)}명({ymKo(isan.latest.asOf)})</b>과 이 그래프의 마지막 값
                  <b className="font-semibold"> {nf(monthlyRows.at(-1)?.v)}명({ymKo(csvAsOf)})</b>은
                  <b className="font-semibold"> 같은 통계의 서로 다른 공표 채널</b>입니다.
                  파일데이터(포털)가 게시판 공표보다 {gapText(Math.round((new Date(isan.latest.asOf).getTime() - new Date(csvAsOf).getTime()) / 864e5))} 뒤처져 있어
                  두 값을 한 문장에 섞어 쓰면 기준일이 깨집니다.
                </p>
                <p className="mt-1.5">
                  <span className="text-[11px] text-slate-400">출처 {isan.sources[0]?.name} · 자료 기준일 {isan.sources[0]?.asOf} ·{' '}
                  </span>
                  <OutLink href={isan.sources[0]?.landing}>원본 데이터</OutLink>
                </p>
              </div>
            )}

            <p className={`mt-3 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/50 ${PROSE}`}>이산가족 출신지는 <b className="font-medium">광복 당시 구행정구역</b> 7종으로만 공표됩니다.
              {p.kind === 'modern' && (() => {
                const names = membersOf({ mode: 'old', id: p.isanKey!.key }, pack.region).join('·')
                return ` 그래서 현행 ${names}${josa(names, '은', '는')} 같은 값(${p.isanKey!.name})을 공유합니다.`
              })()}
              {' '}또한 이 7종의 합({nf(isan.latest.survivors.byOrigin.entries.filter(e => e.label !== '기타').reduce((s, e) => s + e.n, 0))}명)은
              전체 생존자 {nf(isan.latest.survivors.total)}명보다 작습니다 — 「기타」가
              {' '}{nf(isan.latest.survivors.byOrigin.entries.find(e => e.label === '기타')?.n)}명({nf1(isan.latest.survivors.byOrigin.entries.find(e => e.label === '기타')?.pct)}%)이라
              지역별 비율의 분모로 쓸 수 없습니다.
            </p>
          </>
        ) : (
          <p className={`text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>이산가족 출신지 공표 항목에 이 구역에 대응하는 분류가 없습니다.
          </p>
        )}
      </Block>

      {/* ── 탈북민 재북 출신지 ── */}
      <Block tag="탈북민" tone="blue" title="이 지역이 재북 출신지인 탈북민" sub="입국 누적 인원">
        {p.defector && defNotice ? (
          <>
            <p className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-white">
              {nf(p.defector.total)}
              <span className="ml-1 text-base font-medium text-slate-500">명</span>
            </p>
            <div className="mt-2 space-y-0">
              <StatRow label="남" value={`${nf(p.defector.male)}명`} />
              <StatRow label="여" value={`${nf(p.defector.female)}명`} />
            </div>
            <p className={`mt-2 text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>
              {p.defector.cumulativeSince.slice(0, 4)}년 이후 누적{p.defectorMissing.length ? ` · ${p.defectorMissing.join('·')}는 이 축에 별도 항목이 없습니다` : ''}
            </p>
            <div className="mt-2">
              <AsOfLine n={defNotice} verbose />
            </div>
            <p className="mt-1.5">
              <span className="text-[11px] text-slate-400">출처 통일부 북한이탈주민 재북 출신지역별 현황 · </span>
              <OutLink href="https://www.data.go.kr/data/15090949/fileData.do">원본 데이터</OutLink>
            </p>
          </>
        ) : (
          <p className={`text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>공표 출신지 13개 축에 이 지역 항목이 없습니다{p.title === '라선' ? ' (역사적으로 함경북도에 포함됩니다)' : ''}.
            없다는 뜻이 아니라 <b className="font-medium">이 분류로는 집계되지 않았다</b>는 뜻입니다.
          </p>
        )}
      </Block>

      {/* ── 이 지역의 기록 ── */}
      <Block
        tag="기록"
        tone="blue"
        title="이 지역의 공식 기록"
        sub={`통일부 자료에서 이 지역이 언급된 건수`}
      >
        <div className="grid grid-cols-2 gap-x-4">
          <StatRow label="남북관계 연표" value={`${nf(p.eventsTotal)}건`} />
          <StatRow label="보도·설명자료" value={`${nf(p.briefings)}건`} />
          <StatRow label="북한 동향" value={`${nf(p.trends)}건`} />
          <StatRow label="북한개황 문서" value={`${nf(p.overviews)}건`} />
        </div>

        <div className="mt-3">
          <AsOfLine n={recNotice} />
        </div>

        {p.events.length > 0 ? (
          <>
            <p className={`mt-4 text-sm font-medium text-slate-700 dark:text-slate-200 ${PROSE}`}>최근 사건 (최신순 · 상위 {nf(p.events.length)}건 수록)
            </p>
            <ol className="relative mt-2 ml-1 space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
              {events.map((e, i) => (
                <li key={`${e.date}-${i}`} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-slate-900" aria-hidden="true" />
                  <time className="text-[11px] font-medium tabular-nums text-slate-500" dateTime={e.date}>{e.date}</time>
                  <p className={`text-sm leading-relaxed text-slate-800 dark:text-slate-100 ${PROSE}`}>{clean(e.title)}</p>
                </li>
              ))}
            </ol>
            {p.events.length > 8 && (
              <button
                type="button"
                onClick={() => setAllEvents(v => !v)}
                className={`mt-3 w-full rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-600 dark:border-slate-800 dark:text-slate-300 ${FOCUS}`}
              >
                {allEvents ? '접기' : `나머지 ${nf(p.events.length - 8)}건 더 보기`}
              </button>
            )}
            {p.eventsTotal > p.events.length && (
              <p className={`mt-2 text-[11px] leading-relaxed text-slate-400 ${PROSE}`}>전체 {nf(p.eventsTotal)}건 중 최신 {nf(p.events.length)}건만 이 화면에 수록돼 있습니다.
                나머지는 사실은ON 검색에서 확인할 수 있습니다.
              </p>
            )}
          </>
        ) : (
          <p className={`mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>날짜가 확인되는 연표 기록이 없습니다.
          </p>
        )}

        <div className="mt-4 space-y-1 border-t border-slate-100 pt-2.5 dark:border-slate-800">
          <p className="text-[11px] text-slate-400">연표·보도자료 —{' '}
            <OutLink href="https://www.data.go.kr/data/15090949/fileData.do">공공데이터포털</OutLink>
          </p>
          <p className="text-[11px] text-slate-400">동향·북한개황 —{' '}
            <OutLink href="https://nkinfo.unikorea.go.kr">북한정보포털</OutLink>
          </p>
          <p className={`mt-1 leading-relaxed text-[11px] text-slate-400 ${PROSE}`}>지역 귀속은 지역명·도시명 문자열 매칭 결과입니다. {pack.region.meta.matching.caveats[0]}
          </p>
        </div>

        <p className="mt-3">
          <Link to={`/factcheck?q=${encodeURIComponent(p.title.replace(/\(구\)$/, ''))}`} className={`inline-flex items-center gap-1 rounded text-sm font-medium text-blue-700 underline underline-offset-2 dark:text-blue-400 ${FOCUS}`}>사실은ON에서 「{p.title}」 검색하기 →
          </Link>
        </p>
      </Block>
    </div>
  )
}

/* ══════════════════════ 소멸 시계 ══════════════════════
   실측(2017-07~2025-08 등록현황 CSV 98개월 + 2026-03~05 공표 HWP 3개월)과
   추계(2026~2050)를 한 축 위에 올린다.
    추계는 통일부 공표 통계가 아니라 이 시제품의 계산 결과다 — 선 모양·배지·각주 3중으로 구분한다. */

function ExtinctionClock({ isan, proj }: { isan: IsanData; proj: ProjData }) {
  const W = 960, H = 340
  const PAD = { l: 62, r: 20, t: 20, b: 40 }
  const X0 = 2017.4, X1 = 2050.7
  const Y1 = 62000

  const tOf = (iso: string) => {
    const m = iso.match(/^(\d{4})-(\d{2})/)
    return m ? Number(m[1]) + (Number(m[2]) - 1) / 12 : NaN
  }
  const x = (t: number) => PAD.l + ((t - X0) / (X1 - X0)) * (W - PAD.l - PAD.r)
  const y = (v: number) => H - PAD.b - (v / Y1) * (H - PAD.t - PAD.b)

  const csv = isan.monthly.map(m => ({ t: tOf(m.month), v: m.total }))
  const hwp = [...(isan.latest.previousMonths ?? []), isan.latest]
    .map(s => ({ t: tOf(s.asOf), v: s.survivors.total, asOf: s.asOf }))
    .sort((a, b) => a.t - b.t)
  const fut = proj.byYear.map(r => ({ t: tOf(r.asOf), lo: r.expected, hi: r.expectedCalibrated }))

  const path = (pts: Array<{ t: number; v: number }>) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')

  const bandPath =
    fut.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.hi).toFixed(1)}`).join(' ') +
    ' ' +
    [...fut].reverse().map(p => `L${x(p.t).toFixed(1)},${y(p.lo).toFixed(1)}`).join(' ') +
    ' Z'

  const yTicks = [0, 10000, 20000, 30000, 40000, 50000, 60000]
  const xTicks = [2020, 2025, 2030, 2035, 2040, 2045, 2050]

  /* 1만 명 하회 구간 — 원값 시나리오(빠른 쪽)와 교정 시나리오(느린 쪽)의 두 해 사이 */
  const [m10a, m10b] = proj.milestoneRange.below10000.split('~').map(Number)
  const seam = tOf(isan.latest.asOf)

  return (
    <section className={`overflow-hidden ${CARD}`}>
      <div className={`flex items-start gap-2.5 p-4 ${TONE.slate.band}`}>
        <ClauseTag>추계</ClauseTag>
        <div className="min-w-0 flex-1">
          <h2 className={`text-base font-semibold leading-snug text-slate-900 dark:text-white ${PROSE}`}>
            <span aria-hidden="true"></span> 소멸 시계 — 고향을 기억하는 사람이 남아 있는 시간
          </h2>
          <p className={`mt-0.5 text-sm leading-relaxed text-slate-500 ${PROSE}`}>실측 {nf(isan.monthly.length)}개월(2017~2025) + 공표 3개월(2026) 위에 생잔 추계를 얹은 것입니다.
          </p>
        </div>
        <span className="ml-auto shrink-0 self-center rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:border-slate-600 dark:text-slate-400">공식 통계 아님 · 계산 결과
        </span>
      </div>

      <div className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <p className="text-[11px] text-slate-500">공표 생존자 ({ymKo(proj.headline.asOf)})</p>
            <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{nf(proj.headline.survivors)}명</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <p className="text-[11px] text-slate-500">2040년 전망 (범위)</p>
            <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{proj.headline.survivors2040}명</p>
          </div>
          <div className="rounded-xl bg-blue-50 p-3 dark:bg-blue-950/30">
            <p className="text-[11px] text-blue-700 dark:text-blue-300">1만 명 하회 전망</p>
            <p className="text-2xl font-semibold tabular-nums text-blue-800 dark:text-blue-200">{proj.headline.below10000Year}년</p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full min-w-[560px]"
            role="img"
            aria-label={`이산가족 생존 신청자 추이와 전망. 2017년 7월 ${nf(isan.monthly[0]?.total)}명에서 ${ymKo(isan.latest.asOf)} ${nf(isan.latest.survivors.total)}명으로 줄었고, 추계로는 ${proj.milestoneRange.below10000}년에 1만 명을 밑돌 것으로 계산됩니다.`}
          >
            {/* 가로 눈금 */}
            {yTicks.map(v => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth={1} />
                <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="text-[13px] tabular-nums fill-slate-400">
                  {v === 0 ? '0' : `${v / 10000}만`}
                </text>
              </g>
            ))}
            {xTicks.map(t => (
              <text key={t} x={x(t)} y={H - PAD.b + 20} textAnchor="middle" className="text-[13px] tabular-nums fill-slate-400">
                {t}
              </text>
            ))}

            {/* 1만 명 기준선 + 하회 구간 */}
            <rect x={x(m10a)} y={PAD.t} width={Math.max(2, x(m10b) - x(m10a))} height={H - PAD.t - PAD.b} className="fill-blue-500/10" />
            <line x1={PAD.l} x2={W - PAD.r} y1={y(10000)} y2={y(10000)} className="stroke-blue-500" strokeWidth={1.5} strokeDasharray="6 4" />
            <text x={x(m10b) + 6} y={y(10000) - 8} className="text-[13px] font-semibold fill-blue-700 dark:fill-blue-300">
              1만 명 하회 {proj.milestoneRange.below10000}
            </text>

            {/* 추계 범위 밴드 */}
            <path d={bandPath} className="fill-slate-400/25" />
            <path d={path(fut.map(p => ({ t: p.t, v: p.lo })))} fill="none" className="stroke-slate-500 dark:stroke-slate-400" strokeWidth={2} strokeDasharray="7 5" />
            <path d={path(fut.map(p => ({ t: p.t, v: p.hi })))} fill="none" className="stroke-slate-500 dark:stroke-slate-400" strokeWidth={2} strokeDasharray="7 5" />

            {/* 실측 — 등록현황 CSV */}
            <path d={path(csv)} fill="none" className="stroke-blue-600 dark:stroke-blue-400" strokeWidth={2.5} strokeLinejoin="round" />

            {/* 실측 — 공표 HWP 3개월 (다른 채널이므로 이어 붙이지 않고 점으로 찍는다) */}
            {hwp.map(p => (
              <circle key={p.asOf} cx={x(p.t)} cy={y(p.v)} r={3.5} className="fill-blue-700 stroke-white dark:fill-blue-300 dark:stroke-slate-900" strokeWidth={1.2} />
            ))}

            {/* 실측 / 추계 경계 */}
            <line x1={x(seam)} x2={x(seam)} y1={PAD.t} y2={H - PAD.b} className="stroke-slate-400" strokeWidth={1} strokeDasharray="3 3" />
            <text x={x(seam) - 6} y={PAD.t + 12} textAnchor="end" className="text-[12px] fill-slate-500">← 실측</text>
            <text x={x(seam) + 6} y={PAD.t + 12} className="text-[12px] fill-slate-500">추계 →</text>

            <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="stroke-slate-300 dark:stroke-slate-700" strokeWidth={1} />
          </svg>
        </div>

        {/* 범례 */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
            <svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" className="stroke-blue-600 dark:stroke-blue-400" strokeWidth="2.5" /></svg>실측 — 등록현황 CSV (2017.7~{ymKo(isan.monthly.at(-1)?.month)})
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
            <svg width="22" height="8" aria-hidden="true"><circle cx="11" cy="4" r="3.5" className="fill-blue-700 dark:fill-blue-300" /></svg>실측 — 공표 HWP 3개월 (2026.3~5)
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
            <svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" className="stroke-slate-500" strokeWidth="2" strokeDasharray="7 5" /></svg>추계 범위 (생명표 원값 ~ 실측 교정)
          </span>
        </div>

        {/* 이정표 */}
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {([['2만 명', proj.milestoneRange.below20000], ['1만 명', proj.milestoneRange.below10000],
            ['5천 명', proj.milestoneRange.below5000], ['1천 명', proj.milestoneRange.below1000]] as const).map(([k, v]) => (
            <div key={k} className="rounded-xl border border-slate-200 p-2.5 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">{k} 하회 전망</p>
              <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{v}년</p>
            </div>
          ))}
        </div>

        {/* 각주 — 가정·출처 */}
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className={`text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>
            <b className="font-semibold text-slate-600 dark:text-slate-300">방법</b> — {proj.method.summary}
          </p>
          <p className={`mt-1 text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>
            <b className="font-semibold text-slate-600 dark:text-slate-300">두 시나리오</b> — 위쪽 선: {proj.method.scenarios.expectedCalibrated} /
            아래쪽 선: {proj.method.scenarios.expected} · {proj.milestoneRange.note}
          </p>
          <details className="mt-2">
            <summary className={`cursor-pointer list-none text-[11px] font-medium text-blue-600 dark:text-blue-400 [&::-webkit-details-marker]:hidden ${FOCUS}`}>가정 {proj.assumptions.length}가지 전부 보기 ▾
            </summary>
            <ul className="mt-1.5 space-y-1">
              {proj.assumptions.map((a, i) => (
                <li key={i} className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>· {a}</li>
              ))}
            </ul>
          </details>
          <p className={`mt-2 text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>생명표: {proj.sources[0]?.name} (표 {proj.lifeTable.tblId} · {proj.lifeTable.year}년 · 최종수정 {proj.lifeTable.published}) ·{' '}
            <OutLink href={proj.sources[0]?.url}>원본 데이터</OutLink>
            {' · '}기준 인원: 통일부 이산가족 신청 현황 {proj.headline.asOf} ·{' '}
            <OutLink href={isan.latest.attachment}>공표 원문</OutLink>
          </p>
          <p className={`mt-1.5 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/50 ${PROSE}`}><b className="font-medium">이 곡선의 미래 구간은 통일부가 발표한 값이 아니라 본 시제품이 계산한 추계</b>입니다.
            {proj.headline.note}
          </p>
        </div>
      </div>
    </section>
  )
}

/* ══════════════════════ 페이지 ══════════════════════ */

/* ══════════════════════ 후손 다리 ══════════════════════

   소멸 시계가 "언제까지 남아 있는가"를 말한다면, 이 층은 "그 다음은 누구인가"를 말한다.

   왜 이 층이 정당한가 — 우리가 만들고 싶어서가 아니라, **통일부 자신의 조사가 요구했다**:
     · 이산가족이 1순위로 원한 사업 = 「사진·물건 등 기록물 수집 보존」 59.9%
     · 위로사업 2위 = 「고향 관련 사진·영상의 수집·제작, 전시」 44.5%
     · 유전자검사 사업은 2025년부터 2~3세대 후손을 대상에 넣었다(사후 가족관계 확인 목적)
   즉 정책은 이미 후손을 향해 있는데, 후손이 접속할 화면이 없다.

    데이터 정직성 — 후손 문항은 **후손 본인 조사가 아니다.**
     자손이 있는 1세대 4,042명이 자기 자손을 평가한 값이다. 화면에 그대로 밝힌다.
     그 한계를 감추면 이 층 전체가 근거를 잃는다. */

function GapBar({ g }: { g: DescGap }) {
  const hi = Math.max(g.a.pct, g.b.pct)
  const w = (v: number) => `${Math.max(2, (v / Math.max(hi, 1)) * 100)}%`
  /* 두 막대는 **같은 축**에서 길이로 비교돼야 의미가 생긴다.
     위(a)는 청록 = 하고 싶다는 쪽, 아래(b)는 먹색 = 실제 쪽.
     색만으로 가르지 않고 라벨에 같은 도형을 붙여 흑백에서도 짝이 보이게 한다. */
  return (
    <li className={`border-b py-3.5 last:border-0 ${SURFACE.hair}`}>
      <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>{g.title}</p>
      <div className="mt-2.5 space-y-1.5">
        {([[g.a, 'bg-[#1a4e9c] dark:bg-[#7aa9e8]', '◆'], [g.b, 'bg-[#b6bcc5] dark:bg-[#39414c]', '◇']] as const).map(([row, color], i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className={`w-14 shrink-0 text-right ${TYPE.figureSm} ${TEXT.ink}`} style={{ fontSize: '1.0625rem' }}>
              {nf1(row.pct)}%
            </span>
            <span className={`h-3 min-w-0 flex-1 overflow-hidden rounded-full ${SURFACE.inset}`}>
              <span className={`block h-full rounded-full ${color}`} style={{ width: w(row.pct) }} />
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 space-y-0.5">
        <p className={`${TYPE.cap} ${TEXT.blue} ${PROSE}`}>◆ {g.a.label}</p>
        <p className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>◇ {g.b.label}</p>
      </div>
      <p className={`mt-2 rounded-xl border-l-[3px] border-[#1a4e9c] bg-[#eef3fb] px-3 py-2 ${TYPE.cap} ${TEXT.soft} dark:border-[#7aa9e8] dark:bg-[#16202c] ${PROSE}`}>
        <b className={`font-semibold tabular-nums ${TEXT.blue}`}>{g.gapPp > 0 ? '+' : ''}{nf1(g.gapPp)}%p</b> — {g.reading}
      </p>
    </li>
  )
}

function DescendantBridge({ desc, isan }: { desc: DescData; isan: IsanData }) {
  const [openAssume, setOpenAssume] = useState(false)
  const x = desc.descendants.wantsCrossGenerationExchange
  const alive = isan.latest.overview.cumulative.alive

  return (
    <Block
      tag="후손"
      tone="blue"
      title="후손 다리 — 1세대가 떠난 뒤 이 기록은 누구의 것인가"
      sub={`${desc.survey.name} · 심층 ${nf(desc.survey.bases.deep)}명 (${desc.survey.publishedAt} 공표)`}
    >
      {/* ── 반전: 후손이 1세대보다 더 원한다 ── */}
      <div className={`${SURFACE.slab} p-4`}>
        <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>
          1세대 사후, 자손 세대끼리 교류하기를 바라는가
        </p>
        <div className="mt-3 grid grid-cols-2 gap-4">
          {([['이산 1세대', x.gen1, TEXT.faint], ['후손 세대', x.descendants, TEXT.blue]] as const).map(([label, v, cls]) => (
            <div key={label}>
              <p className={`${TYPE.cap} ${TEXT.faint}`}>{label}</p>
              <p className={`mt-0.5 ${TYPE.figureSm} ${cls}`}>{nf1(v)}%</p>
            </div>
          ))}
        </div>
        <p className={`mt-3 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
          {x.note}(<b className={`font-semibold tabular-nums ${TEXT.blue}`}>{nf1(x.descendants - x.gen1)}%p</b> 차이).
          {' '}<b className={`font-semibold ${TEXT.ink}`}>문제는 후손의 무관심이 아닙니다</b> — 이어받을 수단이 없는 것입니다.
        </p>
      </div>

      {/* ── 간극 3종 ── */}
      <p className={`mt-5 ${TYPE.eyebrow} ${TEXT.faint} ${PROSE}`}>세대 간극 3종</p>
      <ul className="mt-1">
        {desc.gaps.map(g => <GapBar key={g.id} g={g} />)}
      </ul>

      {/* ── 통일부 조사가 요구한 사업 ── */}
      <div className={`mt-4 ${SURFACE.card} p-4`}>
        <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>이산가족이 1순위로 요청한 사업
        </p>
        <ul className="mt-2 space-y-1.5">
          {desc.recordPrograms.기록및공감대.map((r, i) => (
            <li key={r.label} className="flex items-baseline gap-2">
              <span className={`w-14 shrink-0 text-right text-[1.0625rem] font-semibold tabular-nums ${i === 0 ? TEXT.blue : TEXT.faint}`}>
                {nf1(r.pct)}%
              </span>
              <span className={`${TYPE.sub} ${i === 0 ? 'font-medium ' + TEXT.ink : TEXT.soft} ${PROSE}`}>
                {r.label}
              </span>
            </li>
          ))}
        </ul>
        <p className={`mt-3 ${TYPE.cap} ${TEXT.soft} ${PROSE}`}>
          {(() => {
            const w = desc.recordPrograms.위로사업[1]
            if (!w) return null
            return <>위로사업에서도 「{w.label}」{josa(w.label, '이', '가')} {nf1(w.pct)}%로 2위입니다.</>
          })()}
          {' '}<b className="font-medium">이 화면이 하는 일이 곧 그 요청입니다</b> — 우리가 고른 주제가 아니라 이산가족이 고른 주제입니다.
        </p>
      </div>

      {/* ── 규모 ── */}
      <div className={`mt-3 ${SURFACE.inset} p-4`}>
        <p className={`${TYPE.body} ${TEXT.soft} ${PROSE}`}>이건 <b className="font-semibold tabular-nums">{nf(alive)}명</b>의 문제가 아닙니다.
          {' '}1세대 누계 {nf(desc.scale.gen1Cumulative)}명 중 {nf1(desc.scale.withDescendantsRate)}%가 자손을 두었으니,
          {' '}<b className="font-semibold">{desc.scale.estimate.phrase}</b>입니다.
        </p>
        <button
          type="button"
          onClick={() => setOpenAssume(v => !v)}
          className={`mt-2.5 ${TYPE.cap} font-medium underline decoration-dotted underline-offset-2 ${TEXT.blue} ${FOCUS}`}
          aria-expanded={openAssume}
        >이 추정의 가정 {desc.scale.assumptions.length}가지 {openAssume ? '접기 ▴' : '보기 ▾'}
        </button>
        {openAssume && (
          <ul className="mt-2 space-y-1">
            {desc.scale.assumptions.map((a, i) => (
              <li key={i} className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>· {a}</li>
            ))}
          </ul>
        )}
        <p className={`mt-3 ${TYPE.cap} ${TEXT.stale} ${PROSE}`}>후손 규모는 <b className="font-medium">공표값이 아니라 추정</b>입니다. 범위로만 읽어야 합니다.
        </p>
      </div>

      {/* ── 데이터 한계 — 감추면 이 층이 무너진다 ── */}
      <div className={`mt-3 rounded-xl border ${ASOF.stale.edge} ${ASOF.stale.band} p-4`}>
        <p className={`${TYPE.eyebrow} ${TEXT.stale} ${PROSE}`}>이 수치를 읽을 때 반드시 알아야 할 것</p>
        <ul className="mt-1 space-y-1">
          {desc.caveats.map((c, i) => (
            <li key={i} className={`${TYPE.cap} ${TEXT.soft} ${PROSE}`}>· {c}</li>
          ))}
        </ul>
      </div>

      <p className="mt-3">
        <span className={`${TYPE.cap} ${TEXT.faint}`}>출처 {desc.sources[0]?.name} · </span>
        <OutLink href={desc.sources[0]?.url}>보도자료 원문</OutLink>
        {desc.sources[1]?.url && (
          <>
            <span className={`${TYPE.cap} ${TEXT.faint}`}> · </span>
            <OutLink href={desc.sources[1].url}>요약자료(인포그래픽)</OutLink>
          </>
        )}
      </p>
    </Block>
  )
}

export default function GohyangOn() {
  const [pack, setPack] = useState<Pack | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('old')
  const [sel, setSel] = useState<Sel | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  /* 데이터는 scripts/nk-gohyang-pack.mjs 가 public/gohyang/ 로 복사해 둔 것을 받는다.
     4개 파일 합계 약 450KB — 검색 인덱스(13.5MB)와 달리 통째로 받아도 부담이 없다.
     하나라도 실패하면 화면을 절반만 그리지 않고 오류를 말한다(없는 값을 0으로 그리면 거짓말이 된다). */
  useEffect(() => {
    let alive = true
    const grab = (n: string) =>
      fetch(`${PACK}/${n}.json`).then(r => {
        if (!r.ok) throw new Error(`${n}.json 로드 실패 (${r.status})`)
        return r.json()
      })
    Promise.all([grab('map'), grab('region'), grab('isan'), grab('projection'), grab('descendant')])
      .then(([map, region, isan, proj, desc]) => { if (alive) setPack({ map, region, isan, proj, desc }) })
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

  function select(s: Sel) {
    setSel(s)
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      window.setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
    }
  }

  /* 선택 전 안내에 쓸 상위 지역 — 아무 데이터도 만들지 않고 실측 상위만 고른다 */
  const topOld = useMemo(() => {
    if (!pack) return []
    const byOrigin = new Map(pack.isan.latest.survivors.byOrigin.entries.map(e => [e.label, e.n]))
    return pack.map.regionsOld
      .map(o => {
        const m = Object.keys(pack.region.regions).find(k => pack.region.regions[k].isanOrigin?.key === o.id)
        const key = m ? pack.region.regions[m].isanOrigin?.latestKey : undefined
        return { id: o.id, name: o.name, n: key ? (byOrigin.get(key) ?? 0) : 0 }
      })
      .sort((a, b) => b.n - a.n)
      .slice(0, 4)
  }, [pack])

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
      {/* ── 표제 ──
          예전 머리글은 기능 설명("지도 위에서 읽는 자료의 기준일")으로 시작했다.
          그건 만든 사람의 관심사다. 화면을 여는 사람에게 먼저 와야 하는 것은
          **남은 사람이 몇 명인가**다. 수치를 주인공으로 올린다. */}
      <header className={PROSE}>
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>통일부 공공데이터 · 이산가족과 고향</p>

        <h1 className={`mt-3 ${TYPE.h1} ${TEXT.ink}`}>고향을 기억하는 사람이<br className="hidden sm:block" />
          {' '}
          <span className="whitespace-nowrap">
            <span className={`${TYPE.figure} ${TEXT.stale} align-baseline`}>
              {nf(pack.isan.latest.overview.cumulative.alive)}
            </span>
            <span className={`ml-1 ${TYPE.h2} ${TEXT.ink}`}>명</span>
          </span>
          {' '}남았습니다
        </h1>

        <p className={`mt-3 max-w-2xl ${TYPE.body} ${TEXT.soft}`}>
          {ymKo(pack.isan.latest.asOf)} 기준 이산가족 생존 신청자 수입니다.
          평균 나이는 <b className={`font-semibold ${TEXT.ink}`}>{nf1(pack.isan.monthly.at(-1)?.avgAge)}세</b>이고,
          {' '}추계로는 <b className={`font-semibold ${TEXT.ink}`}>{pack.proj.milestoneRange.below10000}년</b>에 1만 명을 밑돕니다.
        </p>
        <p className={`mt-1.5 max-w-2xl ${TYPE.sub} ${TEXT.faint}`}>아래 지도에서 고향을 누르면 그곳의 이산가족·탈북민·공식 기록·오늘 날씨가 한자리에 모입니다.
          네 계열의 기준일이 서로 다르며, 그 차이를 숨기지 않고 함께 표시합니다.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link to="/factcheck" className={BTN.primary}>지도에 없는 것은 물어보세요
          </Link>
          <a href="#extinction" className={BTN.ghost}>소멸 시계 보기 <span aria-hidden="true">↓</span>
          </a>
          <a href="#descendant" className={BTN.ghost}>후손 다리 <span aria-hidden="true">↓</span>
          </a>
        </div>
      </header>

      {/* ── 지도 + 패널 ── */}
      <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0">
          <div className={`overflow-hidden ${CARD}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3 dark:border-slate-800">
              <div role="group" aria-label="지도 종류" className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                {([['modern', '현행 행정구역'], ['old', '고향 지도 (광복 당시)']] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => switchMode(k)}
                    aria-pressed={mode === k}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${FOCUS} ${
                      mode === k
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">지역 위에 커서를 올리면 요약, 누르면 상세</p>
            </div>

            <div className="p-3">
              <NkMapView pack={pack} mode={mode} sel={sel} onSelect={select} />
            </div>

            <div className="border-t border-slate-100 px-3 py-2.5 dark:border-slate-800">
              <p className={`text-[11px] leading-relaxed text-slate-400 ${PROSE}`}>
                {mode === 'old' ? (
                  <>구역 안의 가는 선은 <b className="font-medium">현행 도 경계</b>입니다 — 구행정구역 폴리곤이 따로 없어 현행 구역을 묶어 근사한 것입니다.
                    {' '}미수복경기는 개성 위치의 <b className="font-medium">원형 마커</b>로 대신했습니다(별도 지오메트리 없음). {pack.map.crosswalk.note}
                  </>
                ) : (
                  <>남포·개성은 이 지오메트리 판본에 별도 폴리곤이 없어 <b className="font-medium">도시 점</b>으로 표시했습니다(각각 평안남도·황해북도 폴리곤에 포함).
                    {' '}검은 점은 주요 도시이며, 누르면 소속 지역이 열립니다.
                  </>
                )}
              </p>
              <p className={`mt-1 text-[11px] leading-relaxed text-slate-400 ${PROSE}`}>지도 지오메트리 — {pack.map.sources[0]?.name} ({pack.map.sources[0]?.license}) ·{' '}
                <OutLink href={pack.map.sources[0]?.url}>원본 데이터</OutLink>
              </p>
            </div>
          </div>
        </div>

        {/* ── 우측(모바일은 아래) 패널 ── */}
        <div ref={panelRef} className="mt-4 min-w-0 lg:mt-0">
          {sel ? (
            <RegionPanel pack={pack} sel={sel} onClose={() => setSel(null)} />
          ) : (
            <div className={`${CARD} p-4`}>
              <p className={`text-base font-semibold text-slate-900 dark:text-white ${PROSE}`}>지역을 선택하세요
              </p>
              <p className={`mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>지도에서 지역을 누르면 이 자리에 그 지역의 이산가족·탈북민·공식 기록·기상 관측이 기준일과 함께 표시됩니다.
              </p>
              <p className={`mt-4 text-sm font-medium text-slate-700 dark:text-slate-200 ${PROSE}`}>이산가족 생존 신청자가 많은 고향 ({ymKo(pack.isan.latest.asOf)} 기준)
              </p>
              <ul className="mt-2 space-y-1.5">
                {topOld.map(o => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => { setMode('old'); select({ mode: 'old', id: o.id }) }}
                      className={`flex w-full items-baseline justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left dark:border-slate-800 ${FOCUS}`}
                    >
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{o.name}</span>
                      <span className="text-sm font-semibold tabular-nums text-blue-700 dark:text-blue-400">{nf(o.n)}명</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className={`mt-3 text-[11px] leading-relaxed text-slate-400 ${PROSE}`}>
                「기타」 {nf(pack.isan.latest.survivors.byOrigin.entries.find(e => e.label === '기타')?.n)}명은
                공표 출신지 7종에 속하지 않아 지도에 표시할 수 없습니다.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── 소멸 시계 (지도 아래, 전폭) ── */}
      <div id="extinction" className="mt-8 scroll-mt-24">
        <ExtinctionClock isan={pack.isan} proj={pack.proj} />
      </div>

      {/* ── 후손 다리 — 소멸 시계 바로 뒤에 온다.
             "언제까지 남아 있는가" 다음 질문이 "그 다음은 누구인가"이기 때문이다. */}
      <div id="descendant" className="mt-8 scroll-mt-24">
        <DescendantBridge desc={pack.desc} isan={pack.isan} />
      </div>

      {/* ── 이 화면이 쓴 자료 전부 ── */}
      <section className={`mt-6 overflow-hidden ${CARD}`}>
        <div className="flex items-start gap-2.5 border-b border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
          <ClauseTag>출처</ClauseTag>
          <div className="min-w-0 flex-1">
            <h2 className={`text-base font-semibold text-slate-900 dark:text-white ${PROSE}`}>이 화면이 쓴 자료와 각각의 기준일
            </h2>
            <p className={`mt-0.5 text-sm leading-relaxed text-slate-500 ${PROSE}`}>기준일이 최대 6년 넘게 벌어져 있습니다. 한 화면에 있다고 같은 시점의 값이 아닙니다.
            </p>
          </div>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {[
            { name: '이산가족 신청 현황 (월별 공표 HWP)', org: '통일부 이산가족정보통합시스템', end: pack.isan.latest.asOf, fresh: 'live' as Level, url: pack.isan.latest.boardUrl },
            { name: '남북관계 연표·보도자료·북한 동향·북한개황', org: '통일부 / 북한정보포털', end: pack.region.sources.find(s => s.coverageEnd)?.coverageEnd ?? pack.region.builtAt, fresh: 'live' as Level, url: 'https://nkinfo.unikorea.go.kr' },
            { name: '이산가족찾기 등록현황 월별 통계 (파일데이터)', org: '공공데이터포털 — 통일부', end: pack.isan.monthly.at(-1)?.month ?? '', fresh: 'live' as Level, url: pack.isan.sources[0]?.landing },
            { name: '기상 관측 (Global Summary of the Day)', org: 'NOAA NCEI', end: pack.region.meta.weather.latestObsDate, fresh: 'stale' as Level, url: 'https://www.ncei.noaa.gov/data/global-summary-of-the-day/' },
            { name: '이산가족 교류 현황 (월별 공표 HWP)', org: '통일부 이산가족정보통합시스템', end: pack.isan.exchange.asOf, fresh: 'live' as Level, url: pack.isan.exchange.boardUrl },
            { name: '북한이탈주민 재북 출신지역별 현황', org: '통일부', end: pack.region.regions['평양']?.defectorOrigin?.asOf ?? '', fresh: 'stale' as Level, url: 'https://www.data.go.kr/data/15090949/fileData.do' },
            { name: '남북이산가족 관련 연표 (파일데이터)', org: '공공데이터포털 — 통일부', end: pack.isan.chronology.at(-1)?.date ?? '', fresh: 'stale' as Level, url: pack.isan.sources[3]?.landing },
            { name: '개성공단 · 금강산 관광', org: '통일부 (주제 종료)', end: '2016-02-10', fresh: 'frozen' as Level, url: null, reason: '개성공단은 2016-02-10, 금강산 관광은 2008-07-11 이후 신규 데이터가 생성되지 않습니다.' },
          ].map(s => {
            const n = s.end ? notice(s.end, s.fresh, (s as { reason?: string }).reason) : null
            return (
              <div key={s.name} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 p-3">
                {n && <AsOfPill level={n.level as Level} size="sm" />}
                <span className={`min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200 ${PROSE}`}>
                  {s.name}
                  <span className="ml-1 text-[11px] text-slate-400">{s.org}</span>
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-slate-500">기준 {s.end || '미상'}</span>
                <OutLink href={s.url}>원본</OutLink>
              </div>
            )
          })}
        </div>
        <div className="border-t border-slate-100 p-3 dark:border-slate-800">
          <p className={`text-[11px] leading-relaxed text-slate-400 ${PROSE}`}>데이터 팩 생성일 {pack.map.builtAt} · 지도 {pack.map.builtAt} · 지역 {pack.region.builtAt} · 이산가족 {pack.isan.builtAt} · 추계 {pack.proj.builtAt}.
            북한 관련 정보 특성상 공식자료에 수록되지 않은 사실이 존재할 수 있습니다.
          </p>
        </div>
      </section>
    </div>
  )
}
