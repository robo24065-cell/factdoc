// Supabase Edge Function (Deno): 사용자가 '불만족'한 답변을 AI가 검토 → 부실 여부 판정.
// 사용자가 마구 누른 오클릭을 거르고, 진짜 부실/오답만 관리자 부실응답 큐로 승격하기 위한 1차 필터.
// 배포: supabase functions deploy review-answer --no-verify-jwt  · 시크릿: GEMINI_API_KEYS
import { geminiGenerate } from '../_shared/gemini.ts'

const MODELS = ['gemini-2.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash']

const SYSTEM = `너는 건강정보 팩트체커의 '답변 품질 심사관'이다. 사용자가 어떤 답변에 '불만족'을 눌렀다. 그 질문과 답변 전체(판정·근거·설명 카드)를 보고, 답변이 실제로 부실/부정확한지 판정하라.
판단 기준:
- 부실(poor=true): 질문에 제대로 답하지 못함 / 공식 근거 없이 얼버무림 / 핵심을 놓침 / 사실과 달라 보임 / 너무 짧거나 동문서답.
- 양호(poor=false): 질문에 맞게 공식 근거(질병관리청·식약처 등)와 함께 명확히 답함. 이 경우 사용자가 오클릭했거나 단순 불만일 수 있음.
- 너는 답변을 다시 작성하지 말고, 부실 여부와 한 줄 사유만 판정한다.
출력은 JSON만: {"poor": true/false, "reason": "한국어 한 줄 사유(관리자가 수정 방향을 알 수 있게)"}`

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
    const { claim, verdict, snapshot } = await req.json()
    if (!claim || typeof claim !== 'string') return json({ error: 'claim 필요' }, 400)
    const prompt = `[질문] ${claim}\n[판정] ${verdict ?? ''}\n[사용자가 본 답변 전체]\n${(snapshot ?? '').slice(0, 6000)}`
    const { text } = await geminiGenerate({
      system: SYSTEM, prompt, models: MODELS,
      generationConfig: { responseMimeType: 'application/json', temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
    })
    let out: { poor?: boolean; reason?: string } = {}
    try { out = JSON.parse(text) } catch { out = { poor: true, reason: 'AI 검토 파싱 실패 — 수동 확인 필요' } }
    return json({ poor: !!out.poor, reason: String(out.reason ?? '') })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
