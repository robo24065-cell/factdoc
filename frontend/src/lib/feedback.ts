// 답변 품질 피드백 — 사용자 만족/불만족 + 불만족 시 AI(또는 규칙) 검토 → 부실응답 큐 적재.
// 저장: localStorage(데모/단일기기 즉시 작동) + Supabase(있으면 교차기기). AI 검토: review-answer Edge Function(배포 시) → 미배포 시 규칙 휴리스틱.
import { supabase } from './supabase'

export interface PoorItem {
  id: string
  claim: string
  verdict: string
  snapshot: string        // 사용자가 본 답변 전체(카드·근거 포함)
  ts: number
  aiVerdict: 'poor' | 'looks-ok' | 'pending'
  aiReason: string
  resolved?: boolean      // 관리자가 처리함
}

const LS_QUEUE = 'factdoc_poor_queue'
const LS_STATS = 'factdoc_fb_stats'

function loadLocal(): PoorItem[] { try { return JSON.parse(localStorage.getItem(LS_QUEUE) || '[]') } catch { return [] } }
function saveLocal(items: PoorItem[]) { try { localStorage.setItem(LS_QUEUE, JSON.stringify(items.slice(0, 300))) } catch { /* quota */ } }

// 만족/불만족 누적 카운트(대시보드 표시)
export function feedbackStats(): { up: number; down: number } {
  try { return JSON.parse(localStorage.getItem(LS_STATS) || '{"up":0,"down":0}') } catch { return { up: 0, down: 0 } }
}
function bumpStat(k: 'up' | 'down') { const s = feedbackStats(); s[k]++; try { localStorage.setItem(LS_STATS, JSON.stringify(s)) } catch { /* */ } }

// 규칙 기반 1차 검토 — AI Edge Function 미배포 시 대체(보류·무출처·과단문이면 부실 후보).
function heuristicReview(verdict: string, snapshot: string): { poor: boolean; reason: string } {
  const s = snapshot || ''
  if (verdict === 'unverified' || /공식 근거가\s*(아직\s*)?없|확인이 어려|단정하기 어려|근거가 제한/.test(s))
    return { poor: true, reason: '공식 근거 없이 보류·확인불가로 처리됨 — 코퍼스/룰 보강 후보' }
  if (!/출처|질병관리청|식품의약품안전처|KNHANES|감염병포털/.test(s))
    return { poor: true, reason: '공식 출처 인용이 보이지 않음 — 그라운딩 점검 필요' }
  if (s.replace(/\s/g, '').length < 80)
    return { poor: true, reason: '설명이 지나치게 짧음 — 답변 보강 필요' }
  return { poor: false, reason: '공식 출처·판정이 있어 형식상 양호 — 사용자 불만 사유 별도 확인' }
}

function uid(): string { return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}` }

// 만족 피드백 — 가벼운 카운트만.
export function feedbackUp(claim: string, verdict: string): void {
  bumpStat('up')
  if (supabase) { try { void supabase.from('answer_feedback').insert({ rating: 'up', claim, verdict }) } catch { /* */ } }
}

// 불만족 피드백 — 스냅샷 + AI/규칙 검토 → 부실응답 큐.
export async function feedbackDown(claim: string, verdict: string, snapshot: string): Promise<PoorItem> {
  bumpStat('down')
  let review = heuristicReview(verdict, snapshot)
  // AI 검토 우선(배포 시) — review-answer Edge Function. 실패하면 규칙 결과 유지.
  if (supabase) {
    try {
      const { data } = await supabase.functions.invoke('review-answer', { body: { claim, verdict, snapshot: snapshot.slice(0, 6000) } })
      const d = data as { poor?: boolean; reason?: string } | null
      if (d && typeof d.poor === 'boolean') review = { poor: d.poor, reason: d.reason || review.reason }
    } catch { /* keep heuristic */ }
  }
  const item: PoorItem = { id: uid(), claim, verdict, snapshot: (snapshot || '').slice(0, 6000), ts: Date.now(), aiVerdict: review.poor ? 'poor' : 'looks-ok', aiReason: review.reason }
  const items = loadLocal(); items.unshift(item); saveLocal(items)
  if (supabase) { try { void supabase.from('answer_feedback').insert({ rating: 'down', claim, verdict, snapshot: item.snapshot, ai_verdict: item.aiVerdict, ai_reason: item.aiReason }) } catch { /* */ } }
  return item
}

// 관리자 — 부실응답 큐 조회(Supabase ∪ localStorage, 최신순). Supabase 우선, 없으면 로컬.
export async function loadPoorQueue(): Promise<PoorItem[]> {
  let remote: PoorItem[] = []
  if (supabase) {
    try {
      const { data } = await supabase.from('answer_feedback').select('*').eq('rating', 'down').order('created_at', { ascending: false }).limit(300)
      remote = (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id), claim: String(r.claim ?? ''), verdict: String(r.verdict ?? ''), snapshot: String(r.snapshot ?? ''),
        ts: r.created_at ? Date.parse(String(r.created_at)) : 0, aiVerdict: (r.ai_verdict as PoorItem['aiVerdict']) ?? 'pending', aiReason: String(r.ai_reason ?? ''), resolved: !!r.resolved,
      }))
    } catch { /* */ }
  }
  const local = loadLocal()
  // 클레임+ts 근접 중복 제거(로컬·원격 동시 적재분)
  const seen = new Set(remote.map((r) => r.claim))
  const merged = [...remote, ...local.filter((l) => !seen.has(l.claim))]
  return merged.sort((a, b) => b.ts - a.ts)
}

export async function deletePoorItem(item: PoorItem): Promise<void> {
  saveLocal(loadLocal().filter((i) => i.id !== item.id))
  if (supabase && /^\d/.test(item.id) === false) { /* 로컬 id는 Supabase에 없을 수 있음 */ }
  if (supabase) { try { void supabase.from('answer_feedback').delete().eq('claim', item.claim).eq('rating', 'down') } catch { /* */ } }
}

export function resolvePoorItemLocal(id: string): void {
  saveLocal(loadLocal().map((i) => (i.id === id ? { ...i, resolved: true } : i)))
}
