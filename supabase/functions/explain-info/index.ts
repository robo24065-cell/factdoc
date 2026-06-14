// Supabase Edge Function (Deno): 정보질문 → 질병청 공식정보 기반 쉬운 설명(한국어)
// 그라운딩 우선(발췌가 있으면 그것만), 없으면 일반 상식 수준만 + 포털 안내. 환각 금지·의료면책. §10.4, §13.10a
// 배포: supabase functions deploy explain-info --no-verify-jwt  · 시크릿: GEMINI_API_KEY(이미 등록)

const MODEL = 'gemini-2.5-flash'

const SYSTEM = `너는 질병관리청 공식 건강정보 안내자다. 사용자가 어떤 질병·건강 주제의 정의/증상/예방 정보를 물었다.
규칙:
- [공식 발췌]가 주어지면 그 내용만 근거로 2~4문장으로 일반인이 이해하기 쉽게 설명하라(발췌에 없는 내용 보태지 마라).
- [공식 발췌]가 없으면, 그 주제에 대해 널리 알려진 기본 정의만 1~2문장으로 간단히 제시하고, 정확·최신 정보는 '질병관리청 국가건강정보포털'에서 확인하라고 안내하라. 불확실하면 단정하지 말고 일반적 수준만.
- 내부 처리 용어 금지. 출처 기관명(질병관리청)을 자연스럽게 언급.
- 마지막에 "진단이 아니며, 증상이 의심되면 의료기관·전문가와 상담하세요." 취지의 한 문장을 덧붙여라.
출력은 설명 문장만(따옴표·머리말 없이).`

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
    const key = Deno.env.get('GEMINI_API_KEY')
    if (!key) return json({ error: 'GEMINI_API_KEY 미설정' }, 500)
    const { disease, sections } = await req.json()
    if (!disease || typeof disease !== 'string') return json({ error: 'disease(string) 필요' }, 400)

    const excerpt = Array.isArray(sections) && sections.length
      ? sections.map((s: { section?: string; text?: string }) => `- ${s.section ? `[${s.section}] ` : ''}${s.text ?? ''}`).join('\n')
      : '(없음)'
    const prompt = `[주제] ${disease}\n[공식 발췌]\n${excerpt}`

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } },
      }),
    })
    if (!res.ok) return json({ error: `Gemini ${res.status}`, detail: await res.text() }, 502)
    const data = await res.json()
    const summary = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
    return json({ summary })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
