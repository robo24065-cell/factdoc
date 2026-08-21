#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   분석 덱 「Gemini 요약」을 굽는다 — 검사를 통과한 것만 파일로 남긴다.

   왜 화면이 아니라 스크립트인가
     ① 요청 때마다 만들면 사람이 읽어 볼 기회가 없다. 빌드 때 한 번 구워 파일로 커밋하면
        **검토 가능한 산출물**이 남는다. 「스크립트로 굽는다」의 가장 큰 안전 이득이
        오프라인 동작이 아니라 이것이다.
     ② 네트워크가 죽어도 화면이 멀쩡하다(LLM 4원칙 ④). 요약이 없으면 화면은 그 구획을
        아예 그리지 않는다 — 빈 상자·스켈레톤을 두지 않는다. 자리를 비워 두면 고장 난
        화면이 되고, 그건 요약이 없는 것보다 나쁘다.

   무엇을 하지 않는가
     · 규칙 폴백을 만들지 않는다. 덱 머리에는 이미 규칙이 쓴 요약이 있다
       ("21가지를 재봤습니다. 성립 11 · 약함 4 · 불가 6"). Gemini 요약은 순수한 덤이다.
       문장을 규칙으로 지어내면 우리가 쓴 글에 "Gemini 요약" 이름표를 붙이는 것이 되어
       labeling 이 거짓이 된다.
     · 근거 포인터(figures)를 LLM 에게 만들게 하지 않는다. 검증기가 채운다(nk-summary.mjs).

   사용법
     node scripts/nk-deck-summary.mjs                # 굽는다
     node scripts/nk-deck-summary.mjs --require      # 실패하면 exit 1 (제출·발표 빌드용)
     node scripts/nk-deck-summary.mjs --dry          # 호출 없이 사실 묶음·기존 산출물만 점검
     node scripts/nk-deck-summary.mjs --selftest     # 검증기 자체 시험 (네트워크 없음)
     node scripts/nk-deck-summary.mjs --quiet        # 통과 전문 출력 생략

   키는 .gemini-keys.tmp.json(gitignore) 에서 읽고 **어떤 경로로도 출력하지 않는다.**
   나가는 값: 기본 0. --require 이고 쓸 수 있는 요약이 하나도 없을 때만 1.
   ────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  SUMMARY_PROMPT, PROMPT_VERSION, buildSummaryFacts, verifySummary, feedbackBlock, scanNumbers,
  SAY_RULES, CARD_RULES,
} from '../frontend/src/engine/nk-summary.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const has = (f) => argv.includes(`--${f}`)
const arg = (k) => { const h = argv.find((a) => a.startsWith(`--${k}=`)); return h ? h.slice(k.length + 3) : null }

const QUIET = has('quiet')
const DRY = has('dry')
const SELFTEST = has('selftest')
const REQUIRE = has('require')
/* --think : thinkingBudget 0 을 빼고 모델의 기본 추론을 켠다.
   검사가 14종이라 무추론 출력은 「카드 제목 재진술」·「구획별 필수 수치 누락」에서 자주 걸린다(실측).
   느리고 토큰을 더 쓰지만 판정 기준은 그대로다 — 검사를 통과한 출력만 저장된다. */
const THINK = has('think')
const TODAY = arg('today') || process.env.TODAY || '2026-08-19'

const SRC = path.join(root, '북한자료-api/analysis.json')
const OUT = path.join(root, '북한자료-api/deck-summary.json')
const KEYS = path.join(root, '.gemini-keys.tmp.json')

const say = (...a) => { if (!QUIET) console.log(...a) }
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))

if (!fs.existsSync(SRC)) {
  console.error(`✗ 입력이 없다: 북한자료-api/analysis.json\n  먼저 node scripts/nk-analysis.mjs 를 돌려라.`)
  process.exit(1)
}
const analysis = readJson(SRC)
export const cardsHash = 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(analysis.cards)).digest('hex')

/* ══════════════════════ 자체 시험 ══════════════════════
   검증기(순수 함수)만 시험한다. 네트워크도 키도 쓰지 않는다.
   일부러 틀린 숫자·인과·판정 부풀리기를 넣은 가짜 요약이 **반드시** 걸려야 한다. */

/* 정상 인용 — 전부 카드 원문에 있는 수치다. 한 문장도 걸리면 안 된다.
   ★ 구획은 카드 판정을 따른다(검사 12) — 그래서 이 표는 카드 id 만 적고 자리는 판정에서 뽑는다. */
/* ★ 이 표의 숫자는 **현재 카드에 실제로 있는 값**이어야 한다. 카드 수치가 움직이면
   여기 문장이 「카드에 없는 수치다」로 걸리고 --selftest 가 실패한다 — 그게 의도된 알림장치다.
   실패하면 fixture 를 새 값으로 고쳐라. 검사를 느슨하게 만들어 통과시키지 마라.
   (2026-08-21: 이산가족정보통합시스템 신규 수집분이 분자에 들어가면서 밀도 3개 값을 갱신했다) */
const GOOD = [
  ['exchange-terminus', '당국차원 교류는 2018년을 끝으로 89개월 동안 0건이다.'],
  ['deaths-since-last-reunion', '게시판 공표 기준 마지막 상봉 이후 2만 5천 분이 사망으로 기록됐다.'],
  ['record-density-gap', '미수복강원의 기록 밀도는 1.944건/인이고 황해도(구)는 0.14건/인이다.'],
  ['two-homeland-maps', '함경북도(구)는 이산 5.9%와 탈북 59.4%로 53.5%p 차다.'],
  ['aging-deficit', '평균연령은 8.09년 동안 2.25세 올랐다.'],
  ['origin-known-erosion', '원적 확인 생존자는 36,749명에서 18,294명으로 줄었다.'],
  ['words-vs-deeds', '통일부 보도자료의 이산가족 언급은 2010~2018년 연평균 14건, 2019~2024년 연평균 14.7건이다.'],
  ['talks-humanitarian', '남북회담 인도 분야 자료는 2018-12-31 이후 확인되지 않는다.'],
  ['death-seasonality', '겨울 사망률은 여름의 1.23배였지만 표본이 얇다.'],
  ['opinion-vs-survivors', '생존자 60,076명과 응답 53.8%는 같은 기간 함께 내려갔다고까지만 말할 수 있다.'],
  ['museum-production-era', '생산연도가 확인되는 사료 3,098건 가운데 2019년 이후는 0건이다.'],
  ['legacy-priority', '평안북도(구)는 생존 53.1% 감소에 기록 0.424건/인으로 순위합 4이다.'],
  ['series-breaks', '2018-10-31 에는 부모가 1,418명 줄고 형제자매가 779명 늘었다.'],
  ['museum-region-by-era', '고향 × 시대 사료 교차표는 42칸 중 27칸이 10건 미만이라 지역 간 비교를 할 수 없다.'],
  ['region-survivor-record-corr', '구행정구역 7개로는 생존자와 사료의 상관을 판정할 수 없다.'],
]

/* 적대 세트 — 전부 걸려야 한다. [이름, 카드, 문장]
   뒤쪽 12건은 2026-08-19 검증 단계가 「통과해 버린다」고 실측해 온 것들이다. */
const BAD = [
  ['날조 수치', 'exchange-terminus', '당국차원 교류는 2018년을 끝으로 91개월 동안 0건이다.'],
  ['단위 바꿔치기', 'two-homeland-maps', '황해도(구) 생존자는 6,851건이다.'],
  ['단위 떼기', 'two-homeland-maps', '황해도(구) 이산가족은 6,851이고 함경북도(구) 탈북민은 19,760이다.'],
  ['인과 주장', 'museum-production-era', '교류가 끊겼기 때문에 사료 생산도 0건이다.'],
  ['전망', 'origin-known-erosion', '2027년에는 원적 확인 생존자가 1만 명을 밑돌 것이다.'],
  ['정부 평가', 'words-vs-deeds', '통일부는 교류 재개에 실패했고 당국차원 실적은 0건이다.'],
  ['판정 부풀리기', 'death-seasonality', '겨울에 사망이 1.23배 많아 계절성이 확인된다.'],
  ['stale 을 frozen 으로', 'talks-humanitarian', '남북회담 인도 분야는 2019년 이후 열리지 않았다.'],
  ['합쇼체', 'exchange-terminus', '당국차원 교류는 2018년을 끝으로 89개월 동안 0건입니다.'],
  ['카드 제목 베끼기', 'record-density-gap', '가장 많은 사람이 그리는 고향에, 가장 적은 기록이 남았다.'],
  ['제목 어미만 바꾼 재진술', 'record-density-gap', '가장 많은 사람이 그리는 고향에, 가장 적은 0.14건/인의 기록이 남아 있다.'],
  ['아라비아 반올림', 'origin-known-erosion', '원적 확인 비중은 61.1%에서 52%로 내려갔다.'],
  ['만 단위 과대 반올림', 'deaths-since-last-reunion', '게시판 공표 기준 마지막 상봉 이후 2만 분이 사망으로 기록됐다.'],
  ['감정 연출', 'deaths-since-last-reunion', '끝내 만나지 못한 채 게시판 공표까지 2만 5천 분이 사망으로 기록됐다.'],
  ['카드에 없는 평가 형용사', 'exchange-terminus', '당국차원 교류는 2018년 이후 빠르게 줄어 0건이다.'],
  ['이모지', 'exchange-terminus', '당국차원 교류는 2018년을 끝으로 89개월 동안 0건이다 \u{1F4C9}'],
  /* ── 아래부터가 이번에 막은 구멍이다 ── */
  ['두 공표를 이어 놓고 출처 미표기', 'deaths-since-last-reunion', '마지막 상봉 이후 93개월 동안 25,252명이 사망으로 기록됐다.'],
  ['값·기간 엇갈려 배선', 'deaths-since-last-reunion', '게시판 공표까지 84개월 동안 25,252명이 사망으로 기록됐다.'],
  ['같은 카드 안 기준일 엇갈림', 'origin-known-erosion', '원적 확인 생존자는 2026년 5월 31일 기준 18,294명이다.'],
  ['성립 카드 속 「판정 불가」 값 인용', 'two-homeland-maps', '황해도(구) 이산 37.4%와 탈북 2.8%의 순위 상관은 0.357이다.'],
  ['「없다」로 한계 표지 위장', 'region-survivor-record-corr', '생존자가 많은 고향일수록 사료가 많다는 관계는 7개 지역에서 어긋난 곳이 없다.'],
  ['전역 최소집합(21·11·4·6) 도용', 'talks-humanitarian', '남북회담 인도 분야는 6건만 확인되고 그 뒤는 확인되지 않는다.'],
  ['카드가 대지 않은 한계 사유', 'opinion-vs-survivors', '통일 필요성과 생존자 수는 같은 기간 함께 내려갔으나 표본이 얇아 인과를 말할 수 없다.'],
  ['수치 0개(제목 재진술만 남는다)', 'opinion-vs-survivors', '통일 필요성과 생존자 수는 같은 기간 내려갔다고까지만 말할 수 있다.'],
  ['대조 기준선 삭제', 'words-vs-deeds', '이산가족 관련 언급은 교류가 끊긴 2019년부터 2024년까지 연평균 14.7건이다.'],
  ['카드 2장 인용(사전 합집합)', 'exchange-terminus|deaths-since-last-reunion', '당국차원 교류는 2018년을 끝으로 93개월 동안 0건이다.'],
]

/** 그 카드의 판정에 맞는 자리 — 검사 12(구획 판정 = 카드 판정) 때문에 자리를 마음대로 못 고른다 */
const SLOT_OF = { 성립: ['established', 0], 약함: ['weak', 0], 불가: ['impossible', 0] }
const verdictOf = (id) => analysis.cards.find((c) => c.id === id)?.verdict ?? '성립'
const slotFor = (idSpec) => SLOT_OF[verdictOf(String(idSpec).split('|')[0])]

/** 한 문장을 그 자리에 끼워 넣은 온전한 스키마를 만든다 — 부분 채택이 없으므로 전체가 폐기된다 */
function frame(slot, cardId, text) {
  const pick = (id) => { const g = GOOD.find(([c]) => c === id); return { text: g[1], cards: [g[0]] } }
  const base = {
    headline: {
      text: '게시판 공표 기준 마지막 상봉 이후 2만 5천 분이 사망으로 기록됐습니다.',
      cards: ['deaths-since-last-reunion'],
    },
    established: ['exchange-terminus', 'deaths-since-last-reunion', 'record-density-gap', 'two-homeland-maps'].map(pick),
    weak: ['death-seasonality', 'opinion-vs-survivors'].map(pick),
    impossible: ['talks-humanitarian', 'museum-region-by-era'].map(pick),
  }
  if (slot === 'headline') base.headline = { text, cards: [cardId] }
  else {
    const [k, i] = slot
    base[k][i] = { text, cards: String(cardId).split('|') }
  }
  return base
}

function selftest() {
  let pass = 0, fail = 0
  const ok = (cond, label, extra) => {
    if (cond) { pass++; console.log(`  ✓ ${label}`) }
    else { fail++; console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`) }
  }

  console.log('\n▶ ① 양성 대조군 — 카드 원문에 있는 수치만 쓴 문장은 통과해야 한다')
  const baseline = verifySummary(frame('headline', 'deaths-since-last-reunion',
    '게시판 공표 기준 마지막 상봉 이후 2만 5천 분이 사망으로 기록됐습니다.'), analysis)
  ok(baseline.ok, '정상 요약 9문장 전체 통과',
    baseline.problems.map((p) => `${p.where} ${p.why}`).join(' / '))
  if (baseline.ok) {
    console.log(`    수치 ${baseline.stats.figures}개 · 인용 카드 ${baseline.stats.cardsCited}장 · 검사 ${baseline.stats.checks}종`)
  }

  console.log('\n▶ ② 정상 인용 세트 — 문장 하나씩 끼워 넣어도 통과해야 한다')
  let goodFail = 0
  for (const [cardId, text] of GOOD) {
    const slot = slotFor(cardId)
    const v = verifySummary(frame(slot, cardId, text), analysis)
    const where = `${slot[0]}[${slot[1]}]`
    const own = v.problems.filter((p) => p.where === where)
    if (own.length) { goodFail++; console.error(`    ✗ ${text}\n      ${own.map((p) => p.why).join(' / ')}`) }
  }
  ok(goodFail === 0, `정상 인용 ${GOOD.length}문장 — 수치·주장 검사 전부 통과`, `${goodFail}건 오탐`)

  console.log('\n▶ ③ 적대 세트 — 전부 폐기돼야 한다')
  let missed = 0
  for (const [name, cardId, text] of BAD) {
    const slot = slotFor(cardId)
    const v = verifySummary(frame(slot, cardId, text), analysis)
    const own = v.problems.filter((p) => p.where === `${slot[0]}[${slot[1]}]`)
    if (!own.length) { missed++; console.error(`    ✗ 못 잡음: [${name}] ${text}`) }
    else console.log(`    ✓ [${name}] → ${own[0].why}`)
  }
  ok(missed === 0, `적대 ${BAD.length}문장 전부 적발`, `${missed}건 통과해 버림`)

  console.log('\n▶ ④ 구조 검사')
  const noHead = frame('headline', 'talks-humanitarian', '남북회담 자료는 2018년에서 끊겼습니다.')
  ok(!verifySummary(noHead, analysis).ok, 'headline 이 「불가」 카드를 인용하면 폐기')
  const short = frame(['established', 0], 'exchange-terminus', GOOD[0][1])
  short.established = short.established.slice(0, 3)
  ok(!verifySummary(short, analysis).ok, 'established 가 4문장이 아니면 폐기')
  const dup = frame(['established', 0], 'exchange-terminus', GOOD[0][1])
  dup.established[1] = { text: GOOD[0][1], cards: ['exchange-terminus'] }
  ok(!verifySummary(dup, analysis).ok, '한 구획에서 같은 카드를 두 번 인용하면 폐기')
  const ghost = frame(['established', 0], 'exchange-terminus', GOOD[0][1])
  ghost.established[0].cards = ['없는-카드']
  ok(!verifySummary(ghost, analysis).ok, '없는 카드 id 를 인용하면 폐기')
  const narrow = frame(['established', 0], 'exchange-terminus', GOOD[0][1])
  narrow.weak = narrow.weak.map(() => ({ text: GOOD[8][1], cards: [GOOD[8][0]] }))
  ok(!verifySummary(narrow, analysis).ok, '인용 폭이 좁으면(중복) 폐기')
  ok(verifySummary(null, analysis).ok === false, 'null → 폐기')

  /* ★ 구획 오배치 3방향 — 화면은 구획 라벨을 SECTIONS 고정값으로 그리므로
     「불가」 문장이 성립 구획에 들어가면 성립 배지 아래에 그려진다. 세 방향 모두 막아야 한다. */
  const misplace = (sec, i, id, text) => {
    const f = frame([sec, i], id, text)
    const v = verifySummary(f, analysis)
    return v.problems.some((p) => p.where === `${sec}[${i}]` && /구획 판정/.test(p.why))
  }
  ok(misplace('established', 3, 'talks-humanitarian', GOOD[7][1]), '「불가」 카드를 성립 구획에 넣으면 폐기')
  ok(misplace('established', 3, 'death-seasonality', GOOD[8][1]), '「약함」 카드를 성립 구획에 넣으면 폐기')
  ok(misplace('impossible', 1, 'aging-deficit', GOOD[4][1]), '「성립」 카드를 불가 구획에 넣으면 폐기')

  console.log('\n▶ ⑤ 스캐너 — 한국어 수 표기')
  const s1 = scanNumbers('2019년~2026-05-31 (89개월)')
  ok(s1.length === 3 && s1.some((t) => t.kind === 'date') && s1.some((t) => t.raw === '89' && t.unit === '개월'),
    '날짜·연도·개월이 쪼개지지 않는다', JSON.stringify(s1))
  const s2 = scanNumbers('2만 5천 분')
  ok(s2.length === 1 && s2[0].value === 25000 && s2[0].step === 1000 && s2[0].family === 'person',
    '"2만 5천" → 25000 (step 1000 · person)', JSON.stringify(s2))
  /* 토큰화 시험이라 문자열 내용은 무관하지만, 현행 값을 쓴다 —
     옛 세대 수치(0.121·15.5배)가 저장소에 남아 있으면 grep 감사가 헛짚는다. */
  const s3 = scanNumbers('0.14건/인 · 53.5%p · 13.9배')
  ok(s3.length === 3 && s3[0].family === 'density' && s3[1].unit === '%p' && s3[2].unit === '배',
    '건/인 · %p · 배가 각각 한 토큰이다', JSON.stringify(s3))
  /* 「만큼」의 만을 10,000 으로 읽던 버그 — 오탐과 오통과를 동시에 만들었다 */
  const s4 = scanNumbers('0.907만큼')
  ok(s4.length === 1 && s4[0].value === 0.907 && s4[0].kind === 'num', '"0.907만큼" 의 만은 자릿수가 아니다', JSON.stringify(s4))
  const s5 = scanNumbers('3만큼 늘었다')
  ok(s5.length === 1 && s5[0].value === 3, '"3만큼" → 3 (30000 이 아니다)', JSON.stringify(s5))

  console.log('\n▶ ⑥ 규칙 표 대조 — 말투 제약이 기계 검사에서 빠지면 그 카드는 무검사다')
  const missingRule = Object.keys(SAY_RULES).filter((id) => !CARD_RULES[id])
  ok(missingRule.length === 0, `SAY_RULES ${Object.keys(SAY_RULES).length}장이 전부 CARD_RULES 에 있다`, missingRule.join(', '))
  const ghostRule = Object.keys(CARD_RULES).filter((id) => !analysis.cards.some((c) => c.id === id))
  ok(ghostRule.length === 0, 'CARD_RULES 에 없는 카드 id 가 없다', ghostRule.join(', '))

  console.log(`\n${fail === 0 ? '✓ 통과' : '✗ 실패'} — ${pass}건 통과 · ${fail}건 실패\n`)
  return fail === 0 ? 0 : 1
}

/* 굽힌 파일 → LLM 원출력 모양으로 되돌린다(재검용) */
export function toRaw(baked) {
  if (!baked?.headline) return null
  const out = { headline: { text: baked.headline.text, cards: baked.headline.cardIds ?? [] } }
  for (const sec of baked.sections ?? []) {
    out[sec.key] = (sec.lines ?? []).map((l) => ({ text: l.text, cards: l.cardIds ?? [] }))
  }
  return out
}

/* ══════════════════════ 굽기 ══════════════════════ */

/* 순서는 실측 성적순이다(2026-08-21 재굽기): gemini-3.1-flash-lite 가 지적 1~3건까지 내려오고,
   gemini-2.5-flash-lite 는 404/429 로 응답 자체를 못 주는 일이 잦아 뒤로 물렸다.
   어느 모델이 구웠는지는 산출물의 model 필드에 남는다. */
const MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']
/* 모델당 시도 횟수. 검사가 14종이라 한 번에 통과하는 일이 드물고, 지적을 되먹여 주면
   회를 거듭할수록 지적 수가 줄어든다(실측: 9건 → 5건 → 1건). 카드가 바뀐 직후에는
   --attempts 를 올려 다시 굽는다. 늘려도 안전하다 — 검사를 통과한 출력만 저장되기 때문이다. */
const MAX_ATTEMPT = Math.max(1, Math.min(12, +((argv.find((a) => a.startsWith('--attempts=')) || '').split('=')[1] || 3)))

async function callGemini(model, key, userText, noThinking) {
  const body = {
    systemInstruction: { parts: [{ text: SUMMARY_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      maxOutputTokens: 2400,
      ...(noThinking ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
    },
  }
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) },
  )
  if (!r.ok) return { status: r.status, text: null }
  const j = await r.json()
  return { status: 200, text: j?.candidates?.[0]?.content?.parts?.[0]?.text ?? null }
}

async function bake() {
  const facts = buildSummaryFacts(analysis)
  const factText = JSON.stringify(facts)
  say(`\n▶ 덱 요약 굽기 — 카드 ${facts.cards.length}장 · 사실 묶음 ${factText.length}자 · 기준 ${TODAY}`)

  let keys = []
  try { keys = readJson(KEYS) } catch { /* 아래에서 처리 */ }
  if (!Array.isArray(keys) || !keys.length) {
    console.error('  ✗ 키 파일을 읽지 못했다(.gemini-keys.tmp.json)')
    return finish(null, 0, null)
  }
  say(`  키 ${keys.length}개 로테이션 · 모델 ${MODELS.join(' → ')}`)

  let lastProblems = null
  let discarded = 0
  let calls = 0
  let ki = 0

  for (const model of MODELS) {
    for (let attempt = 1; attempt <= MAX_ATTEMPT; attempt++) {
      const userText = lastProblems
        ? `${factText}\n\n${feedbackBlock(lastProblems, attempt, MAX_ATTEMPT)}`
        : factText

      /* 429/5xx 는 시도 횟수에 세지 않고 즉시 다음 키 조합으로 넘어간다 */
      let raw = null
      for (let t = 0; t < keys.length * 2; t++) {
        const key = keys[ki % keys.length]
        ki += 1
        let res
        try { res = await callGemini(model, key, userText, THINK) } catch (e) {
          say(`  · ${model} 호출 실패(${String(e?.name ?? e)}) — 다음 키 조합`)
          continue
        }
        calls += 1
        if (res.status === 400) {
          /* thinkingConfig 를 받지 않는 모델이 있다 — nk-llm.mjs 와 같은 처리 */
          try { res = await callGemini(model, key, userText, true); calls += 1 } catch { continue }
        }
        if (res.status === 429 || res.status >= 500) { say(`  · ${model} ${res.status} — 다음 키 조합`); continue }
        if (res.status !== 200 || !res.text) { say(`  · ${model} 응답 없음(${res.status}) — 다음 키 조합`); continue }
        try { raw = JSON.parse(res.text) } catch { say(`  · ${model} JSON 파싱 실패 — 스키마 밖이므로 폐기`); discarded += 1; continue }
        break
      }
      if (!raw) { say(`  ✗ ${model} 시도 ${attempt} — 응답을 얻지 못했다`); continue }

      const v = verifySummary(raw, analysis)
      if (v.ok) {
        say(`  ✓ ${model} 시도 ${attempt} 통과 — 문장 ${v.stats.lines}개 · 수치 ${v.stats.figures}개 · 인용 카드 ${v.stats.cardsCited}장`)
        return finish({ ...v.summary, builtAt: TODAY, sourceHash: cardsHash, model, attempt }, discarded, v)
      }
      discarded += 1
      lastProblems = v.problems
      say(`  ✗ ${model} 시도 ${attempt} 폐기 — 지적 ${v.problems.length}건`)
      for (const p of v.problems.slice(0, 8)) say(`      · ${p.where} — ${p.why}`)
    }
    lastProblems = null // 모델을 바꾸면 지적을 초기화한다(다른 모델의 실수를 물려주지 않는다)
  }
  say(`  ✗ 전 모델 실패 — 호출 ${calls}회 · 폐기 ${discarded}회`)
  return finish(null, discarded, null)
}

/* ══════════════════════ 마무리 — 3단계 ══════════════════════
   ① 통과 → 파일 갱신. 통과 전문을 콘솔에 출력한다(사람 검토용).
   ② 실패 + 직전 통과본의 sourceHash 가 지금 카드 해시와 같음
      → 그대로 둔다. 카드가 바뀌지 않았으니 그 요약은 낡지 않았다.
   ③ 실패 + 쓸 수 있는 직전본 없음 → **지운다**.
      낡은 요약이 새 카드 위에 남는 것이 이 프로젝트에서는 요약이 없는 것보다 훨씬 나쁘다(as-of 규약). */
function finish(summary, discarded, v) {
  if (summary) {
    const ordered = {
      schema: summary.schema,
      builtAt: summary.builtAt,
      sourceBuiltAt: summary.sourceBuiltAt,
      sourceHash: summary.sourceHash,
      model: summary.model,
      attempt: summary.attempt,
      promptVersion: PROMPT_VERSION,
      verifierVersion: summary.verifierVersion,
      verified: summary.verified,
      shape: summary.shape,
      headline: summary.headline,
      sections: summary.sections,
      closing: summary.closing,
      notice: summary.notice,
    }
    fs.writeFileSync(OUT, JSON.stringify(ordered, null, 2) + '\n', 'utf8')
    console.log(`\n✓ 북한자료-api/deck-summary.json (${fs.statSync(OUT).size} B) · 폐기 ${discarded}회`)
    if (!QUIET) printForHuman(ordered, v)
    return 0
  }

  if (fs.existsSync(OUT)) {
    let prev = null
    try { prev = readJson(OUT) } catch { prev = null }
    const sameCards = Boolean(prev) && prev.sourceHash === cardsHash
    const stillPasses = Boolean(prev) && verifySummary(toRaw(prev), analysis).ok
    if (sameCards && stillPasses) {
      console.log(`\n△ 이번 굽기는 실패했지만 직전 통과본을 그대로 둔다 — 카드가 바뀌지 않았으므로 그 요약은 낡지 않았다.`)
      console.log(`  (구운 날 ${prev.builtAt} · 모델 ${prev.model})`)
      return 0
    }
    fs.rmSync(OUT)
    /* 왜 지우는지를 갈라 적는다 — 카드가 바뀐 것과 검사가 엄해진 것은 다른 사건이다 */
    const why = !prev ? '직전본을 읽지 못했다'
      : !sameCards ? '직전본이 지금 카드와 계보가 다르다'
        : '직전본이 지금 검사를 통과하지 못한다(검증기가 엄해졌다)'
    console.error(`\n✗ 요약을 만들지 못했고 ${why} — deck-summary.json 을 지웠다.`)
  } else {
    console.error(`\n✗ 요약을 만들지 못했다 — deck-summary.json 을 쓰지 않는다.`)
  }
  console.error('  화면은 요약 구획을 그리지 않고 나머지는 그대로 동작한다(빈 상자·스켈레톤을 두지 않는다).')
  return REQUIRE ? 1 : 0
}

/* 사람이 읽고 커밋하라 — 마지막 방어는 규칙이 아니라 사람이다 */
function printForHuman(s, v) {
  const bar = '─'.repeat(70)
  console.log(`\n${bar}`)
  console.log(`[요약 전문 — 사람이 한 번 읽고 커밋하라]`)
  console.log(`  ${s.headline.text}`)
  for (const sec of s.sections) {
    console.log(`\n  《${sec.label}》 (판정 ${sec.verdict})`)
    for (const l of sec.lines) console.log(`   · ${l.text}   [${l.cardIds.join(', ')}]`)
  }
  console.log(`\n  ${s.closing}`)
  console.log(bar)
  const figs = [s.headline, ...s.sections.flatMap((x) => x.lines)].flatMap((l) => l.figures)
  console.log(`수치 ${figs.length}개 — 전부 카드 원문으로 되짚었다 (정확 ${figs.filter((f) => f.match === 'exact').length} · 근사 ${figs.filter((f) => f.match === 'rounded').length})`)
  for (const f of figs) console.log(`  ${String(f.raw).padStart(10)} → ${f.cardId} · ${f.matchedIn}${f.findingIndex === null ? '' : `[${f.findingIndex}]`} · "${f.sourceText}"`)
  if (v) console.log(`검사 ${v.stats.checks}종 통과 · 인용 카드 ${v.stats.cardsCited}장`)
  console.log(bar)
}

/* ══════════════════════ 실행 ══════════════════════ */
if (SELFTEST) {
  process.exitCode = selftest()
} else if (DRY) {
  /* ── --dry : 호출 없이 검증기만 시험한다 ── */
  const facts = buildSummaryFacts(analysis)
  console.log(`\n▶ 사실 묶음 — 카드 ${facts.cards.length}장 · ${JSON.stringify(facts).length}자`)
  console.log(`  claims 최대 ${Math.max(...facts.cards.map((c) => c.claims.length))}개 · sayRule ${facts.cards.filter((c) => c.sayRule).length}장 · limit ${facts.cards.filter((c) => c.limit).length}장`)
  if (fs.existsSync(OUT)) {
    const prev = readJson(OUT)
    const v = verifySummary(toRaw(prev), analysis)
    console.log(`\n▶ 기존 산출물 재검 — ${v.ok ? '통과' : '실패'}`)
    if (!v.ok) v.problems.forEach((p) => console.log(`  ✗ ${p.where} — ${p.why}`))
    else console.log(`  수치 ${v.stats.figures}개 · 인용 카드 ${v.stats.cardsCited}장`)
    console.log(`  sourceHash ${prev.sourceHash === cardsHash ? '일치' : '불일치 — 카드가 바뀌었다'}`)
  } else {
    console.log('\n▶ 기존 산출물 없음 — 화면은 요약 구획을 그리지 않는다(정상 동작)')
  }
  console.log()
} else {
  process.exitCode = await bake()
}
