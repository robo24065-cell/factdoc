// Supabase Edge Function (Deno): 주장 텍스트 → 트리플(JSON) — Gemini Flash-Lite(폴백 Flash)
// 진실 판단은 하지 않는다(룰·그래프 엔진 담당). 파싱만. CLAUDE.md §13.4
//
// 배포:  supabase functions deploy parse-claim
// 시크릿: supabase secrets set GEMINI_API_KEYS="키1,키2,키3,키4"  (콤마구분 키 풀 → 쿼터 합산·로테이션)
// 호출:  supabase.functions.invoke('parse-claim', { body: { text } })
import { geminiGenerate } from '../_shared/gemini.ts'

// 질문파악(클레임 파싱): 빠르고 저렴한 flash-lite 우선, 과부하·쿼터 시 flash 폴백.
const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash']

const SYSTEM = `너는 건강정보 팩트체커의 '주장 추출기'다. 입력 문장에서 검증 대상이 되는 주장을 구조화된 트리플(JSON)로만 변환한다.
- 너는 주장의 진실 여부를 절대 판정하지 않는다(판정은 별도 룰·그래프 엔진이 한다).
- 의학 지식을 보태거나 지어내지 마라(환각 금지). 문장에 표현된 그대로만 채운다.
- 사람·방송·브랜드명은 subject에 넣지 마라. subject는 성분/식품/요법/약물/백신 등 '검증 가능한 대상'.
- 한 문장에 주장이 여러 개면 트리플을 여러 개로 분리한다.
- relation은 다음 닫힌 집합에서만: cures, prevents, reduces_risk, increases_risk, manages, no_effect, insufficient_evidence, causes_or_worsens, diagnoses, replaces_treatment.
- strength: absolute(완치/무조건/유일/100%) / strong(확실/반드시) / moderate(도움/좋다) / weak(가능성/일부).
- polarity(극성)는 그 관계가 단정되는지 부정되는지다. 문장이 관계를 부정하면("완치되지 않는다", "예방 안 된다", "막지 못한다", "효과 없다", "걸리지 않는다") polarity="negate", 단정하면 "assert". relation은 동사 자체(예: 완치=cures)로 두고, 부정 여부는 polarity로만 표현한다(부정이라고 relation을 바꾸지 말 것). 부정어가 어느 동사에 걸리는지 보고 해당 트리플에만 negate를 준다.
출력은 JSON만: {"claims":[{"subject":"","relation":"","object_disease":"","polarity":"assert","strength":"moderate","qualifier":null,"claim_text":""}]}
예시:
- "당뇨는 어떤 즙으로도 완치되지 않습니다" → {"claims":[{"subject":"즙","relation":"cures","object_disease":"당뇨","polarity":"negate","strength":"absolute","qualifier":null,"claim_text":"당뇨는 어떤 즙으로도 완치되지 않습니다"}]}
- "독감백신은 독감을 못 막는다" → {"claims":[{"subject":"독감백신","relation":"prevents","object_disease":"독감","polarity":"negate","strength":"moderate","qualifier":null,"claim_text":"독감백신은 독감을 못 막는다"}]}`

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
    const { text } = await req.json()
    if (!text || typeof text !== 'string') return json({ error: 'text(string) 필요' }, 400)

    const { text: out } = await geminiGenerate({
      system: SYSTEM,
      prompt: text,
      models: MODELS,
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    })
    return new Response(out || '{"claims":[]}', { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
