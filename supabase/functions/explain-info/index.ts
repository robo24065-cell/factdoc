// Supabase Edge Function (Deno): 정보질문 → 질병청 공식정보 기반 쉬운 설명(한국어)
// 그라운딩 우선(발췌가 있으면 그것만), 없으면 일반 상식 수준만 + 포털 안내. 환각 금지·의료면책. §10.4, §13.10a
// 배포: supabase functions deploy explain-info --no-verify-jwt  · 시크릿: GEMINI_API_KEYS(콤마구분 키 풀)
import { geminiGenerate } from '../_shared/gemini.ts'

// 정보읽기(설명): 가장 유창한 3.5-flash 우선 → 3.1-flash-lite → 안정 GA(2.5) 순 폴백.
const MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash']

const SYSTEM = `너는 질병관리청 공식 건강정보를 쉽고 따뜻하게 풀어주는 안내자다. 사용자의 [질문]에 곧바로 도움이 되게 답하라.
작성 방식:
- 사용자의 [질문]이 묻는 바(정의·전파경로·증상·예방·관리 등)에 정확히 초점을 맞춰 답하라. 전체 3~5문장, 친근하지만 정확하게.
- [공식 발췌]가 주어지면 그 내용을 근거로 삼아라(발췌에 없는 의학적 사실을 지어내지 마라). 발췌가 여러 개면 핵심을 엮어 매끄럽게.
- [공식 발췌]가 "(없음)"이면, **널리 확립된 일반 의학지식으로 질문에 실제로 답하라**(예: 전파경로를 물으면 주된 전파경로를 구체적으로). 질문이 전파·예방 등이어도 **그 질병의 주요 증상도 1문장 곁들여** 사용자가 전체를 가늠하게 하라. 단 첫머리나 끝에 "질병관리청 공식 자료에는 아직 정리돼 있지 않아 일반 의학정보로 안내드린다"는 취지를 한 번 밝히고, 확실치 않은 세부(정확한 통계·최신 지침)는 단정하지 말고 "정확·최신 정보는 질병관리청 국가건강정보포털에서 확인"을 안내하라.
- ★치료제·약·완치·특효는 단정하지 마라(치료는 "전문가 상담"으로). 특정 식품·민간요법의 치료·예방 효과를 단정하지 마라.
- 내부 처리 용어 금지. 출처 기관(질병관리청)을 자연스럽게 한 번 언급. 어려운 의학용어는 괄호로 쉬운 말 덧붙임.
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
    const { disease, sections, question } = await req.json()
    if (!disease || typeof disease !== 'string') return json({ error: 'disease(string) 필요' }, 400)

    const excerpt = Array.isArray(sections) && sections.length
      ? sections.map((s: { section?: string; text?: string }) => `- ${s.section ? `[${s.section}] ` : ''}${s.text ?? ''}`).join('\n')
      : '(없음)'
    const q = typeof question === 'string' && question.trim() ? question.trim() : `${disease}에 대해 알려줘`
    const prompt = `[주제] ${disease}\n[질문] ${q}\n[공식 발췌]\n${excerpt}`

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
