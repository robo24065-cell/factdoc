// 공유 Gemini 클라이언트 — 키 풀 로테이션(라운드로빈) + 모델 폴백 + 429/503 재시도.
// 무료 티어 쿼터(키당 ~RPD)를 여러 키로 합산하고, 일시적 과부하/쿼터소진 시 다음 키·다음 모델로 자동 전환.
// 키는 Supabase secret에만 존재(레포 미커밋). 진실 판단은 하지 않는다(파싱·설명·임베딩만). CLAUDE.md §13.7
//
// 시크릿 설정(권장: 여러 키 콤마구분):
//   supabase secrets set GEMINI_API_KEYS="키1,키2,키3,키4"
//   (구버전 단일 키 GEMINI_API_KEY 도 자동 인식 — 하위호환)

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/** 환경변수에서 키 풀을 읽는다. GEMINI_API_KEYS(콤마/공백 구분) 우선, 없으면 GEMINI_API_KEY. */
export function geminiKeys(): string[] {
  const raw = Deno.env.get('GEMINI_API_KEYS') || Deno.env.get('GEMINI_API_KEY') || ''
  return raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
}

// 따뜻한 인스턴스 내에서 호출 간 유지되는 라운드로빈 오프셋 → 키별 부하 분산.
let rr = 0

/** 재시도(다음 키/모델로 전환)할 가치가 있는 일시적 오류인가. */
function transient(status: number, body: string): boolean {
  return (
    status === 429 || // 쿼터/레이트리밋
    status === 503 || // 과부하(high demand)
    status === 500 || // 일시적 내부오류
    /high demand|overloaded|RESOURCE_EXHAUSTED|UNAVAILABLE|try again/i.test(body)
  )
}
/** 키 자체가 문제(인증) → 다음 키로. */
function badKey(status: number): boolean {
  return status === 401 || status === 403
}

export interface GenResult {
  text: string
  model: string
  keyIndex: number
}

/**
 * 모델 폴백 체인 × 키 풀을 돌며 generateContent. 첫 성공을 반환.
 * models[0]을 우선 시도(모든 키 소진 시) → models[1] … 순으로 폴백.
 */
export async function geminiGenerate(opts: {
  system?: string
  prompt?: string
  contents?: unknown
  models: string[]
  generationConfig?: Record<string, unknown>
}): Promise<GenResult> {
  const keys = geminiKeys()
  if (!keys.length) throw new Error('GEMINI 키 미설정 (GEMINI_API_KEYS secret)')
  const contents = opts.contents ?? [{ parts: [{ text: opts.prompt ?? '' }] }]
  const payload = JSON.stringify({
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
    contents,
    generationConfig: opts.generationConfig ?? {},
  })

  let lastErr = ''
  for (const model of opts.models) {
    for (let i = 0; i < keys.length; i++) {
      const idx = (rr + i) % keys.length
      try {
        const res = await fetch(`${BASE}/${model}:generateContent?key=${keys[idx]}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        })
        const body = await res.text()
        if (res.ok) {
          rr = (idx + 1) % keys.length // 다음 호출은 다음 키부터
          const data = JSON.parse(body)
          const parts = data?.candidates?.[0]?.content?.parts ?? []
          const text = parts.map((p: { text?: string }) => p?.text ?? '').join('').trim()
          return { text, model, keyIndex: idx }
        }
        lastErr = `${model} key#${idx} HTTP ${res.status}: ${body.slice(0, 160)}`
        if (res.status === 400) throw new Error(lastErr) // 잘못된 요청 — 재시도 무의미
        // transient/badKey → 다음 키 시도. 그 외도 일단 다음 키로.
      } catch (e) {
        lastErr = `${model} key#${idx}: ${e instanceof Error ? e.message : String(e)}`
        if (lastErr.includes('HTTP 400')) throw e
      }
    }
    // 이 모델은 모든 키 실패 → 다음 모델
  }
  throw new Error('Gemini 전 키/모델 실패: ' + lastErr)
}

/** 임베딩(embedContent) — 키 풀 로테이션. */
export async function geminiEmbed(text: string, model = 'gemini-embedding-001', dim = 1024): Promise<number[]> {
  const keys = geminiKeys()
  if (!keys.length) throw new Error('GEMINI 키 미설정')
  const payload = JSON.stringify({ content: { parts: [{ text }] }, outputDimensionality: dim })
  let lastErr = ''
  for (let i = 0; i < keys.length; i++) {
    const idx = (rr + i) % keys.length
    try {
      const res = await fetch(`${BASE}/${model}:embedContent?key=${keys[idx]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })
      const body = await res.text()
      if (res.ok) {
        rr = (idx + 1) % keys.length
        const values = JSON.parse(body)?.embedding?.values
        if (Array.isArray(values)) return values
        lastErr = `embedding 없음: ${body.slice(0, 120)}`
      } else {
        lastErr = `embed key#${idx} HTTP ${res.status}: ${body.slice(0, 120)}`
        if (res.status === 400) throw new Error(lastErr)
      }
    } catch (e) {
      lastErr = `embed key#${idx}: ${e instanceof Error ? e.message : String(e)}`
    }
  }
  throw new Error('Gemini 임베딩 전 키 실패: ' + lastErr)
}
