// Gemini 파서(Edge Function parse-claim) 호출 → 정규화된 트리플
// 진실 판단은 하지 않음(룰·그래프가 함). 실패 시 빈 배열 → 규칙 파서만 사용.
import { supabase } from './supabase'
import type { Triple } from '../engine'
import { rawToTriples, type RawClaim } from '../engine/fromRaw'

export async function geminiTriples(text: string): Promise<Triple[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase.functions.invoke('parse-claim', { body: { text } })
    if (error || !data) return []
    const claims: RawClaim[] = (data as { claims?: RawClaim[] }).claims ?? []
    return rawToTriples(claims, text)
  } catch {
    return []
  }
}
