// 실사용 질의 회귀 — 정답 문자열이 아니라 '행동 규약'을 검사
// 사용: node scripts/wild.mjs [--v]

import fs from 'node:fs'
import { buildIndex, answer } from '../frontend/src/engine/nk-search.mjs'
import { WILD } from './wild-set.mjs'

const V = process.argv.includes('--v')

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
/* 관계망도 함께 싣는다 — 안 실으면 관계 답변이 조용히 꺼진 채로 전부 통과해 버린다.
   없으면 경고하고 계속한다(관계 케이스만 실패하고 나머지는 그대로 돈다). */
const GP = '북한자료-api/nk-graph.json'
if (!WEB && fs.existsSync(GP)) data.graph = JSON.parse(fs.readFileSync(GP, 'utf8'))
else console.log('⚠ 관계망 없음 — node scripts/build-nk-graph.mjs 를 먼저 돌리세요')
/* 어휘 사전도 함께 — 안 실으면 낱말 질문이 '사전 없음' 경로로만 돌아 실제 동작을 못 잰다. */
const LP = '북한자료-api/nk-lexicon.json'
if (!WEB && fs.existsSync(LP)) data.lexicon = JSON.parse(fs.readFileSync(LP, 'utf8'))
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

  /* ── 관계망 ────────────────────────────────────────────────
     양방향으로 감시한다. expectRelation 은 '관계를 물었으면 답해야 한다'(과잉회피 감시),
     noRelation 은 '관계를 안 물었으면 관계 카드를 들이밀지 마라'(과잉주장 감시).
     relationTop 은 방향까지 본다 — '측근'은 그가 수행한 대상이 아니라 그를 수행한 사람이다. */
  if (c.expectRelation && !a.relation) fails.push('관계를 물었는데 관계망이 답하지 않음')
  if (c.noRelation && a.relation) fails.push(`관계를 안 물었는데 관계 카드(${a.relation.subject})`)
  if (c.relationTop) {
    const R = a.relation
    if (!R) fails.push('관계 없음')
    else {
      const side = (R.servedTotal ?? 0) >= (R.servesTotal ?? 0) ? R.served : R.serves
      const names = (side || []).map(x => x.name)
      if (!names.slice(0, 3).includes(c.relationTop))
        fails.push(`관계 상위에 ${c.relationTop} 없음(${names.slice(0, 3).join(',') || '비어있음'})`)
    }
  }
  /* ── 시간 정합성 ────────────────────────────────────────
     as-of 원칙은 근거(groups)에만 걸려 있었고 집계(agg)에는 없었다.
     그 구멍은 정답 문자열로는 안 잡힌다 — 값은 늘 맞고 '시점'만 틀리기 때문이다. */
  if (c.mustNumber && !(a.agg && !a.agg.unsolicited)) fails.push('가진 수치가 요지에서 사라짐')
  /* 수치가 '내려간' 것뿐 아니라 '아예 없는' 것도 통과다 — 원래 요구는
     '묻지 않은 수치를 요지로 올리지 마라'이지 '수치를 만들어놓고 내려라'가 아니다. */
  if (c.mustDemoteNumber && a.agg && !a.agg.unsolicited) fails.push('묻지 않은 수치가 요지로 올라감')
  if (c.mustOutOfWindow && !(a.agg && a.agg.outOfWindow)) fails.push('물어본 시점의 값이 아닌데 표식 없음')
  if (c.mustNotOutOfWindow && a.agg?.outOfWindow) fails.push('창 안인데 창 밖으로 표시')
  if (c.mustFuture && !(a.Q?.win?.future && a.agg?.future)) fails.push('미래 시점을 과거로 처리')
  if (c.mustNoAgg && a.agg) fails.push(`없는 차원(${a.agg.dimName})으로 수치 생성`)
  /* 연도 질의의 1순위 근거는 질의 주제의 데이터셋이어야 한다.
     '2018년 남북회담'이 '북한이탈주민 정착현황 — 2018'을 1위로 물어오던 자리다.
     정답 문자열이 아니라 데이터셋 주제 일치로 검사한다(유도형 질문 금지 원칙). */
  if (c.topDatasetAny) {
    const top = (a.groups || [])[0]?.dsKey ?? (a.items || [])[0]?.r.datasetId ?? null
    if (!c.topDatasetAny.includes(top)) fails.push(`1순위 근거 ${top || '없음'}`)
  }
  if (c.mustItemsYear) {
    const it = a.items || []
    const off = it.filter(i => !String(i.r.occurredOn || '').startsWith(c.mustItemsYear))
    if (!it.length || off.length) fails.push(`연도 벗어난 항목 ${off.length}/${it.length}`)
  }

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
/* ── 집계 안정성 (질의 교차 불변식) ─────────────────────────
   같은 지표·같은 성별필터의 합계는 질문 문장이 달라져도 같아야 한다.
   합계를 랭킹 창(hits.slice(0,40))에서 모으면 40위에 못 든 행이 빠져 조용히 잘린다 —
   실측(수정 전): '탈북민 건강 어때' 24,243 · '탈북했다 월북한 사례' 14,609 · '탈북민 교육' 1,295.
   값은 늘 '있고' 시점 고지도 붙으므로 개별 단언으로는 영원히 안 잡힌다. */
const sums = new Map()
for (const x of rows) {
  const g = x.a?.agg
  if (!g || g.mode === 'distribution' || g.sum == null) continue
  const k = `${g.metric}|${g.genderFilter}`
  if (!sums.has(k)) sums.set(k, new Map())
  const m = sums.get(k)
  if (!m.has(g.sum)) m.set(g.sum, [])
  m.get(g.sum).push(x.c.q)
}
const unstable = [...sums].filter(([, m]) => m.size > 1)
for (const [k, m] of unstable) {
  console.log(`✗ 같은 지표에 서로 다른 합계 — ${k}`)
  for (const [v, qs] of [...m].sort((a, b) => b[1].length - a[1].length))
    console.log(`    ${v} ← ${qs.slice(0, 4).join(' / ')}`)
}
console.log(`집계 안정성 : 불안정 지표 ${unstable.length}종`)
process.exitCode = (pass === rows.length && !unstable.length) ? 0 : 1
