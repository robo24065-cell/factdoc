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
  /* relation_answer: 문서 근거는 0건인데 관계망이 답할 수 있는 경우
     pending_only: 준비된 데이터셋 중 어느 것도 이 질문 유형에 답할 수 없는 경우
                   (어휘 질문 등) — 문서를 근거로 올리지 않고 미연동 안내를 답으로 낸다 */
  level: 'timeline' | 'frozen_answer' | 'dated_answer' | 'stale_answer' | 'no_evidence'
    | 'relation_answer' | 'pending_only'
  Q: any
  topicNotice?: { topic: string; state: string; since: string; text: string } | null
  groups?: Array<{ dsKey: string; ds: NkDataset; hits: Array<{ r: NkRecord; score: number }>; notice: Notice }>
  items?: Array<{ r: NkRecord; ds: NkDataset; notice: Notice }>
  sources?: NkDataset[]
  agg?: any; numeric?: any; related?: any; relation?: any
  /* 미연동 자료 안내 — { key, name, url, exclusive, note } */
  pending?: { key: string; name: string; url: string | null; exclusive: boolean; note: string | null } | null
  totalHits?: number; available?: number; widened?: boolean
  llmUsed?: string[]
}
export function buildIndex(data: any): any
export function search(ix: any, q: string, opts?: any): { Q: any; hits: any[] }
export function answer(ix: any, q: string, opts?: any): NkAnswer
export function answerAsync(ix: any, q: string, opts?: any): Promise<NkAnswer>
export function asOfNotice(rec: NkRecord, askedAt?: Date): Notice
export function topicNotice(Q: any): any
