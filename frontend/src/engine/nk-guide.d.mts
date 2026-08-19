// nk-guide.mjs 타입 선언 (엔진은 순수 JS — 브라우저·Cloudflare Pages Functions 가 공유)
// 값의 진실은 nk-guide.mjs 다. 여기는 화면(TSX)이 형태를 알게 하는 껍데기일 뿐이다.

export interface GuideFacts {
  region: string
  kind: 'old' | 'modern'
  survivors: { n: number; pct: number; asOf: string } | null
  aliveTotal: { n: number; asOf: string }
  avgAge: number
  defector: { total: number; asOf: string } | null
  events: { total: number; latest: Array<{ date: string; title: string }> }
  museum: { total: number; venue: number; historic: number }
  frozen: Array<{ name: string; since: string }>
  clock: { below10000: string; threshold: string }
}

export interface GuideResult {
  lines: string[]
  next: { target: string; label: string }
}

export const GUIDE_TARGETS: readonly string[]
export const GUIDE_PROMPT: string

export function buildGuideFacts(sel: unknown, pack: unknown): GuideFacts | null
export function validateGuide(raw: unknown, facts: unknown): GuideResult | null
export function fallbackGuide(facts: unknown): GuideResult
export function cardHint(id: string, facts: unknown): string
