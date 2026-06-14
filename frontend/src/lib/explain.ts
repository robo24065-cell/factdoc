import { supabase } from './supabase'
import type { Judgement, Verdict } from '../engine'

const VLABEL: Record<Verdict, string> = {
  true: '사실(공식 근거와 일치)',
  partial: '부분적으로 맞음(과장되었거나 조건이 빠짐)',
  false: '사실 아님(공식 근거와 다름)',
  unverified: '공식 근거 없음(확인 어려움)',
}

// 판정 + 근거 → 사람이 읽기 쉬운 AI 설명문. 실패 시 null(설명 생략, 판정/근거는 그대로 노출).
export async function explainVerdict(claim: string, j: Judgement): Promise<string | null> {
  if (!supabase) return null
  try {
    const points = j.trace
      .filter((s) => s.outcome && s.kind !== 'normalize')
      .map((s) => s.detail || s.label)
      .slice(0, 4)
    const sources = j.citations.map((c) => ({ portal: c.portal, title: c.title }))
    const { data, error } = await supabase.functions.invoke('explain-verdict', {
      body: { claim, verdict: VLABEL[j.verdict], sources, points, warning: j.warning ?? null },
    })
    if (error || !data) return null
    const text = (data as { explanation?: string }).explanation
    return text?.trim() || null
  } catch {
    return null
  }
}
