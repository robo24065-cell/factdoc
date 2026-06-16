// Supabase Edge Function (Deno): 텍스트 → 1024d 임베딩(Gemini embedding-001)
// 시맨틱 캐시·하이브리드 검색의 쿼리 임베딩. 코퍼스(scripts/embed.mjs)와 동일 모델·차원(1024).
// 배포: supabase functions deploy embed-text --no-verify-jwt  · 시크릿: GEMINI_API_KEYS(콤마구분 키 풀)
// 호출: supabase.functions.invoke('embed-text', { body: { text } }) → { embedding: number[1024] }
import { geminiEmbed } from '../_shared/gemini.ts'

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

    const embedding = await geminiEmbed(text, 'gemini-embedding-001', 1024)
    return json({ embedding })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
