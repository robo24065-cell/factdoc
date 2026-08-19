import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, MouseEvent as ReactMouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { asOfNotice, coverageEndOf, type NkRecord, type Notice } from '../engine/nk-search.mjs'

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

/* 박물관 사료 — 통일부 남북이산가족 디지털박물관.
    이미지는 **우리가 저장하지 않는다.** 기증자 저작물이고 개방형 라이선스 표기를 확인하지 못했다.
     imageUrl 은 박물관 원본을 그대로 가리키는 문자열이고, 화면은 그 URL 을 <img> 로 참조만 한다. */
type MuseumRec = {
  iId: number
  title: string
  producedOn: string | null
  form: string | null
  donor: string | null
  imageUrl: string | null
  recordUrl: string | null
  regions: string[]
  regionCities: string[]
  regionsHistoric: string[]
  source: string
  /** 강원도로 잡혔지만 근거 지명이 금강산·장전항·갈마뿐 = 고향이 아니라 상봉 장소 */
  venueOnly: boolean
}
type MuseumData = {
  builtAt: string
  sources: Array<{ name: string; url?: string; asOf?: string; note?: string }>
  license: string
  endpoints: { image: string | null; record: string | null }
  archive: { totCnt: number | null; note?: string | null }
  records: MuseumRec[]
  byRegion: Record<string, number[]>
  byRegionHistoric: Record<string, number[]>
  meta: {
    historicToOld: Record<string, string[]>
    historicNote: string
    kangwonVenueOnly: { count: number; venueCities: string[]; note: string } | null
    caveats: string[]
    slim: { totalRecords: number; keptRecords: number; droppedRecords: number; keptRule: string }
  }
}

/* 후손이 오늘 실제로 신청할 수 있는 창구.
   actionable = ① 후손이 자기 이름으로 신청 주체가 될 수 있고 ② 창구가 실측으로 살아 있음.
   **성사 가능성은 포함하지 않는다** — 그건 note 와 gaps 가 따로 말한다. */
type PathItem = {
  id: string
  title: string
  org: string
  what: string
  eligibility: string
  eligibilityQuote?: string
  eligibilityQuote2?: string
  counterQuote?: string
  actionable: boolean
  url: string
  applyUrl?: string
  contact: string
  legalBasis?: string | null
  how?: string[]
  note?: string
}
type PathGap = { id: string; title: string; fact: string; consequence: string; evidence?: string }
type PathData = {
  builtAt: string
  sources: Array<{ name: string; url?: string; asOf?: string }>
  paths: PathItem[]
  summary: { actionableCount: number; totalPaths: number; gapCount: number; descendantEligibleCount: number; unknownCount: number; gen1OnlyCount: number }
  gaps: PathGap[]
  meta: {
    actionableCriterion: string
    eligibilityRule: string
    legalRoot: string
    checkedUrls: number
    liveUrls: number
    caveats: string[]
    measured?: { archiveNewestProducedOn?: string; counselWindows?: number; archivePublicTotal?: number }
  }
}

/* 통일의식조사 — ★ 이 계열만 통일부 자료가 아니다(서울대학교 통일평화연구원).
   화면에서 반드시 출처를 갈라 표시하고, 소멸 곡선과 나란히 놓되 인과를 주장하지 않는다. */
type OpinionRow = { label: string; values: number[] }
type OpinionSeries = {
  key: string
  titleKey: string
  topic: string
  question: string
  group: { menu: number; label: string; respondents: string; dir: string }
  unit: string
  years: number[]
  rows: OpinionRow[]
  extended?: { years: number[]; sourceByYear: Record<string, string>; rows: OpinionRow[]; note: string }
  reportSeries?: { years: number[]; asOfByYear: Record<string, string>; sampleSizeByYear: Record<string, number>; rows: OpinionRow[]; note: string }
  overlapCheck?: { years: number[]; maxAbsDiffPp: number }
  source: { xlsx: string; png: string }
}
type OpinionData = {
  builtAt: string
  sources: Array<{ name: string; url?: string; org?: string; asOf?: string; kind?: string }>
  license: string
  licenseFullText: string
  licenseUrl: string
  series: OpinionSeries[]
  headline: {
    needUnification: {
      first: { year: number; pct: number; source: string }
      last: { year: number; pct: number; source: string }
      deltaPp: number
      label: string
      /* 두 출처를 이어 붙인 값이라, 단일 출처만으로 계산한 대조값을 함께 갖고 있다 */
      infographicOnly?: { first: { year: number; pct: number }; last: { year: number; pct: number }; deltaPp: number }
      basicReportOnly?: { first: { year: number; pct: number }; last: { year: number; pct: number }; deltaPp: number }
    }
  }
  reports: Array<{ year: number; url: string; asOf?: string; sampleSize: number; fieldPeriod?: { from: string; to: string; days: number } }>
  meta: { caveats: string[] }
}

type Pack = {
  map: NkMapData; region: NkRegionData; isan: IsanData; proj: ProjData; desc: DescData
  museum: MuseumData; paths: PathData; opinion: OpinionData; tour: MuseumSections
}

/* 지도 모드 — 현행 행정구역 / 광복 당시 구행정구역(= 이산가족 '고향' 축) */
type Mode = 'modern' | 'old'
type Sel = { mode: 'modern'; key: string } | { mode: 'old'; id: string }

/* 보기 방식 — 같은 데이터를 두 밀도로 읽는다 (2026-08-19 사용자 지시).
   all  = 한눈에: 지도+패널+소멸시계+후손층을 한 화면에 (기존 대시보드)
   step = 한걸음씩: 노인·어린이용. 한 번에 카드 하나, 큰 글씨, 쉬운 문장.
   선택은 localStorage 에 저장해 다시 와도 유지한다. */
type View = 'all' | 'step'
const VIEW_KEY = 'gohyang_view'

/* ══════════════════════ 상수 (SasilOn 과 같은 팔레트) ══════════════════════ */

/* 팔레트·활자는 theme/gohyang.ts 가 단일 진실 소스다.
   아래는 이 화면이 쓰는 이름으로 옮겨 붙인 얇은 층이다 —
   기존 JSX 수백 곳을 건드리지 않고 껍데기만 갈아입히려고 이렇게 둔다. */
import { SURFACE, TYPE, TEXT, ASOF, PROSE as T_PROSE, FOCUS as T_FOCUS, BTN, josa } from '../theme/gohyang'
import MuseumTour, { type MuseumSections } from '../components/MuseumTour'
import MuseumBanner from '../components/MuseumBanner'

/* 고향 도우미(페르소나 AI) — LLM 4원칙(CLAUDE.md §5)의 화면 쪽 절반.
   사실 묶음은 buildGuideFacts 가 데이터 팩에서 만들고, LLM 은 프록시(/api/llm, kind='guide')를
   거쳐 문장으로 엮기만 한다. 검증 실패·네트워크 실패는 전부 fallbackGuide(규칙 문장)로 되돌린다. */
import { buildGuideFacts, fallbackGuide, cardHint } from '../engine/nk-guide.mjs'
import { probe as probeLLM, guideWithLLM } from '../engine/nk-llm-proxy.mjs'
/* 기상은 화면이 직접 부르는 유일한 계열 — 지도와 기억 카드가 같은 호출을 쓴다 */
import { useLiveWeather } from '../lib/gohyangWeather'
import MemoryCard, { type MemoryHome, type MemoryDonation } from '../components/MemoryCard'

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

/* 수집 원자료에는 편집자 표시 글리프(★ ⚠)가 섞여 있다.
   ⚠(U+26A0)는 플랫폼에 따라 컬러 이모지로 렌더되므로 화면에 내보내기 전에 뗀다
   (theme/gohyang.ts 제약 ① — 이 화면의 렌더링 이모지는 0개여야 한다). */
function plain(s?: string | null): string {
  return String(s ?? '')
    .replace(/[★☆⚠]️?/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/* 박물관 생산일자 — 원문 표기를 그대로 보존한 값이라 형태가 여러 가지다(실측).
   '1987.03.24' · '1997.00.00'(월일 미상) · '0000.00.00'(전체 미상) · '2003.09' · '2015' · '-' · null
   없는 것을 있는 것처럼 채우지 않는다. 모르는 자리는 잘라내고 모르면 '미상'이라고 쓴다. */
function museumDate(v?: string | null): string {
  const s = String(v ?? '').trim()
  if (!s || s === '-' || /^0{4}/.test(s)) return '생산일자 미상'
  const [y, mo, d] = s.split('.')
  if (!/^\d{4}$/.test(y)) return '생산일자 미상'
  const M = mo && /^\d{1,2}$/.test(mo) && Number(mo) > 0 ? Number(mo) : null
  const D = d && /^\d{1,2}$/.test(d) && Number(d) > 0 ? Number(d) : null
  if (M == null) return `${y}년`
  if (D == null) return `${y}년 ${M}월`
  return `${y}년 ${M}월 ${D}일`
}

/* '사진류 > 인화사진' → '사진류 · 인화사진' */
function formKo(v?: string | null): string {
  return String(v ?? '').split('>').map(s => s.trim()).filter(Boolean).join(' · ')
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
      <div className={`flex items-start gap-2.5 border-b p-5 ${SURFACE.hair} ${T.band}`}>
        <ClauseTag>{tag}</ClauseTag>
        <div className={`h-9 w-[3px] shrink-0 ${T.accent}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className={`${TYPE.h2} ${PROSE} ${T.text}`}>{title}</h2>
          {sub && <p className={`mt-1 ${TYPE.sub} ${TEXT.faint} ${PROSE}`}>{sub}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
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
   좌표표와 호출 규약은 lib/gohyangWeather.ts 하나뿐이다 — 기억 카드도 같은 것을 쓴다.
   빌드에 굽지 않고 브라우저가 직접 부르는 이유는 그 파일 머리에 적어 두었다. */

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
      <p className={`mt-2 text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>오늘 고향의 날씨입니다. <b className="font-medium">지금 관측된 값을 그대로 가져왔습니다.</b>
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

/* ══════════════════════ 박물관 사료 ══════════════════════

   통일부 남북이산가족 디지털박물관의 공개 사료 4,342건 중, 본문에 북한 지명이
   확인된 1,445건만 이 화면이 지역에 걸 수 있다. 나머지 2,897건은 고향이 없어서가
   아니라 **본문에 지명이 적혀 있지 않아서** 걸 자리가 없는 것이다 — 화면이 그렇게 말한다.

   ★ 이미지는 저장하지 않는다.
     기증자 저작물이고 개방형 라이선스(공공누리) 표기를 수집 단계에서 확인하지 못했다.
     그래서 박물관 원본 URL 을 <img> 로 그대로 참조하고, 자세히 보기는 박물관 페이지로 보낸다.
     정부 서버가 언제든 막을 수 있으므로 실패하면 이미지 자리를 통째로 감춘다
     (깨진 이미지 아이콘은 "자료가 없다"는 거짓 신호가 된다). */

type MuseumBundle = {
  hometown: MuseumRec[]
  venue: MuseumRec[]
  historic: MuseumRec[]
  historicKeys: string[]
  total: number
}

/** 사료 목록 안에서의 정렬 — 상세를 받은 건(전 필드 보유)을 앞에 둔다. */
function museumOrder(a: MuseumRec, b: MuseumRec): number {
  const rank = (r: MuseumRec) => (r.source === 'collectionDetail' ? 0 : 1)
  return rank(a) - rank(b) || a.iId - b.iId
}

function museumFor(sel: Sel, pack: Pack): MuseumBundle {
  const m = pack.museum
  const byId = new Map(m.records.map(r => [r.iId, r]))
  const pick = (ids?: number[]) => (ids ?? []).map(i => byId.get(i)).filter((r): r is MuseumRec => Boolean(r))

  const members = membersOf(sel, pack.region)
  const oldId = sel.mode === 'old' ? sel.id : pack.region.regions[sel.key]?.isanOrigin?.key ?? null

  const direct = new Map<number, MuseumRec>()
  members.forEach(n => pick(m.byRegion[n]).forEach(r => direct.set(r.iId, r)))

  /* 구(舊)도명 — 광복 당시 표기라 현행 13축으로 확정할 수 없어 따로 묶는다.
     historicToOld 는 데이터 팩이 검증한 대응표다(화면에서 만들어 내지 않는다). */
  const historicKeys = oldId
    ? Object.keys(m.meta.historicToOld).filter(k => (m.meta.historicToOld[k] ?? []).includes(oldId))
    : []
  const historic = new Map<number, MuseumRec>()
  historicKeys.forEach(k => pick(m.byRegionHistoric[k]).forEach(r => { if (!direct.has(r.iId)) historic.set(r.iId, r) }))

  const all = [...direct.values()]
  return {
    hometown: all.filter(r => !r.venueOnly).sort(museumOrder),
    venue: all.filter(r => r.venueOnly).sort(museumOrder),
    historic: [...historic.values()].sort(museumOrder),
    historicKeys,
    total: all.length + historic.size,
  }
}

/** 사료 한 장. 이미지가 죽으면 그림 자리를 감추고 제목만 남긴다. */
/* 사료 이미지는 **경유로를 통해** 부른다.
   박물관 서버가 JPEG 를 Content-Type: text/html + nosniff 로 보내서 Chromium 의 ORB 가
   막는다 — 실측 2026-08-19: 실제 Chrome 에서 onerror, iOS Safari 는 ORB 가 없어 그냥 보였다
   ("모바일에선 보이는데 PC 에선 안 보인다"의 원인). /api/museum-img 는 원본 바이트를
   저장 없이 흘려보내며 Content-Type 만 실제 값으로 고친다. */
function imgSrcOf(r: MuseumRec): string | null {
  if (!r.imageUrl) return null
  const m = r.imageUrl.match(/file_id=(\d+)/)
  return m ? `/api/museum-img?file_id=${m[1]}` : r.imageUrl
}

function MuseumCard({ r, mark }: { r: MuseumRec; mark: string | null }) {
  const [broken, setBroken] = useState(false)
  const src = imgSrcOf(r)
  const showImg = Boolean(src) && !broken
  return (
    <li className={`overflow-hidden ${SURFACE.card}`}>
      {showImg && (
        <img
          src={src!}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className={`block h-32 w-full border-b object-cover ${SURFACE.hair}`}
        />
      )}
      <div className="p-2.5">
        {mark && (
          <span className={`mb-1 inline-block rounded px-1.5 py-0.5 ${TYPE.cap} font-semibold ${ASOF.stale.chip}`}>{mark}</span>
        )}
        <p className={`${TYPE.sub} font-medium ${TEXT.ink} ${PROSE}`}>{clean(r.title)}</p>
        <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          {museumDate(r.producedOn)}
          {r.form ? ` · ${formKo(r.form)}` : ''}
          {r.donor ? ` · 기증 ${clean(r.donor)}` : ''}
        </p>
        <p className="mt-1.5">
          <OutLink href={r.recordUrl}>박물관에서 보기</OutLink>
        </p>
      </div>
    </li>
  )
}

function MuseumBlock({ pack, sel }: { pack: Pack; sel: Sel }) {
  const b = useMemo(() => museumFor(sel, pack), [sel, pack])
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(false) }, [sel])

  const m = pack.museum
  const src = m.sources[0]
  /* 이 사료 더미의 as-of 는 '언제 받아왔나'가 아니라 '가장 최근 것이 언제 만들어졌나'다.
     실측: 기록관 공개 사료의 최신 생산일 2018-07-27 — 그 뒤로 공개된 것이 있는지는 모른다(stale). */
  const newest = pack.paths.meta.measured?.archiveNewestProducedOn ?? null
  const n = newest ? notice(newest, 'stale') : null

  const rows = [
    ...b.hometown.map(r => ({ r, mark: null as string | null })),
    ...b.venue.map(r => ({ r, mark: '상봉 장소 표기' })),
    ...b.historic.map(r => ({ r, mark: `${b.historicKeys.join('·')} 표기` })),
  ]
  const shown = open ? rows : rows.slice(0, 12)   // 전폭 4열 격자 — 첫 화면에 세 줄

  return (
    <Block
      tag="사료"
      tone="blue"
      title="이 고향에서 온 기록물"
      sub={`통일부 남북이산가족 디지털박물관 공개 사료 ${nf(m.archive.totCnt)}건 중 이 구역에 걸린 것`}
    >
      {rows.length === 0 ? (
        <>
          <p className={`${TYPE.body} ${TEXT.soft} ${PROSE}`}>이 고향의 사료는 아직 공개 목록에 없습니다.</p>
          <p className={`mt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
            사료가 없다는 뜻이 아니라, 공개된 {nf(m.archive.totCnt)}건의 제목·내용에서 이 지역 이름이 확인되지 않았다는 뜻입니다.
            {' '}{nf(m.meta.slim.totalRecords - m.meta.slim.keptRecords)}건은 본문에 지명이 적혀 있지 않아 어느 고향에도 걸지 못했습니다.
          </p>
        </>
      ) : (
        <>
          <p className={`${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
            <b className={`font-semibold tabular-nums ${TEXT.ink}`}>{nf(rows.length)}건</b>
            {b.venue.length > 0 && <> · 이 가운데 {nf(b.venue.length)}건은 고향이 아니라 <b className="font-medium">상봉 장소</b>(금강산 면회소)로 잡힌 것입니다</>}
            {b.historic.length > 0 && <> · {nf(b.historic.length)}건은 광복 당시 구(舊)도명으로만 적힌 것입니다</>}
          </p>

          <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map(({ r, mark }) => <MuseumCard key={r.iId} r={r} mark={mark} />)}
          </ul>

          {rows.length > 12 && (
            <button
              type="button"
              onClick={() => setOpen(v => !v)}
              className={`mt-3 w-full ${BTN.ghost}`}
              aria-expanded={open}
            >
              {open ? '접기' : `나머지 ${nf(rows.length - 12)}건 더 보기`}
            </button>
          )}

          {b.historic.length > 0 && (
            <p className={`mt-3 rounded-md border-l-[3px] border-[#dcdfe4] pl-2.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              {m.meta.historicNote}
            </p>
          )}
          {b.venue.length > 0 && m.meta.kangwonVenueOnly && (
            <p className={`mt-2 rounded-md border-l-[3px] border-[#dcdfe4] pl-2.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              {m.meta.kangwonVenueOnly.note}
            </p>
          )}
        </>
      )}

      {n && (
        <div className="mt-3">
          <AsOfLine n={n} />
        </div>
      )}

      <div className={`mt-3 space-y-1 border-t pt-2.5 ${SURFACE.hair}`}>
        <p className={`${TYPE.cap} ${TEXT.faint}`}>
          출처 통일부 남북이산가족 디지털박물관 · 수집 {m.builtAt} ·{' '}
          <OutLink href={src?.url}>박물관 원문</OutLink>
        </p>
        <p className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          사진은 <b className="font-medium">박물관 원본을 그대로 불러온 것</b>입니다.
          {' '}본 화면은 사료 이미지를 내려받아 저장하거나 다시 배포하지 않습니다 — 기증자의 저작물이기 때문입니다.
          {' '}이미지가 보이지 않으면 박물관이 외부 참조를 막은 것이며, 제목과 원문 링크는 그대로 남습니다.
        </p>
      </div>
    </Block>
  )
}

/* ══════════════════════ 고향 안내인 (페르소나 AI) ══════════════════════

   지역을 고른 사람에게 그 지역의 **우리 데이터만 근거로** 말을 거는 도우미.

   LLM 4원칙이 코드에 그대로 박혀 있다 (CLAUDE.md §5 — 타협 대상 아님):
     ① 규칙이 먼저 — 수치·사건·사료는 전부 buildGuideFacts 가 데이터 팩에서 꺼낸다.
     ② LLM 은 해석만 — validateGuide(프록시 어댑터 내부)가 사실 묶음에 없는 숫자를
        하나라도 발견하면 출력 전체를 폐기한다. LLM 이 수치를 만들 문법이 없다.
     ③ 스키마 밖이면 폐기 — guideWithLLM 은 닫힌 스키마(lines 2~4 + next 1)가 아니면 null.
     ④ 네트워크가 죽어도 동작 — 화면은 fallbackGuide(규칙 문장)로 먼저 채우고,
        LLM 이 검증을 통과한 경우에만 그 자리를 바꾼다. 빈 화면이 되는 경로가 없다.

   시각 구분 — AI/규칙이 만든 문장은 **점선 상자** 안에만 산다. 공식 수치(실선 구획)와
   같은 표면에 두지 않는다. 라벨과 "자동 작성" 고지를 항상 붙인다. */

type GuideMsg = { lines: string[]; next: { target: string; label: string } }

function prefersReduced(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/* smooth 스크롤은 rAF 로 움직여서 백그라운드 탭·저사양 기기에서 멈춘 채 끝나기도 한다(실측).
   잠시 뒤 도착을 확인하고 못 갔으면 즉시 이동한다 — 눌렀는데 안 움직이는 화면이 제일 나쁘다. */
function scrollToEl(el: HTMLElement | null) {
  if (!el) return
  el.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' })
  window.setTimeout(() => {
    const r = el.getBoundingClientRect()
    if (r.top >= window.innerHeight || r.bottom <= 0) el.scrollIntoView({ block: 'start' })
  }, 700)
}

/* 보기 방식을 갈아탄 직후에는 목적지 구획이 아직 렌더 전일 수 있다 — 생길 때까지 잠깐 기다린다 */
function scrollToId(id: string, tries = 12) {
  const el = document.getElementById(id)
  if (el) { scrollToEl(el); return }
  if (tries > 0) window.setTimeout(() => scrollToId(id, tries - 1), 120)
}

/* next.target → 대시보드 구획 앵커 (한걸음씩 모드는 onGo 로 카드 번호에 따로 잇는다) */
const GUIDE_ANCHOR: Record<string, string> = {
  weather: 'g-weather', events: 'g-events', museum: 'g-museum', clock: 'extinction', action: 'actions',
}

function GuideBox({ pack, sel, onGo }: { pack: Pack; sel: Sel; onGo?: (target: string) => void }) {
  const facts = useMemo(() => buildGuideFacts(sel, pack), [sel, pack])
  const [g, setG] = useState<GuideMsg | null>(() => (facts ? (fallbackGuide(facts) as GuideMsg) : null))
  const [via, setVia] = useState<'rule' | 'llm'>('rule')

  useEffect(() => {
    let alive = true
    if (!facts) { setG(null); return }
    setG(fallbackGuide(facts) as GuideMsg)          // ④ 네트워크와 무관하게 화면부터 채운다
    setVia('rule')
    ;(async () => {
      try {
        await probeLLM()
        /* guideWithLLM 은 호출 실패·스키마 위반·수치 생성 전부 null 로 돌려준다 */
        const ok = (await guideWithLLM(facts)) as GuideMsg | null
        if (alive && ok) { setG(ok); setVia('llm') }
      } catch { /* 규칙 문장 유지 — 화면은 이미 차 있다 */ }
    })()
    return () => { alive = false }
  }, [facts])

  if (!g) return null
  const go = (t: string) => {
    if (onGo) { onGo(t); return }
    scrollToEl(document.getElementById(GUIDE_ANCHOR[t] ?? ''))
  }
  return (
    <div
      className={`rounded-md border border-dashed ${SURFACE.line} ${SURFACE.inset} p-4`}
      role="note"
      aria-label="고향 안내인의 자동 작성 안내문"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 ${TYPE.cap} font-semibold ${TONE.slate.chip}`}>고향 안내인</span>
        <span className={`${TYPE.cap} ${TEXT.faint}`}>{via === 'llm' ? 'AI 보조 문장 · 수치 검증 통과' : '규칙 기반 문장'}</span>
      </div>
      <div className="mt-2.5 space-y-1.5">
        {g.lines.map((l, i) => (
          <p key={i} className={`${TYPE.body} ${TEXT.soft} ${PROSE}`}>{l}</p>
        ))}
      </div>
      <p className="mt-3">
        <button type="button" onClick={() => go(g.next.target)} className={BTN.ghost}>
          {g.next.label} <span aria-hidden="true">→</span>
        </button>
      </p>
      <p className={`mt-2.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        이 안내문은 아래 자료만 근거로 자동 작성됐습니다. 공식 수치는 실선 구획의 값을 보십시오.
      </p>
    </div>
  )
}

/* ══════════════════════ 우측 패널 ══════════════════════ */

function StatRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800">
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
    /* 전폭에서는 2열 그리드 — 좁은 기둥에 길게 쌓이는 대신 나란히 놓인다.
       머리·종료 공지·안내인·사료는 전폭(col-span-2), 관측·이산가족·탈북민·기록은 반폭. */
    <div className="space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
      {/* ── 머리 ── */}
      <div className={`${CARD} p-4 lg:col-span-2`}>
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
          <div key={f.topic} className={`overflow-hidden ${CARD} lg:col-span-2`}>
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

      {/* ── 고향 안내인 — AI/규칙 문장은 점선 상자에만 산다. 공식 수치와 섞이지 않는다 ── */}
      <div className="lg:col-span-2"><GuideBox pack={pack} sel={sel} /></div>

      {/* ── 날씨 ── */}
      <div id="g-weather" className="scroll-mt-24">
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
      </div>

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
      <div id="g-events" className="scroll-mt-24">
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

      {/* ── 박물관 사료 ──
          위의 '기록'이 이 지역이 **몇 번 언급됐는지**를 세는 것이라면,
          이 구획은 이 지역에서 실제로 나온 **물건**을 보여준다. 숫자 다음에 얼굴이 와야 한다. */}
      <div id="g-museum" className="scroll-mt-24 lg:col-span-2">
        <MuseumBlock pack={pack} sel={sel} />
      </div>
    </div>
  )
}

/* ══════════════════════ 기록 골든타임 ══════════════════════
   실측(2017-07~2025-08 등록현황 CSV 98개월 + 2026-03~05 공표 HWP 3개월)과
   추계(2026~2050)를 한 축 위에 올린다.
    추계는 통일부 공표 통계가 아니라 이 시제품의 계산 결과다 — 선 모양·배지·각주 3중으로 구분한다. */

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

  /* 값이 보이게 — 손가락/커서/키보드로 짚으면 그 시점의 수를 띄운다.
     그래프가 모양만 보여주고 "이 지점이 몇 명인지 모르겠다"는 지적(2026-08-19)의 답. */
  const scrubPts = useMemo(() => ([
    ...csv.map((d, i) => ({ t: d.t, v: d.v, label: ymKo(isan.monthly[i]?.month), kind: 'real' as const })),
    ...hwp.map(d => ({ t: d.t, v: d.v, label: `${ymKo(d.asOf)} 공표`, kind: 'real' as const })),
    ...fut.map((d, i) => ({ t: d.t, v: Math.round((d.lo + d.hi) / 2), label: `${proj.byYear[i]?.year}년 (계산)`, kind: 'proj' as const })),
  ].filter(q => Number.isFinite(q.t)).sort((a, b) => a.t - b.t)), [csv, hwp, fut, isan, proj])
  const lastRealIdx = useMemo(() => {
    for (let i = scrubPts.length - 1; i >= 0; i--) if (scrubPts[i].kind === 'real') return i
    return 0
  }, [scrubPts])
  const [scrub, setScrub] = useState(lastRealIdx)
  const [scrubbing, setScrubbing] = useState(false)
  useEffect(() => { setScrub(lastRealIdx) }, [lastRealIdx])
  const svgRef = useRef<SVGSVGElement>(null)
  const pickAt = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r || !r.width) return
    const vx = ((clientX - r.left) / r.width) * W
    let best = 0, bd = Infinity
    scrubPts.forEach((q, i) => { const d = Math.abs(x(q.t) - vx); if (d < bd) { bd = d; best = i } })
    setScrub(best)
  }
  const sc = scrubPts[scrub]

  /* 1만 명 하회 구간 — 원값 시나리오(빠른 쪽)와 교정 시나리오(느린 쪽)의 두 해 사이 */
  const [m10a, m10b] = proj.milestoneRange.below10000.split('~').map(Number)
  const seam = tOf(isan.latest.asOf)

  return (
    <section className={`overflow-hidden ${CARD}`}>
      <div className={`flex items-start gap-2.5 p-4 ${TONE.slate.band}`}>
        <ClauseTag>추계</ClauseTag>
        <div className="min-w-0 flex-1">
          <h2 className={`text-base font-semibold leading-snug text-slate-900 dark:text-white ${PROSE}`}>
            <span aria-hidden="true"></span> 기록 골든타임 — 고향을 기억하는 사람이 남아 있는 시간
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
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full min-w-[560px] touch-none select-none"
            tabIndex={0}
            onPointerDown={e => { setScrubbing(true); pickAt(e.clientX); (e.target as Element).setPointerCapture?.(e.pointerId) }}
            onPointerMove={e => { if (scrubbing || e.pointerType === 'mouse') pickAt(e.clientX) }}
            onPointerUp={() => { setScrubbing(false); setScrub(lastRealIdx) }}
            onPointerLeave={() => { if (!scrubbing) setScrub(lastRealIdx) }}
            onKeyDown={e => {
              if (e.key === 'ArrowLeft') { e.preventDefault(); setScrub(i => Math.max(0, i - 1)) }
              if (e.key === 'ArrowRight') { e.preventDefault(); setScrub(i => Math.min(scrubPts.length - 1, i + 1)) }
            }}
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

            {/* 짚은 지점의 값 — 마지막 실측값을 기본으로 늘 하나는 떠 있다 */}
            {sc && (() => {
              const cx = x(sc.t), cy = y(sc.v)
              const bw = 150, bh = 44
              const bx = Math.min(Math.max(cx - bw / 2, PAD.l), W - PAD.r - bw)
              const by = cy - bh - 12 < PAD.t ? cy + 14 : cy - bh - 12
              return (
                <g>
                  <line x1={cx} x2={cx} y1={PAD.t} y2={H - PAD.b} className="stroke-blue-600 dark:stroke-blue-400" strokeWidth={1} strokeDasharray="3 3" />
                  <circle cx={cx} cy={cy} r={5.5} fill="#fff" className={sc.kind === 'proj' ? 'stroke-slate-500' : 'stroke-blue-600'} strokeWidth={2.5} />
                  <rect x={bx} y={by} width={bw} height={bh} rx={5} fill="#fff" className="stroke-slate-300" />
                  <text x={bx + 10} y={by + 17} className="text-[12px] fill-slate-500">{sc.label}</text>
                  <text x={bx + 10} y={by + 36} className="text-[16px] font-bold fill-slate-900">
                    {nf(sc.v)}명{sc.kind === 'proj' ? ' (계산)' : ''}
                  </text>
                </g>
              )
            })()}
          </svg>
        </div>
        <p className={`mt-1.5 text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>
          그래프를 손가락으로 짚거나 커서를 올리면 그 시점의 인원이 나옵니다. 키보드 좌우 화살표로도 움직입니다.
        </p>

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
          <p className={`max-w-prose text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>
            <b className="font-semibold text-slate-600 dark:text-slate-300">방법</b> — {proj.method.summary}
          </p>
          <p className={`mt-1 max-w-prose text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>
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

/* ══════════════════════ 통일 필요성 19년 ══════════════════════

   기록 골든타임 바로 아래에 온다. 두 곡선을 나란히 두는 것이 요지다 —
   1세대가 줄어드는 선과, 통일이 필요하다는 응답이 내려가는 선.

   ★★ 이 구획만 통일부 자료가 아니다. 서울대학교 통일평화연구원의 통일의식조사다.
      화면 전체가 통일부 공공데이터로 만들어져 있으므로, 여기만 출처가 다르다는 것을
      배지·머리글·출처란 세 곳에서 반복해 밝힌다. 섞이면 이 화면의 신뢰가 통째로 깨진다.

    인과를 주장하지 않는다. "같은 기간에 함께 내려갔다"까지만 쓴다.
     한쪽이 다른 쪽의 원인이라는 근거는 이 자료에 없다. */

function OpinionTrend({ opinion, isan }: { opinion: OpinionData; isan: IsanData }) {
  const s = opinion.series.find(x => x.titleKey === 'Uni01' && x.group.menu === 1)
  const ext = s?.extended
  if (!s || !ext || !ext.years.length) return null

  const need = ext.rows.find(r => r.label === '필요하다') ?? ext.rows[0]
  const notNeed = ext.rows.find(r => r.label === '필요하지 않다') ?? ext.rows[ext.rows.length - 1]
  const H0 = opinion.headline.needUnification

  const W = 960, H = 300
  const PAD = { l: 46, r: 116, t: 18, b: 38 }
  const Y1 = 70
  const yrs = ext.years
  const x = (i: number) => PAD.l + (i / Math.max(1, yrs.length - 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => H - PAD.b - (v / Y1) * (H - PAD.t - PAD.b)
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  /* 출처 전환 지점 — 인포그래픽 XLSX 는 2022 에서 끊기고 그 뒤는 기초보고서 PDF 다.
     한 선으로 그리되 어디서 출처가 바뀌었는지 선 위에 표시한다(데이터가 시킨 것이다). */
  const switchAt = yrs.findIndex(v => ext.sourceByYear[String(v)] !== ext.sourceByYear[String(yrs[0])])
  const yTicks = [0, 20, 40, 60]
  const xTickYears = yrs.filter(v => v % 3 === 1 || v === yrs[yrs.length - 1])

  /* 같은 기간 1세대는 몇 명에서 몇 명이 됐나 — 옆 곡선과 이어 읽히게 하려는 것 */
  const isanFirst = isan.monthly[0]
  const isanLast = isan.latest

  return (
    <section className={`overflow-hidden ${CARD}`}>
      <div className={`flex flex-wrap items-start gap-2.5 p-4 ${TONE.slate.band}`}>
        <ClauseTag>참고</ClauseTag>
        <div className="min-w-0 flex-1">
          <h2 className={`${TYPE.h2} ${TEXT.ink} ${PROSE}`}>같은 기간, 통일이 필요하다는 응답</h2>
          <p className={`mt-0.5 ${TYPE.sub} ${TEXT.faint} ${PROSE}`}>
            {s.question} · {ext.years[0]}~{ext.years[ext.years.length - 1]}년 {nf(ext.years.length)}개 연도 · 단위 {s.unit}
          </p>
        </div>
        <span className={`shrink-0 self-center rounded-md border px-2 py-0.5 ${TYPE.cap} font-semibold ${ASOF.stale.chip}`}>
          통일부 자료 아님 · 서울대학교 통일평화연구원
        </span>
      </div>

      <div className="p-4">
        {/* ── 두 곡선을 잇는 한 문장 ── */}
        <p className={`${SURFACE.inset} p-3 ${TYPE.body} ${TEXT.soft} ${PROSE}`}>
          위 「기록 골든타임」에서 고향을 기억하는 사람은 {ymKo(isanFirst?.month)}{' '}
          <b className={`font-semibold tabular-nums ${TEXT.ink}`}>{nf(isanFirst?.total)}명</b>에서 {ymKo(isanLast.asOf)}{' '}
          <b className={`font-semibold tabular-nums ${TEXT.ink}`}>{nf(isanLast.survivors.total)}명</b>으로 줄었습니다.
          {' '}같은 기간 「통일이 필요하다」는 응답은 {H0.first.year}년{' '}
          <b className={`font-semibold tabular-nums ${TEXT.ink}`}>{nf1(H0.first.pct)}%</b>에서 {H0.last.year}년{' '}
          <b className={`font-semibold tabular-nums ${TEXT.ink}`}>{nf1(H0.last.pct)}%</b>로 내려갔습니다.
          {' '}<b className={`font-semibold ${TEXT.ink}`}>두 곡선은 같은 기간에 함께 내려갔습니다.</b>
          {' '}여기까지가 자료가 말하는 전부입니다 — 한쪽이 다른 쪽의 원인이라는 근거는 이 자료에 없습니다.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className={`${SURFACE.inset} p-3`}>
            <p className={`${TYPE.cap} ${TEXT.faint}`}>{H0.first.year}년 「{H0.label}」</p>
            <p className={`${TYPE.figureSm} ${TEXT.ink}`}>{nf1(H0.first.pct)}%</p>
          </div>
          <div className={`${SURFACE.inset} p-3`}>
            <p className={`${TYPE.cap} ${TEXT.faint}`}>{H0.last.year}년 「{H0.label}」</p>
            <p className={`${TYPE.figureSm} ${TEXT.ink}`}>{nf1(H0.last.pct)}%</p>
          </div>
          <div className={`${SURFACE.slab} p-3`}>
            <p className={`${TYPE.cap} ${TEXT.faint}`}>{ext.years.length}개 연도 변화폭</p>
            <p className={`${TYPE.figureSm} ${TEXT.blue}`}>{nf1(H0.deltaPp)}%p</p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full min-w-[560px]"
            role="img"
            aria-label={`남한 주민의 통일 필요성 응답 추이. 「${H0.label}」는 ${H0.first.year}년 ${nf1(H0.first.pct)}퍼센트에서 ${H0.last.year}년 ${nf1(H0.last.pct)}퍼센트로 ${nf1(Math.abs(H0.deltaPp))}퍼센트포인트 내려갔습니다.`}
          >
            {yTicks.map(v => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth={1} />
                <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="text-[13px] tabular-nums fill-slate-400">{v}%</text>
              </g>
            ))}
            {xTickYears.map(t => (
              <text key={t} x={x(yrs.indexOf(t))} y={H - PAD.b + 20} textAnchor="middle" className="text-[13px] tabular-nums fill-slate-400">{t}</text>
            ))}

            {/* 출처 전환 지점 */}
            {switchAt > 0 && (
              <>
                <line
                  x1={(x(switchAt - 1) + x(switchAt)) / 2}
                  x2={(x(switchAt - 1) + x(switchAt)) / 2}
                  y1={PAD.t}
                  y2={H - PAD.b}
                  className="stroke-slate-400"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <text x={(x(switchAt - 1) + x(switchAt)) / 2 - 6} y={PAD.t + 12} textAnchor="end" className="text-[12px] fill-slate-500">
                  ← 인포그래픽 XLSX
                </text>
                <text x={(x(switchAt - 1) + x(switchAt)) / 2 + 6} y={PAD.t + 12} className="text-[12px] fill-slate-500">
                  기초보고서 PDF →
                </text>
              </>
            )}

            {/* 필요하지 않다 — 대조선 */}
            <path d={line(notNeed.values)} fill="none" className="stroke-slate-400 dark:stroke-slate-500" strokeWidth={1.8} strokeDasharray="5 4" strokeLinejoin="round" />
            {/* 필요하다 — 주인공 */}
            <path d={line(need.values)} fill="none" className="stroke-blue-600 dark:stroke-blue-400" strokeWidth={2.5} strokeLinejoin="round" />
            {need.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={2.6} className="fill-blue-600 dark:fill-blue-400" />
            ))}

            {/* 끝점 라벨 — 오른쪽 여백에 둔다 */}
            <text x={x(yrs.length - 1) + 8} y={y(need.values[need.values.length - 1]) + 4} className="text-[13px] font-semibold tabular-nums fill-blue-700 dark:fill-blue-300">
              {need.label} {nf1(need.values[need.values.length - 1])}%
            </text>
            <text x={x(yrs.length - 1) + 8} y={y(notNeed.values[notNeed.values.length - 1]) + 4} className="text-[13px] tabular-nums fill-slate-500">
              {notNeed.label} {nf1(notNeed.values[notNeed.values.length - 1])}%
            </text>

            <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="stroke-slate-300 dark:stroke-slate-700" strokeWidth={1} />
          </svg>
        </div>

        {/* 두 출처를 이어 붙였다는 사실 — 감추면 곡선이 거짓이 된다 */}
        <div className={`mt-3 ${SURFACE.inset} p-3`}>
          <p className={`${TYPE.cap} ${TEXT.soft} ${PROSE}`}>{ext.note}</p>
          {H0.infographicOnly && H0.basicReportOnly && (
            <p className={`mt-1.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              단일 출처만으로 보면 — 인포그래픽 {H0.infographicOnly.first.year}~{H0.infographicOnly.last.year}년{' '}
              {nf1(H0.infographicOnly.deltaPp)}%p · 기초보고서 {H0.basicReportOnly.first.year}~{H0.basicReportOnly.last.year}년{' '}
              {nf1(H0.basicReportOnly.deltaPp)}%p.
              {s.overlapCheck && ` 두 출처가 겹치는 ${nf(s.overlapCheck.years.length)}개 연도의 최대 차이는 ${nf1(s.overlapCheck.maxAbsDiffPp)}%p입니다.`}
            </p>
          )}
        </div>

        <div className={`mt-3 border-t pt-3 ${SURFACE.hair}`}>
          <p className={`${TYPE.cap} ${TEXT.soft} ${PROSE}`}>
            <b className={`font-semibold ${TEXT.ink}`}>출처</b> — {opinion.licenseFullText}
          </p>
          <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
            {opinion.sources.map((v, i) => (
              <span key={v.name}>
                {i > 0 && ' · '}
                {v.name}
                {v.asOf ? ` (기준 ${v.asOf})` : ''}
              </span>
            ))}
          </p>
          <p className="mt-1.5">
            <OutLink href={opinion.licenseUrl}>통일의식조사 데이터 아카이브</OutLink>
            <span className={`${TYPE.cap} ${TEXT.faint}`}> · </span>
            <OutLink href={s.source.xlsx}>이 지표의 원본 XLSX</OutLink>
          </p>
          <p className={`mt-2 rounded-md p-2 ${SURFACE.inset} ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
            이 구획의 수치는 <b className="font-medium">통일부 공공데이터가 아닙니다.</b>
            {' '}본 화면의 다른 모든 수치와 <b className="font-medium">출처가 다르며</b>, 조사기관·표본·조사방법이 달라 같은 표에 넣어 계산하면 안 됩니다.
            {' '}여기서는 <b className="font-medium">같은 기간을 나란히 보여주는 참고 자료</b>로만 씁니다.
          </p>
        </div>
      </div>
    </section>
  )
}

/* ══════════════════════ 페이지 ══════════════════════ */

/* ══════════════════════ 후손 다리 ══════════════════════

   기록 골든타임이 "언제까지 남아 있는가"를 말한다면, 이 층은 "그 다음은 누구인가"를 말한다.

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

function DescendantBridge({ desc, isan, pack }: { desc: DescData; isan: IsanData; pack: Pack }) {
  const [openAssume, setOpenAssume] = useState(false)
  const x = desc.descendants.wantsCrossGenerationExchange
  const alive = isan.latest.overview.cumulative.alive

  /* ── 기억 카드가 쓸 재료 ──
     이 구획은 진단(통계)만 하고 후손이 무언가를 남길 자리를 주지 못했다(사용자 지적).
     아래 도구가 그 자리인데, 빈 칸을 주면 아무도 못 쓰므로 **질문을 데이터가 만든다**.
     여기서는 팩에서 재료만 뽑아 넘긴다 — 계산하지 않는다(패널·사료 조인은 기존 함수 그대로). */
  const memoryHomes = useMemo<MemoryHome[]>(() => {
    const byOrigin = new Map(isan.latest.survivors.byOrigin.entries.map(e => [e.label, e.n]))
    /* 기억을 끌어내는 단서로 쓸 사건을 고른다.
       그냥 최신순으로 두면 미사일 발사·현지지도가 앞에 오는데, 그건 후손이 집안에서
       들었을 이야기의 실마리가 되지 못한다. 그래서 ① 이산가족·교류가 걸린 사건,
       ② 그다음 왕래·개성공단·금강산처럼 사람이 오간 사건, ③ 그래도 없으면 가장 오래된 사건
       순으로 고른다. **사건을 만들어 내지 않는다** — 순서만 바꾼다. */
    const STRONG = /이산가족|상봉|방문단|적십자|면회소|서신|왕래|교류/
    const WEAK = /개성공단|금강산|방북|방남|협력|경의선|동해선|철도/
    const cueEvents = (evs: Array<{ date: string; title: string }>) => {
      const asc = [...evs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      const strong = asc.filter(e => STRONG.test(e.title))
      const weak = asc.filter(e => !STRONG.test(e.title) && WEAK.test(e.title))
      const seen = new Set<string>()
      return [...strong, ...weak, ...asc]
        .filter(e => {
          const k = `${e.date}|${e.title}`
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
        .slice(0, 2)
    }
    return pack.map.regionsOld
      .map(o => {
        const sel: Sel = { mode: 'old', id: o.id }
        const p = buildPanel(sel, pack)
        const mu = museumFor(sel, pack)
        const latestKey = p?.isanKey?.latestKey
        const relics = [
          ...mu.hometown.map(r => ({ r, historic: false })),
          ...mu.historic.map(r => ({ r, historic: true })),
        ].slice(0, 2)
        return {
          id: o.id,
          name: o.name,
          survivors: latestKey ? (byOrigin.get(latestKey) ?? 0) : 0,
          members: p?.memberNames ?? [],
          events: cueEvents(p?.events ?? []).map(e => ({ date: e.date, title: clean(e.title) })),
          eventsTotal: p?.eventsTotal ?? 0,
          relics: relics.map(({ r, historic }) => ({
            iId: r.iId,
            title: plain(r.title),
            producedOn: r.producedOn ? museumDate(r.producedOn) : null,
            imgSrc: imgSrcOf(r),
            recordUrl: r.recordUrl,
            historic,
          })),
          relicsTotal: mu.total,
        }
      })
    /* ★ 정렬하지 않는다 — regionsOld 의 차례가 곧 이산가족 공표 축의 차례다
         (황해·평남·평북·함남·함북·경기·강원).
       생존자 수 내림차순으로 늘어놓으면 「내 고향을 고르는 자리」가
       「어느 고향에 몇 분 남았나 둘러보는 순위표」가 된다. 당사자는 자기 고향을 이미 안다. */
  }, [pack, isan])

  /* 기증 2경로 — 실태조사 1순위 요청(기록물 수집 보존)에 직접 답하는 창구다.
     목록은 paths.json 이 정하고, 화면은 그중 기증만 골라 카드 옆에 둔다. */
  const memoryDonations = useMemo<MemoryDonation[]>(
    () =>
      DONATION_FIRST.map(id => pack.paths.paths.find(p => p.id === id))
        .filter((p): p is PathItem => Boolean(p))
        .map(p => ({ id: p.id, title: plain(p.title), org: plain(p.org), what: plain(p.what), url: p.applyUrl || p.url, contact: plain(p.contact) })),
    [pack],
  )

  /* ★ 기억 카드의 기준일 — **보여 준 것의 출처**에서 뽑는다.
       여기 실리는 사건(events)은 nk-build-region 이 timeline 레코드만 모은 것이다
       (보도자료는 건수만 세고 사건 목록에는 들어가지 않는다). 그러므로 기준일은
       남북관계연표의 coverageEnd 이고, 카탈로그가 그 단일 진실 소스다.
       전에는 region.json 의 sources 를 앞에서부터 훑어 「coverageEnd 가 있는 첫 항목」
       (북한정보포털 동향 2026-08-11)을 집었다 — 화면에 뜬 사건과 무관한 계열이라
       기준일이 291일 과대로 찍혔고 그 날짜가 PNG·인쇄본에 그대로 남았다.
       museum 은 coverageEnd 가 아니라 **우리가 수집을 돌린 날**이다 — 이름을 갈라 부른다. */
  const memoryAsOf = {
    survivors: isan.latest.asOf,
    events: coverageEndOf('timeline') ?? pack.region.builtAt,
    museumCollected: pack.museum.builtAt,
  }

  return (
    <Block
      tag="후손"
      tone="blue"
      title="기록을 이어받는 사람들 — 1세대가 떠난 뒤 이 기록은 누구의 것인가"
      sub={`${desc.survey.name} · 심층 ${nf(desc.survey.bases.deep)}명 (${desc.survey.publishedAt} 공표)`}
    >
      {/* ── 통일부 공식 안내로 바로 가는 줄 ──
             수치를 읽다가 "그래서 어디서 물어보나"가 되면 안 된다. 통일부가 이미
             운영하는 안내·접수 창구를 맨 위에 둔다. 우리가 대신 접수하지 않는다. */}
      <div className={`${SURFACE.inset} p-4`}>
        <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>통일부 안내로 바로 가기</p>
        <p className={`mt-1 ${TYPE.cap} ${TEXT.soft} ${PROSE}`}>
          신청과 교류는 통일부 이산가족정보통합시스템에서 이루어집니다. 아래에서 바로 열립니다.
        </p>
        {/* 「후손」으로만 부르면 자녀가 없는 집안이 빠진다.
             이산가족법 제2조는 이산가족을 8촌 이내로 정의한다 — 조카·사촌도 당사자다. */}
        <p className={`mt-2 rounded-md border-l-[3px] border-[#1a4e9c] bg-[#eef3fb] px-3 py-2 ${TYPE.cap} ${TEXT.soft} ${PROSE}`}>
          자녀나 손자녀가 아니어도 괜찮습니다. 이산가족법은 이산가족을 <b className={`font-semibold ${TEXT.ink}`}>8촌 이내 친족</b>으로
          정하고 있어, 조카와 사촌도 같은 자격으로 신청하고 기록을 맡기실 수 있습니다.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {([
            ['이산가족 신청·교류 안내', 'https://reunion.unikorea.go.kr/reuni/home/cms/page/uf_info/view.do?mid=SM00000118'],
            ['이산가족찾기 신청·취소', 'https://reunion.unikorea.go.kr/reuni/home/fml/registee/main.do?mid=SM00000119'],
            ['기록물 기증 안내', 'https://reunion.unikorea.go.kr/reuni/home/museum/archive/DonationInfo.do?mid=SM00000265'],
            ['상담 창구 안내', 'https://reunion.unikorea.go.kr/reuni/home/cms/page/uf_counsel/view.do?mid=SM00000126'],
          ] as const).map(([label, href]) => (
            <a key={href} href={href} target="_blank" rel="noreferrer" className={`${BTN.ghost} min-h-[46px]`}>
              {label} ↗
            </a>
          ))}
        </div>
      </div>

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

      {/* ── 진단 다음에 손을 쓸 자리 ──
             위까지는 전부 "후손이 이어받고 싶어 하는데 수단이 없다"는 통계다.
             아래 도구가 이 구획 안에서 그 수단 하나를 실제로 준다 — 후손이 집안의 기억을
             구조화해 적고, 그림 파일이나 인쇄물로 손에 쥐고, 기증 창구로 들고 갈 수 있게. */}
      <MemoryCard homes={memoryHomes} donations={memoryDonations} asOf={memoryAsOf} />
    </Block>
  )
}

/* ══════════════════════ 지금 할 수 있는 일 ══════════════════════

   위의 '후손 다리'는 **진단**이다 — 후손이 이어받고 싶어 하는데 수단이 없다는 것.
   진단만 하고 끝내면 화면이 후손에게 아무것도 주지 않는다. 그래서 이 층을 붙인다.

   ★ 기증 경로가 맨 앞이다.
     실태조사에서 이산가족이 1순위로 요청한 사업이 「사진·물건 등 기록물 수집 보존」 59.9% 였고,
     후손이 조부모의 사진을 기증하는 것이 그 요청에 직접 답하는 행동이기 때문이다.
     우리가 고른 순서가 아니라 이산가족이 고른 순서다.

    정직성 두 가지
     ① actionable 은 **창구가 살아 있다**는 뜻이지 **성사된다**는 뜻이 아니다(예: 북한방문).
     ② '후손 가능' 판정 다수는 법령 정의에서 도출한 것이지 안내 페이지가 그렇게 쓴 것이 아니다.
        "법적으로는 이미 대상 / 안내에는 없음"을 붙여 보여야 오해가 없다. */

const ELIG: Record<string, { glyph: string; label: string; chip: string }> = {
  '후손 가능': { glyph: '◆', label: '후손도 신청 주체가 될 수 있음', chip: TONE.blue.chip },
  '불명': { glyph: '◇', label: '후손 대상 여부가 안내에 없음', chip: ASOF.stale.chip },
  '1세대만': { glyph: '■', label: '이산 1세대 본인만', chip: ASOF.frozen.chip },
}

/* 기증 경로를 맨 앞으로 — 실태조사 1순위 요청에 직접 답하는 행동이기 때문 */
const DONATION_FIRST = ['life-record-donation', 'museum-donation']

function PathCard({ p }: { p: PathItem }) {
  const e = ELIG[p.eligibility] ?? ELIG['불명']
  const apply = p.applyUrl || p.url
  return (
    <li className={`${SURFACE.card} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className={`min-w-0 flex-1 ${TYPE.h3} ${TEXT.ink} ${PROSE}`}>{plain(p.title)}</h4>
        <span className={`shrink-0 rounded px-2 py-0.5 ${TYPE.cap} font-semibold ${e.chip}`}>
          <span aria-hidden="true">{e.glyph}</span> {e.label}
        </span>
      </div>
      <p className={`mt-1.5 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>{plain(p.what)}</p>

      {p.eligibilityQuote && (
        <blockquote className={`mt-2.5 border-l-[3px] border-[#dcdfe4] pl-2.5 ${TYPE.cap} ${TEXT.faint} ${PROSE} dark:border-[#2a2f36]`}>
          자격 근거 — “{plain(p.eligibilityQuote)}”
        </blockquote>
      )}

      <dl className={`mt-2.5 space-y-0.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        <div className="flex gap-1.5">
          <dt className="shrink-0 font-semibold">주관</dt>
          <dd className="min-w-0">{plain(p.org)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0 font-semibold">문의</dt>
          <dd className="min-w-0">{plain(p.contact)}</dd>
        </div>
        {p.legalBasis && (
          <div className="flex gap-1.5">
            <dt className="shrink-0 font-semibold">근거</dt>
            <dd className="min-w-0">{plain(p.legalBasis)}</dd>
          </div>
        )}
      </dl>

      {(p.note || p.counterQuote || (p.how?.length ?? 0) > 0) && (
        <details className="mt-2.5">
          <summary className={`cursor-pointer list-none ${TYPE.cap} font-medium ${TEXT.blue} [&::-webkit-details-marker]:hidden ${FOCUS}`}>
            신청 전에 알아야 할 것 ▾
          </summary>
          {(p.how?.length ?? 0) > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {p.how!.map((h, i) => (
                <li key={i} className={`${TYPE.cap} ${TEXT.soft} ${PROSE}`}>· {plain(h)}</li>
              ))}
            </ul>
          )}
          {p.note && <p className={`mt-1.5 ${TYPE.cap} ${TEXT.soft} ${PROSE}`}>{plain(p.note)}</p>}
          {p.counterQuote && (
            <p className={`mt-1.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>안내 원문 — “{plain(p.counterQuote)}”</p>
          )}
        </details>
      )}

      <p className="mt-3">
        <a href={apply} target="_blank" rel="noreferrer" className={BTN.primary}>
          신청·안내 페이지 열기 <span aria-hidden="true">↗</span>
        </a>
      </p>
    </li>
  )
}

function DescendantActions({ paths, desc }: { paths: PathData; desc: DescData }) {
  const actionable = paths.paths.filter(p => p.actionable)
  const donation = DONATION_FIRST.map(id => actionable.find(p => p.id === id)).filter((p): p is PathItem => Boolean(p))
  const donationIds = new Set(donation.map(p => p.id))
  const rest = actionable.filter(p => !donationIds.has(p.id))
  const closed = paths.paths.filter(p => !p.actionable)
  const top = desc.recordPrograms.기록및공감대[0]

  return (
    <Block
      tag="행동"
      tone="blue"
      title="지금 하실 수 있는 일 — 가족 이름으로 신청할 수 있는 창구"
      sub={`${nf(paths.summary.totalPaths)}건을 확인해 ${nf(actionable.length)}건이 열려 있었습니다 · 링크 ${nf(paths.meta.checkedUrls)}개 가운데 ${nf(paths.meta.liveUrls)}개가 지금도 열립니다 (${paths.builtAt} 실측)`}
    >
      {/* ── ★ 기증 경로 먼저 ── */}
      <div className={`${SURFACE.slab} p-4`}>
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>가장 먼저 할 수 있는 일</p>
        <p className={`mt-1 ${TYPE.body} ${TEXT.soft} ${PROSE}`}>
          {top && (
            <>
              이산가족이 1순위로 요청한 사업은 「{plain(top.label)}」{josa(plain(top.label), '이', '가')}{' '}
              <b className={`font-semibold tabular-nums ${TEXT.ink}`}>{nf1(top.pct)}%</b>였습니다.
            </>
          )}
          {' '}<b className={`font-semibold ${TEXT.ink}`}>후손이 조부모의 사진을 기증하는 것이 그 요청에 직접 답하는 행동입니다</b> —
          {' '}1세대가 원한 일을, 1세대가 없어도 후손이 대신 할 수 있는 유일한 자리이기 때문입니다.
        </p>
      </div>
      <ul className="mt-3 space-y-3">
        {donation.map(p => <PathCard key={p.id} p={p} />)}
      </ul>

      {/* ── 나머지 창구 ── */}
      <p className={`mt-5 ${TYPE.eyebrow} ${TEXT.faint} ${PROSE}`}>그 밖에 후손이 신청할 수 있는 것 {nf(rest.length)}건</p>
      <ul className="mt-2 space-y-3">
        {rest.map(p => <PathCard key={p.id} p={p} />)}
      </ul>

      {/* ── 판정 기준을 밝힌다 ── */}
      <div className={`mt-4 rounded-md border ${ASOF.stale.edge} ${ASOF.stale.band} p-4`}>
        <p className={`${TYPE.eyebrow} ${TEXT.stale} ${PROSE}`}>이 목록을 읽을 때 반드시 알아야 할 것</p>
        <ul className={`mt-1.5 space-y-1 ${TYPE.cap} ${TEXT.soft} ${PROSE}`}>
          <li>
            · <b className="font-semibold">「열려 있다」는 창구가 살아 있다는 뜻이지 성사된다는 뜻이 아닙니다.</b> {plain(paths.meta.actionableCriterion)}
          </li>
          <li>
            · <b className="font-semibold">「후손도 신청 주체가 될 수 있음」의 다수는 법령 정의에서 나온 판정</b>이며, 안내 페이지가 「후손도 됩니다」라고 쓴 것이 아닙니다.
            {' '}법적으로는 이미 대상인데 안내에는 없습니다.
          </li>
          <li>· 근거 — {plain(paths.meta.legalRoot)}</li>
          {paths.meta.caveats.map((c, i) => (
            <li key={i}>· {plain(c)}</li>
          ))}
        </ul>
      </div>

      {/* ── 헛걸음 방지 — 지금은 신청할 수 없는 것 ── */}
      <details className={`mt-3 ${SURFACE.card} p-4`}>
        <summary className={`cursor-pointer list-none ${TYPE.h3} ${TEXT.ink} [&::-webkit-details-marker]:hidden ${FOCUS} ${PROSE}`}>
          지금은 신청할 수 없는 것 {nf(closed.length)}건 ▾
        </summary>
        <p className={`mt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          이 조사에서 <b className="font-medium">「이산 1세대 본인만 가능」으로 판정된 제도는 {nf(paths.summary.gen1OnlyCount)}건</b>입니다.
          {' '}아래 {nf(closed.length)}건은 후손의 자격이 막혀서가 아니라 <b className="font-medium">접수할 창구 자체가 없거나 사라졌기</b> 때문에 신청할 수 없습니다.
          {' '}헛걸음하지 않도록 따로 묶어 둡니다.
        </p>
        <ul className="mt-3 space-y-3">
          {closed.map(p => (
            <li key={p.id} className={`${SURFACE.inset} p-3`}>
              <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>{plain(p.title)}</p>
              <p className={`mt-1 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>{plain(p.what)}</p>
              {p.note && <p className={`mt-1.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{plain(p.note)}</p>}
              <p className="mt-1.5">
                <OutLink href={p.url}>해당 페이지 보기</OutLink>
              </p>
            </li>
          ))}
        </ul>
      </details>

      {/* ── 아직 후손에게 열려 있지 않은 것 — 감추지 않는다 ── */}
      <div className="mt-4">
        <p className={`${TYPE.eyebrow} ${TEXT.faint} ${PROSE}`}>아직 후손에게 열려 있지 않은 것 {nf(paths.gaps.length)}가지</p>
        <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          제도가 없어서가 아니라, 있는 제도가 후손에게 닿지 않는 지점입니다. 고치자는 제안이 아니라 이번 조사에서 실제로 확인된 사실만 적었습니다.
        </p>
        <ul className="mt-2">
          {paths.gaps.map(g => (
            <li key={g.id} className={`border-b py-3 last:border-0 ${SURFACE.hair}`}>
              <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>{plain(g.title)}</p>
              <p className={`mt-1 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>{plain(g.fact)}</p>
              <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>→ {plain(g.consequence)}</p>
              {g.evidence && <p className={`mt-0.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>확인 근거 — {plain(g.evidence)}</p>}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4">
        <span className={`${TYPE.cap} ${TEXT.faint}`}>
          출처 {plain(paths.sources[0]?.name)} 외 {nf(paths.sources.length - 1)}종 · 링크 생존 확인 {paths.builtAt} ·{' '}
        </span>
        <OutLink href={paths.sources[0]?.url}>이산가족정보통합시스템</OutLink>
      </p>
    </Block>
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
        const rows: Array<{ name: string; end: string; fresh: Level; outside?: boolean }> = [
          { name: '이산가족 신청 현황 공표 (통일부)', end: isan.latest.asOf, fresh: 'live' },
          { name: '등록현황 월별 통계 (공공데이터포털)', end: isan.monthly.at(-1)?.month ?? '', fresh: 'live' },
          { name: '연표·보도·동향 기록 (통일부)', end: pack.region.sources.find(s => s.coverageEnd)?.coverageEnd ?? pack.region.builtAt, fresh: 'live' },
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

  /* 주소에 고향이 실려 오면 그 지역을 열어 준다(팩이 준비된 뒤 한 번만). */
  const restored = useRef(false)
  useEffect(() => {
    if (!pack || restored.current) return
    restored.current = true
    const v = new URLSearchParams(window.location.search).get('고향')
    if (!v) return
    if (pack.map.regionsOld.some(o => o.id === v)) { setMode('old'); setSel({ mode: 'old', id: v }) }
    else if (pack.region.regions[v]) { setMode('modern'); setSel({ mode: 'modern', key: v }) }
  }, [pack])

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
      {/* ── 표제 ──
          예전 머리글은 기능 설명("지도 위에서 읽는 자료의 기준일")으로 시작했다.
          그건 만든 사람의 관심사다. 화면을 여는 사람에게 먼저 와야 하는 것은
          **남은 사람이 몇 명인가**다. 수치를 주인공으로 올린다. */}
      <header className={PROSE}>
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>통일부 공공데이터 · 이산가족과 고향</p>

        {view === 'step' ? (
          /* 한걸음씩 모드의 표제 — 숫자를 여기서 쏟지 않는다. 첫 카드가 하나씩 말한다. */
          <>
            <h1 className={`mt-3 ${TYPE.h1} ${TEXT.ink}`}>한 걸음씩 보여 드리겠습니다</h1>
            <p className={`mt-3 max-w-prose ${TYPE.body} ${TEXT.soft}`}>
              화면 하나에 한 가지씩만 나옵니다. [다음] 단추나 키보드 위·아래 화살표,
              또는 스크롤 어느 것으로든 넘기실 수 있습니다.
            </p>
          </>
        ) : (
          <>
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
          네 자료는 조사한 날짜가 서로 다릅니다. 그래서 값마다 기준일을 함께 적었습니다.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link to="/factcheck" className={BTN.primary}>지도에 없는 것은 물어보세요
          </Link>
          <a href="#extinction" className={BTN.ghost}>기록 골든타임 보기 <span aria-hidden="true">↓</span>
          </a>
          <a href="#descendant" className={BTN.ghost}>후손 다리 <span aria-hidden="true">↓</span>
          </a>
          {/* 후손이 직접 남기는 자리로 바로 간다 — 통계만 읽다 나가지 않게 */}
          <a href="#memory-card" className={BTN.ghost}>기억 카드 만들기 <span aria-hidden="true">↓</span>
          </a>
          <a href="#actions" className={BTN.ghost}>지금 할 수 있는 일 <span aria-hidden="true">↓</span>
          </a>
        </div>
          </>
        )}

        {/* ── 보기 방식 — 같은 데이터, 두 밀도. 선택은 저장되어 다음 방문에도 유지된다 ── */}
        <ViewSwitch view={view} onChange={v => switchView(v)} />
      </header>

      {view === 'step' && (
        <StepMode pack={pack} oldRanked={oldRanked} onExit={anchor => switchView('all', anchor)} />
      )}

      {view === 'all' && (
      <>

      {/* ── 고향 찾기 진입 ──
          지도를 읽을 줄 아는 사람만 들어올 수 있는 화면이면 후손은 못 들어온다.
          후손이 아는 것은 지도가 아니라 **집안에서 들은 고향 이름** 하나다.
          그래서 이름만으로 들어오는 문을 표제 바로 아래에 둔다.

          ★ 물음을 "할아버지 고향"으로 좁히지 않는다(사용자 지적, 2026-08-19).
            할머니가 지워지고, 부모 세대와 1세대 본인이 빠지며, 탈북민에게는
            조부모가 아니라 두고 온 가족의 고향일 수 있다. 화면이 누구의 고향인지
            먼저 단정하면 그 바깥에 있는 사람은 자기 자리가 아니라고 느낀다. */}
      <div className={`mt-8 ${SURFACE.slab} p-5`}>
        <h2 className={`${TYPE.h2} ${TEXT.ink} ${PROSE}`}>어느 고향을 찾으십니까?</h2>
        <p className={`mt-1 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
          본인의 고향이든, 부모·조부모께서 떠나오신 곳이든, 북에 두고 온 가족이 살던 곳이든 좋습니다.
          {' '}이산가족 출신지는 광복 당시 구행정구역 {nf(pack.map.regionsOld.length)}종으로만 공표됩니다 —
          {' '}지도를 몰라도 이름을 누르면 그곳이 열립니다.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {oldRanked.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => { setMode('old'); select({ mode: 'old', id: o.id }) }}
              aria-pressed={sel?.mode === 'old' && sel.id === o.id}
              className={`inline-flex items-baseline gap-1.5 rounded-md border px-3 py-2 ${TYPE.sub} font-medium ${FOCUS} ${
                sel?.mode === 'old' && sel.id === o.id
                  ? 'border-[#1a4e9c] bg-[#eef3fb] text-[#1a4e9c] dark:border-[#2f5f9f] dark:bg-[#16202c] dark:text-[#7aa9e8]'
                  : `${SURFACE.line} bg-white ${TEXT.ink} hover:border-[#1a4e9c] dark:bg-transparent`
              }`}
            >
              {o.name}
              <span className={`${TYPE.cap} tabular-nums ${TEXT.faint}`}>{o.n > 0 ? `${nf(o.n)}명` : '집계 없음'}</span>
            </button>
          ))}
        </div>
        <p className={`mt-2.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          옆의 인원은 그 고향이 출신지인 이산가족 생존 신청자 수입니다 ({ymKo(pack.isan.latest.asOf)} 기준).
          {' '}「기타」 {nf(pack.isan.latest.survivors.byOrigin.entries.find(e => e.label === '기타')?.n)}명은 이 {nf(pack.map.regionsOld.length)}종에 속하지 않아 여기에 없습니다.
        </p>
      </div>

      {/* ── 지도 + 패널 ──
          지역을 고르기 전에는 지도 옆 좁은 안내 기둥이 맞다. 그런데 고른 뒤에도
          그 기둥에 모든 구획을 쌓으면 좁은 곳에 길게 늘어지고 지도 아래가 통째로
          빈다(실측 지적, 2026-08-19). 선택 후에는 패널이 지도 아래 전폭으로 내려와
          2열 그리드로 펼쳐진다. */}
      <div className={`mt-8 ${sel ? '' : 'lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]'}`}>
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
              <p className="text-[11px] text-slate-400">지역을 누르면 그 지역의 자료가 아래에 열립니다</p>
            </div>

            <div className="p-3">
              {/* 전폭이 되면 지도가 화면 높이를 넘겨 버린다(가로 800×세로 834 비율) — 폭을 묶는다 */}
              <div className="mx-auto w-full max-w-3xl">
                <NkMapView pack={pack} mode={mode} sel={sel} onSelect={select} />
              </div>
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

        {/* ── 패널: 선택 전엔 우측 기둥, 선택 후엔 지도 아래 전폭 ── */}
        <div ref={panelRef} className={sel ? 'mt-6 min-w-0' : 'mt-4 min-w-0 lg:mt-0'}>
          {sel ? (
            <RegionPanel pack={pack} sel={sel} onClose={() => { setSel(null); syncUrl(null) }} />
          ) : (
            <div className={`${CARD} p-4`}>
              <p className={`text-base font-semibold text-slate-900 dark:text-white ${PROSE}`}>고향을 하나 골라 보세요
              </p>
              <p className={`mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>지도에서 고향을 누르면 이 자리에 그 고향의 자료가 열립니다. 이산가족 신청 현황, 그 지역이 출신지인 북한이탈주민, 공식 기록에 남은 일, 오늘 날씨까지 — 자료마다 기준일이 달라 날짜를 함께 적습니다.
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

      {/* ── 기록 골든타임 (지도 아래, 전폭) ── */}
      <div id="extinction" className="mt-8 scroll-mt-24">
        <ExtinctionClock isan={pack.isan} proj={pack.proj} />
      </div>

      {/* ── 통일 필요성 19년 — 기록 골든타임 **바로 아래**.
             두 곡선을 나란히 두는 것이 요지라 사이에 다른 구획을 끼우지 않는다.
             단, 출처가 다르므로(서울대 통일평화연구원) 배지·문장으로 갈라 표시한다. */}
      <div className="mt-6">
        <OpinionTrend opinion={pack.opinion} isan={pack.isan} />
      </div>

      {/* ── 후손 다리 — 기록 골든타임 바로 뒤에 온다.
             "언제까지 남아 있는가" 다음 질문이 "그 다음은 누구인가"이기 때문이다. */}
      {/* 박물관 둘러보기 — 기록 골든타임 다음, 후손 다리 앞.
             "얼마 안 남았다"를 본 사람이 "무엇이 남아 있나"를 보고, 그다음 "무엇을 할까"로 간다. */}
      <div id="museum-tour" className="mt-8 scroll-mt-24">
        {/* 큰 사진이 먼저, 분류는 그다음 — 사료를 목록이 아니라 사람으로 보이게 한다 */}
        <MuseumBanner
          records={pack.museum.records}
          title="기증해 주신 사진"
          sub={`실향민과 가족이 맡기신 기록물입니다. 지금 ${nf(pack.tour.totalRecords)}건이 박물관에 공개되어 있습니다.`}
        />
        <div className="mt-4">
          <MuseumTour data={pack.tour} />
        </div>
      </div>

      <div id="descendant" className="mt-8 scroll-mt-24">
        <DescendantBridge desc={pack.desc} isan={pack.isan} pack={pack} />
      </div>

      {/* ── 진단 다음에 행동. 후손 다리가 "수단이 없다"고 말했으니
             바로 아래에서 "그래도 오늘 할 수 있는 것"을 준다. */}
      <div id="actions" className="mt-6 scroll-mt-24">
        <DescendantActions paths={pack.paths} desc={pack.desc} />
      </div>

      {/* ── 이 화면이 쓴 자료 전부 ── */}
      <section className={`mt-8 overflow-hidden ${CARD}`}>
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
            { name: `남북이산가족 디지털박물관 공개 사료 ${nf(pack.museum.archive.totCnt)}건`, org: '통일부 이산가족정보통합시스템', end: pack.paths.meta.measured?.archiveNewestProducedOn ?? pack.museum.builtAt, fresh: 'stale' as Level, url: pack.museum.sources[0]?.url ?? null },
            { name: `후손이 신청할 수 있는 제도 ${nf(pack.paths.summary.totalPaths)}종 (창구 링크 실측)`, org: '통일부 · 법제처 국가법령정보', end: pack.paths.builtAt, fresh: 'live' as Level, url: pack.paths.sources[0]?.url ?? null },
            { name: '통일의식조사 — 남북한 통일의 필요성', org: '서울대학교 통일평화연구원', end: pack.opinion.reports.at(-1)?.fieldPeriod?.to ?? '', fresh: 'stale' as Level, url: pack.opinion.licenseUrl, outside: true },
          ].map(s => {
            const n = s.end ? notice(s.end, s.fresh, (s as { reason?: string }).reason) : null
            return (
              <div key={s.name} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 p-3">
                {n && <AsOfPill level={n.level as Level} size="sm" />}
                <span className={`min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200 ${PROSE}`}>
                  {s.name}
                  <span className="ml-1 text-[11px] text-slate-400">{s.org}</span>
                  {(s as { outside?: boolean }).outside && (
                    <span className={`ml-1.5 rounded px-1.5 py-0.5 ${TYPE.cap} font-semibold ${ASOF.stale.chip}`}>통일부 자료 아님</span>
                  )}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-slate-500">기준 {s.end || '미상'}</span>
                <OutLink href={s.url}>원본</OutLink>
              </div>
            )
          })}
        </div>
        <div className="border-t border-slate-100 p-3 dark:border-slate-800">
          <p className={`text-[11px] leading-relaxed text-slate-400 ${PROSE}`}>데이터 팩 생성일 {pack.map.builtAt} · 지도 {pack.map.builtAt} · 지역 {pack.region.builtAt} · 이산가족 {pack.isan.builtAt} · 추계 {pack.proj.builtAt} · 박물관 사료 {pack.museum.builtAt} · 후손 경로 {pack.paths.builtAt} · 통일의식조사 {pack.opinion.builtAt}.
            북한 관련 정보 특성상 공식자료에 수록되지 않은 사실이 존재할 수 있습니다.
          </p>
          <p className={`mt-1 text-[11px] leading-relaxed text-slate-400 ${PROSE}`}>
            박물관 사료는 공개 {nf(pack.museum.archive.totCnt)}건 가운데 본문에서 지역명이 확인된 {nf(pack.museum.meta.slim.keptRecords)}건만 이 화면에 실려 있습니다
            {' '}— 나머지 {nf(pack.museum.meta.slim.droppedRecords)}건은 고향이 없어서가 아니라 본문에 지명이 적혀 있지 않아 지도에 걸 자리가 없는 것입니다.
            {' '}사료 이미지는 저장하지 않고 박물관 원본을 그대로 참조합니다.
            {' '}통일의식조사만 통일부 자료가 아닙니다 — {pack.opinion.licenseFullText}
          </p>
        </div>
      </section>
      </>
      )}
    </div>
  )
}
