// LLM 중간계층 — 자유 표현 → 닫힌 스키마
//
// 원칙
//  ① 규칙이 먼저. LLM은 규칙이 못 잡은 것만 (호출 최소화)
//  ② LLM은 '해석'만 한다. 판정·수치·근거 생성 금지
//  ③ 출력이 스키마 밖이면 폐기하고 규칙 결과로 되돌린다 (LLM 실패가 서비스 실패가 되지 않음)
//  ④ 네트워크가 죽어도 규칙 계층만으로 동작한다

import { QUERY_SCHEMA, LLM_NORMALIZE_PROMPT, validateNormalized } from './nk-normalize.mjs'
import { LLM_TIME_PROMPT, TIME_SLOTS } from './nk-time.mjs'

// 슬롯 분류는 단순 작업 — 저지연 모델 우선, 쿼터 소진 시 다음 모델로
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-flash']
const ENDPOINT = (m, k) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(k)}`

let KEYS = [], rr = 0
export function setKeys(keys) { KEYS = keys.filter(Boolean) }
export function hasKeys() { return KEYS.length > 0 }
const nextKey = () => KEYS[(rr++) % KEYS.length]

const cache = new Map()                     // 질의 → 결과 (같은 질문 반복 호출 방지)
export function cacheSize() { return cache.size }

async function callGemini(system, user, { timeoutMs = 8000 } = {}) {
  if (!KEYS.length) return null
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 800,
      // 2.5 계열은 기본 사고가 켜져 토큰을 소진한다 — 슬롯 분류엔 불필요
      thinkingConfig: { thinkingBudget: 0 },
    },
  }
  // 모델 × 키 조합으로 재시도 (429는 다음 모델/키로)
  for (const m of MODELS) {
    for (let k = 0; k < Math.min(2, KEYS.length); k++) {
      try {
        const r = await fetch(ENDPOINT(m, nextKey()), {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
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

export { QUERY_SCHEMA }
