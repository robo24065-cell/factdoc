// LLM 중간계층 — 자유 표현 → 닫힌 스키마
//
// 원칙
//  ① 규칙이 먼저. LLM은 규칙이 못 잡은 것만 (호출 최소화)
//  ② LLM은 '해석'만 한다. 판정·수치·근거 생성 금지
//  ③ 출력이 스키마 밖이면 폐기하고 규칙 결과로 되돌린다 (LLM 실패가 서비스 실패가 되지 않음)
//  ④ 네트워크가 죽어도 규칙 계층만으로 동작한다

import { QUERY_SCHEMA, LLM_NORMALIZE_PROMPT, validateNormalized } from './nk-normalize.mjs'
import { LLM_TIME_PROMPT, TIME_SLOTS } from './nk-time.mjs'
import { RERANK_PROMPT, INTENT_PROMPT, RERANK_MAX, TITLE_MAX,
         validateScores, validateIntent } from './nk-judge.mjs'

/* 저지연 모델 우선, 쿼터 소진 시 다음 모델로.
   ⚠ 2026-08-12 실측: 기존 폴백 2종(gemini-2.0-flash-lite, gemini-2.0-flash)이
     **404 — 모델 없어짐** 이었다. 3단계 폴백이 사실은 1단계였고,
     gemini-2.5-flash 쿼터가 차는 순간 LLM 계층이 통째로 죽었다(벤치 27/27 → 16/27).
     아래는 같은 날 실제로 200 을 받은 모델만 남긴 것이다.
     lite 를 앞에 두는 이유: 이 작업(분류·심사)에 큰 모델이 필요 없고 쿼터가 넉넉하다. */
const MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash']
const ENDPOINT = (m, k) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(k)}`

let KEYS = [], rr = 0
export function setKeys(keys) { KEYS = keys.filter(Boolean) }
export function hasKeys() { return KEYS.length > 0 }
const nextKey = () => KEYS[(rr++) % KEYS.length]

const cache = new Map()                     // 질의 → 결과 (같은 질문 반복 호출 방지)
export function cacheSize() { return cache.size }

async function callGemini(system, user, { timeoutMs = 8000 } = {}) {
  if (!KEYS.length) return null
  const mk = thinking => ({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 800,
      // 2.5 계열은 기본 사고가 켜져 토큰을 소진한다 — 분류·심사엔 불필요
      ...(thinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  })
  /* 모델 × 키 조합으로 재시도. 429(쿼터)는 다음 조합으로 넘긴다.
     400 은 대개 **그 모델이 이 인자를 안 받는다**는 뜻이라(실측: gemini-3.6-flash 가
     thinkingConfig 를 거부) 같은 모델에 인자를 빼고 한 번 더 던진다.
     모델 라인업은 계속 바뀐다 — 인자 하나 때문에 폴백이 통째로 끊기지 않게 한다. */
  for (const m of MODELS) {
    for (let k = 0; k < Math.min(2, KEYS.length); k++) {
      try {
        const key = nextKey()
        let r = await fetch(ENDPOINT(m, key), {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(mk(true)), signal: AbortSignal.timeout(timeoutMs),
        })
        if (r.status === 400) r = await fetch(ENDPOINT(m, key), {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(mk(false)), signal: AbortSignal.timeout(timeoutMs),
        })
        if (r.status === 429) continue
        if (!r.ok) continue
        const j = await r.json()
        if (j?.candidates?.[0]?.finishReason === 'MAX_TOKENS') continue
        const t = j?.candidates?.[0]?.content?.parts?.[0]?.text
        if (!t) continue
        return JSON.parse(t)
      } catch { /* 다음 조합 */ }
    }
  }
  return null
}

// ── 질의 정규화 ─────────────────────────────────────────────
export async function normalizeWithLLM(q, ruleResult) {
  const key = 'n:' + q
  if (cache.has(key)) return cache.get(key)
  const raw = await callGemini(LLM_NORMALIZE_PROMPT, q)
  const out = validateNormalized(raw, ruleResult)      // 스키마 밖이면 규칙 결과로 되돌림
  cache.set(key, out)
  return out
}

// ── 시간 표현 ───────────────────────────────────────────────
export async function timeWithLLM(q, ruleTime) {
  const key = 't:' + q
  if (cache.has(key)) return cache.get(key)
  const raw = await callGemini(LLM_TIME_PROMPT, q)
  let out = ruleTime
  if (raw && TIME_SLOTS.includes(raw.slot)) {
    const t = { ...raw, matched: ruleTime.matched, cleaned: ruleTime.cleaned, resolvedBy: 'llm' }
    if (t.to === 'TODAY') t.to = new Date().toISOString().slice(0, 10)
    // year/range 정합성 검사 — 스키마는 맞지만 값이 이상하면 폐기
    const okYear = t.slot !== 'year' || (t.year >= 1945 && t.year <= new Date().getFullYear() + 1)
    const okRange = t.slot !== 'range' || (/^\d{4}-\d{2}-\d{2}$/.test(t.from || '') && /^\d{4}-\d{2}-\d{2}$/.test(t.to || ''))
    if (okYear && okRange) out = t
  }
  cache.set(key, out)
  return out
}

/* ── 리랭킹 ────────────────────────────────────────────────
   BM25 가 낱말로 찾아 온 후보가 **정말 이 질문의 답인지** 뜻으로 심사한다.
   프롬프트는 프록시(frontend/functions/api/llm.js)와 **같은 상수**를 쓴다 —
   두 경로가 다른 프롬프트로 갈리면 로컬 평가 결과가 배포본을 대변하지 못한다. */
export async function rerankWithLLM(q, items) {
  if (!items?.length) return null
  const list = items.slice(0, RERANK_MAX)
    .map(x => `${x.i}. ${String(x.t).replace(/\s+/g, ' ').slice(0, TITLE_MAX)}`).join('\n')
  const key = 'r:' + q + '|' + list
  if (cache.has(key)) return cache.get(key)
  const raw = await callGemini(RERANK_PROMPT, `질문: ${q}\n\n후보:\n${list}`)
  const out = validateScores(raw, items.length)
  cache.set(key, out)
  return out
}

// ── 의도 분류 — 말투가 아니라 뜻을 본다 ─────────────────────
export async function intentWithLLM(q) {
  const key = 'i:' + q
  if (cache.has(key)) return cache.get(key)
  const out = validateIntent(await callGemini(INTENT_PROMPT, q))
  cache.set(key, out)
  return out
}

export const llmAdapter = { hasKeys, normalizeWithLLM, timeWithLLM, rerankWithLLM, intentWithLLM }

export { QUERY_SCHEMA }
