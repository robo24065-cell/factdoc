// 질의 CLI — 검색·as-of 게이트 검증
// 사용: node scripts/ask.mjs "개성공단 입주기업 몇 개야"

import fs from 'node:fs'
import { buildIndex, answer } from '../frontend/src/engine/nk-search.mjs'

const data = JSON.parse(fs.readFileSync('frontend/src/data/nk-index.json', 'utf8'))
const ix = buildIndex(data)
const q = process.argv.slice(2).join(' ')
if (!q) { console.error('질문을 입력하세요'); process.exit(1) }

const a = answer(ix, q)
const badge = { frozen: '🔒', live: '🟢', stale: '🟡' }

console.log(`\n❓ ${q}`)
console.log(`   시간슬롯: ${a.Q.time.slot}${a.Q.time.matched ? `("${a.Q.time.matched}")` : ''} → ${a.Q.win.label}`)
console.log(`   검색토큰: ${a.Q.tokens.join(' ')}${a.Q.expanded && a.Q.expanded.length > a.Q.tokens.length ? ` (+확장 ${a.Q.expanded.slice(a.Q.tokens.length).slice(0,5).join(' ')})` : ''}${a.Q.numeric ? ` · 수치주장 ${a.Q.numeric.raw}` : ''}`)
console.log(`   주제 라우팅: ${a.Q.topics.join(', ') || '(없음)'}\n`)

if (a.topicNotice) {
  const ic = a.topicNotice.state === 'frozen' ? '🔒' : '⏸'
  console.log(`${ic} ${a.topicNotice.text}
`)
}

if (a.level === 'no_evidence') {
  console.log('📭 관련 공식 자료를 찾지 못했습니다.')
  console.log('   근거가 없어서 모르는 것이지, 주장이 거짓이라는 뜻은 아닙니다.\n')
  process.exit(0)
}

// 연혁 모드 — 시간순 나열
if (a.level === 'timeline') {
  console.log(`🗓  연혁 ${a.items.length}건 (관련 ${a.available}건 중 최신순)`)
  if (a.widened) console.log(`   ⚠  '${a.Q.win.label}' 구간 자료가 부족해 전 기간에서 최신순으로 보여줍니다.`)
  console.log('')
  let lastY = ''
  for (const it of a.items) {
    const y = it.r.occurredOn.slice(0, 4)
    if (y !== lastY) { console.log(`  ── ${y} ──`); lastY = y }
    const src = it.ds.name.length > 12 ? it.ds.name.slice(0, 12) + '…' : it.ds.name
    console.log(`   ${it.r.occurredOn}  ${it.r.title.slice(0, 66)}`)
    if (it.r.body && it.r.body !== it.r.title && it.r.body.length > it.r.title.length + 10)
      console.log(`               ${it.r.body.slice(0, 90)}`)
    console.log(`               └ ${src}`)
  }
  console.log('')
  console.log('📎 출처')
  for (const d of a.sources) {
    const n = asOfBadge(d)
    console.log(`   ${n} ${d.name} — ${d.provider}${d.url ? ' · ' + d.url : ''}`)
  }
  console.log('')
  console.log('─'.repeat(62))
  console.log(`관련 ${a.totalHits}건 · 응답등급 timeline`)
  process.exit(0)
}
function asOfBadge(d) {
  return d.freshness === 'frozen' ? `🔒 ${d.coverageEnd} 이후 데이터 없음`
    : d.freshness === 'live' ? `🟢 ${d.coverageEnd} 기준 최신`
    : `🟡 ${d.coverageEnd} 기준 (이후 미확인)`
}

// 집계·분해 결과
if (a.agg) {
  const g = a.agg
  const gf = g.genderFilter && g.genderFilter !== '전체' ? `${g.genderFilter}성 ` : ''
  if (g.mode === 'distribution') {
    console.log(`📊 ${g.dimName}별 분포 — ${gf}${g.metric}`)
    const w = Math.max(...g.items.map(i => i.value))
    for (const i of g.items) {
      const bar = '█'.repeat(Math.max(1, Math.round(i.share * 30)))
      console.log(`   ${String(i.key).padEnd(9)} ${String(i.value.toLocaleString()).padStart(7)}${g.unit || ''} ${(i.share*100).toFixed(1).padStart(5)}%  ${bar}`)
    }
    console.log(`   합계 ${g.total.toLocaleString()}${g.unit || ''}`)
  } else if (g.mode === 'sum') {
    console.log(`📊 합계 — ${gf}${g.metric}`)
    console.log(`   ${g.sum.toLocaleString()}${g.unit || ''}  (${g.dimName || '구간'} ${g.count}개 합산)`)
    if (g.peak?.key) console.log(`   최다 ${g.peak.key} ${g.peak.value.toLocaleString()}${g.unit||''} · 최소 ${g.low.key} ${g.low.value.toLocaleString()}${g.unit||''}`)
  } else {
    const t = g.mode === 'max' ? g.peak : g.low
    console.log(`📊 ${g.mode === 'max' ? '최다' : '최소'} — ${gf}${g.metric}`)
    console.log(`   ${t.key} : ${t.value.toLocaleString()}${g.unit || ''}`)
  }
  const nt = asOfBadge(g.dataset)
  console.log(`   ${nt}`)
  console.log(`   📎 ${g.dataset.name} · ${g.dataset.provider}`)
  console.log('')
}

// 참고 정보 — 물어본 단위 자료가 없을 때 (답이 아니라 참고)
if (a.related && !a.agg) {
  const k = a.related
  if (k.substituted) {
    console.log('📎 참고 정보')
    console.log(`   질문하신 '${k.askedUnit}' 기준 자료는 확인되지 않습니다.`)
    console.log(`   다만 참고할 만한 공식 자료로 다음이 있습니다:`)
  } else {
    console.log('🔢 수치 조회')
  }
  console.log(`   ${k.metric} : ${k.value.toLocaleString()}${k.unit ? ' ' + k.unit : ''}  (${k.period || k.dataset.coverageEnd} 기준)`)
  if (k.outOfWindow) console.log(`   ⚠  '${k.windowLabel}' 구간 자료가 없어 가장 가까운 시점 자료입니다.`)
  console.log(`   📎 ${k.dataset.name} · ${k.dataset.provider}`)
  console.log('')
}

// ★ 수치 대조를 먼저 — 사용자가 궁금한 건 결론
if (a.numeric) {
  const n = a.numeric
  if (n.comparable) {
    console.log('📊 수치 대조')
    console.log(`   주장값        ${n.claimed.toLocaleString()} ${n.unit || ''}`)
    console.log(`   공식 최댓값   ${n.max.toLocaleString()} (${n.metric}, 관측 ${n.n}개 구간)`)
    console.log(`   최종 관측값   ${n.latest.toLocaleString()} (${n.latestPeriod || '기간미상'})`)
    if (n.verdict === 'above_max') console.log(`   → 주장값이 공식 최댓값의 ${n.ratioToMax.toFixed(1)}배입니다.`)
    else if (n.verdict === 'below_min') console.log('   → 주장값이 공식 최솟값보다 작습니다.')
    else console.log('   → 주장값이 공식 관측 범위 안에 있습니다.')
  } else {
    console.log('📊 직접 대조 불가')
    console.log(`   주장 단위 "${n.wantUnit}" 와 동일 단위의 공식 지표를 찾지 못했습니다. (${n.reason})`)
    console.log('   → 잘못된 대조를 내놓지 않고, 관련 지표만 제시합니다.')
    for (const r of n.related) console.log(`     · ${r.metric} ${r.value.toLocaleString()}${r.unit ? ' ' + r.unit : ''} (${r.period || '기간미상'})`)
    if (n.derived) console.log(`   🧮 역산 추정: 약 ${n.derived.value.toLocaleString()} ${n.derived.unit} — ${n.derived.note}`)
  }
  console.log('')
}

for (const g of a.groups) {
  const b = badge[g.notice.level]
  console.log(`${b} 【${g.ds.name}】`)
  console.log(`   ⏱  ${g.notice.text}`)
  if (g.notice.level !== 'live')
    console.log(`   ⚠  아래 수치·서술은 위 기준일 시점의 값이며, 질문 시점의 값이 아닙니다.`)
  for (const h of g.hits) {
    const d = h.r.occurredOn ? `[${h.r.occurredOn}] ` : ''
    const star = h.r.isLatestInDataset ? '★' : ' '
    console.log(`  ${star}· ${d}${h.r.title.slice(0, 78)}`)
    if (h.r.body && h.r.body !== h.r.title) console.log(`      ${h.r.body.slice(0, 130)}`)
  }
  console.log(`   📎 ${g.ds.provider}${g.ds.url ? ' · ' + g.ds.url : ''}\n`)
}
console.log('─'.repeat(62))
console.log(`관련 ${a.totalHits}건 · 응답등급 ${a.level}   (★ = 해당 데이터셋 최종 시점)`)
