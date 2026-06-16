// Supabase Edge Function (Deno): 정보질문 → 질병청 공식정보 기반 쉬운 설명(한국어)
// 그라운딩 우선(발췌가 있으면 그것만), 없으면 일반 상식 수준만 + 포털 안내. 환각 금지·의료면책. §10.4, §13.10a
// 배포: supabase functions deploy explain-info --no-verify-jwt  · 시크릿: GEMINI_API_KEYS(콤마구분 키 풀)
import { geminiGenerate } from '../_shared/gemini.ts'

// 정보읽기(설명): 가장 유창한 3.5-flash 우선 → 3.1-flash-lite → 안정 GA(2.5) 순 폴백.
const MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash']

const SYSTEM = `너는 질병관리청 공식 건강정보를 쉽고 따뜻하게 풀어주는 안내자다. 사용자가 어떤 질병·건강 주제의 정의/증상/예방 정보를 물었다.
작성 방식:
- 핵심을 먼저 한 문장으로 짚고, 이어서 원인·증상·예방·관리 중 질문에 맞는 내용을 자연스럽게 풀어라. 전체 3~5문장, 친근하지만 정확하게.
- [공식 발췌]가 주어지면 그 내용만 근거로 삼아라(발췌에 없는 의학적 사실을 지어내지 마라). 발췌가 여러 개면 핵심을 엮어 매끄럽게.
- [공식 발췌]가 없으면, 널리 알려진 기본 정의만 1~2문장으로 조심스럽게 제시하고 "정확·최신 정보는 질병관리청 국가건강정보포털에서 확인하세요"라고 안내하라. 불확실한 건 단정하지 마라.
- 내부 처리 용어 금지. 출처 기관(질병관리청)을 자연스럽게 한 번 언급.
- 어려운 의학용어는 괄호로 쉬운 말을 덧붙여라(예: 고혈압(혈압이 높은 상태)).
- 마지막에 "이 정보는 진단이 아니며, 증상이 의심되면 의료기관·전문가와 상담하세요." 취지의 한 문장으로 마무리.
출력은 설명 문장만(따옴표·머리말·목록기호·마크다운 강조 별표(**) 없이, 자연스러운 문단).`

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { disease, sections } = await req.json()
    if (!disease || typeof disease !== 'string') return json({ error: 'disease(string) 필요' }, 400)

    const excerpt = Array.isArray(sections) && sections.length
      ? sections.map((s: { section?: string; text?: string }) => `- ${s.section ? `[${s.section}] ` : ''}${s.text ?? ''}`).join('\n')
      : '(없음)'
    const prompt = `[주제] ${disease}\n[공식 발췌]\n${excerpt}`

    const { text: summary } = await geminiGenerate({
      system: SYSTEM,
      prompt,
      models: MODELS,
      generationConfig: { temperature: 0.3, maxOutputTokens: 700, thinkingConfig: { thinkingBudget: 0 } },
    })
    return json({ summary })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
