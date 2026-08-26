/* ────────────────────────────────────────────────────────────────
   AI 스튜디오 — 프롬프트 조립·다듬기 통로

   · 조립(buildStudioOutput)은 engine/nk-studio.mjs 의 순수 함수다.
     네트워크 0에서도 5구획 산출이 전부 나온다(LLM 4원칙 ④).
   · Gemini 다듬기는 /api/llm(kind='studio') 한 곳으로만 나간다.
     dev 서버에는 /api/llm 이 없다 — GET 탐침이 JSON 을 못 받으면
     「AI로 다듬기」 단추 자체를 그리지 않는다(nk-llm-proxy 의 낙관 탐침과
     달리 여기서는 비관 탐침이다: 다듬기는 부가 기능이라 없다고 잘못 판단해도
     잃는 것이 없고, 있다고 잘못 판단하면 눌리지 않는 단추가 생긴다).
   · 출력 검증(validateStudio)은 닫힌 스키마 {ko,en} + 숫자 부분집합 검사 —
     실패는 전부 조용히 null 이고 화면은 템플릿 산출을 그대로 유지한다.
   ──────────────────────────────────────────────────────────────── */

import { buildStudioOutput, validateStudio } from '../engine/nk-studio.mjs'
import type { StudioInput, StudioOutput } from '../engine/nk-studio.mjs'

export { buildStudioOutput }
export type { StudioInput, StudioOutput }

const ENDPOINT = '/api/llm'

let available: boolean | null = null
let probing: Promise<boolean> | null = null

/** /api/llm 이 실제로 있는지(키까지 설정됐는지) 한 번만 물어본다. dev 에서는 false 다. */
export function probeStudioLLM(): Promise<boolean> {
  if (available !== null) return Promise.resolve(available)
  if (probing) return probing
  probing = (async () => {
    try {
      const r = await fetch(ENDPOINT, { signal: AbortSignal.timeout(4000) })
      const ct = r.headers.get('content-type') || ''
      available = Boolean(r.ok && ct.includes('json') && (await r.json())?.ok)
    } catch {
      available = false
    }
    return available
  })()
  return probing
}

/** Gemini 로 ko/en 프롬프트만 다듬는다. 실패·스키마 밖·새 숫자 = null(템플릿 유지). */
export async function refineStudio(out: StudioOutput): Promise<{ ko: string; en: string } | null> {
  if (available !== true) return null
  const payload = { ko: out.promptKo, en: out.promptEn, story: out.storyRaw }
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'studio', q: JSON.stringify(payload) }),
      signal: AbortSignal.timeout(12000),
    })
    if (!r.ok) {
      if (r.status === 503) available = false
      return null
    }
    const raw = (await r.json())?.result ?? null
    return validateStudio(raw, payload)
  } catch {
    return null
  }
}
