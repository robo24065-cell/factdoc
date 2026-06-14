// 평가셋을 Gemini 파서로 오프라인 1회 파싱 → eval-triples.ts (실제 제품 파이프라인 반영).
// parse-claim Edge Function과 동일 시스템 프롬프트·모델. 결과를 결정론 judge로 채점(재현 가능).
// 사용: GEMINI_API_KEY=... node scripts/parse-eval.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const GK = process.env.GEMINI_API_KEY
if (!GK) { console.error('GEMINI_API_KEY 필요'); process.exit(1) }
const MODEL = 'gemini-2.5-flash-lite'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const SYSTEM = `너는 건강정보 팩트체커의 '주장 추출기'다. 입력 문장에서 검증 대상이 되는 주장을 구조화된 트리플(JSON)로만 변환한다.
- 너는 주장의 진실 여부를 절대 판정하지 않는다(판정은 별도 룰·그래프 엔진이 한다).
- 의학 지식을 보태거나 지어내지 마라(환각 금지). 문장에 표현된 그대로만 채운다.
- 사람·방송·브랜드명은 subject에 넣지 마라. subject는 성분/식품/요법/약물/백신 등 '검증 가능한 대상'.
- 한 문장에 주장이 여러 개면 트리플을 여러 개로 분리한다.
- relation은 다음 닫힌 집합에서만: cures, prevents, reduces_risk, increases_risk, manages, no_effect, insufficient_evidence, causes_or_worsens, diagnoses, replaces_treatment.
- strength: absolute(완치/무조건/유일/100%) / strong(확실/반드시) / moderate(도움/좋다) / weak(가능성/일부). polarity: assert / negate.
출력은 JSON만: {"claims":[{"subject":"","relation":"","object_disease":"","polarity":"assert","strength":"moderate","qualifier":null,"claim_text":""}]}`

async function parse(text) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GK}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ parts: [{ text }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    })
    if (res.status === 429) { await sleep(8000); continue }
    if (!res.ok) { console.error('  Gemini', res.status); await sleep(2000); continue }
    const data = await res.json()
    try {
      const claims = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{"claims":[]}').claims ?? []
      return claims.map((c) => ({ subject: c.subject ?? '', relation: c.relation ?? '', object_disease: c.object_disease ?? '', polarity: c.polarity ?? 'assert', strength: c.strength ?? 'moderate', qualifier: c.qualifier ?? null }))
    } catch { return [] }
  }
  return []
}

const ds = JSON.parse(readFileSync('frontend/src/engine/eval/dataset.json', 'utf8'))
const map = {}
let i = 0
for (const d of ds) {
  i++
  map[d.claim] = await parse(d.claim)
  await sleep(900)
  if (i % 10 === 0) console.log(`  ${i}/${ds.length}`)
}

const ts = `// 빌드 산출물: scripts/parse-eval.mjs (오프라인 1회). 평가셋 Gemini 파싱 결과(raw). ⚠ 수기 편집 금지.
// 실제 제품 파이프라인(Gemini 파서 + 룰·그래프 judge) 재현용. 룰 파서와 병합해 채점.
import type { RawClaim } from '../fromRaw'

export const EVAL_RAW: Record<string, RawClaim[]> = ${JSON.stringify(map, null, 1)}
`
writeFileSync('frontend/src/engine/eval/eval-triples.ts', ts)
console.log(`eval-triples.ts 저장: ${Object.keys(map).length}건 파싱`)
process.exit(0)
