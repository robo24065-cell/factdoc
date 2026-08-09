// 자가 감사 — 정답을 모르는 채로 '의심스러운 출력'을 잡아낸다
//
// eval/wild 는 사람이 케이스를 써야 늘어난다. 그건 내가 상상한 질문만 검사한다는 뜻이다.
// 이 감사기는 반대로 간다: 답을 정하지 않고, **답변 자체가 자기모순이거나 근거가 미심쩍은 신호**를
// 규칙으로 잡는다. 사용자가 화면에서 발견한 실패들이 전부 이 신호에 걸린다.
//
//   node scripts/audit.mjs            요약
//   node scripts/audit.mjs --all      전체 지적 출력
//   node scripts/audit.mjs --rule 시점괴리
//
// 신호가 잡혔다고 전부 버그는 아니다. '사람이 봐야 할 것'의 우선순위 목록이다.

import fs from 'node:fs'
import path from 'node:path'
import { buildIndex, answer, tokenize } from '../frontend/src/engine/nk-search.mjs'

const ix = buildIndex(JSON.parse(
  fs.readFileSync(path.resolve('frontend/public/nk-index.json'), 'utf8')))   // 브라우저와 동일한 인덱스

/* ── 질의 말뭉치 ──────────────────────────────────────────────
   사람이 실제로 칠 법한 형태로만 쓴다. 유도형 금지 — "…맞지?" 처럼 답을 심어두지 않는다.
   같은 뜻을 여러 말투로 적어 표현 차이에 견디는지 본다. */
const QUERIES = [
  // 개성공단 (종료 확정)
  '개성공단 아직 하냐', '개성공단 지금도 돌아가?', '개성공단 언제 멈췄지', '개성공단 기업 몇 개였어',
  '개성공단 생산액 얼마나 됐어', '개성공단 근로자 몇 명이었나', '개성공단 다시 연다는 말 있던데',
  // 금강산 (종료 확정)
  '금강산 관광 다시 가나', '금강산 몇 명이나 갔었어', '금강산 왜 중단됐어', '금강산 관광객 지금 얼마나 가',
  // 교역
  '남북 무역 하고 있나', '북한이랑 교역 얼마나 해', '남북교역 규모 어느 정도야', '북한에 뭘 팔았어',
  '반출 반입 차이가 뭐야', '남북 교역 건수 얼마나 되나',
  // 왕래
  '북한에 몇 명이나 갔다 왔어', '남북 왕래 요즘 있나', '배로도 오가나', '북한 가는 비행기 있어',
  // 탈북민
  '탈북민 몇 명이야', '북한이탈주민 얼마나 왔어', '탈북민 여자가 몇 명이야', '탈북민 남자는',
  '탈북민 남자 여자 몇 명이야', '탈북은 나이 많은 사람이 더 많이 한다며', '탈북민 어디 출신이 많아',
  '북한에서 내려온 사람 다시 북으로 돌려보냈다던데', '탈북했다 다시 월북한다던데', '강제북송 있었대',
  // 인물·동향
  '김정은 최근에 뭐 했어', '김정은 요즘 뭐함', '김여정은 뭐하고 있어', '북한 실세가 누구야',
  '김정은 죽었다는 말 있던데', '북한 주요 인물 알려줘',
  // 회담·합의
  '남북회담 요즘 함?', '정상회담 몇 번 했어', '이산가족 상봉 아직도 하나', '남북 합의서 뭐가 있어',
  // 군사·도발
  '북한 미사일 몇 번 쐈어', '북한 도발', '북한 핵', '북한 핵실험 또 했어?', '오물풍선 또 보냈대',
  '북한이 남한 공격준비중이라는데 요즘', '무인기 넘어왔다며', '북한이 러시아에 파병했다던데',
  // 인도·경제
  '북한 주민은 많이 굶는다던데', '북한 식량난 심각해?', '대북지원 하는 단체 있나', '쌀 보내준 적 있어',
  '북한 경제 어때', '북한 물가 어떻대',
  // 사회·문화
  '북한 사람들 휴대폰 써?', '북한에도 시장 있어', '북한 학교는 몇 년 다녀', '사회문화 교류 뭐 했어',
  // 최근 이슈형 (코퍼스에 없을 가능성이 높은 것 — '없다'고 말하는지 본다)
  '제주도에서 북한하고 무역했다며', '제주도 북한 교류', '우라늄 공장 폐수', '평산 우라늄 어떻게 됐어',
  '간첩', '귀순', '월북', '북한 코로나 어땠어',
  // 시점 지정
  '작년 탈북민은 몇 명', '2019년 남북교역 얼마야', '2015년 개성공단 생산액', '올해 남북관계 어때',
  '내년 탈북민 몇 명이야', '최근 6개월 무슨 일 있었어',
  // 도메인 밖 (답하면 안 됨)
  '오늘 저녁 뭐 먹지', '치킨 맛집 추천', '오늘 날씨 어때', '영화 추천해줘', '주식 뭐 사지',
]

/* 질문이 '최근'을 함의하는가 — 이 표지가 있으면 오래된 근거는 그대로 답이 될 수 없다 */
const RECENT_HINT = /요즘|최근|지금|현재|올해|이번|아직|계속|다며|던데|대\?|한대|했대|난대|중이라는데|는중/
const OUT_OF_DOMAIN = ['오늘 저녁 뭐 먹지', '치킨 맛집 추천', '오늘 날씨 어때', '영화 추천해줘', '주식 뭐 사지']
const FUTURE_HINT = /내년|내후년|앞으로|향후|예정|될까|하게 될/

const YEAR = 365.25 * 864e5
const findings = []
const add = (rule, q, detail, sev) => findings.push({ rule, q, detail, sev })

for (const q of QUERIES) {
  let a
  try { a = answer(ix, q) } catch (e) { add('예외', q, e.message.slice(0, 80), 3); continue }

  const groups = a.groups ?? []
  const items = a.items ?? []
  const answered = groups.length > 0 || items.length > 0 || a.agg || a.numeric
  const outDomain = a.Q?.inDomain === false

  // ① 도메인 밖인데 답함 / 도메인 안인데 빈손
  if (OUT_OF_DOMAIN.includes(q) && answered) add('도메인누출', q, '답하면 안 되는데 답함', 3)
  if (!OUT_OF_DOMAIN.includes(q) && !answered && !outDomain) add('빈손', q, '도메인 안인데 아무것도 못 냄', 2)
  if (!OUT_OF_DOMAIN.includes(q) && outDomain) add('도메인오탐', q, '북한·통일 질문인데 분야 밖으로 판정', 3)

  const hits = [...groups.flatMap(g => (g.hits ?? []).map(h => ({ ...h, ds: g.ds, notice: g.notice }))),
                ...items.map(i => ({ r: i.r, ds: i.ds, notice: i.notice }))]
  const top = hits[0]

  if (top) {
    // ② 배지는 '최신'인데 실제 근거가 아주 오래됨
    //    배지는 '데이터셋'의 신선도인데 사용자는 '이 근거'의 시점으로 읽는다. 그 괴리를 잡는다.
    const on = top.r?.occurredOn
    if (on && String(top.notice?.level) === 'live') {
      const age = (Date.now() - new Date(on)) / YEAR
      if (age >= 10) add('시점괴리', q, `배지 🟢최신 인데 1위 근거는 ${on} (${age.toFixed(0)}년 전)`, 3)
      else if (age >= 5) add('시점괴리', q, `배지 🟢최신 인데 1위 근거는 ${on} (${age.toFixed(0)}년 전)`, 2)
    }
    // ③ 최근을 물었는데 근거가 오래됨
    if (RECENT_HINT.test(q) && on) {
      const age = (Date.now() - new Date(on)) / YEAR
      if (age >= 10) add('최신성불일치', q, `'최근'을 물었는데 1위 근거 ${on} (${age.toFixed(0)}년 전)`, 2)
    }
    // ④ 주제 표류 — 질문의 어떤 낱말도 1위 제목에 없다
    const qt = tokenize(q).filter(t => t.length >= 2)
    const title = String(top.r?.title ?? '')
    if (qt.length && !qt.some(t => title.includes(t) || title.includes(t.slice(0, 2))))
      add('주제표류', q, `1위 제목에 질문 낱말이 하나도 없음 — 「${title.slice(0, 40)}」`, 2)
  }

  // ⑤ 미래를 물었는데 과거 수치를 답으로 냄
  if (FUTURE_HINT.test(q) && (a.agg || a.numeric))
    add('미래에과거답', q, '미래를 물었는데 과거 집계를 제시', 3)

  // ⑥ 집계에 필터가 걸렸는데 그 조건이 드러나지 않음 (전체값으로 오독됨)
  if (a.agg?.genderFilter && a.agg.genderFilter !== '전체' && a.agg.mode !== 'distribution'
      && !/남자|여자|남성|여성/.test(q))
    add('숨은필터', q, `성별=${a.agg.genderFilter} 로 걸러 합산했는데 질문엔 성별 언급 없음`, 3)

  // ⑦ 변별 신호가 없는데 '근거'로 제시 (참고여야 함)
  if (a.Q?.genericOnly && groups.length && !a.related)
    add('참고를근거로', q, '변별 어휘 0 인데 근거 카드로 노출 (refOnly 처리 확인 필요)', 1)

  // ⑧ 무관 데이터셋 혼입 — 인물/탈북민이 관련 없는 질의에 붙음
  const names = groups.map(g => g.dsKey)
  if (names.includes('people') && !/인물|누구|실세|김정은|김여정/.test(q))
    add('무관데이터셋', q, '북한 주요 인물이 근거로 붙음', 3)
  if (names.some(n => /^defector/.test(n)) && !/탈북|이탈주민|귀순|북송/.test(q))
    add('무관데이터셋', q, '북한이탈주민 통계가 근거로 붙음', 3)
}

// ── 출력 ──────────────────────────────────────────────────
const RULES = [...new Set(findings.map(f => f.rule))]
const only = process.argv.includes('--rule') ? process.argv[process.argv.indexOf('--rule') + 1] : null
const all = process.argv.includes('--all')

console.log('═'.repeat(80))
console.log(` 자가 감사 — 질의 ${QUERIES.length}건 · 지적 ${findings.length}건`)
console.log('═'.repeat(80))
for (const r of RULES.sort((a, b) =>
  findings.filter(f => f.rule === b).length - findings.filter(f => f.rule === a).length)) {
  const fs_ = findings.filter(f => f.rule === r)
  const sev = Math.max(...fs_.map(f => f.sev))
  console.log(`\n${'●'.repeat(sev)} ${r}  ${fs_.length}건`)
  for (const f of (all || only === r ? fs_ : fs_.slice(0, 4)))
    console.log(`   ${f.q.padEnd(30)} ${f.detail}`)
  if (!all && only !== r && fs_.length > 4) console.log(`   … 외 ${fs_.length - 4}건 (--rule ${r})`)
}
console.log('\n' + '═'.repeat(80))
const crit = findings.filter(f => f.sev === 3).length
console.log(` 심각 ${crit}건 · 주의 ${findings.filter(f => f.sev === 2).length}건 · 참고 ${findings.filter(f => f.sev === 1).length}건`)
console.log('═'.repeat(80))
process.exitCode = crit > 0 ? 1 : 0
