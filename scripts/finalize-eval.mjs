// Gemini 무료 쿼터 복귀를 감지하면 평가 마무리(parse-eval + ablation)를 단독·순차로 실행.
// 쿼터 소진(RESOURCE_EXHAUSTED) 중에는 20분 간격으로 재확인. 복귀 시 1회 실행 후 종료.
// 사용: GEMINI_API_KEY=... SUPABASE_DB_URL=... node scripts/finalize-eval.mjs
import { execSync } from 'node:child_process'

const GK = process.env.GEMINI_API_KEY
const DB = process.env.SUPABASE_DB_URL
if (!GK || !DB) { console.error('GEMINI_API_KEY, SUPABASE_DB_URL 필요'); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function geminiUp() {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GK}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'ok' }] }], generationConfig: { maxOutputTokens: 5 } }),
    })
    const j = await r.json()
    return !j.error && Array.isArray(j.candidates)
  } catch { return false }
}

const MAX = 12 // ×20분 = 최대 4시간
for (let i = 1; i <= MAX; i++) {
  if (await geminiUp()) {
    console.log(`Gemini 복귀(시도 ${i}) — 평가 마무리 시작`)
    execSync('node scripts/parse-eval.mjs', { stdio: 'inherit', env: process.env })
    execSync('node scripts/ablation.mjs 8', { stdio: 'inherit', env: process.env })
    console.log('FINALIZE_DONE')
    process.exit(0)
  }
  console.log(`시도 ${i}/${MAX}: Gemini 아직 다운(RESOURCE_EXHAUSTED), 20분 대기`)
  await sleep(1200000)
}
console.log('FINALIZE_TIMEOUT — 다음 세션에서 node scripts/finalize-eval.mjs 재실행')
process.exit(3)
