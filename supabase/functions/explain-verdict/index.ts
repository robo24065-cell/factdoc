// Supabase Edge Function (Deno): 판정 + 공식 근거 → 사람이 읽기 쉬운 AI 설명문(한국어)
// 진실 판정은 바꾸지 않음(주어진 판정을 설명만). CLAUDE.md §6②(설명은 LLM 가장자리)
// 배포: supabase functions deploy explain-verdict  · 시크릿: GEMINI_API_KEYS(콤마구분 키 풀)
import { geminiGenerate } from '../_shared/gemini.ts'

// 판정설명: 유창한 flash 우선, 과부하 시 flash-lite 폴백.
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']

const SYSTEM = `너는 건강정보 팩트체커의 '설명 작성기'다. 주어진 판정과 공식 근거로, 일반 사용자가 한눈에 납득할 수 있는 한국어 설명을 작성한다.
작성 방식:
- 구조: ① 결론을 먼저 한 문장으로(이 주장이 왜 그 판정인지) → ② 공식 근거가 무엇을 말하는지 쉽게 풀어서 → ③ 사용자가 알아두면 좋을 점/실천 팁 한 문장. 전체 2~4문장.
- 내부 처리 용어(트리플, 클레임그래프, 룰, 근거수준, 매칭, 엔티티 등)는 절대 쓰지 마라.
- 출처 기관명(질병관리청, 식품의약품안전처 등)을 자연스럽게 언급하라.
- 주어진 '판정'을 바꾸지 말고 그 판정을 설명만 하라. 친근하고 명확하게, 단정적 의료조언은 피하라.
- 사람·방송·브랜드를 비난하지 말고 '주장' 자체만 다뤄라(명예훼손 회피).
- 공식 근거가 없는 경우(확인 어려움)에는 "근거가 없다는 것이 효과를 보증하지도 부정하지도 않는다"는 점과 전문가 상담을 안내하라.
- 위험 경고가 있으면 마지막에 한 문장으로 따뜻하게 주의를 덧붙여라.
출력은 설명 문장만(따옴표·머리말·목록기호 없이).`

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
    const { claim, verdict, sources, points, warning } = await req.json()

    const srcText = Array.isArray(sources) && sources.length
      ? sources.map((s: { portal?: string; title?: string }) => `- ${s.portal ?? ''}: ${s.title ?? ''}`).join('\n')
      : '(공식 근거 없음)'
    const ptText = Array.isArray(points) && points.length ? points.join(' / ') : ''
    const prompt = `[주장] ${claim}\n[판정] ${verdict}\n[공식 출처]\n${srcText}\n[핵심 근거] ${ptText}\n${warning ? `[위험 경고] ${warning}` : ''}`

    const { text: explanation } = await geminiGenerate({
      system: SYSTEM,
      prompt,
      models: MODELS,
      generationConfig: { temperature: 0.4, maxOutputTokens: 600, thinkingConfig: { thinkingBudget: 0 } },
    })
    return json({ explanation })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
