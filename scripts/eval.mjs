// 회귀 하니스 — 눈으로 하나씩 보지 않고 한 번에 측정
// 사용: node scripts/eval.mjs [--v]

import fs from 'node:fs'
import { buildIndex, answer } from '../frontend/src/engine/nk-search.mjs'
import { CASES } from './eval-set.mjs'

const VERBOSE = process.argv.includes('--v')

/* ★ --web : 브라우저가 실제로 받는 파일 그대로 검증한다.
   지금까지 회귀는 로컬 인덱스(frontend/src/data/nk-index.json)만 봤다.
   그런데 배포본은 **본문이 잘려 있고**(BODY_MAX) 잘린 어휘는 st 로만 남으며,
   포털동향은 열 배열로 압축돼 별도 파일로 온다. 즉 **검증한 적 없는 인덱스가 배포돼 있었다.**
   실측 사고 2026-08-13: "북한이 미사일 발사 언제언제 했니" 가 로컬에선 연혁 20건인데
   웹 인덱스에선 items=0 이었고, eval 을 통과하던 "탈북민 여자가 몇 명이야" 도 라이브에서 깨졌다. */
function loadWeb() {
  const P = 'frontend/public/'
  const idx = JSON.parse(fs.readFileSync(P + 'nk-index.json', 'utf8'))
  const ms = JSON.parse(fs.readFileSync(P + 'nk-measures.json', 'utf8'))
  const opt = f => (fs.existsSync(P + f) ? JSON.parse(fs.readFileSync(P + f, 'utf8')) : null)
  const g = opt('nk-graph.json'), lx = opt('nk-lexicon.json'), p = opt('nk-trend.json')
  const tr = p?.rows?.length ? p.rows.map(r => ({
    /* ★ defaults 를 **통째로 펼친다.** 손으로 나열하면 또 빠뜨리고,
       빠진 필드는 랭킹에서 조용히 NaN 이 되어 정렬 전체를 무너뜨린다(실측 사고). */
    ...p.defaults,
    id: r[0], topic: r[1], title: r[2], body: r[3],
    occurredOn: null, len0: r[5] ?? undefined,
    sourceUrl: r[4] ? String(p.defaults.urlTemplate).replace('{pk}', String(r[4])) : null,
  })) : []
  return { ...idx, records: [...(idx.records ?? []), ...tr], measures: ms.measures ?? [], graph: g, lexicon: lx }
}

const WEB = process.argv.includes('--web')
const data = WEB ? loadWeb() : JSON.parse(fs.readFileSync('frontend/src/data/nk-index.json', 'utf8'))
const ix = buildIndex(data)

// 응답을 검사 가능한 평문으로 직렬화
function flatten(a) {
  const parts = []
  if (a.level) parts.push(a.level)
  if (a.topicNotice) parts.push(a.topicNotice.text, a.topicNotice.state)
  for (const g of a.groups || []) {
    parts.push(g.ds?.name, g.notice?.text)
    for (const h of g.hits || []) parts.push(h.r.title, h.r.body)
  }
  for (const it of a.items || []) parts.push(it.r.title, it.r.body, it.notice?.text)
  if (a.agg) parts.push(a.agg.metric, JSON.stringify(a.agg.items || ''), a.agg.dataset?.name)
  if (a.numeric) parts.push(JSON.stringify(a.numeric))
  if (a.related) parts.push(a.related.metric, a.related.note)
  for (const s of a.sources || []) parts.push(s.name, s.frozenReason)
  // frozen 사유는 데이터셋에 있으므로 함께 편입
  for (const g of a.groups || []) if (g.ds?.frozenReason) parts.push(g.ds.frozenReason)
  for (const it of a.items || []) if (it.ds?.frozenReason) parts.push(it.ds.frozenReason)
  if (a.agg?.dataset?.frozenReason) parts.push(a.agg.dataset.frozenReason)
  return parts.filter(Boolean).join(' \n ')
}

const results = []
for (const c of CASES) {
  const fails = []
  let a
  try { a = answer(ix, c.q) } catch (e) { results.push({ c, fails: [`예외: ${e.message}`], a: null }); continue }
  const text = flatten(a)

  if (c.must) for (const m of c.must)
    if (!text.includes(m)) fails.push(`must "${m}"`)
  if (c.mustNot) for (const m of c.mustNot)
    if (text.includes(m)) fails.push(`mustNot "${m}"`)

  if (c.mode && a.level !== c.mode) fails.push(`mode ${a.level}≠${c.mode}`)
  const itemCount = a.agg?.mode === 'distribution' ? (a.agg.items?.length || 0) : (a.items?.length || 0)
  if (c.minItems && itemCount < c.minItems) fails.push(`items ${itemCount}<${c.minItems}`)
  if (c.exactItems && (a.items?.length || 0) !== c.exactItems)
    fails.push(`items ${a.items?.length || 0}≠${c.exactItems}`)
  if (c.mustDatasets) for (const d of c.mustDatasets)
    if (!(a.items || []).some(i => i.r.datasetId === d)) fails.push(`dataset ${d} 없음`)
  if (c.allItemsInYear && (a.items || []).length &&
      !(a.items || []).every(i => i.r.occurredOn?.startsWith(c.allItemsInYear)))
    fails.push(`연도 ${c.allItemsInYear} 벗어남`)

  if (c.topFrozen) {
    const lv = a.topicNotice?.state || a.groups?.[0]?.notice?.level || a.agg?.dataset?.freshness
    if (lv !== 'frozen') fails.push(`top ${lv}≠frozen`)
  }
  if (c.mustNoticeLevel) {
    const lv = a.topicNotice ? (a.topicNotice.state === 'frozen' ? 'frozen' : 'stale')
      : (a.groups?.[0]?.notice?.level || a.agg?.dataset?.freshness)
    if (!c.mustNoticeLevel.includes(lv)) fails.push(`notice ${lv}`)
  }

  if (c.numericComparable !== undefined) {
    if (!a.numeric) fails.push('numeric 없음')
    else if (a.numeric.comparable !== c.numericComparable)
      fails.push(`comparable ${a.numeric.comparable}`)
  }
  if (c.numericVerdict && a.numeric?.verdict !== c.numericVerdict)
    fails.push(`verdict ${a.numeric?.verdict}`)

  if (c.aggMode && a.agg?.mode !== c.aggMode) fails.push(`aggMode ${a.agg?.mode}≠${c.aggMode}`)
  if (c.aggGender && a.agg?.genderFilter !== c.aggGender)
    fails.push(`gender ${a.agg?.genderFilter}≠${c.aggGender}`)
  if (c.aggDim && a.agg?.dimName !== c.aggDim) fails.push(`dim ${a.agg?.dimName}≠${c.aggDim}`)
  if (c.minValue && (a.agg?.sum || 0) < c.minValue) fails.push(`sum ${a.agg?.sum}<${c.minValue}`)

  if (c.wantIntent && a.Q.norm.intent !== c.wantIntent)
    fails.push(`intent ${a.Q.norm.intent}≠${c.wantIntent}`)
  if (c.wantUnitFamily && a.Q.norm.unitFamily !== c.wantUnitFamily)
    fails.push(`unitFam ${a.Q.norm.unitFamily}≠${c.wantUnitFamily}`)
  if (c.timeSlot && a.Q.time.slot !== c.timeSlot) fails.push(`slot ${a.Q.time.slot}≠${c.timeSlot}`)
  if (c.mustNotToken) for (const t of c.mustNotToken)
    if (a.Q.tokens.includes(t)) fails.push(`token "${t}" 잔존`)

  if (!c.allowNoEvidence && a.level === 'no_evidence') fails.push('근거없음')

  results.push({ c, fails, a })
}

// ── 리포트 ──────────────────────────────────────────────────
const byTag = new Map()
for (const r of results) {
  if (!byTag.has(r.c.tag)) byTag.set(r.c.tag, { pass: 0, fail: 0, items: [] })
  const b = byTag.get(r.c.tag)
  r.fails.length ? b.fail++ : b.pass++
  b.items.push(r)
}
const pass = results.filter(r => !r.fails.length).length

console.log('═'.repeat(72))
console.log(` 회귀 평가  ${pass}/${results.length} 통과  (${(pass / results.length * 100).toFixed(0)}%)`)
console.log('═'.repeat(72))
for (const [tag, b] of byTag) {
  const ok = b.fail === 0
  console.log(`${ok ? '✅' : '❌'} ${tag.padEnd(13)} ${b.pass}/${b.pass + b.fail}`)
  for (const r of b.items) {
    if (!r.fails.length && !VERBOSE) continue
    const mark = r.fails.length ? '   ✗' : '   ·'
    console.log(`${mark} ${r.c.q}`)
    if (r.fails.length) console.log(`       ${r.fails.join(' / ')}`)
  }
}
console.log('═'.repeat(72))

// 안전 지표 (실패해도 통과시키지 않는 항목)
const unsafe = results.filter(r => r.fails.some(f => /mustNot|frozen|근거없음/.test(f)))
console.log(`안전 위반 : ${unsafe.length}건`)
console.log(`빈손 응답 : ${results.filter(r => r.a?.level === 'no_evidence').length}건`)
process.exitCode = pass === results.length ? 0 : 1
