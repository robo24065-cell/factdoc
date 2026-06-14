// 정보질문 응답 — 질병청 코퍼스(공식 발췌) 우선 + AI 요약(그라운딩). 환각 방지·의료면책.
// 2단계: ① 공식 발췌 먼저(빠름) → ② AI 요약 비동기 채움.
import { supabase } from './supabase'
import { fetchDiseaseInfo, type DiseaseSection } from './db'
import type { Citation } from '../engine'

export interface InfoAnswer {
  disease: string
  summary: string
  sections: DiseaseSection[]
  hasOfficial: boolean
  citation?: Citation     // 관리 안내 출처(질병청)
  isGuidance?: boolean    // 조언/관리 안내(결정론) 여부
}

// ① 공식 발췌(코퍼스) — 빠른 1단계
export async function fetchDiseaseSections(disease: string): Promise<DiseaseSection[]> {
  const all = (await fetchDiseaseInfo(disease)) ?? []
  return all.filter((s) => s.text && s.text.length > 30).slice(0, 6)
}

// ② 그라운딩 요약 — Gemini(발췌 있으면 그것만, 없으면 일반 상식+포털 안내). 실패 시 '' 반환.
export async function explainDiseaseInfo(disease: string, sections: DiseaseSection[]): Promise<string> {
  if (!supabase) return ''
  try {
    const { data } = await supabase.functions.invoke('explain-info', {
      body: { disease, sections: sections.map((s) => ({ section: s.section, text: s.text })) },
    })
    return (data as { summary?: string } | null)?.summary ?? ''
  } catch {
    return ''
  }
}
