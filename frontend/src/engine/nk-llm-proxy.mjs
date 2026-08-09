// 브라우저용 LLM 어댑터 — /api/llm 프록시를 통해서만 부른다
//
// nk-llm.mjs 와 같은 인터페이스({ hasKeys, normalizeWithLLM, timeWithLLM })를 제공하되
// 키를 만지지 않는다. 키는 Cloudflare Pages 환경변수에만 있고 이 코드는 존재조차 모른다.
//
// 원칙(CLAUDE.md §5): LLM 은 '해석'만 한다. 판정·수치·근거 생성 금지.
//   출력이 닫힌 스키마 밖이면 폐기하고 규칙 결과로 되돌린다.
//   네트워크가 죽어도 규칙 계층만으로 동작한다 — 그래서 모든 실패는 조용히 null 이다.

import { validateNormalized } from './nk-normalize.mjs'
import { TIME_SLOTS } from './nk-time.mjs'

const ENDPOINT = '/api/llm'
const TIMEOUT = 6000            // 이 시간을 넘기면 규칙 결과로 답한다. 사용자를 기다리게 하지 않는다.
const cache = new Map()         // 같은 질문 반복 호출 방지 (세션 한정)

let available = null            // null=미확인 · true/false=확인됨
let probing = null

/** 키가 설정돼 있는지 서버에 한 번만 물어본다 */
export async function probe() {
  if (available !== null) return available
  if (probing) return probing
  probing = (async () => {
    try {
      const r = await fetch(ENDPOINT, { signal: AbortSignal.timeout(4000) })
      const ct = r.headers.get('content-type') || ''
      if (r.ok && ct.includes('json')) available = !!(await r.json())?.ok
      /* GET 이 SPA index.html 로 떨어지는 배치가 있다(Pages 정적 우선 라우팅).
         그때 '없음'으로 단정하면 키가 있어도 영영 안 켜진다.
         → 낙관적으로 켜두고, 실제 POST 가 503 을 주면 그 자리에서 끈다. */
      else available = true
    } catch { available = false }
    return available
  })()
  return probing
}

export function hasKeys() { return available === true }

async function call(kind, q) {
  if (available !== true) return null
  const key = kind + ':' + q
  if (cache.has(key)) return cache.get(key)
  let out = null
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, q }),
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (r.ok) out = (await r.json())?.result ?? null
    else if (r.status === 503) available = false      // 키가 사라졌으면 더 부르지 않는다
  } catch { /* 규칙으로 되돌아간다 */ }
  cache.set(key, out)
  return out
}

// ── 질의 정규화 ─────────────────────────────────────────────
export async function normalizeWithLLM(q, ruleResult) {
  const raw = await call('normalize', q)
  return validateNormalized(raw, ruleResult)          // 스키마 밖이면 규칙 결과로 되돌림
}

// ── 시간 표현 ───────────────────────────────────────────────
export async function timeWithLLM(q, ruleTime) {
  const raw = await call('time', q)
  if (!raw || !TIME_SLOTS.includes(raw.slot)) return ruleTime
  const t = { ...raw, matched: ruleTime.matched, cleaned: ruleTime.cleaned, resolvedBy: 'llm' }
  if (t.to === 'TODAY') t.to = new Date().toISOString().slice(0, 10)
  // 스키마는 맞지만 값이 이상하면 폐기 — 연도 범위·날짜 형식 검사
  const okYear = t.slot !== 'year' || (t.year >= 1945 && t.year <= new Date().getFullYear() + 1)
  const okRange = t.slot !== 'range' ||
    (/^\d{4}-\d{2}-\d{2}$/.test(t.from || '') && /^\d{4}-\d{2}-\d{2}$/.test(t.to || ''))
  return okYear && okRange ? t : ruleTime
}

export const llmAdapter = { hasKeys, normalizeWithLLM, timeWithLLM }
