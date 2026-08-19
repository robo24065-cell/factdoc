// nk-guide.mjs 타입 선언 (엔진은 순수 JS — 브라우저·Cloudflare Pages Functions 가 공유)
// 값의 진실은 nk-guide.mjs 다. 여기는 화면(TSX)이 형태를 알게 하는 껍데기일 뿐이다.

export interface GuideCompare {
  /** 이산가족 축 기준일 — maps.defectorPct 는 이 날짜가 아니다(축이 다르다) */
  asOf: string | null
  of: number
  /** 순위를 센 축의 생존자 수 — survivors.n(공표 축)과 다른 계보다 */
  survivorsInAxis: number
  /** 발표된 자리만 순위로 쓴다. published 가 null 이면 「N위」라는 말을 만들지 않는다 */
  priority: { sum: number | null; published: '1순위' | '2순위' | '가장 여유 있는 곳' | null; note: string }
  drop: { pct: number; period: string | null } | null
  density: {
    v: number
    rankLow: number
    min: { region: string; v: number } | null
    max: { region: string; v: number } | null
    gapX: number | null
  }
  maps: {
    isanPct: number | null
    isanAsOf: string | null
    defectorPct: number | null
    /** 탈북민 재북 출신지 계열의 기준일 — 이산가족 축보다 5년 이상 오래됐다 */
    defectorAsOf: string | null
  } | null
}

export interface GuideFacts {
  region: string
  kind: 'old' | 'modern'
  /** 이산가족 수치·compare 가 실제로 속한 광복 당시 구행정구역 이름 (현행 지역 선택 시 필수 표기) */
  originLabel: string | null
  survivors: { n: number; pct: number; asOf: string } | null
  aliveTotal: { n: number; asOf: string }
  avgAge: { v: number; asOf: string | null }
  defector: { total: number; asOf: string } | null
  /* events.asOf = 합산 계열(연표·보도·동향)의 확인 하한(coverageEndOf 의 min) — 단일 기준일이 아니다 */
  events: { total: number; latest: Array<{ date: string; title: string }>; asOf: string | null }
  /* museum.collectedAt = 목록을 받아 온 수집일 — 자료의 기준일이 아니다 */
  museum: { total: number; venue: number; historic: number; collectedAt: string | null }
  frozen: Array<{ name: string; since: string }>
  clock: { below10000: string; threshold: string }
  /* analysis.json 확정값에서 옮긴 7곳 비교 — analysis 미적재 시 null */
  compare: GuideCompare | null
}

export interface GuideResult {
  lines: string[]
  next: { target: string; label: string }
}

export const GUIDE_TARGETS: readonly string[]
export const GUIDE_PROMPT: string

export function buildGuideFacts(
  sel: unknown,
  pack: unknown,
  extra?: { eventsAsOf?: string | null; analysis?: unknown } | null,
): GuideFacts | null
export function validateGuide(raw: unknown, facts: unknown): GuideResult | null
export function fallbackGuide(facts: unknown): GuideResult
export function cardHint(id: string, facts: unknown): string
