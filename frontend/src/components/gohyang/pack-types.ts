/* ────────────────────────────────────────────────────────────────
   고향잇기 — 데이터 팩 타입 (GohyangOn.tsx 에서 순수 이동, 동작 무변경)

   scripts/nk-gohyang-pack.mjs 가 public/gohyang/ 에 떨어뜨리는 JSON 의 모양이다.
   화면 코드가 여러 파일로 갈라진 뒤에도 팩의 모양은 한 곳에서만 말한다.
   ──────────────────────────────────────────────────────────────── */

import type { MuseumSections } from '../MuseumTour'

export type Level = 'live' | 'stale' | 'frozen'
export type Tone = 'emerald' | 'amber' | 'violet' | 'blue' | 'slate'

export type MapRegion = { id: string; name: string; nameEn: string; path: string; centroid: [number, number] }
export type MapMissing = { id: string; absorbedIn: string; note: string }
export type MapOld = {
  id: string; name: string; members: string[]; paths: string[]; centroid: [number, number]
  missing?: MapMissing[]; marker?: { cx: number; cy: number; r: number }; note?: string
}
export type MapCity = { name: string; x: number; y: number; regionId: string }
export type NkMapData = {
  builtAt: string
  sources: Array<{ name: string; url?: string; license?: string; note?: string; retrieved?: string }>
  projection: { note: string }
  viewBox: string
  regionsModern: MapRegion[]
  regionsOld: MapOld[]
  crosswalk: { map: Record<string, { name: string; modern: string[]; missing?: MapMissing[] }>; note: string }
  cities: MapCity[]
}

export type Weather = {
  station: string; stationEn: string; date: string
  tempC: number | null; maxC: number | null; minC: number | null; prcpMm: number | null; usedYear: number
}
export type RegionInfo = {
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
export type RegionSource = { name: string; url?: string; file?: string; urls?: string[]; asOf?: string; coverageEnd?: string }
export type NkRegionData = {
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

export type IsanMonthly = { month: string; avgAge: number; origin: Record<string, number>; total: number }
export type Entry = { label: string; n: number; pct: number }
export type Breakdown = { entries: Entry[]; total: number; totalPct: number }
export type IsanSnapshot = {
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
export type IsanSource = { name: string; kind: string; landing: string; org: string; asOf: string; note?: string }
export type IsanData = {
  builtAt: string
  sources: IsanSource[]
  boards: { request: { url: string; totalPosts: number }; exchange: { url: string; totalPosts: number } }
  monthly: IsanMonthly[]
  latest: IsanSnapshot
  exchange: { asOf: string; attachment: string; boardUrl: string; byYear: Array<{ year: number }> }
  chronology: Array<{ era: string; date: string; event: string }>
}

export type ProjYear = { year: number; asOf: string; expected: number; expectedCalibrated: number }
export type ProjData = {
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
export type DescGap = {
  id: string; title: string
  a: { label: string; pct: number }
  b: { label: string; pct: number }
  gapPp: number; reading: string
}
export type DescData = {
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
export type MuseumRec = {
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
export type MuseumData = {
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
export type PathItem = {
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
export type PathGap = { id: string; title: string; fact: string; consequence: string; evidence?: string }
export type PathData = {
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
export type OpinionRow = { label: string; values: number[] }
export type OpinionSeries = {
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
export type OpinionData = {
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

/* 이산가족정보통합시스템(reunion.unikorea.go.kr) 신규 수집분 — 12개 코너 중 고향 축이 붙는 두 코너.
   ★ 저작권 — 사진은 통일부가 게시했으나 저작권자는 제공처(미디어한국학·평화문제연구소·
     영남통일교육센터·국가기록원 등)다. 화면에 걸 때 **제공처 표기와 원문 링크가 반드시 함께** 나가야 한다
     (manifest.json 의 reunion.json caution 이 요구하는 조건). 우리는 이미지를 저장하지 않고
     썸네일 URL 을 그대로 참조한다 — 원본(최대 7.4MB)은 부르지 않는다.
   ★ 영상은 링크와 메타데이터만 갖는다. 내려받지 않는다. */
export type ReunionPhoto = {
  fileId: string
  tab: string
  placeName: string
  areaRaw: string | null
  provider: string | null
  thumbUrl: string
  viewUrl: string
  sourceUrl: string
  oldKeys: string[]
  oldNames: string[]
  via: string
  evidence: string | null
  tabAgrees: boolean | null
}
export type ReunionLetter = {
  id: number
  title: string
  productionYear: number | null
  sourceUrl: string
  videoUrl: string | null
  oldKeys: string[]
  oldNames: string[]
  via: string
  evidence: string[]
  evidenceLines?: string[]
}
export type ReunionData = {
  builtAt: string
  builder: string
  collectedAt: Record<string, string>
  axis: Array<{ key: string; name: string }>
  htgallery: {
    corner: string; siteBadgeTotal: number | null; collected: number; mapped: number
    unmapped: number; mappingRate: number; multiRegion: number
    byOld: Record<string, number>
    unmappedReasons: Array<{ fileId: string; tab: string; placeName: string; why: string }>
    items?: ReunionPhoto[]
  }
  /* ★ items 는 선택 사항이다 — 개인정보로 개별 항목을 배포물에서 빼는 코너가 있다.
     영상편지가 실제로 그렇다(제목에 신청인 실명, 자막에 본적지). 그때는 itemsWithheld 와
     축별 집계 byOld 만 온다. 여기에 `items: ReunionLetter[]` 라고 단언해 두면 타입 검사가
     통과하면서 화면이 런타임에 죽는다 — 실제로 그 사고가 났다. 데이터 그대로 적는다. */
  vletter: {
    corner: string; siteBadgeTotal: number | null; collected: number; withCaption: number
    mapped: number; mappingRateOfAll: number; mappingRateOfCaptioned: number; multiRegion: number
    byOld: Record<string, number>
    rule: string; ruleTradeoff: string
    items?: ReunionLetter[]
    itemsWithheld?: { n: number; why: string; seeOriginal?: string }
  }
  byOld: Record<string, { key: string; name: string; htgallery: number; vletter: number; total: number }>
  caveats: string[]
}

export type Pack = {
  map: NkMapData; region: NkRegionData; isan: IsanData; proj: ProjData; desc: DescData
  museum: MuseumData; paths: PathData; opinion: OpinionData; tour: MuseumSections
  reunion: ReunionData
}

/* 지도 모드 — 현행 행정구역 / 광복 당시 구행정구역(= 이산가족 '고향' 축) */
export type Mode = 'modern' | 'old'
export type Sel = { mode: 'modern'; key: string } | { mode: 'old'; id: string }

/* 보기 방식 — 같은 데이터를 두 밀도로 읽는다 (2026-08-19 사용자 지시).
   all  = 한눈에: 지도+패널+소멸시계+후손층을 한 화면에 (기존 대시보드)
   step = 한걸음씩: 노인·어린이용. 한 번에 카드 하나, 큰 글씨, 쉬운 문장.
   선택은 localStorage 에 저장해 다시 와도 유지한다. */
export type View = 'all' | 'step'

/* 데이터 팩이 놓이는 곳 — fetch 와 지연 fetch(analysis.json)가 같은 뿌리를 쓴다 */
export const PACK = '/gohyang'
