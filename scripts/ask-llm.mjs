// LLM 중간계층 포함 질의 — 규칙이 못 잡는 자유 표현 검증
// 사용: NODE_ENV=dev node scripts/ask-llm.mjs "코로나 터지기 전에 남북교역 어땠어"
//       인자 없으면 내장 테스트셋 실행

import fs from 'node:fs'
import { buildIndex, answerAsync } from '../frontend/src/engine/nk-search.mjs'
import * as LLM from '../frontend/src/engine/nk-llm.mjs'

try { LLM.setKeys(JSON.parse(fs.readFileSync('.gemini-keys.tmp.json', 'utf8'))) }
catch { console.warn('⚠ Gemini 키 없음 — 규칙 계층만 동작합니다\n') }

const ix = buildIndex(JSON.parse(fs.readFileSync('frontend/src/data/nk-index.json', 'utf8')))

const DEFAULT_QS = [
  '코로나 터지기 전에 남북교역 어땠어',
  '문재인 정부 때 남북회담 몇 번 했나',
  '북에서 내려온 사람들 숫자가 궁금해요',
  '개성공단 그거 언제 없어진거임',
  '김정은 집권 이후로 뭐 달라졌어',
]
const args = process.argv.slice(2)
const QS = args.length ? [args.join(' ')] : DEFAULT_QS

for (const q of QS) {
  const t0 = Date.now()
  const a = await answerAsync(ix, q, { llm: LLM })
  console.log(`\n❓ ${q}`)
  console.log(`   ${Date.now() - t0}ms · LLM=${a.llmUsed.join(',') || '미사용(규칙으로 충분)'}`)
  console.log(`   시간 ${a.Q.time.slot}(${a.Q.time.resolvedBy}) → ${a.Q.win.label}` +
    ` · intent ${a.Q.norm.intent}(${a.Q.norm.resolvedBy})`)
  if (a.topicNotice) console.log(`   🔒 ${a.topicNotice.text.slice(0, 70)}`)
  if (a.level === 'no_evidence') { console.log('   📭 관련 공식 자료 없음'); continue }
  if (a.level === 'timeline') {
    console.log(`   🗓 연혁 ${a.items.length}건 (${a.items[a.items.length-1]?.r.occurredOn} ~ ${a.items[0]?.r.occurredOn})`)
    a.items.slice(0, 3).forEach(i => console.log(`      ${i.r.occurredOn} ${i.r.title.slice(0, 52)}`))
  } else {
    if (a.agg) console.log(`   📊 ${a.agg.mode} ${a.agg.metric} = ${(a.agg.sum ?? a.agg.total ?? 0).toLocaleString()}${a.agg.unit || ''}`)
    ;(a.groups || []).slice(0, 2).forEach(g =>
      console.log(`   · [${g.notice.level}] ${g.ds.name} — ${g.hits[0].r.title.slice(0, 46)}`))
  }
}
console.log(`\nLLM 캐시 ${LLM.cacheSize()}건`)
