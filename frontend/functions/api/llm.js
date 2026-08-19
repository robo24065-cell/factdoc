// LLM 중간계층 프록시 — Cloudflare Pages Function
//
// ⚠ 위치: 반드시 **frontend/functions/** 다. Pages 프로젝트 루트가 frontend 이기 때문이다.
//   저장소 루트 functions/ 로 옮기면 무시되고 /api/llm 이 SPA index.html 로 떨어진다(실측).
//   한 번 반대로 옮겼다가 되돌렸다 — 배포 전파를 기다리지 않고 판단한 탓이다.
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
import { RERANK_PROMPT, INTENT_PROMPT, RERANK_MAX, TITLE_MAX } from '../../src/engine/nk-judge.mjs'
import { GUIDE_PROMPT } from '../../src/engine/nk-guide.mjs'

/* ⚠ 2026-08-12 실측: 이전 폴백 2종(gemini-2.0-flash-lite / gemini-2.0-flash)이
   **404 — 모델 없어짐** 이었다. 3단계처럼 보였지만 사실상 1단계였고,
   gemini-2.5-flash 쿼터가 차는 순간 LLM 계층이 통째로 죽었다.
   아래는 같은 날 200 을 확인한 모델만 남긴 것이다. lite 를 앞에 둔다 — 분류·심사에
   큰 모델이 필요 없고 쿼터가 넉넉하다. 모델 라인업은 계속 바뀌므로 주기적으로 확인할 것. */
const MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash']
const Q_MAX = 200                     // 질의 길이 상한 — 프롬프트 주입·비용 폭주 방지
/* guide 만 사실 묶음(JSON)을 통째로 받아 상한이 다르다. 대신 JSON 파싱 검사를 걸어
   자유 문장을 실어 나르는 중계기로 쓰지 못하게 한다(아래 onRequestPost 참조). */
const Q_MAX_BY_KIND = { guide: 2000 }
const PROMPTS = {
  normalize: LLM_NORMALIZE_PROMPT, time: LLM_TIME_PROMPT,
  rerank: RERANK_PROMPT, intent: INTENT_PROMPT, guide: GUIDE_PROMPT,
}
/* rerank 만 후보 목록을 함께 받는다. 그래도 이 엔드포인트가 범용 LLM 중계기가 되지는 않는다 —
   출력 스키마가 번호와 0~3 점수뿐이라 자유 문장을 꺼낼 문법이 없다.
   그 위에 개수·길이 상한을 걸어 비용도 묶는다. */
function itemsText(items) {
  if (!Array.isArray(items) || !items.length) return null
  return items.slice(0, RERANK_MAX)
    .map((x, n) => `${Number.isInteger(x?.i) ? x.i : n}. ${String(x?.t ?? '').replace(/\s+/g, ' ').slice(0, TITLE_MAX)}`)
    .join('\n')
}

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
  if (!PROMPTS[kind]) return json({ error: 'bad_kind' }, 400)
  const q = String(body?.q ?? '').trim().slice(0, Q_MAX_BY_KIND[kind] ?? Q_MAX)
  if (!q) return json({ error: 'empty_q' }, 400)
  /* guide 의 q 는 buildGuideFacts() 가 만든 사실 묶음이어야 한다.
     JSON 이 아니면 거부 — 이 kind 를 자유 문장 중계기로 쓰는 것을 막는다. */
  if (kind === 'guide') {
    try { JSON.parse(q) } catch { return json({ error: 'bad_facts' }, 400) }
  }

  let user = q
  if (kind === 'rerank') {
    const list = itemsText(body?.items)
    if (!list) return json({ error: 'no_items' }, 400)
    user = `질문: ${q}\n\n후보:\n${list}`
  }

  const payload = thinking => ({
    systemInstruction: { parts: [{ text: PROMPTS[kind] }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 800,
      // 분류·심사에 사고 토큰은 낭비다. 다만 이 인자를 거부하는 모델이 있어 400 이면 뺀다.
      ...(thinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  })

  // 모델 × 키 조합으로 재시도 — 429/과부하는 다음 조합으로 넘긴다
  let rr = Math.floor(Math.random() * keys.length)
  for (const model of MODELS) {
    for (let i = 0; i < Math.min(3, keys.length); i++) {
      const key = keys[(rr++) % keys.length]
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`
      const post = b => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })
      try {
        let r = await post(payload(true))
        // 400 = 이 모델이 인자를 안 받는다는 뜻인 경우가 많다 — 인자를 빼고 한 번 더
        if (r.status === 400) r = await post(payload(false))
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
