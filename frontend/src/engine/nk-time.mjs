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
  /* ★ 미래는 새 슬롯이 아니라 직교 플래그다 — TIME_SLOTS 닫힌 집합과 LLM 프롬프트를 건드리지 않는다.
     과거 규칙보다 먼저 판정해야 '다음 해'가 '해'류 규칙에 먼저 먹히지 않는다. */
  [/내후년|다다음\s?해/,                          () => ({ slot: 'year', year: Y() + 2, future: true })],
  [/내년|명년|다음\s?해/,                         () => ({ slot: 'year', year: Y() + 1, future: true })],
  // (?<!\d) 가 없으면 '2018년 후반기' 가 "2018년 후" 로 걸려 year=4044 가 된다 (실측)
  [/(?<!\d)(\d{1,2})\s?년\s?(?:후|뒤)/,            (m) => ({ slot: 'year', year: Y() + Number(m[1]), future: true })],
  [/앞으로|향후|장차|앞날/,                        () => ({ slot: 'latest', future: true })],
  [/지금|현재|오늘날|현시점|이제/,                 () => ({ slot: 'now' })],
  [/최근|근래|요새|요즘|얼마\s?전|며칠\s?전/,      () => ({ slot: 'recent', months: 6 })],
  [/올해|금년|올\s?한\s?해/,                      () => ({ slot: 'year', year: Y() })],
  [/재작년|지지난해/,                              () => ({ slot: 'year', year: Y() - 2 })],   // ← /작년/ 보다 먼저
  [/작년|지난해|전년/,                            () => ({ slot: 'year', year: Y() - 1 })],
  // 같은 이유 — '2020년 전후' 가 "2020년 전" 으로 걸려 year=6 이 되던 자리 (기존 버그)
  [/(?<!\d)(\d{1,2})\s?년\s?전/,                   (m) => ({ slot: 'year', year: Y() - Number(m[1]) })],
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
const TIME_WORDS = /지금|현재|오늘날|요즘|현시점|최근|근래|요새|올해|금년|작년|지난해|전년|재작년|내후년|내년|명년|다음\s?해|향후|앞으로|장차|앞날|역대|사상|마지막|최종|이제|얼마\s?전/g

export function extractTime(q, now = new Date()) {
  for (const [re, make] of RULES) {
    const m = q.match(re)
    if (m) {
      const t = make(m)
      const future = isFuture(t, now)
      /* ★ 연도는 '검색어'가 아니지만 '검색 불가'도 아니다.
         이 코퍼스는 제목에 연도가 박혀 있어("남북교역 통계 — 2018-12"), 연도를 통째로 버리면
         "2018년에 남북관계 무슨 일" 이 2018년 기록을 아예 못 부른다(창내 129건 → 0건, 실측).
         → 본문에서는 떼고, 회수용 약가중 토큰으로만 따로 넘긴다.
         사용자가 실제로 친 숫자만 대상이다 — '작년'을 2025 로 바꿔 넣으면
         "작년 남북교역 얼마" 가 2025년 레코드(연표)로 새어 나간다(실측). */
      return { ...t, future, matched: m[0],
        yearToken: (!future && /(19|20)\d{2}/.test(m[0])) ? m[0].match(/(19|20)\d{2}/)[0] : null,
        cleaned: stripTime(q, m[0]), resolvedBy: 'rule' }
    }
  }
  return { slot: 'now', future: false, matched: null, yearToken: null,
    cleaned: stripTime(q), resolvedBy: 'default' }
}

/* 어휘 OR 숫자. 문자열 비교 금지 — '6-01-01' > '2026-08-09' 가 참이라 오식 연도가 미래로 뒤집힌다. */
export function isFuture(t, now = new Date()) {
  if (t.future) return true
  if (t.slot === 'year')  return Number(t.year) > now.getFullYear()
  if (t.slot === 'range') return Number(String(t.from).slice(0, 4)) > now.getFullYear()
  return false
}

/* 시간표현을 떼어낸 뒤 남는 껍데기 — 단독 토큰일 때만 제거.
   '올해 말'에서 '올해'만 지우면 '말'이, '2030년까지'에서는 '까지'가 남는다. */
const TIME_HUSK = /(^|\s)(?:년도?|년대|말|초|중반|하반기|상반기|경|쯤|까지|부터)(?=\s|$)/g

export function stripTime(q, matched = null) {
  let s = q
  if (matched) s = s.split(matched).join(' ')
  return s.replace(TIME_WORDS, ' ').replace(TIME_HUSK, '$1').replace(/\s+/g, ' ').trim()
}

// 슬롯 → 조회 구간
export function timeWindow(t, now = new Date()) {
  const iso = d => d.toISOString().slice(0, 10)
  /* ★ 미래 창은 조회 창이 될 수 없다. 아직 오지 않은 구간으로 필터하면 결과가 반드시 0건이다.
     조회는 '지금까지'로 하고, '물어본 구간이 미래였다'는 사실은 future/askedLabel 로만 올린다. */
  if (isFuture(t, now)) {
    return { from: null, to: iso(now), label: '현재까지 확인된 자료', preferLatest: true, future: true,
      askedFrom: t.slot === 'year' ? `${t.year}-01-01` : iso(now),
      askedLabel: t.slot === 'year' ? `${t.year}년` : '앞으로' }
  }
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
