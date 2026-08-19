/* 분석 덱 요약자 — 카드 21장이 이미 확정한 문장·수치만 옮겨 잇게 하는 계층
 *
 * LLM 4원칙 (CLAUDE.md §5) — nk-guide.mjs 와 같은 자리·같은 규약이다.
 *   ① 규칙이 먼저 — buildSummaryFacts() 가 카드에서 닫힌 사실 묶음을 만든다.
 *      series·table 의 원시 배열은 주지 않는다. 원시 배열을 주면 LLM 이 거기서 새 수치를 뽑는다.
 *   ② LLM 은 해석만 — 판정·수치·근거를 생성하지 않는다.
 *      ★ figures[] 를 LLM 이 아니라 이 파일의 검증기가 채우는 것이 요점이다.
 *        근거 포인터를 LLM 이 만들면 그 순간 LLM 이 근거를 생성한 것이 된다.
 *        검증기는 문장에서 수치 토큰을 스스로 뽑아 카드 원문의 어느 문자열에 붙었는지 기록하므로,
 *        figures 는 「LLM 의 주장」이 아니라 「규칙의 대조 결과」다.
 *   ③ 스키마 밖이면 폐기 — 문장 하나라도 걸리면 그 시도 전체를 버린다(부분 채택 없음).
 *      한 문장을 빼면 4·2·2 구성이 무너지고, 하필 「불가」 구획이 비면 덱의 요지가 통째로 뒤집힌다.
 *   ④ 네트워크가 죽어도 동작 — 이 요약은 빌드 때 한 번 구워 파일로 남는다.
 *      규칙 폴백을 만들지 않는다. 덱 머리에는 이미 규칙이 쓴 요약(시도/성립/약함/불가)이 있고,
 *      요약 파일이 없으면 화면은 그 구획을 아예 그리지 않는다. 「없으면 없는 대로 완결」이 원칙 ④의 지킴이다.
 *      규칙으로 문장을 지어내면 우리가 쓴 글에 "Gemini 요약" 이름표를 붙이는 것이 되어 labeling 이 거짓이 된다.
 *
 * 의존 0개 — 브라우저(Vite)·Node 양쪽에서 import 된다. theme/gohyang.ts(TS)를 끌어오지 않는다.
 * 재검은 scripts/nk-summary-verify.mjs 가 이 파일만으로 네트워크 없이 다시 돌린다.
 * 즉 「검증했다」가 굽던 순간의 주장이 아니라 언제든 재현되는 사실이다.
 */

export const PROMPT_VERSION = 2
export const VERIFIER_VERSION = 2
export const SUMMARY_SCHEMA = 'gohyang.deck-summary/1'

/* ══════════════════════ 구획 — 스키마로 강제하는 세 판정 ══════════════════════
   「약함」·「불가」를 프롬프트 지시가 아니라 **구조**로 강제한다.
   세 구획이 스키마에 박혀 있으므로 LLM 이 성공담만 옮길 수가 없다. */
export const SECTIONS = [
  { key: 'established', label: '재어진 것', verdict: '성립', count: 4, prefix: 'e' },
  { key: 'weak', label: '방향만 보이는 것', verdict: '약함', count: 2, prefix: 'w' },
  { key: 'impossible', label: '잴 수 없었던 것', verdict: '불가', count: 2, prefix: 'i' },
]

/* 맺음·고지 — 전부 규칙 문자열이다. LLM 이 만들지 않는다. */
export const CLOSING =
  '성립하지 않은 카드도 지우지 않았습니다. 무엇이 재어지지 않았는지가 이 덱의 내용입니다.'
export const NOTICE = {
  who:
    '이 요약은 생성형 AI(Google Gemini)가 아래 카드가 이미 확정한 문장과 수치만을 옮겨 이어 쓴 것입니다. ' +
    '통일부의 공식 서술이 아니며, 본 시제품의 해석입니다.',
  when: '화면을 열 때 만들지 않습니다. 빌드 때 한 번 만들어, 검사를 통과한 것을 그대로 담아 두었습니다.',
  /* ★ 이 문장은 화면 동작을 그대로 적은 것이다.
     본문은 일부러 링크로 만들지 않았다(AnalysisDeck.tsx SourceChip 주석 — 고령 사용자가
     문장을 읽는 중 잘못 눌러 화면이 튀는 것을 막는다). 고지가 "문장을 누르시면"이라고
     안내하면 코드가 막아 둔 동작을 하라고 시키는 것이 되므로 단추를 가리켜 적는다. */
  checked:
    '요약에 나오는 수치는 전부 기계 검사로 카드까지 되짚었습니다. 새 수치도, 새 판정도 들어 있지 않습니다. ' +
    '문장 아래의 카드 단추를 누르시면 그 근거로 넘어갑니다.',
}

/* ══════════════════════ 카드별 말투 제약 ══════════════════════
   우리가 쓴 규칙 문장이다. 사실 묶음에 얹어 보내고, 검증기도 같은 표를 본다. */
export const SAY_RULES = {
  'exchange-terminus': '0은 실적 없음이지 자료 없음이 아니다. 원인을 말하지 마라. 0은 당국차원 값이므로 "당국차원"이라고 밝혀 쓴다(민간차원은 0이 아니다).',
  'talks-humanitarian': 'stale 이다. "없었다"가 아니라 "확인되지 않는다"로 쓴다.',
  'words-vs-deeds': '정부를 평가하지 마라. 발표 빈도와 교류 실적을 성과로 견주지 마라.',
  'two-homeland-maps': '두 분포가 다르다는 사실까지다. 설명하지 마라.',
  'opinion-vs-survivors': '같은 기간 함께 내려갔다까지다. 인과·선행후행 금지.',
  'deaths-since-last-reunion': '두 값은 출처가 다르다. 하나만 쓰고 어느 자료인지 밝힌다.',
  'legacy-priority': '순위합은 점수가 아니다. "1순위"를 "가장 중요한 곳"으로 바꾸지 마라.',
  'record-density-gap': '기록이 적은 것이 그 지역이 덜 중요하다는 뜻이 아니다.',
  'museum-production-era': '2019년 이후 0건을 상봉 중단의 결과라고 말하지 마라.',
  'series-breaks': '"재분류"는 통일부 공표가 아니라 이 분석의 해석이다.',
}

/* ══════════════════════ 프롬프트 ══════════════════════
   systemInstruction 으로 고정한다. 실측 3회로 교정한 문안이다.
     1차 — 구획 문장이 전부 합쇼체로 나왔다(어투 지시 무시). 기계 검사로 잡혔다.
     2차 — 어투는 맞았으나 8문장 중 5문장이 카드 제목을 그대로 베꼈다.
     3차 — 9문장 중 8문장 통과. 남은 1문장은 낮춤말("떠났으나")이었고 규칙이 잡았다. */
export const SUMMARY_PROMPT = `너는 「고향잇기」 분석 덱의 요약자다. 통일부 공공데이터를 계산해 만든 분석 카드 21장이 입력으로 주어진다.
네가 하는 일은 하나뿐이다 — 카드가 이미 확정한 내용을 골라 문장으로 잇는 것. 너는 판정하지 않고, 계산하지 않고, 설명하지 않는다.

[1] 수치
· 문장에 쓰는 숫자는 그 문장이 인용한 카드의 title·claims 에 있는 문자열을 그대로 복사한다.
· 더하기·빼기·비율·반올림·단위 환산을 하지 마라. 소수 자리를 바꾸지 마라.
· 단위를 바꾸지 마라. 카드가 "건"이면 "건"이고 "명"이면 "명"이다.
· "넘는", "이상", "가까이", "육박", "달하는", "불과", "약", "여" 를 숫자에 붙이지 마라. 카드에 있는 그대로가 아니면 틀린 수치다.
· 통계량 기호는 쓰지 마라. 그것은 카드가 할 말이다.

[2] 인과·평가 금지
· "때문에", "탓에", "~로 인해", "영향으로", "초래", "유발", "덕분에" 를 쓰지 마라.
· "입증", "증명", "보여준다", "의미한다", "시사한다" 를 쓰지 마라. 관측까지만 쓴다.
· 정부·통일부·당국을 평가하지 마라. 교류는 상대가 있어야 성립한다. 교류 실적 0을 남측의 성적표로 읽으면 안 된다.
  "정부"·"통일부"·"당국"은 자료의 이름을 말할 때만 쓴다 — "당국차원", "통일부 공표", "통일부 보도자료".
· 제언·촉구를 하지 마라. "필요하다", "시급하다", "해야 한다", "요구된다" 금지.
· 전망하지 마라. "예상된다", "우려된다", "~할 것이다" 금지.

[3] 판정을 뒤집지 마라
· verdict "성립" — 단정해도 된다.
· verdict "약함" — 문장 안에 한계를 반드시 넣는다: "표본이 얇다" / "까지만 말할 수 있다" / "우연을 배제할 수 없다" / "경계선상이다".
  단, 카드가 스스로 적어 둔 한계 사유가 따로 있으면 그 사유를 쓴다. 카드에 없는 사유(예: 표본 크기)를 지어내지 마라.
· verdict "불가" — 문장 안에 반드시 넣는다: "말할 수 없다" / "답할 수 없다" / "확인되지 않는다" / "공표되지 않았다".
  "…없다" 만으로는 한계 표지가 되지 않는다. 무엇을 말할 수 없는지를 적어라.
· "모른다"와 "없다"는 다르다. talks-humanitarian 은 자료가 2018년에서 끊긴 것이므로 "회담이 없었다"가 아니라 "이후는 확인되지 않는다"로 쓴다.
· 각 카드의 sayRule 을 그 카드를 인용하는 문장에 그대로 적용한다.
· 카드가 "판정 불가" 또는 "이 값을 근거로 쓰면 안 된다"라고 적어 둔 수치(상관계수 등)는 그 카드가 성립이어도 쓰지 마라.
· 한 카드 안에 기준일이 다른 두 값이 나란히 있으면 **한쪽 묶음만** 쓴다. 값과 기간·기준일을 엇갈려 붙이지 마라.
· 구획은 카드의 판정과 같아야 한다 — established 에는 "성립" 카드만, weak 에는 "약함" 카드만, impossible 에는 "불가" 카드만 인용한다.

[4] 어투 — 기계가 검사한다
· headline 은 독자에게 말을 거는 문장이다. 반드시 "…니다." 로 끝낸다.
· established·weak·impossible 의 문장은 카드의 명제다. 반드시 "…다." 로 끝내되 "니다." 로 끝내면 안 된다.
  올바른 예: "당국차원 교류는 2018년을 끝으로 89개월 동안 0건이다."
  틀린 예:   "당국차원 교류는 2018년을 끝으로 89개월 동안 0건입니다."
· 카드 제목을 그대로 옮기지 마라. 제목은 이미 카드에 있다. 요약은 수치를 담은 새 문장이어야 한다.
· 제목투를 쓰지 마라 — 줄표로 문장을 자르지 말고 한 문장으로 쓴다.
· 한 문장 90자 이내. 감탄사·이모지·느낌표·물음표를 쓰지 마라.
· 감정을 연출하지 마라. "안타깝게도", "가슴 아픈", "끝내", "결국", "만나지 못한 채", "한 번도" 금지.
  사망은 카드가 쓴 표현만 쓴다 — "사망" 또는 "세상을 떠나셨다". 낮춤말("떠났다")로 바꾸지 마라.
· 카드에 없는 평가 형용사를 쓰지 마라 — "심각한", "급격한", "빠르게", "가장", "중요한".

출력은 JSON 하나뿐이다. 설명을 덧붙이지 마라.
{"headline":{"text":"","cards":[]},"established":[{"text":"","cards":[]}],"weak":[{"text":"","cards":[]}],"impossible":[{"text":"","cards":[]}]}
· headline 1문장(55자 이내, 인용 카드는 verdict 가 "성립" 인 것만).
· established 4문장 · weak 2문장 · impossible 2문장.
· **여덟 문장 전부**에 그 카드의 수치가 최소 하나 들어가야 한다. 「약함」·「불가」 문장도 마찬가지다.
· cards 는 그 문장이 인용한 카드 id 배열이며 **정확히 1개**다. 입력에 있는 id 만 쓴다.
  한 문장이 두 카드를 인용하면 두 카드의 수치가 섞여 A 카드의 값을 B 카드의 주장에 붙일 수 있다 — 그래서 막았다.
· 한 구획 안에서 같은 카드를 두 번 인용하지 마라. 전체에서 서로 다른 카드를 8장 이상 인용해라.`

/* ══════════════════════ 문자열 손질 ══════════════════════
   원자료에는 편집자 표시 글리프(★)와 마크다운 강조(**…**)가 섞여 있다(실측 16곳).
   화면에 별표를 흘리지 않는 것과 같은 처리를 사실 묶음에도 적용한다. */
/* U+2605 ★ · U+2606 ☆ · U+26A0 경고표 — 뒤에 VS16 이 붙어 오는 경우까지 뗀다.
   눈에 안 보이는 문자(VS16)를 소스에 직접 두지 않으려고 코드포인트로 적는다. */
const MARKS = /[\u2605\u2606\u26A0]\uFE0F?/g
export function plain(s) {
  return String(s ?? '')
    .replace(MARKS, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
const starred = (s) => /\u2605/.test(String(s ?? ''))
const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1) + '…')

/* ══════════════════════ ① 사실 묶음 ══════════════════════
   카드 21장을 그대로 주지 않는다. 카드당 여섯 가지만 준다(약 6,300자).
     · method 는 주지 않는다 — 길고, LLM 이 방법론을 재서술할 여지를 만든다.
     · series·table 은 주지 않는다 — 원시 배열을 주면 거기서 새 수치를 뽑는다.
     · caveats 전량을 주지 않는다 — 21장×5개면 요약보다 한계가 길어지고 오독 표면만 넓어진다. */
export function buildSummaryFacts(analysis) {
  if (!analysis || !Array.isArray(analysis.cards)) return null
  const cards = analysis.cards.map((c) => {
    const fs = Array.isArray(c.findings) ? c.findings : []
    /* ★ 표시된 finding 을 앞으로 — 카드가 스스로 중요하다고 적어 둔 것이 먼저다 */
    const ordered = [...fs.entries()].sort((a, b) => {
      const sa = starred(a[1].label) || starred(a[1].value) || starred(a[1].note)
      const sb = starred(b[1].label) || starred(b[1].value) || starred(b[1].note)
      return sa === sb ? a[0] - b[0] : sa ? -1 : 1
    })
    const claims = ordered.slice(0, 5).map(([, f]) => {
      const base = `${plain(f.label)} = ${plain(f.value)}`
      const note = plain(f.note)
      return cut(note ? `${base} (${note})` : base, 170)
    })
    const cavStar = (c.caveats ?? []).find((x) => starred(x))
    const limit = c.rejectWhy
      ? cut(plain(c.rejectWhy), 200)
      : cavStar
        ? cut(plain(cavStar), 200)
        : ''
    const out = {
      id: c.id,
      verdict: c.verdict,
      title: plain(c.title),
      n: c.n,
      asOf: c.asOf,
      claims,
    }
    if (limit) out.limit = limit
    if (SAY_RULES[c.id]) out.sayRule = SAY_RULES[c.id]
    return out
  })
  return {
    builtAt: analysis.builtAt,
    shape: {
      tried: analysis.meta?.tried ?? cards.length,
      accepted: analysis.meta?.accepted ?? 0,
      weak: analysis.meta?.weak ?? 0,
      rejected: analysis.meta?.rejectedCount ?? 0,
    },
    cards,
  }
}

/* ══════════════════════ ② 한국어 수 표기 스캐너 ══════════════════════
   왼쪽 우선 · 긴 것 먼저 · 먹은 자리는 공백으로 지운다.
   순서가 규약이다:
     ①②③(날짜·연도범위·연도)을 ④⑤ 보다 먼저 — "2026-05-31" 이 2026/05/31 로,
       "2001~2015" 가 두 개의 무의미한 정수로 부서지지 않게.
     ④(만/억/천)를 ⑤ 보다 먼저 — "2만 5천" 이 2 와 5 로 분해되지 않게.
   허용 사전도 같은 스캐너로 만든다 — 표기 비대칭이 생기지 않는다. */

/** 단위 가족 — CLAUDE.md §5 의 그 규약을 그대로 쓴다. 순서가 중요하다:
 *  "건/인"·"개월"·"%p" 를 "건"·"개"·"%" 보다 먼저 봐야 0.121건/인 과 53.5%p 가 쪼개지지 않는다. */
const UNITS = [
  ['건/인', 'density'],
  ['개월', 'dur'],
  ['%p', 'ratio'],
  ['%', 'ratio'],
  ['명', 'person'],
  ['분', 'person'],
  ['인', 'person'],
  ['건', 'count'],
  ['개', 'count'],
  ['회', 'count'],
  ['차', 'count'],
  ['장', 'count'],
  ['종', 'count'],
  ['칸', 'count'],
  ['곳', 'count'],
  ['년', 'dur'],
  ['월', 'dur'],
  ['일', 'dur'],
  ['세', 'dur'],
  ['배', 'ratio'],
]

/** 식별자 종류 — 값이 아니라 이름이다. 단위를 읽지 않고 반올림도 허용하지 않는다. */
const ID_KINDS = new Set(['date', 'ym', 'year'])

function readUnit(src, pos) {
  let i = pos
  let sp = 0
  while (i < src.length && /\s/.test(src[i]) && sp < 2) { i += 1; sp += 1 }
  for (const [u, fam] of UNITS) if (src.startsWith(u, i)) return { unit: u, family: fam }
  return { unit: '', family: '' }
}

const numOf = (s) => Number(String(s).replace(/,/g, ''))

export function scanNumbers(text) {
  const src = String(text ?? '')
  let work = src
  const out = []

  const sweep = (re, make) => {
    let m
    re.lastIndex = 0
    while ((m = re.exec(work)) !== null) {
      const at = m.index
      const len = m[0].length
      for (const t of make(m) ?? []) {
        const u = readUnit(src, at + len)
        out.push({
          raw: src.slice(at, at + len).trim(),
          value: t.value,
          kind: t.kind,
          step: t.step ?? 0,
          unit: ID_KINDS.has(t.kind) ? '' : u.unit,
          family: ID_KINDS.has(t.kind) ? '' : u.family,
          index: at,
        })
      }
      work = work.slice(0, at) + ' '.repeat(len) + work.slice(at + len)
      re.lastIndex = at + len
    }
  }

  /* ① 날짜 — 허용 오차 없음.
     한국어 표기("2026년 5월 31일")도 같은 식별자로 읽는다. 실측으로 넣은 규칙이다:
     모델이 카드의 "2026-05-31" 을 한국어로 풀어 쓰자 2026/5/31 이 세 개의 무의미한 수로 부서져
     "카드에 없는 수치" 로 폐기됐다. 그건 표기 문제이지 수치 문제가 아니다.
     허용 사전도 같은 스캐너로 만들므로 표기 비대칭이 생기지 않는다.
     ★ 반올림이 아니라 **동일성**이다 — 날짜는 측정값이 아니라 식별자라서 정밀도를 낮춰 적어도 참이다. */
  sweep(/\d{4}-\d{2}-\d{2}/g, (m) => [{ value: dateVal(m[0]), kind: 'date' }])
  sweep(/((?:19|20)\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g, (m) => [
    { value: Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]), kind: 'date' },
  ])
  /* ①b 연월 — "2018-10"(series-breaks 의 finding 라벨) 과 "2026년 5월" 을 같은 값으로 접는다 */
  sweep(/((?:19|20)\d{2})-(\d{2})(?!-?\d)/g, (m) => [{ value: Number(m[1]) * 100 + Number(m[2]), kind: 'ym' }])
  sweep(/((?:19|20)\d{2})\s*년\s*(\d{1,2})\s*월/g, (m) => [{ value: Number(m[1]) * 100 + Number(m[2]), kind: 'ym' }])
  /* ② 연도범위 → 두 연도로 분해 */
  sweep(/((?:19|20)\d{2})\s*[~∼-]\s*((?:19|20)\d{2})\s*년?/g, (m) => [
    { value: Number(m[1]), kind: 'year' },
    { value: Number(m[2]), kind: 'year' },
  ])
  /* ③ 연도 — 측정값이 아니라 식별자다 */
  sweep(/((?:19|20)\d{2})\s*년/g, (m) => [{ value: Number(m[1]), kind: 'year' }])
  /* ④ 만/억/천 — value 는 각 자리 합, step 은 마지막으로 적은 단위의 자릿값.
        "2만 5천" → 25000/1000 · "1만" → 10000/10000. 형식이 스스로 거칠기를 선언한다.
        ★ 「만」 뒤에 「큼」이 오면 그것은 자릿수가 아니라 조사다(실측: "0.907만큼" → 9070,
          "3만큼" → 30000). 오탐(정상 문장 폐기)과 오통과(엉뚱한 값 매칭)를 동시에 만든다.
          「천」도 마찬가지로 "3천만"의 꼬리를 잘못 물지 않게 뒤따르는 글자를 본다. */
  sweep(/(\d+(?:\.\d+)?)\s*억(?!큼)(?:\s*(\d+(?:\.\d+)?)\s*만(?!큼))?(?:\s*(\d+(?:\.\d+)?)\s*천(?!큼))?/g, (m) => {
    const v = Number(m[1]) * 1e8 + (m[2] ? Number(m[2]) * 1e4 : 0) + (m[3] ? Number(m[3]) * 1e3 : 0)
    return [{ value: v, kind: 'myriad', step: m[3] ? 1e3 : m[2] ? 1e4 : 1e8 }]
  })
  sweep(/(\d+(?:\.\d+)?)\s*만(?!큼)(?:\s*(\d+(?:\.\d+)?)\s*천(?!큼))?/g, (m) => {
    const v = Number(m[1]) * 1e4 + (m[2] ? Number(m[2]) * 1e3 : 0)
    return [{ value: v, kind: 'myriad', step: m[2] ? 1e3 : 1e4 }]
  })
  sweep(/(\d+(?:\.\d+)?)\s*천(?!큼)/g, (m) => [{ value: Number(m[1]) * 1e3, kind: 'myriad', step: 1e3 }])
  /* ⑤ 나머지 아라비아 표기 — 반올림 허용 없음 */
  sweep(/([+\-−]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/g, (m) => [
    { value: numOf(m[2] + (m[3] ?? '')) * (m[1] && m[1] !== '+' ? -1 : 1), kind: 'num', step: 0 },
  ])

  return out.sort((a, b) => a.index - b.index)
}

/* 날짜는 값이 아니라 식별자다 — 비교는 문자열 동치와 같아지도록 정수로 접는다 */
function dateVal(s) {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : NaN
}

/* ══════════════════════ ③ 허용 사전 ══════════════════════
   카드 원문 중 **사람이 읽는 필드**만 넣는다.
     title · question · method · rejectWhy · String(n) · asOf · findings[].label/value/note · caveats[]
   series·table 의 원시 배열은 넣지 않는다. 실측 근거:
     · 산문 필드 수치 토큰 774개(고유 291), 카드당 평균 고유 23.5개
     · series/table 수치 토큰 6,810개(고유 1,490개)
     · 100~9999 정수 구간을 덮는 비율: 산문 0.8% vs series 4.7%
   series 를 넣으면 아무 세 자리 수나 5% 확률로 우연 통과한다 — 검증이 무의미해진다.
   원칙상으로도 옳다: 요약은 「카드가 이미 말로 확정한 것」만 옮기는 일이다. */
/** 카드가 스스로 「쓰지 마라」고 못 박은 값 — 그 항목의 수치는 사전에서 **뺀다**.
 *  실측 근거: two-homeland-maps 는 판정이 "성립" 이지만 f4 에 "★ 판정 불가 — n=7 로는
 *  상관의 유무를 말할 수 없다" 가 붙어 있다. 카드 단위로만 사전을 만들면 성립 카드의
 *  판정 불가 값(ρ=0.357)이 그대로 새어 나가 요약이 상관을 단정할 수 있다.
 *  opinion-vs-survivors 의 "r=0.907 ★ 이 값을 근거로 쓰면 안 된다" 도 같은 구멍이었다. */
const NO_CITE = /판정 불가|근거로 쓰면 안 된다/

export function buildCardLexicon(card) {
  const fields = []
  const push = (where, text, findingIndex = null, banned = false) => {
    const t = plain(text)
    if (t) fields.push({ where, text: t, findingIndex, banned })
  }
  push('title', card.title)
  push('question', card.question)
  push('method', card.method)
  if (card.rejectWhy) push('method', card.rejectWhy)
  push('n', String(card.n ?? ''))
  push('asOf', String(card.asOf ?? ''))
  ;(card.findings ?? []).forEach((f, i) => {
    /* 금지는 **항목 단위**다 — 사유가 note 에 적혀 있어도 그 항목의 label·value 를 함께 막는다 */
    const banned = NO_CITE.test(plain([f.label, f.value, f.note ?? ''].join(' ')))
    push('finding', f.label, i, banned)
    push('finding', f.value, i, banned)
    if (f.note) push('finding', f.note, i, banned)
  })
  ;(card.caveats ?? []).forEach((c) => push('caveat', c, null, NO_CITE.test(plain(c))))

  const tokens = []
  for (const f of fields) {
    for (const t of scanNumbers(f.text)) {
      tokens.push({
        ...t,
        cardId: card.id,
        matchedIn: f.where,
        findingIndex: f.findingIndex,
        banned: f.banned,
        sourceText: cut(f.text.slice(Math.max(0, t.index - 25), Math.max(0, t.index - 25) + 60), 60),
      })
    }
  }
  return tokens
}

/* 전역 최소집합 — 덱 자신을 말하는 수(21/11/4/6)와 산출일.
   전역 사전을 크게 잡으면 안 된다: "37.4%"(황해도 이산 비중)를 탈북민 문장에 갖다 붙여도 통과해 버린다.
   사전은 전역이 아니라 **문장 단위**다 — 그 문장이 선언한 cardIds 의 합집합 + 이 최소집합뿐. */
function globalLexicon(analysis) {
  const m = analysis.meta ?? {}
  const out = []
  for (const v of [m.tried, m.accepted, m.weak, m.rejectedCount]) {
    if (Number.isFinite(v)) {
      out.push({
        raw: String(v), value: Number(v), kind: 'num', step: 0, unit: '건', family: 'count',
        index: 0, cardId: null, matchedIn: 'deck', findingIndex: null,
        sourceText: `덱 요약 — 시도 ${m.tried} · 성립 ${m.accepted} · 약함 ${m.weak} · 불가 ${m.rejectedCount}`,
      })
    }
  }
  for (const t of scanNumbers(String(analysis.builtAt ?? ''))) {
    out.push({ ...t, cardId: null, matchedIn: 'deck', findingIndex: null, sourceText: `산출일 ${analysis.builtAt}` })
  }
  return out
}

/* ══════════════════════ ④ 대조 규칙 ══════════════════════
   (1) date/year → 문자열 정확 일치만. 오차 0.
   (2) 부호는 떼고 절댓값으로 본다 — 방향(줄었다/늘었다)은 주장 검사가 본다.
   (3) 단위 가족이 같은 s 중 |s-q| < 1e-9 이면 통과.
   (4) 값은 같은데 단위 가족만 다르면 폐기 — "6,851건"(실제로는 명)을 이 규칙이 잡았다.
   (5) 반올림 허용은 kind=myriad 에만. |s-q| ≤ step/2 **그리고** |s-q|/|s| ≤ 0.05 를 동시에.
   (6) 아라비아 표기는 반올림을 일절 허용하지 않는다("37.7%"→"38%" 폐기).
       근거: 아라비아 숫자는 거칠기를 스스로 선언하지 않는다. "2만 5천" 은 마지막 단위가 천이라는
       사실로 "천 자리까지만 말한다"고 스스로 선언한다. 형식이 거칠기를 선언할 때만 거칠게 봐 준다.
   (7) 정밀도 상향은 (6)에 의해 자동 금지.
   (8) 한 자리 정수(1~9)는 사전에 거의 항상 있어 판별력이 약하다 — 인정하고 적는다.
       보완은 단위 가족 검사다(7년/7건/7개 고향을 갈라 준다).
   (9) 단위 검사는 **비대칭**이다. 예전에는 한쪽이라도 단위가 없으면 통과시켰는데
       (!a.family || !b.family), 그러면 단위를 떼는 것만으로 (4)가 통째로 무력화됐다 —
       실측: "황해도(구) 이산가족은 6,851이고 함경북도(구) 탈북민은 19,760이다." 가 통과했다.
       ("6,851건" 은 잡히는데 "6,851" 은 안 잡히는, 검사가 있으나 마나인 상태였다.)
         · 문장에 단위가 있으면 → 카드가 같은 가족이거나, 카드가 단위를 안 적은 항목이어야 한다.
           (카드는 표 안에서 단위를 생략하는 자리가 있다 — series-breaks 의 "부모 -1,418".)
         · 문장에 단위가 없으면 → 카드에서도 단위가 없는 항목(n·통계량·본문 속 숫자)에만 붙는다.
       막고 싶은 것은 "단위를 떼서 검사를 비켜 가는" 방향이고, 그 방향만 막는다. */
const compat = (q, s) => (q.family ? !s.family || q.family === s.family : !s.family)

function matchFigure(q, all) {
  const qa = Math.abs(q.value)
  /* 인용 금지 값은 사전에서 뺀 뒤, 그 값이었을 때만 사유를 갈라 적는다 —
     "카드에 없는 수치다" 로 뭉뚱그리면 고치는 쪽이 엉뚱한 데를 본다 */
  const lex = all.filter((s) => !s.banned)
  const banned = all.filter((s) => s.banned)
  const isBanned = () =>
    banned.some((s) =>
      ID_KINDS.has(q.kind) ? ID_KINDS.has(s.kind) && String(s.value).startsWith(String(q.value))
        : Math.abs(Math.abs(s.value) - qa) < 1e-9)
  const nope = (why) => ({ ok: false, why: isBanned() ? '카드가 「판정 불가」로 적어 둔 값이다 — 인용 금지' : why })
  /* 식별자(날짜·연월·연도) — 오차 0. 다만 **정밀도를 낮춰 적은 것**은 같은 식별자를 가리키므로 통과시킨다.
     카드가 "2026-05-31" 이면 "2026년 5월"·"2026년" 은 그 카드에 실제로 있는 표기다.
     반대로 정밀도를 올리는 것(카드가 연도만인데 문장이 날짜)은 아래 식이 자동으로 막는다. */
  if (ID_KINDS.has(q.kind)) {
    const prec = { year: 1, ym: 2, date: 3 } // 자릿수 단계 — 값은 100 진법으로 쌓여 있다
    const hit = lex.find((s) => {
      if (!ID_KINDS.has(s.kind)) return false
      if (prec[s.kind] < prec[q.kind]) return false // 카드가 더 거칠면 문장이 더 정밀해진 것이다
      return Math.floor(s.value / Math.pow(100, prec[s.kind] - prec[q.kind])) === q.value
    })
    return hit ? { ok: true, match: 'exact', src: hit } : nope('카드에 없는 날짜·연월·연도다')
  }
  const same = lex.filter((s) => Math.abs(Math.abs(s.value) - qa) < 1e-9)
  const good = same.find((s) => compat(q, s))
  if (good) return { ok: true, match: 'exact', src: good }
  if (same.length) return nope(`값은 있으나 단위 가족이 다르다(카드 ${same[0].family || '무단위'} vs 문장 ${q.family || '무단위'})`)
  if (q.kind === 'myriad' && q.step > 0) {
    let best = null
    for (const s of lex) {
      if (!compat(q, s)) continue
      const sa = Math.abs(s.value)
      if (!(sa > 0)) continue
      const d = Math.abs(sa - qa)
      if (d <= q.step / 2 && d / sa <= 0.05) { if (!best || d < Math.abs(Math.abs(best.value) - qa)) best = s }
    }
    if (best) return { ok: true, match: 'rounded', src: best }
  }
  return nope('카드에 없는 수치다')
}

/* ══════════════════════ ⑤ 주장 검사 ══════════════════════
   수치는 역추적으로 닫히지만 거짓 주장은 닫히지 않는다.
   그래서 「닫는다」고 말하지 않고 「무엇을 어디까지 막는지」를 적는다. */

/** T1 — 절대 금지. 카드에 있어도 요약에는 못 쓴다.
 *  「때문」은 카드 원문에 9번 나오지만 그래도 T1 이다. 인과는 카드 안에 남고 요약으로는 나오지 않는다 —
 *  요약은 페이지 맨 위, 가장 많이 읽히는 자리이고 거기에는 잰 것만 올린다. 의도한 손실이다.
 *  ★ 정규식에는 반드시 앵커를 건다(실측 오탐):
 *    · 「야기」는 카드에 2번 있는데 전부 "이야기"다 → /야기(하|한|했|된)/
 *    · 「것이다」는 "추론한 것이다"(강조)로 쓰였다 → /(할|될|늘|줄|들|올)\s*것이다/
 *    · 「실패」는 homeland-weather 의 finding 라벨이다 → T1 에서 빼고 주체어 규칙으로 옮겼다 */
const T1 = [
  { re: /때문|탓에|탓으로|덕분|로 인해|인하여|영향으로|초래|유발|야기(하|한|했|된)|좌우한|결과다|결과로/, why: '인과 표현' },
  { re: /입증|증명|방증|시사(한|하)|드러낸|의미한다|뜻한다|보여준다|반영한다/, why: '해석 단정' },
  { re: /안타깝|가슴 아|비극|참담|절규|한 맺|끝내|결국|못한 채|한 번도/, why: '감정 연출' },
  { re: /충격|놀랍|압도적|사상 최악|전무후무|극적/, why: '과장' },
  { re: /예상된다|전망된다|우려된다|(할|될|늘|줄|들|올)\s*것이다|이라 본다/, why: '전망' },
  { re: /떠났(다|으나|고)|숨졌|유명을 달리/, why: '사망 표현 — 카드가 쓴 "사망"·"세상을 떠나셨다"만 쓴다' },
  { re: /[!?]/, why: '느낌표·물음표' },
  { re: /\s—\s|\s–\s/, why: '줄표 제목투 — 한 문장으로 쓴다' },
  { re: /[ρμ]|R²|\bU\s*=|\bp\s*=|\br\s*=/, why: '통계량 기호' },
]

/** T2 — 그 카드가 쓴 낱말이면 봐 준다(낱말 단위 대조).
 *  처음에는 10자 이상 공통부분열 마스킹으로 짰다가, "가장 많"(4자)이 문턱에 못 미쳐
 *  정상 문장을 튕기는 것을 보고 낱말 대조로 바꿨다. 더 단순하고 오탐이 없다.
 *  대신 조금 느슨하며, 그 느슨함은 T1 이 받친다. */
const T2_WORDS = [
  '심각', '급격', '대폭', '확연', '명백', '분명히', '현저', '빠르게', '빠른', '크게', '큰 폭', '낮은', '높은', '뚜렷', '가파르',
  '가장', '최대', '최고', '최악', '제일', '유일', '압도',
  '중요', '핵심', '주목', '의의', '시사점',
  '필요하다', '시급', '해야 한', '마땅', '촉구', '요구된다', '서둘러', '늦기 전',
]
/** 수치 어림 — 낱말이 아니라 **구절 전체**가 카드 원문에 그대로 있어야 한다.
 *  「이상」은 카드에 16번 나오지만 대부분 "3촌 이상"(분류 이름)이라 낱말 대조로는 새어 나간다. */
const T2_APPROX = [
  /\d[^가-힣]{0,3}\s*(?:명|건|년|개월|%|배)?\s*(?:넘는|넘게|이상|가까이|육박|불과|여 명|여 건)/g,
  /약\s*\d[^\s]*/g,
  /대략\s*\d[^\s]*/g,
  /거의\s*\d[^\s]*/g,
]

/** 주체 평가 차단 — 이 프로젝트가 방금 걷어낸 것을 되돌리지 않기 위한 전용 규칙.
 *  교류 성사는 남측만으로 결정되지 않는다는 사실을 요약이 뒤집지 못하게 한다. */
const SUBJECT = /(정부|통일부|당국|남측|북측|정책)/g
const SUBJECT_CTX = /차원|공표|보도자료|자료|발표|통계|「|공식/
const SUBJECT_JUDGE = /실패|미흡|부족|못했|않았|외면|방치|무능|책임|잘못|성과|성적|노력/

/** 판정 표지 강제 — 「약함」·「불가」를 「성립」처럼 말하지 못하게 한다.
 *  수치 검사만으로는 절대 못 잡는 유형이고, 덱의 요지를 지키는 것은 이 규칙이다.
 *  ★ 「없다」를 표지 목록에서 뺐다(2026-08-19). 단독으로는 판별력이 0이다 —
 *    "…어긋난 곳이 없다" 처럼 상관을 **단정하는** 문장도 표지 검사를 통과해 버렸다.
 *    실측: "생존자가 많은 고향일수록 사료가 많다는 관계는 7개 지역에서 어긋난 곳이 없다."
 *    (region-survivor-record-corr — 카드는 "「상관이 있다」도 「없다」도 말할 수 없다"고 적었다.)
 *    표지는 「무엇을 말할 수 없는가」를 적을 때만 표지다. */
const VERDICT_MUST = {
  약함: /표본이 얇|까지만|우연을 배제할 수 없|단정할 수 없|경계선|말하기 어렵|충분하지 않|그뿐/,
  /* 「…수 없다」 구문은 남기고 맨 「없다」만 뺀다 — "어긋난 곳이 없다"(단정)와
     "비교를 할 수 없다"(한계)를 가르는 것이 바로 그 구문이다. */
  불가: /말할 수 없|답할 수 없|계산할 수 없|쓸 수 없|알 수 없|할 수 없|낼 수 없|볼 수 없|확인되지 않|공표되지 않|판정 불가/,
}

/** 카드별 규칙 — stale/frozen 혼동 차단 포함.
 *  talks-humanitarian 의 must 는 stale 을 frozen 으로 읽는 문장을 문법적으로 못 쓰게 만든다.
 *  이 서비스의 정체성이다. */
export const CARD_RULES = {
  /* when 이 있으면 그 조건에 걸린 문장에만 must 를 요구한다.
     실측으로 추가한 규칙: 1차 통과본의 headline 이 "이산가족 교류는 … 0건입니다" 였다.
     0 은 **당국차원**의 값이고 민간차원은 같은 기간 34건이다. 수치는 전부 진짜였지만
     한 카드 안에서 A 수치를 B 맥락에 붙인 경우라 수치 검사로는 잡히지 않았다. */
  'exchange-terminus': {
    when: /0\s*건|0\s*명/,
    must: /당국/,
    mustWhy: '0 은 당국차원 실적이다 — 민간차원은 같은 기간 0이 아니므로 "당국차원"을 문장 안에 밝혀라',
  },
  'talks-humanitarian': {
    ban: /없었다|끊겼다|중단(됐|되었)|종료(됐|되었)|열리지 않/,
    banWhy: 'stale 을 frozen 으로 읽었다 — 자료가 2018년에서 끊긴 것이지 회담이 없었던 것이 아니다',
    must: /확인되지 않|알 수 없|갱신되지 않|모른다/,
    mustWhy: 'stale 카드다 — "확인되지 않는다"를 문장 안에 넣어라',
  },
  /* ★ 두 값을 나란히 낸 카드 — 어느 자료인지 밝히지 않으면 폐기한다.
     sayRule 에는 처음부터 적혀 있었는데 기계 검사에는 이 한 장만 빠져 있었다(실측).
     그래서 "마지막 상봉 이후 … 93개월 동안 25,252명" 처럼 서로 다른 두 공표를 이어 만든
     값이 단일 사실로 나갔다. SAY_RULES 와 이 표의 키 집합이 어긋나면 셀프테스트가 실패한다. */
  'deaths-since-last-reunion': {
    when: /25,252|2만 5천|23,154|2만 3천/,
    must: /출처 연결|게시판|CSV|HWP|공표를 이어|이어 붙|두 공표/,
    mustWhy: '두 값은 출처가 다르다 — 어느 자료의 값인지 문장 안에 밝혀라',
    /* 값·기간·기준일의 짝이 정해져 있다. 사전이 카드 단위라 엇갈려 배선해도 통과했다
       (실측: "마지막 상봉 이후 84개월 동안 25,252명이 사망으로 기록됐다." → 지적 0건) */
    exclusive: [
      { name: '단일 출처(CSV 2025-08-31)', re: [/(?<![\d.])(?:23,154|2만 3천)/, /(?<![\d.])84\s*개월/, /2025-08-31|2025년\s*8월/] },
      { name: '출처 연결(HWP 2026-05-31)', re: [/(?<![\d.])(?:25,252|2만 5천)/, /(?<![\d.])93\s*개월/, /2026-05-31|2026년\s*5월/] },
    ],
  },
  'words-vs-deeds': {
    ban: /성과|성적|노력|실패|미흡|무산|방치|못했/,
    banWhy: '정부 평가',
    /* 이 카드의 요지는 **두 값의 대조**다(2010~2018 연평균 14건 vs 2019~2024 연평균 14.7건).
       14.7 만 옮기면 대조 기준선이 사라지고, 같은 구획의 "당국차원 교류 0건" 옆에 놓이는
       순간 낱말 하나 없이 병치만으로 저격성 프레임이 복원된다. ban 정규식으로는 못 잡는다. */
    when: /14\.7/,
    must: /14건/,
    mustWhy: '대조 기준선을 지우지 마라 — 교류 있던 시기 연평균 14건을 같은 문장에 함께 적어라',
  },
  'museum-production-era': { ban: /결과다|중단(으로|되어)|탓/, banWhy: '상봉 중단의 결과라고 말하지 않는다' },
  'legacy-priority': { ban: /중요|시급|점수|우선해야|급한/, banWhy: '순위합은 점수가 아니다' },
  'record-density-gap': { ban: /덜 중요|소홀|외면/, banWhy: '기록이 적은 것이 덜 중요하다는 뜻이 아니다' },
  'two-homeland-maps': { ban: /설명|이유|배경/, banWhy: '두 분포가 다르다는 사실까지다' },
  'opinion-vs-survivors': {
    ban: /동행|연동|선행|후행|함께 움직/,
    banWhy: '인과·선행후행 금지',
    /* ★ limit — 이 카드가 적어 둔 한계 표지를 강제한다(VERDICT_MUST 를 이 카드에서 대체).
       카드의 한계는 「표본이 얇다」가 아니다: 수준 상관 r=0.907 은 쓰면 안 되고,
       추세를 걷어낸 1차 차분에서는 관계가 사라진다("공행성도 말할 수 없다").
       공용 표지 목록만 두면 가장 값싼 표지("표본이 얇아")를 붙여 한계를 좁힐 수 있었다 —
       실측 baked w1 이 정확히 그렇게 나와 「동행성은 성립하고 인과만 모른다」로 읽혔다. */
    limit: /까지만|그뿐/,
    limitWhy: '카드가 적은 한계는 표본 크기가 아니다 — sayRule 그대로 "…까지만" 형태로 써라',
  },
  'series-breaks': { ban: /통일부가 재분류|공표했다/, banWhy: '"재분류"는 통일부 공표가 아니라 이 분석의 해석이다' },
  'origin-known-erosion': {
    /* 같은 카드 안에 기준일이 다른 두 공표가 있다 — CSV 98개월(2025-08-31)과
       caveat 의 2026-05-31 게시판 공표(기타 16,331명·49.1%). 섞어 쓰면 기준일이 거짓이 된다
       (실측: "원적 확인 생존자는 2026년 5월 31일 기준 18,294명이다." → 지적 0건). */
    exclusive: [
      { name: 'CSV 98개월(2025-08-31)', re: [/(?<![\d.])(?:36,749|18,294|23,381|17,017|61\.1|51\.8|50\.2|27\.2|9\.3)/, /2025-08-31|2025년\s*8월/] },
      { name: '게시판 공표(2026-05-31)', re: [/(?<![\d.])(?:16,331|49\.1)/, /2026-05-31|2026년\s*5월/] },
    ],
  },
}

const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u

/** 어절 집합 겹침 비율 — 제목 대비 얼마나 그대로 옮겼는가.
 *  분모를 제목으로 잡는다: 요약이 제목보다 길어져도 "제목을 통째로 담았다"가 흐려지지 않는다.
 *  ★ 숫자가 든 어절은 센 어절에서 뺀다 — 요약은 카드의 수치를 **그대로 옮기는 것이 일**이라
 *    수치까지 겹침으로 세면 정상 문장이 제목 재진술로 몰린다. 베끼기는 서술어의 문제다. */
function overlap(text, title) {
  const w = (s) => new Set(String(s).replace(/[^가-힣A-Za-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter((x) => x.length > 1 && !/\d/.test(x)))
  const a = w(text)
  const b = w(title)
  if (!b.size) return 0
  let hit = 0
  for (const t of b) if (a.has(t)) hit += 1
  return hit / b.size
}

/* ══════════════════════ ⑥ 검증 ══════════════════════
   문장 하나라도 실패하면 그 시도 **전체**를 폐기한다(부분 채택 없음). */
export function verifySummary(raw, analysis) {
  const problems = []
  const bad = (where, text, why) => { problems.push({ where, text: text ?? '', why }) }

  if (!analysis || !Array.isArray(analysis.cards)) {
    bad('입력', '', 'analysis 가 없다')
    return { ok: false, problems, stats: null, summary: null }
  }
  const byId = new Map(analysis.cards.map((c) => [c.id, c]))
  const lexOf = new Map()
  const lexFor = (id) => {
    if (!lexOf.has(id)) lexOf.set(id, byId.has(id) ? buildCardLexicon(byId.get(id)) : [])
    return lexOf.get(id)
  }
  const gLex = globalLexicon(analysis)
  const titles = analysis.cards.map((c) => plain(c.title)).filter((t) => t.length >= 8)

  /* SAY_RULES 와 CARD_RULES 의 키 집합 대조 —
     말투 제약만 프롬프트로 지시하고 기계 검사에서 빠뜨리면 그 카드는 사실상 무검사다.
     실제로 deaths-since-last-reunion 한 장이 그렇게 빠져 있었다. */
  for (const id of Object.keys(SAY_RULES)) {
    if (!CARD_RULES[id]) bad('규칙', '', `sayRule 은 있는데 기계 검사(CARD_RULES)가 없다: ${id}`)
  }
  for (const id of Object.keys(CARD_RULES)) {
    if (!byId.has(id)) bad('규칙', '', `CARD_RULES 에 없는 카드 id 가 있다: ${id}`)
  }

  /* ── 검사 1: 스키마 형태 ── */
  const H = raw?.headline
  if (!H || typeof H.text !== 'string') bad('headline', '', 'headline.text 가 없다')
  const rows = []
  for (const sec of SECTIONS) {
    const arr = raw?.[sec.key]
    if (!Array.isArray(arr) || arr.length !== sec.count) {
      bad(sec.key, '', `${sec.count}문장이어야 하는데 ${Array.isArray(arr) ? arr.length : 0}문장이다`)
      continue
    }
    arr.forEach((l, i) => rows.push({ sec, i, id: `${sec.prefix}${i + 1}`, where: `${sec.key}[${i}]`, raw: l }))
  }
  if (problems.length) return { ok: false, problems, stats: null, summary: null }

  const all = [{ sec: null, i: 0, id: 'headline', where: 'headline', raw: H }, ...rows]

  /* 문장 공통 검사 — 2·3·4·6·7·8·9·10·11 */
  const out = []
  for (const row of all) {
    const isHead = row.where === 'headline'
    const text = String(row.raw?.text ?? '').replace(/\s+/g, ' ').trim()
    const cards = Array.isArray(row.raw?.cards) ? row.raw.cards.map((x) => String(x)) : []

    /* 2. 길이·이모지·형식 */
    const cap = isHead ? 55 : 90
    if (!text) { bad(row.where, '', '빈 문장이다'); continue }
    if (text.length > cap) bad(row.where, text, `${cap}자를 넘었다(${text.length}자)`)
    if (EMOJI.test(text)) bad(row.where, text, '이모지')

    /* 3. 어투 — "습니다|입니다|ㅂ니다" 로 적으면 "벌어집니다"를 놓친다(ㅂ이 앞 음절 받침으로 합성된다) */
    if (isHead) {
      if (!/[가-힣]니다\.$/.test(text)) bad(row.where, text, 'headline 은 "…니다." 로 끝내야 한다')
    } else {
      if (!/다\.$/.test(text)) bad(row.where, text, '구획 문장은 "…다." 로 끝내야 한다')
      else if (/[가-힣]니다\.$/.test(text)) bad(row.where, text, '구획 문장에 합쇼체를 쓰지 않는다')
    }

    /* 4. cardIds 실재 · **정확히 1개** · headline 은 성립 카드만
       두 카드를 허용하면 사전이 합집합이 되어 A 카드의 수치를 B 카드의 주장에 붙인 문장이
       그대로 통과한다(실측: "당국차원 교류는 2018년을 끝으로 93개월 동안 0건이다."
       cards:['exchange-terminus','deaths-since-last-reunion'] → 지적 0건. 참값은 89개월이고
       93 은 사망 카드의 n 에서 빌려온 것이다). 합집합을 없애는 것이 유일하게 확실한 차단이다. */
    if (cards.length !== 1) bad(row.where, text, `cards 는 정확히 1개여야 한다(지금 ${cards.length}개)`)
    const unknown = cards.filter((id) => !byId.has(id))
    if (unknown.length) bad(row.where, text, `없는 카드 id: ${unknown.join(', ')}`)
    if (isHead && cards.some((id) => byId.get(id) && byId.get(id).verdict !== '성립')) {
      bad(row.where, text, 'headline 이 인용하는 카드는 판정 "성립" 만 허용한다')
    }

    /* 12. 구획 판정 = 인용 카드 판정
       화면은 구획 라벨을 SECTIONS 고정값으로 그린다(AnalysisDeck SummaryBlock).
       그래서 「불가」 카드 문장을 「재어진 것(성립)」 구획에 넣으면 화면이 그것을
       성립 배지 아래에 그린다 — 덱의 요지가 통째로 뒤집힌다. 전에는 아무 검사가 없었다. */
    if (row.sec) {
      for (const id of cards) {
        const c = byId.get(id)
        if (c && c.verdict !== row.sec.verdict) {
          bad(row.where, text, `구획 판정 "${row.sec.verdict}" 에 판정 "${c.verdict}" 카드(${id})를 넣었다`)
        }
      }
    }
    const cites = cards.filter((id) => byId.has(id)).map((id) => byId.get(id))
    if (!cites.length) continue
    const cardText = cites.map((c) => plain([c.title, c.question, c.method, c.rejectWhy ?? '',
      ...(c.findings ?? []).flatMap((f) => [f.label, f.value, f.note ?? '']),
      ...(c.caveats ?? [])].join(' '))).join(' ')

    /* 6. 카드 제목 재진술 금지 — 완전 부분문자열 대조는 어미 한 글자만 바꿔도 우회됐다.
       실측: "가장 많은 사람이 그리는 고향에, 가장 적은 0.121건/인의 기록이 남아 있다."
       (원 제목 "…가장 적은 기록이 남았다") 가 통과했다. 어절 집합 겹침으로 바꾼다. */
    const copied = titles.find((t) => text.includes(t) || overlap(text, t) >= 0.7)
    if (copied) bad(row.where, text, `카드 제목을 재진술했다: "${cut(copied, 30)}"`)

    /* 7. 수치 대조 — 사전은 이 문장이 선언한 카드뿐이다.
       전역 최소집합(21·11·4·6·산출일)은 **덱 자신을 말하는 자리**에서만 쓴다.
       구획 문장에까지 열어 두면 그 네 수를 아무 문장에나 쓸 수 있었다
       (실측: "남북회담 인도 분야는 6건만 확인되고…" → 지적 0건. 참값은 155건). */
    const lex = [...cards.flatMap((id) => lexFor(id)), ...(isHead ? gLex : [])]
    const figures = []
    for (const q of scanNumbers(text)) {
      const r = matchFigure(q, lex)
      if (!r.ok) { bad(row.where, text, `"${q.raw}${q.unit}" — ${r.why}`); continue }
      figures.push({
        raw: q.raw,
        value: q.value,
        cardId: r.src.cardId,
        findingIndex: r.src.findingIndex ?? null,
        matchedIn: r.src.matchedIn,
        sourceText: r.src.sourceText,
        match: r.match,
      })
    }

    /* 8. 구획 문장은 **전부** 수치 최소 하나 — 예전에는 established 만 요구했다.
       수치가 0개인 문장은 카드 제목 재진술 말고는 담을 것이 없다(실측 baked w1 이 그랬다).
       「약함」·「불가」 카드에도 인용 가능한 수치는 있다. 한계를 적는 것과 수치를 적는 것은
       배타적이지 않다. */
    if (row.sec && figures.length === 0) {
      bad(row.where, text, `${row.sec.label} 구획의 문장에도 카드의 수치가 최소 하나 들어가야 한다`)
    }

    /* 9. T1 */
    for (const t of T1) { const m = text.match(t.re); if (m) bad(row.where, text, `${t.why} — "${m[0]}"`) }

    /* 10. T2 + 주체어 */
    for (const w of T2_WORDS) {
      if (text.includes(w) && !cardText.includes(w)) bad(row.where, text, `카드에 없는 낱말 "${w}"`)
    }
    for (const re of T2_APPROX) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(text)) !== null) {
        if (!cardText.includes(m[0].trim())) bad(row.where, text, `수치 어림 "${m[0].trim()}" 이 카드 원문에 없다`)
      }
    }
    SUBJECT.lastIndex = 0
    let sm
    let hasSubject = false
    while ((sm = SUBJECT.exec(text)) !== null) {
      hasSubject = true
      const tail = text.slice(sm.index + sm[0].length, sm.index + sm[0].length + 8)
      if (!SUBJECT_CTX.test(tail)) bad(row.where, text, `"${sm[0]}" 뒤에 자료 문맥이 없다 — 자료의 이름을 말할 때만 쓴다`)
    }
    if (hasSubject) { const m = text.match(SUBJECT_JUDGE); if (m) bad(row.where, text, `주체 평가 "${m[0]}"`) }

    /* 11. 판정 표지 + 카드별 규칙
       ★ 카드가 limit 을 적어 두었으면 공용 표지 목록 대신 그것을 쓴다 —
         카드가 대지 않은 사유(가장 값싼 표지)를 붙여 한계를 좁히는 것을 막는다. */
    const verdicts = cites.map((c) => c.verdict)
    for (const c of cites) {
      const v = c.verdict
      if (v !== '약함' && v !== '불가') continue
      const own = CARD_RULES[c.id]?.limit
      if (own) {
        if (!own.test(text)) bad(row.where, text, `${c.id} — ${CARD_RULES[c.id].limitWhy}`)
      } else if (!VERDICT_MUST[v].test(text)) {
        bad(row.where, text, `판정 "${v}" 인데 한계 표지가 없다`)
      }
    }
    for (const c of cites) {
      const r = CARD_RULES[c.id]
      if (!r) continue
      if (r.ban) { const m = text.match(r.ban); if (m) bad(row.where, text, `${c.id} — ${r.banWhy}("${m[0]}")`) }
      if (r.must && (!r.when || r.when.test(text)) && !r.must.test(text)) bad(row.where, text, `${c.id} — ${r.mustWhy}`)
      /* 14. 배타 짝 — 한 카드 안에서 기준일이 갈리는 값 묶음을 섞어 쓰면 폐기 */
      if (r.exclusive) {
        const hit = r.exclusive.filter((g) => g.re.some((re) => re.test(text)))
        if (hit.length > 1) {
          bad(row.where, text, `${c.id} — 기준일이 다른 두 묶음을 섞었다(${hit.map((g) => g.name).join(' × ')})`)
        }
      }
    }

    out.push({ row, text, cards, verdicts, figures })
  }

  /* ── 검사 5: 구획 내 중복 · 인용 폭 ── */
  for (const sec of SECTIONS) {
    const used = out.filter((o) => o.row.sec?.key === sec.key).flatMap((o) => o.cards)
    const dup = used.filter((id, i) => used.indexOf(id) !== i)
    if (dup.length) bad(sec.key, '', `한 구획 안에서 같은 카드를 두 번 인용했다: ${[...new Set(dup)].join(', ')}`)
  }
  const cited = [...new Set(out.flatMap((o) => o.cards))]
  if (cited.length < 8) bad('전체', '', `인용된 고유 카드가 ${cited.length}장이다 — 8장 이상이어야 한다`)
  for (const v of ['성립', '약함', '불가']) {
    if (!cited.some((id) => byId.get(id)?.verdict === v)) bad('전체', '', `판정 "${v}" 카드가 한 장도 인용되지 않았다`)
  }

  const figCount = out.reduce((s, o) => s + o.figures.length, 0)
  /* 검사 14종 — 1 스키마 · 2 길이·이모지 · 3 어투 · 4 카드 1장·실재 · 5 구획 중복·인용 폭 ·
     6 제목 재진술 · 7 수치 대조 · 8 문장마다 수치 · 9 T1 · 10 T2·주체어 · 11 판정 표지·카드 규칙 ·
     12 구획 판정 일치 · 13 인용 금지 값 · 14 배타 짝 */
  const stats = { lines: out.length, figures: figCount, cardsCited: cited.length, checks: 14, passed: problems.length === 0 }
  if (problems.length) return { ok: false, problems, stats, summary: null }

  /* ── 통과 — 화면이 읽는 모양으로 조립한다. closing·notice·shape·label 은 전부 규칙 문자열이다 ── */
  const head = out.find((o) => o.row.where === 'headline')
  const summary = {
    schema: SUMMARY_SCHEMA,
    sourceBuiltAt: analysis.builtAt,
    promptVersion: PROMPT_VERSION,
    verifierVersion: VERIFIER_VERSION,
    verified: stats,
    shape: {
      tried: analysis.meta?.tried ?? analysis.cards.length,
      accepted: analysis.meta?.accepted ?? 0,
      weak: analysis.meta?.weak ?? 0,
      rejected: analysis.meta?.rejectedCount ?? 0,
    },
    headline: { text: head.text, cardIds: head.cards, figures: head.figures },
    sections: SECTIONS.map((sec) => ({
      key: sec.key,
      label: sec.label,
      verdict: sec.verdict,
      lines: out
        .filter((o) => o.row.sec?.key === sec.key)
        .map((o) => ({ id: o.row.id, text: o.text, cardIds: o.cards, verdicts: o.verdicts, figures: o.figures })),
    })),
    closing: CLOSING,
    notice: NOTICE,
  }
  return { ok: true, problems, stats, summary }
}

/* ══════════════════════ ⑦ 지적 블록 ══════════════════════
   위반한 규칙과 문제 문장만 준다. **정답 수치는 절대 주지 않는다** —
   알려 주면 우리가 요약을 쓰고 LLM 이 받아쓴 것이 된다. 그건 이 설계의 목적이 아니다.
   실측: 1차 어투 전량 위반 → 2차 제목 베끼기 5건 → 3차 9문장 중 8통과. 지적형 재시도가 수렴한다. */
export function feedbackBlock(problems, attempt, maxAttempt) {
  const head = `[재시도 ${attempt}/${maxAttempt}] 앞선 출력이 검사에서 걸렸다. 아래 지적만 고치고 나머지는 유지해라.`
  const lines = problems.slice(0, 12).map((p) => `· ${p.where} "${cut(p.text, 60)}" — ${p.why}`)
  return [head, ...lines].join('\n')
}
