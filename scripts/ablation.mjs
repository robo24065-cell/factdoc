// Ablation 벤치마크(§13.6 간판 비교표) — 오프라인 1회 실행, 결과를 frontend/src/engine/eval/ablation.json 으로.
//   (a) 무근거 LLM : Gemini가 데이터 없이 판정          ← 한국어 무근거 LLM 베이스라인
//   (b) 일반 RAG   : 하이브리드 검색 top-k + Gemini 판정  ← 룰·그래프 없음
//   (c)/(d) 룰만/풀(룰+그래프)은 프론트에서 엔진으로 라이브 계산(결정론).
// 사용: GEMINI_API_KEY=... SUPABASE_DB_URL=... node scripts/ablation.mjs [classCap]
import pg from 'pg'
import { readFileSync, writeFileSync } from 'node:fs'

const GK = process.env.GEMINI_API_KEY
const DB = process.env.SUPABASE_DB_URL
if (!GK || !DB) { console.error('GEMINI_API_KEY, SUPABASE_DB_URL 필요'); process.exit(1) }
const CLASS_CAP = Number(process.argv[2] || 15) // 클래스당 표본 상한(비용·속도 제어)
const VERDICTS = ['true', 'partial', 'false', 'unverified']
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const ds = JSON.parse(readFileSync('frontend/src/engine/eval/dataset.json', 'utf8'))

// 클래스 균형 표본(결정론: claim 정렬 후 클래스별 상한)
const byClass = Object.fromEntries(VERDICTS.map((v) => [v, []]))
for (const d of [...ds].sort((a, b) => a.claim.localeCompare(b.claim))) if (byClass[d.gold]) byClass[d.gold].push(d)
const subset = VERDICTS.flatMap((v) => byClass[v].slice(0, CLASS_CAP))
console.log(`표본 ${subset.length}건 (클래스당 ≤${CLASS_CAP}): ` + VERDICTS.map((v) => `${v} ${byClass[v].slice(0, CLASS_CAP).length}`).join(' / '))

async function geminiVerdict(system, user) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GK}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 200, thinkingConfig: { thinkingBudget: 0 } },
      }),
    })
    if (res.status === 429) { await sleep(8000); continue }
    if (!res.ok) { console.error('Gemini', res.status, (await res.text()).slice(0, 120)); await sleep(2000); continue }
    const data = await res.json()
    const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    try { const v = JSON.parse(txt).verdict; if (VERDICTS.includes(v)) return v } catch { /* */ }
    return 'unverified'
  }
  return 'unverified'
}

async function embed(text) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GK}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: { parts: [{ text }] }, outputDimensionality: 1024 }),
  })
  const d = await res.json()
  if (!d?.embedding?.values) throw new Error(JSON.stringify(d).slice(0, 120))
  return `[${d.embedding.values.join(',')}]`
}

const SYS_UNGROUNDED = `너는 건강 주장 판정기다. 주어진 주장을 너의 일반 지식만으로 4단계 중 하나로 판정하라: true(사실)/partial(부분적·과장)/false(근거없음·허위)/unverified(공식근거없음·보류). JSON만 출력: {"verdict":"true|partial|false|unverified"}`
const SYS_RAG = `너는 건강 주장 판정기다. 아래 [공식자료 발췌]에 담긴 내용만 근거로 주장을 4단계로 판정하라: true/partial/false/unverified. 발췌에 관련 근거가 없으면 unverified. JSON만: {"verdict":"true|partial|false|unverified"}`

const c = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await c.connect()

// 무료 RPM(flash ~10-15/분) 안전 페이싱: flash 호출 간 ~4s. 단독 실행 전제(다른 Gemini 작업 종료 후).
const preds = {}
let i = 0
let fails = 0
for (const d of subset) {
  i++
  const ungrounded = await geminiVerdict(SYS_UNGROUNDED, `[주장] ${d.claim}`)
  await sleep(4000)
  let rag = 'unverified'
  try {
    const v = await embed(d.claim)
    const { rows } = await c.query('select text from search_chunks_hybrid($1, $2, 4)', [v, d.claim])
    const ctx = rows.map((r, k) => `(${k + 1}) ${r.text}`).join('\n') || '(관련 자료 없음)'
    rag = await geminiVerdict(SYS_RAG, `[공식자료 발췌]\n${ctx}\n\n[주장] ${d.claim}`)
  } catch (e) { console.error('RAG 실패', d.claim, e.message) }
  await sleep(4000)
  if (ungrounded === 'unverified' && rag === 'unverified') fails++ // 모니터링: 과도하면 429 오염 의심
  preds[d.claim] = { gold: d.gold, ungrounded, rag }
  if (i % 5 === 0) console.log(`  ${i}/${subset.length} (both-unverified ${fails})`)
}
console.log(`완료 — both-unverified ${fails}/${subset.length} (높으면 429 오염 → 재실행 필요)`)
await c.end()

const out = { generatedAtNote: 'offline ablation; Gemini-2.5-flash(무근거/RAG) vs 엔진(룰만/풀)은 프론트 라이브', classCap: CLASS_CAP, subsetSize: subset.length, preds }
const ts = `// 빌드 산출물: scripts/ablation.mjs (오프라인 1회). 무근거 LLM / 일반 RAG 예측. ⚠ 수기 편집 금지.\n`
  + `export interface AblationPred { gold: string; ungrounded: string; rag: string }\n`
  + `export const ABLATION = ${JSON.stringify(out, null, 2)} as {\n`
  + `  generatedAtNote: string; classCap: number; subsetSize: number; preds: Record<string, AblationPred>\n}\n`
writeFileSync('frontend/src/engine/eval/ablation-data.ts', ts)
console.log(`ablation-data.ts 저장: ${subset.length}건`)
process.exit(0)
