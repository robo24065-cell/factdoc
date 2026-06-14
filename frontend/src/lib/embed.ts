// 쿼리 텍스트 → 1024d 임베딩(Edge Function embed-text, Gemini embedding-001). 실패 시 null.
// 코퍼스(scripts/embed.mjs)와 동일 모델·차원이라 코사인 비교가 일관됨.
import { supabase } from './supabase'

export async function embedText(text: string): Promise<number[] | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.functions.invoke('embed-text', { body: { text } })
    if (error || !data) return null
    const v = (data as { embedding?: number[] }).embedding
    return Array.isArray(v) && v.length ? v : null
  } catch {
    return null
  }
}

// pgvector 텍스트 리터럴([...]) — RPC 인자/컬럼 저장용(PostgREST 벡터 직렬화 모호성 회피)
export function vecLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`
}
