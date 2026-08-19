#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   고향 안내인(nk-guide.mjs) 검증 하니스

   무엇을 재는가
     ① 규칙 계층 — 데이터 팩의 모든 지역(구 7 + 현행 13)에 대해
        buildGuideFacts → fallbackGuide 가 항상 2~4문장을 만들고,
        그 문장이 validateGuide(자기 사실 대조)를 통과하는지. LLM 4원칙 ④의 증거다.
     ② 폐기 규칙 — 만들어 낸 숫자·스키마 밖 출력·이모지가 정말 폐기되는지(음성 대조군).
     ③ (--llm) 실호출 — GUIDE_PROMPT 를 systemInstruction 으로 Gemini 를 실제로 불러
        원출력이 validateGuide 를 통과하는지. 키는 .gemini-keys.tmp.json(gitignore)에서
        읽고 **어떤 경로로도 출력하지 않는다.**

   사용
     node scripts/nk-guide-check.mjs            # 규칙 계층만 (네트워크 없음)
     node scripts/nk-guide-check.mjs --llm      # + Gemini 실호출 1건 (키 필요)

   나가는 값: 전부 통과 0, 실패 있으면 1.
   ────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GUIDE_PROMPT, buildGuideFacts, fallbackGuide, validateGuide,
} from '../frontend/src/engine/nk-guide.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WITH_LLM = process.argv.includes('--llm')

const load = (n) =>
  JSON.parse(fs.readFileSync(path.join(root, 'frontend/public/gohyang', n + '.json'), 'utf8'))
const pack = {
  map: load('map'), region: load('region'), isan: load('isan'),
  proj: load('projection'), museum: load('museum'), paths: load('paths'),
}

let pass = 0, fail = 0
const ok = (cond, label) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.error(`  ✗ ${label}`) }
}

/* ── ① 규칙 계층 — 전 지역 ── */
console.log('▶ ① 규칙 계층 (전 지역, 네트워크 없음)')
const sels = [
  ...pack.map.regionsOld.map((o) => ({ mode: 'old', id: o.id, label: o.name })),
  ...Object.keys(pack.region.regions).map((k) => ({ mode: 'modern', key: k, label: k })),
]
let allGood = true
for (const s of sels) {
  const f = buildGuideFacts(s, pack)
  const g = f && fallbackGuide(f)
  const valid = g && validateGuide(g, f)
  if (!f || !g || !valid || g.lines.length < 2 || g.lines.length > 4) {
    allGood = false
    console.error(`    실패: ${s.label}`)
  }
}
ok(allGood, `지역 ${sels.length}곳 전부 — facts 생성 · 규칙 문장 2~4줄 · 자기검증 통과`)
const maxLen = Math.max(...sels.map((s) => JSON.stringify(buildGuideFacts(s, pack)).length))
ok(maxLen < 2000, `facts 최대 길이 ${maxLen}자 < 프록시 상한 2000자`)

/* ── ② 폐기 규칙 — 음성 대조군 ── */
console.log('▶ ② 폐기 규칙 (스키마 밖이면 null 이어야 한다)')
const f = buildGuideFacts({ mode: 'old', id: 'hwanghae-old' }, pack)
const N = { target: 'events', label: '기록 보기' }
ok(validateGuide({ lines: ['안내입니다.', '신청자는 9,999명입니다.'], next: N }, f) === null, '사실에 없는 숫자 → 폐기')
ok(validateGuide({ lines: ['a', 'b', 'c', 'd', 'e'], next: N }, f) === null, '5문장(스키마 밖) → 폐기')
ok(validateGuide({ lines: ['안내입니다.'], next: N }, f) === null, '1문장(스키마 밖) → 폐기')
ok(validateGuide({ lines: ['안내입니다.', '보십시오.'], next: { target: 'chat', label: 'x' } }, f) === null, '닫힌 target 밖 → 폐기')
ok(validateGuide({ lines: ['안내입니다 \u{1F338}', '보십시오.'], next: N }, f) === null, '이모지 → 폐기')
ok(validateGuide(null, f) === null, 'null → 폐기')
ok(validateGuide(fallbackGuide(f), f) !== null, '규칙 문장 자신 → 통과 (양성 대조군)')

/* ── ③ 실호출 (선택) ── */
if (WITH_LLM) {
  console.log('▶ ③ Gemini 실호출 — 프록시와 같은 프롬프트·같은 인자')
  let keys = []
  try { keys = JSON.parse(fs.readFileSync(path.join(root, '.gemini-keys.tmp.json'), 'utf8')) } catch { /* 아래에서 처리 */ }
  if (!Array.isArray(keys) || !keys.length) {
    console.error('  ✗ 키 파일 없음(.gemini-keys.tmp.json) — 실호출 생략')
    fail++
  } else {
    const MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash']
    let raw = null, used = null
    outer: for (const m of MODELS) {
      for (let i = 0; i < Math.min(2, keys.length); i++) {
        try {
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(keys[i])}`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: GUIDE_PROMPT }] },
                contents: [{ role: 'user', parts: [{ text: JSON.stringify(f) }] }],
                generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 800 },
              }),
              signal: AbortSignal.timeout(15000),
            },
          )
          if (!r.ok) continue
          const j = await r.json()
          const t = j?.candidates?.[0]?.content?.parts?.[0]?.text
          if (!t) continue
          raw = JSON.parse(t); used = m
          break outer
        } catch { /* 다음 조합 */ }
      }
    }
    if (!raw) {
      console.error('  ✗ 전 모델 실패 — 네트워크/쿼터 확인 (화면은 이때 규칙 문장으로 동작한다)')
      fail++
    } else {
      const v = validateGuide(raw, f)
      console.log(`  모델 ${used} · 원출력: ${JSON.stringify(raw).slice(0, 400)}`)
      ok(v !== null, 'LLM 원출력이 validateGuide 통과 (수치 전부 사실 묶음 안)')
      if (v) console.log(`  검증 후: ${v.lines.length}문장 · next=${v.next.target} 「${v.next.label}」`)
    }
  }
} else {
  console.log('▶ ③ 실호출 생략 (--llm 플래그 없음) — 이 경로가 죽어도 화면은 ①로 동작한다')
}

console.log(`\n${fail === 0 ? '✓ 통과' : '✗ 실패'} — ${pass}건 통과 · ${fail}건 실패`)
/* fetch 직후 process.exit() 는 Windows 에서 libuv 종료 어서션을 낸다(실측) — exitCode 로 둔다 */
process.exitCode = fail === 0 ? 0 : 1
