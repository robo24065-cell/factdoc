// nk-search.mjs / nk-llm.mjs 타입 선언 (엔진은 순수 JS — 프론트·CLI·평가 하니스가 공유)
export interface NkDataset {
  name: string; provider: string; url: string | null; topic: string
  asOf: string; coverageEnd: string
  freshness: 'live' | 'stale' | 'frozen'
  frozenReason: string | null; note: string | null
  status?: string; searchPriority?: number
}
export interface NkRecord {
  id: number; datasetId: string; kind: string; topic: string
  title: string; body: string; occurredOn: string | null
  asOf: string; coverageEnd: string; freshness: 'live' | 'stale' | 'frozen'
  frozenReason: string | null; sourceName: string; sourceUrl: string | null
  priority: number; entities: string[]; isLatestInDataset: boolean
}
export interface Notice { level: 'live' | 'stale' | 'frozen'; gapDays: number; text: string }
export interface NkAnswer {
  level: 'timeline' | 'frozen_answer' | 'dated_answer' | 'stale_answer' | 'no_evidence'
  Q: any
  topicNotice?: { topic: string; state: string; since: string; text: string } | null
  groups?: Array<{ dsKey: string; ds: NkDataset; hits: Array<{ r: NkRecord; score: number }>; notice: Notice }>
  items?: Array<{ r: NkRecord; ds: NkDataset; notice: Notice }>
  sources?: NkDataset[]
  agg?: any; numeric?: any; related?: any
  totalHits?: number; available?: number; widened?: boolean
  llmUsed?: string[]
}
export function buildIndex(data: any): any
export function search(ix: any, q: string, opts?: any): { Q: any; hits: any[] }
export function answer(ix: any, q: string, opts?: any): NkAnswer
export function answerAsync(ix: any, q: string, opts?: any): Promise<NkAnswer>
export function asOfNotice(rec: NkRecord, askedAt?: Date): Notice
export function topicNotice(Q: any): any
