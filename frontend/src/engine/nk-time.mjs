// 시간 표현 정규화 계층
//
// 원칙: 시간 표현은 '검색어'가 아니라 '정렬·필터 신호'다.
//   "김정은 최근에 뭐 했어" 에서 '최근'을 검색하면 1997년 기사의 '최근'에 매칭된다.
//   → 시간 표현은 질의에서 제거하고 슬롯으로 승격시킨다.
//
// 슬롯은 닫힌 집합이다. 규칙으로 대부분 잡고, 못 잡는 자유 표현만 LLM이 이 집합으로 매핑한다.
//   (LLM은 '해석'만 하고 '판정'하지 않는다는 원칙의 연장)

export const TIME_SLOTS = ['now', 'recent', 'year', 'range', 'latest', 'historical', 'at_event']

const Y = () => new Date().getFullYear()

// 규칙 사전 — [정규식, 슬롯 생성기]
const RULES = [
  [/지금|현재|오늘날|현시점|이제/,                 () => ({ slot: 'now' })],
  [/최근|근래|요새|요즘|얼마\s?전|며칠\s?전/,      () => ({ slot: 'recent', months: 6 })],
  [/올해|금년|올\s?한\s?해/,                      () => ({ slot: 'year', year: Y() })],
  [/작년|지난해|전년/,                            () => ({ slot: 'year', year: Y() - 1 })],
  [/재작년/,                                      () => ({ slot: 'year', year: Y() - 2 })],
  [/(\d+)\s?년\s?전/,                             (m) => ({ slot: 'year', year: Y() - Number(m[1]) })],
  [/역대|사상|이제까지|지금까지|통틀어/,           () => ({ slot: 'historical' })],
  [/마지막|최종|맨\s?끝|가장\s?최근/,              () => ({ slot: 'latest' })],
  [/(19|20)\d{2}\s?년\s?대/,                      (m) => ({ slot: 'range',
                                                     from: `${m[0].match(/\d{4}/)[0]}-01-01`,
                                                     to: `${Number(m[0].match(/\d{4}/)[0]) + 9}-12-31` })],
  [/((?:19|20)\d{2})\s?년/,                       (m) => ({ slot: 'year', year: Number(m[1]) })],
  [/((?:19|20)\d{2})\s?[~\-]\s?((?:19|20)\d{2})/, (m) => ({ slot: 'range',
                                                     from: `${m[1]}-01-01`, to: `${m[2]}-12-31` })],
]

// 시간 표현으로만 쓰이는 어휘 — 검색 토큰에서 제거
const TIME_WORDS = /지금|현재|오늘날|요즘|현시점|최근|근래|요새|올해|금년|작년|지난해|전년|재작년|역대|사상|마지막|최종|이제|얼마\s?전/g

export function extractTime(q, now = new Date()) {
  for (const [re, make] of RULES) {
    const m = q.match(re)
    if (m) {
      const t = make(m)
      return { ...t, matched: m[0], cleaned: stripTime(q), resolvedBy: 'rule' }
    }
  }
  return { slot: 'now', matched: null, cleaned: stripTime(q), resolvedBy: 'default' }
}

export function stripTime(q) {
  return q.replace(TIME_WORDS, ' ').replace(/\s+/g, ' ').trim()
}

// 슬롯 → 조회 구간
export function timeWindow(t, now = new Date()) {
  const iso = d => d.toISOString().slice(0, 10)
  switch (t.slot) {
    case 'year':  return { from: `${t.year}-01-01`, to: `${t.year}-12-31`, label: `${t.year}년` }
    case 'range': return { from: t.from, to: t.to, label: `${t.from.slice(0,4)}~${t.to.slice(0,4)}` }
    case 'recent': {
      const d = new Date(now); d.setMonth(d.getMonth() - (t.months || 6))
      return { from: iso(d), to: iso(now), label: `최근 ${t.months || 6}개월` }
    }
    case 'historical': return { from: null, to: null, label: '전 기간', preferExtreme: true }
    case 'latest':     return { from: null, to: null, label: '최종 관측', preferLatest: true }
    default:           return { from: null, to: iso(now), label: '현재', preferLatest: true }
  }
}

// ── LLM 폴백 인터페이스 ──────────────────────────────────────
// 규칙이 못 잡은 자유 표현("코로나 터지기 전", "문재인 정부 때")만 넘긴다.
// LLM은 반드시 위 닫힌 슬롯 집합 중 하나로만 답해야 한다.
export const LLM_TIME_PROMPT = `사용자 질문에서 시간 표현을 찾아 아래 슬롯 중 하나로만 변환하라.
슬롯: now | recent(months) | year(year) | range(from,to) | latest | historical
시간 표현이 없으면 {"slot":"now"}.
JSON만 출력. 해석·추론·판정 금지. 예시:
"코로나 터지기 전에" → {"slot":"range","from":"2018-01-01","to":"2019-12-31"}
"문재인 정부 때"     → {"slot":"range","from":"2017-05-10","to":"2022-05-09"}
"김정은 집권 이후"   → {"slot":"range","from":"2011-12-17","to":"TODAY"}`

export function needsLLM(t) { return t.resolvedBy === 'default' && /전에|이후|시절|정부|때|무렵|당시/.test(t.cleaned) }
