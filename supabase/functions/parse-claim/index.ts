// Supabase Edge Function (Deno): 주장 텍스트 → 트리플(JSON) — Gemini Flash-Lite
// 진실 판단은 하지 않는다(룰·그래프 엔진 담당). 파싱만. CLAUDE.md §13.4
//
// 배포:  supabase functions deploy parse-claim
// 시크릿: supabase secrets set GEMINI_API_KEY=AIza...   ← 표준 API 키 필요(AQ. 임시토큰 아님)
// 호출:  supabase.functions.invoke('parse-claim', { body: { text } })

const MODEL = 'gemini-2.5-flash-lite'

const SYSTEM = `너는 건강정보 팩트체커의 '주장 추출기'다. 입력 문장에서 검증 대상이 되는 주장을 구조화된 트리플(JSON)로만 변환한다.
- 너는 주장의 진실 여부를 절대 판정하지 않는다(판정은 별도 룰·그래프 엔진이 한다).
- 의학 지식을 보태거나 지어내지 마라(환각 금지). 문장에 표현된 그대로만 채운다.
- 사람·방송·브랜드명은 subject에 넣지 마라. subject는 성분/식품/요법/약물/백신 등 '검증 가능한 대상'.
- 한 문장에 주장이 여러 개면 트리플을 여러 개로 분리한다.
- relation은 다음 닫힌 집합에서만: cures, prevents, reduces_risk, increases_risk, manages, no_effect, insufficient_evidence, causes_or_worsens, diagnoses, replaces_treatment.
- strength: absolute(완치/무조건/유일/100%) / strong(확실/반드시) / moderate(도움/좋다) / weak(가능성/일부). polarity: assert / negate.
출력은 JSON만: {"claims":[{"subject":"","relation":"","object_disease":"","polarity":"assert","strength":"moderate","qualifier":null,"claim_text":""}]}`

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
    if (!key) return json({ error: 'GEMINI_API_KEY 미설정 (supabase secrets set)' }, 500)

    const { text } = await req.json()
    if (!text || typeof text !== 'string') return json({ error: 'text(string) 필요' }, 400)

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ parts: [{ text }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
      },
    )

    if (!res.ok) return json({ error: `Gemini ${res.status}`, detail: await res.text() }, 502)
    const data = await res.json()
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{"claims":[]}'
    return new Response(out, { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
