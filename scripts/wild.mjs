// 실사용 질의 회귀 — 정답 문자열이 아니라 '행동 규약'을 검사
// 사용: node scripts/wild.mjs [--v]

import fs from 'node:fs'
import { buildIndex, answer } from '../frontend/src/engine/nk-search.mjs'
import { WILD } from './wild-set.mjs'

const V = process.argv.includes('--v')
const data = JSON.parse(fs.readFileSync('frontend/src/data/nk-index.json', 'utf8'))
const ix = buildIndex(data)

const VERDICT_WORDS = ['거짓입니다', '허위입니다', '사실입니다', '틀렸습니다', '맞습니다']

function inspect(a) {
  const g = a.groups || [], it = a.items || []
  const hasAnswer = a.level !== 'no_evidence' &&
    (g.length > 0 || it.length > 0 || !!a.agg || !!a.related)
  const hasSource = !!a.topicNotice ||
    g.some(x => x.ds?.name) || it.some(x => x.ds?.name) || !!a.agg?.dataset || !!a.related?.dataset
  const hasAsOf = !!a.topicNotice ||
    g.some(x => x.notice?.text) || it.some(x => x.notice?.text) ||
    !!a.agg?.dataset?.coverageEnd || !!a.related?.dataset?.coverageEnd
  const text = [
    ...g.flatMap(x => [x.ds?.name, x.notice?.text, ...x.hits.map(h => h.r.title)]),
    ...it.map(x => x.r.title), a.agg?.metric, a.related?.metric, a.topicNotice?.text,
  ].filter(Boolean).join(' ')
  return { hasAnswer, hasSource, hasAsOf, text }
}

const rows = []
for (const c of WILD) {
  let a, err = null
  try { a = answer(ix, c.q) } catch (e) { err = e.message }
  if (err) { rows.push({ c, fails: [`예외 ${err}`], a: null }); continue }
  const r = inspect(a)
  const fails = []

  if (c.domain) {
    if (!r.hasAnswer && !c.soft) fails.push('빈손')
    if (r.hasAnswer && !r.hasSource) fails.push('출처없음')
    if (r.hasAnswer && !r.hasAsOf) fails.push('시점고지없음')
    if (c.expectTopic && !a.Q.topics.some(t => t === c.expectTopic || t.startsWith(c.expectTopic)))
      fails.push(`주제이탈(${a.Q.topics.join(',') || '없음'})`)
  } else {
    if (r.hasAnswer) fails.push('도메인밖인데 답함')
  }
  if (c.noVerdict && VERDICT_WORDS.some(w => r.text.includes(w))) fails.push('단정')

  /* mustNotDataset 과 mustDataset 을 같은 세트에 함께 둔다.
     과잉주장만 감시하면 문턱이 계속 올라가 과잉회피로 되돌아가고, 그 반대도 마찬가지다. */
  if (c.mustNotDataset) for (const d of c.mustNotDataset)
    if ((a.groups || []).some(g => g.dsKey === d)) fails.push(`무관 데이터셋 ${d} 혼입`)
  if (c.mustDataset) for (const d of c.mustDataset)
    if (!(a.groups || []).some(g => g.dsKey === d) &&
        !(a.items || []).some(i => i.r.datasetId === d)) fails.push(`필요 데이터셋 ${d} 유실`)
  if (c.mustEvidenceAny && r.hasAnswer && !c.mustEvidenceAny.some(w => r.text.includes(w)))
    fails.push(`근거에 ${c.mustEvidenceAny.join('/')} 없음`)
  if (c.expectGenericOnly && !a.Q?.genericOnly) fails.push('변별신호 없음을 못 알아챔')

  rows.push({ c, fails, a, r })
}

const pass = rows.filter(x => !x.fails.length).length
console.log('═'.repeat(74))
console.log(` 실사용 질의  ${pass}/${rows.length} 대응  (${(pass / rows.length * 100).toFixed(0)}%)`)
console.log('═'.repeat(74))
for (const x of rows) {
  if (!x.fails.length && !V) continue
  console.log(`${x.fails.length ? '✗' : '·'} ${x.c.q.slice(0, 48)}`)
  if (x.fails.length) console.log(`    ${x.fails.join(' / ')}`)
  else if (V) console.log(`    → ${(x.r.text || '').slice(0, 90)}`)
}
console.log('═'.repeat(74))
const dom = rows.filter(x => x.c.domain)
console.log(`도메인 내 ${dom.length}건 중 응답 ${dom.filter(x => x.r?.hasAnswer).length}건`)
console.log(`출처 누락 ${rows.filter(x => x.r?.hasAnswer && !x.r.hasSource).length}건 · 시점 누락 ${rows.filter(x => x.r?.hasAnswer && !x.r.hasAsOf).length}건`)
process.exitCode = pass === rows.length ? 0 : 1
