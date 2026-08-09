// LLM 중간계층 프록시 — Cloudflare Pages Function
//
// 왜 프록시인가: 브라우저에서 Gemini 를 직접 부르면 API 키가 번들에 그대로 실린다.
// 키는 Cloudflare Pages 환경변수(GEMINI_API_KEYS)에만 두고, 브라우저는 이 엔드포인트만 부른다.
//
// 왜 프롬프트를 서버가 만드는가: 클라이언트가 보낸 프롬프트를 그대로 전달하면
// 이 엔드포인트가 누구나 쓸 수 있는 무료 LLM 중계기가 된다.
// 클라이언트는 '무엇을 해석해 달라'(kind + q)만 보내고, 프롬프트는 여기서 고정한다.
//
//   GET  /api/llm  → { ok: true|false }   키 설정 여부만 알려준다 (키 값은 절대 노출 않음)
//   POST /api/llm  → { kind: 'normalize'|'time', q: string }
//
// 키가 없으면 503 을 준다. 프론트는 그걸 보고 조용히 규칙 계층만으로 동작한다 —
// LLM 이 죽어도 서비스가 죽지 않는다는 원칙(§5 LLM 4원칙 ④)을 배포 경로에서도 지킨다.

import { LLM_NORMALIZE_PROMPT } from '../../src/engine/nk-normalize.mjs'
import { LLM_TIME_PROMPT } from '../../src/engine/nk-time.mjs'

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-flash']
const Q_MAX = 200                     // 질의 길이 상한 — 프롬프트 주입·비용 폭주 방지
const PROMPTS = { normalize: LLM_NORMALIZE_PROMPT, time: LLM_TIME_PROMPT }

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})

const keysOf = env => String(env?.GEMINI_API_KEYS || '').split(',').map(s => s.trim()).filter(Boolean)

export async function onRequestGet({ env }) {
  // 키 '개수'까지만 알린다. 값은 어떤 경로로도 내보내지 않는다.
  return json({ ok: keysOf(env).length > 0 })
}

export async function onRequestPost({ request, env }) {
  const keys = keysOf(env)
  if (!keys.length) return json({ error: 'no_keys' }, 503)

  let body
  try { body = await request.json() } catch { return json({ error: 'bad_json' }, 400) }

  const kind = String(body?.kind || '')
  const q = String(body?.q ?? '').trim().slice(0, Q_MAX)
  if (!PROMPTS[kind]) return json({ error: 'bad_kind' }, 400)
  if (!q) return json({ error: 'empty_q' }, 400)

  const payload = {
    systemInstruction: { parts: [{ text: PROMPTS[kind] }] },
    contents: [{ role: 'user', parts: [{ text: q }] }],
    generationConfig: {
      temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 800,
      thinkingConfig: { thinkingBudget: 0 },   // 슬롯 분류에 사고 토큰은 낭비다
    },
  }

  // 모델 × 키 조합으로 재시도 — 429/과부하는 다음 조합으로 넘긴다
  let rr = Math.floor(Math.random() * keys.length)
  for (const model of MODELS) {
    for (let i = 0; i < Math.min(3, keys.length); i++) {
      const key = keys[(rr++) % keys.length]
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) },
        )
        if (!r.ok) continue
        const j = await r.json()
        if (j?.candidates?.[0]?.finishReason === 'MAX_TOKENS') continue
        const text = j?.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) continue
        return json({ ok: true, model, result: JSON.parse(text) })
      } catch { /* 다음 조합 */ }
    }
  }
  return json({ error: 'all_failed' }, 502)
}
