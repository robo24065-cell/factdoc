// 사실은ON 검색·응답 엔진 (무튜닝 코어)
//
// 설계: 튜닝이 필요한 요소를 핵심 경로에서 배제한다.
//   BM25(고정 상수) → 결정론 부스트 → as-of 게이트 → 응답
// 벡터 검색은 나중에 RRF로 합류시킬 수 있게 rank 기반으로 구조를 잡아둔다.

import { extractTime, timeWindow, needsLLM } from './nk-time.mjs'
import { normalizeByRule } from './nk-normalize.mjs'
import { TOPIC_STATUS } from '../../../scripts/nk-catalog.mjs'

// ── 토크나이저 ──────────────────────────────────────────────
const STOP = new Set(['그리고','에서','으로','인가','인가요','뭐야','뭔가','얼마','어떻게','있나','있나요',
  '한가','한가요','되나','되나요','진짜','정말','알려줘','알려주세요','대해','관련','우리','사실','인지',
  '건가','건가요','거야','건데','는데','인데','같은','하는','했나','인상','정도',
  // 변별력 없는 부사 — '북한이 다시 영토 침범' 같은 무관 기록을 끌어올리던 것들
  '다시','많이','매우','아주','너무','조금','계속','그냥','혹시','도대체','아마','실화냐','실화',
  // 의문사 — '통일 언제되냐'가 "언제 어디서든"·"언제든지" 인용문에 걸리던 것들.
  // 질문의 형태를 나타낼 뿐 무엇을 찾을지는 알려주지 않는다.
  '언제','어디','어디서','누가','누구','무엇','뭐가','왜','어째서','어떤','몇','언제쯤','되냐','되나요','될까'])
const JOSA = /(은|는|이|가|을|를|의|에|도|만|과|와|으로|로|에서|부터|까지|이나|나|든지|밖에|처럼|보다)$/

// ★ 1음절 내용어 — 사람이 관리하는 닫힌 목록. 통계로는 못 만든다.
//   실측 df: 핵 83 · 를 106 · 의 118  → 빈도 컷오프는 내용어와 조사를 못 가른다.
//   또한 dfsum/N 게이트도 못 가른다: 핵 0.081 인데 물 0.090 · 총 0.080 · 산 0.173.
//   '물'을 넣으면 확장이 박물관·동물원·화물선으로 새고, '총'은 유엔총회·국무총리로 샌다
//   (직접 확인함). 자립명사이면서 복합어가 주제 안에 머무는 것만 넣는다.
const MONO = new Set(['핵', '쌀', '돈', '밥', '땅', '옷', '밭'])

export function tokenize(s) {
  const raw = String(s || '').match(/[가-힣]+|[A-Za-z][A-Za-z0-9]{1,}|\d{4}/g) || []
  const ok = t => (t.length >= 2 ? !STOP.has(t) : MONO.has(t))
  const out = []
  for (const t of raw) {
    if (ok(t)) out.push(t)
    const c = t.replace(JOSA, '')
    if (c !== t && c.length >= 1 && ok(c)) out.push(c)
  }
  return [...new Set(out)]
}

// ── 동의어 확장 ─────────────────────────────────────────────
// 사용자 어휘 ≠ 공식 문서 어휘. '탈북'으로 물어도 '북한이탈주민' 통계에 닿아야 한다.
// 남북 표기 대응(오물풍선↔대남 쓰레기 풍선)도 같은 통로로 흐른다.
// 용어사전·언어비교 API가 복구되면 이 표가 자동 확장된다.
const SYN = {
  '탈북': ['북한이탈주민', '탈북민', '탈북자', '입국'],
  '탈북민': ['북한이탈주민', '탈북'], '탈북자': ['북한이탈주민', '탈북'],
  '북한이탈주민': ['탈북', '탈북민'],
  '개성공단': ['개성', '입주기업'], '금강산': ['관광객', '금강산관광'],
  '교역': ['반출', '반입', '무역'], '무역': ['교역', '반출', '반입'],
  '왕래': ['방북', '방남', '인원'], '회담': ['남북회담', '고위급회담'],
  '이산가족': ['상봉', '신청'], '지원금': ['정착금', '급여', '수급'],
  '오물풍선': ['대남 쓰레기 풍선', '풍선'], '미사일': ['발사체', '탄도'],
  '처형': ['사망', '숙청'], '숙청': ['해임', '사망'],

  // ★ 북송·송환 — 사람들이 쓰는 말과 공문서의 말이 가장 크게 벌어지는 지점.
  //   "다시 돌려보냈다"·"북으로 넘겼다" 가 코퍼스의 '북송'·'송환' 에 닿지 않아
  //   2004년 어선 예인 기록이 1위로 나오던 자리다. (코퍼스: 송환 117 · 북송 10 · 추방 5)
  '돌려보내': ['북송', '송환', '강제송환', '추방'],
  '돌려보냈': ['북송', '송환', '강제송환', '추방'],
  '되돌려': ['북송', '송환'],
  '북송': ['송환', '강제송환', '추방', '탈북'],
  '송환': ['북송', '강제송환', '추방'],
  '강제북송': ['북송', '송환', '강제송환'],
  '넘겼': ['송환', '북송'],
  '귀순': ['탈북', '북한이탈주민', '월남'],
  '월북': ['월경', '넘어간'],

  // 식량·기아 — '굶는다'가 공문서의 '식량난·아사'에 닿지 않았다 (코퍼스: 식량 71 · 아사 9 · 식량난 8)
  '굶는': ['식량난', '식량', '아사', '기아'],
  '굶어': ['식량난', '식량', '아사', '기아'],
  '굶주': ['식량난', '아사', '기아'],
  '식량난': ['식량', '아사', '기아', '식량지원'],
  '기아': ['식량난', '아사', '식량'],
  '배고': ['식량난', '식량'],
}
// 어간 접두 매칭용 — 긴 것부터 검사해 '돌려보냈' 이 '돌려보내' 보다 먼저 걸리게 한다
const SYN_STEMS = Object.keys(SYN).filter(k => k.length >= 2).sort((a, b) => b.length - a.length)

function expandTokens(tokens, data) {
  const out = new Map()                       // token → weight
  for (const t of tokens) out.set(t, 1)
  for (const t of tokens) {
    for (const syn of SYN[t] || []) if (!out.has(syn)) out.set(syn, 0.7)
    /* 용언은 활용이 심해 정확일치로는 못 잡는다 — '돌려보냈다던데' 는 '돌려보냈' 항목에
       걸려야 '북송·송환' 으로 이어진다. 어간(2자 이상)이 토큰의 접두면 발동한다. */
    if (!SYN[t]) for (const k of SYN_STEMS) {
      if (t.length > k.length && t.startsWith(k)) {
        /* 용언에서 온 확장은 주장의 '술어'다 — "북한 주민이 굶는다"에서 핵심은 굶는다이지 주민이 아니다.
           0.6 이면 주어(주민, df 57)에 밀려 식량난 기록이 22위로 내려간다. 거의 원어 수준으로 둔다. */
        for (const syn of SYN[k]) if (!out.has(syn)) out.set(syn, 0.9)
        break                                   // 가장 긴 어간 하나만 (SYN_STEMS 는 길이 내림차순)
      }
    }
    // 엔티티 별칭
    for (const e of data.entities || []) {
      const names = [e.name, ...(e.aliases || []).map(a => a.alias)]
      if (names.some(n => n === t || (t.length >= 3 && n.includes(t))))
        for (const n of names) if (!out.has(n)) out.set(n, 0.7)
    }
  }
  return out
}

// ── BM25 인덱스 ─────────────────────────────────────────────
const K1 = 1.2, B = 0.75, TITLE_W = 3
const REL_FLOOR = 0.25   // 1위 그룹 대비 부스트 전 관련도가 이보다 낮으면 근거가 아니다

export function buildIndex(data) {
  const docs = data.records.map(r => {
    const tf = new Map()
    const own = new Set()      // ★ 제목+본문 = 이 문서가 '자기 말로' 담고 있는 어휘
    for (const t of tokenize(r.title)) { tf.set(t, (tf.get(t) || 0) + TITLE_W); own.add(t) }
    for (const t of tokenize(r.sourceName)) tf.set(t, (tf.get(t) || 0) + 2)   // own 에 넣지 않는다
    for (const t of tokenize(r.body)) { tf.set(t, (tf.get(t) || 0) + 1); own.add(t) }
    for (const t of tokenize(r.st)) { tf.set(t, (tf.get(t) || 0) + 1); own.add(t) }  // 웹 절단 보완
    return { r, tf, own, len: [...tf.values()].reduce((a, b) => a + b, 0) }
  })
  const df = new Map()
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1)
  // 제목 df — 제목에 실린 어휘는 본문에 스친 어휘보다 도메인 신호가 강하다
  const titleDf = new Map()
  for (const d of docs) for (const t of new Set(tokenize(d.r.title))) titleDf.set(t, (titleDf.get(t) || 0) + 1)
  const N = docs.length
  const avg = docs.reduce((s, d) => s + d.len, 0) / (N || 1)

  // 역색인 — 질의 토큰이 든 문서만 순회
  const inv = new Map()
  docs.forEach((d, i) => { for (const t of d.tf.keys()) {
    if (!inv.has(t)) inv.set(t, []); inv.get(t).push(i) } })

  // 수치: recordId → measures
  const mByRec = new Map()
  for (const m of data.measures || []) {
    if (!mByRec.has(m.recordId)) mByRec.set(m.recordId, [])
    mByRec.get(m.recordId).push(m)
  }
  const vocByChar = new Map()
  for (const t of df.keys()) for (const ch of new Set(t)) {
    if (!vocByChar.has(ch)) vocByChar.set(ch, [])
    vocByChar.get(ch).push(t)
  }
  return { data, docs, df, titleDf, N, avg, inv, mByRec, vocByChar }
}

function bm25(ix, weighted) {
  const scores = new Map()
  for (const [t, w] of weighted) {
    const posting = ix.inv.get(t); if (!posting) continue
    const idf = Math.log(1 + (ix.N - ix.df.get(t) + 0.5) / (ix.df.get(t) + 0.5))
    for (const i of posting) {
      const d = ix.docs[i], f = d.tf.get(t)
      const s = idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * d.len / ix.avg))
      scores.set(i, (scores.get(i) || 0) + s * w)
    }
  }
  return scores
}

// ── 질의 해석 ───────────────────────────────────────────────
const TOPIC_HINTS = [
  [/개성공단|개성 공단/, 'econ.kaesong'], [/금강산/, 'econ.kumgang'],
  [/교역|무역|수출|수입/, 'econ.trade'], [/이산가족/, 'humanitarian.family'],
  [/탈북|북한이탈주민|정착지원|하나원/, 'def'], [/회담|정상회담/, 'ik.talks'],
  [/합의서|합의문|선언/, 'ik.accord'], [/왕래|방북|방남/, 'ik.travel'],
  [/김정은|김여정|인물|숙청|처형|사망/, 'who.person'], [/법인|단체|NGO/, 'who.org'],
]
const NUM_RE = /(\d[\d,.]*)\s*(만|억|천)?\s*(명|개|곳|건|달러|톤|원|퍼센트|%|배)/
const STAT_Q = /현황|통계|수치|규모|추이|얼마|몇|비율|분포|평균|총계|합계/
// 도메인 신호 — 이 중 하나도 없으면 우리 소관이 아니다
const DOMAIN_WORDS = ['북한','북측','남북','통일','탈북','개성','금강산','판문점','평양','김정은','김여정','김정일','김일성','비무장지대','DMZ','이산가족','대북','북핵','비핵화','노동당','조선중앙','노동신문','인민군','최고인민회의','북향민','접경','정전','분단','월북','월남','귀순','핵실험','미사일','무인기','풍선','전단','하나원','하나센터','북측','조선','군사합의','합의서','남북회담','정상회담','교역','왕래','방북','방남','대남','개성공단','북에서','북에']
const DOMAIN_RE = new RegExp(DOMAIN_WORDS.join('|'))
// 수치를 '묻는' 질문 (주장이 아님) — 몇 번/몇 명/얼마나…
const QUANT_Q = /몇\s*(명|번|개|건|곳|회|차례|%|퍼센트)?|얼마(나|였|입니까|인가)?|어느\s*정도|규모가|얼마만큼/
const ASKED_UNIT = /몇\s*(명|번|개|건|곳|회|차례|퍼센트|%)/
// 연혁·목록 질의 — 한 건이 아니라 시간순 나열로 답해야 하는 질문
const LIST_Q = /뭐\s*(했|하고|한)|무슨\s*(일|활동)|어떤\s*(활동|일|움직임)|동향|근황|행보|일정|있었(던|나|어)|나열|목록|리스트|정리해|쭉|전부|모두|다\s*보여/
const COUNT_RE = /(\d+)\s*(개|건|가지|줄)\s*(만|정도|씩)?\s*(보여|알려|나열|목록|리스트|줘|주세요)?/

export function parseQuery(q, ov = {}) {
  // ★ 시간 표현을 먼저 떼어낸다 — 검색어로 쓰면 1997년 기사의 '최근'에 걸린다
  const time = ov.time || extractTime(q)
  const win = timeWindow(time)
  const body = time.cleaned

  const tokens = tokenize(body)
  const topics = TOPIC_HINTS.filter(([re]) => re.test(body)).map(([, t]) => t)
  const askedAt = time.slot === 'year' ? new Date(`${time.year}-12-31`)
    : win.to ? new Date(win.to) : new Date()

  let numeric = null
  const nm = body.match(NUM_RE)
  if (nm) {
    let v = Number(nm[1].replace(/,/g, ''))
    if (nm[2] === '만') v *= 1e4; else if (nm[2] === '억') v *= 1e8; else if (nm[2] === '천') v *= 1e3
    numeric = { value: v, unit: nm[3], raw: nm[0] }
  }
  // 수치를 '묻는' 질문인가 (주장 대조가 아니라 조회)
  const isQuant = !numeric && QUANT_Q.test(body)
  const askedUnit = (body.match(ASKED_UNIT) || [])[1] || null
  // 연혁 나열 질의인가 + 사용자가 개수를 지정했는가
  const cm = q.match(COUNT_RE)
  const explicitCount = !!cm && (!!cm[3] || !!cm[4])      // '10개만', '5개 보여줘'
  const listIntent = LIST_Q.test(body) || (explicitCount && !isQuant)
  const wantCount = explicitCount ? Math.min(100, Number(cm[1])) : null

  const wantsStat = STAT_Q.test(body)
  const norm = ov.norm || normalizeByRule(body)
  return { raw: q, tokens, topics, askedAt, time, win, numeric, isQuant, askedUnit, norm, wantsStat,
    listIntent: listIntent || norm.intent === 'timeline', wantCount,
    askedYear: time.slot === 'year' ? String(time.year) : null,
    needsLLMTime: needsLLM(time) }
}

// ── as-of 가중 ──────────────────────────────────────────────
// frozen은 감쇠하지 않는다 — 오래됐지만 그게 확정 최종값이므로.
const HALF_LIFE_Y = 6
export function asofWeight(rec, askedAt) {
  if (rec.freshness === 'frozen') return 1
  const gapY = (askedAt - new Date(rec.coverageEnd)) / (365.25 * 864e5)
  if (gapY <= 0) return 1
  return Math.pow(0.5, gapY / HALF_LIFE_Y)      // 6년 지나면 0.5
}

// ── 검색 ────────────────────────────────────────────────────
export function search(ix, q, { limit = 40, ov } = {}) {
  const Q = parseQuery(q, ov || {})
  if (!Q.tokens.length) return { Q, hits: [] }
  // 붙여쓴 복합어 분해 — '금강산관광객수' → 금강산 + 관광객
  const decomp = []
  const residuals = []                        // ★ 색인 어휘로 설명되지 않고 버려지던 조각
  for (const t of Q.tokens) {
    if (t.length < 4 || (ix.df.get(t) || 0) > 3) continue    // df 1~3 희소 복합어도 분해
    let i = 0, found = [], resid = ''
    while (i < t.length) {
      let hit = null
      for (let L = Math.min(6, t.length - i); L >= 2; L--) {
        const piece = t.slice(i, i + L)
        if (piece === t) continue               // 자기 자신은 분해가 아니다
        if (ix.df.has(piece)) { hit = piece; break }
      }
      if (hit) { found.push(hit); i += hit.length } else { resid += t[i]; i++; continue }
      if (resid.length >= 2) residuals.push(resid)
      resid = ''
    }
    if (resid.length >= 2) residuals.push(resid)   // '북한방사능' → residuals = ['방사능']
    if (found.length >= 1) decomp.push(...found)
  }
  if (decomp.length) Q.tokens = [...new Set([...Q.tokens, ...decomp])]

  // 띄어쓰기로 갈라진 복합어 복원 — 색인 어휘에 존재할 때만 채택
  const joined = []
  for (let i = 0; i < Q.tokens.length - 1; i++) {
    const j2 = Q.tokens[i] + Q.tokens[i + 1]
    if (ix.df.has(j2)) joined.push(j2)
    if (i < Q.tokens.length - 2) {
      const j3 = j2 + Q.tokens[i + 2]
      if (ix.df.has(j3)) joined.push(j3)
    }
  }
  if (joined.length) Q.tokens = [...new Set([...joined, ...Q.tokens])]
  // ★ 질의측 어휘 확장 — 색인에 없는(또는 1음절인) 질의 토큰을 '그것을 포함하는' 색인 어휘로 되살린다.
  //   '핵' → 핵문제·북핵·비핵화·핵실험 …(345종). 변별력 없는 확장(df합이 코퍼스의 25% 초과)은 통째로 거부.
  /* ★ 조사가 붙은 형태는 '개념'이 아니다 — 확장의 씨앗으로 쓰면 안 된다.
     tokenize 가 '북한이'(원형)와 '북한'(조사 절단형)을 둘 다 내보내는데,
     '북한이' 가 엔티티 '북한이탈주민' 의 부분문자열이라
     "북한이 러시아에 파병했다던데" 같은 질문이 전부 탈북민 데이터로 새어 나갔다.
     절단형이 이미 토큰 목록에 있으면 원형은 검색어로만 쓰고 확장은 시키지 않는다. */
  const stripped = new Set(Q.tokens.map(t => t.replace(JOSA, '')))
  const isInflected = t => {
    const c = t.replace(JOSA, '')
    return c !== t && stripped.has(c)
  }
  const seedTokens = Q.tokens.filter(t => !isInflected(t))
  const VOC_W = 0.55, VOC_MAX_SHARE = 0.25
  const vocHit = new Map()
  Q.unmatched = []
  const expandVoc = (term, record) => {
    const cand = (ix.vocByChar.get(term[0]) || []).filter(v => v !== term && v.includes(term))
    let dfsum = 0; for (const v of cand) dfsum += ix.df.get(v)
    if (!cand.length || dfsum / ix.N > VOC_MAX_SHARE) { if (record) Q.unmatched.push(term); return }
    for (const v of cand) if (!vocHit.has(v)) vocHit.set(v, VOC_W)
  }
  for (const t of seedTokens) {
    if (t.length >= 2 && ix.df.has(t)) continue
    expandVoc(t, !ix.df.has(t) && !residuals.some(rt => t.includes(rt)))
  }
  for (const rt of residuals) expandVoc(rt, true)      // '방사능' → 확장 실패 → unmatched

  const expanded = expandTokens(seedTokens, ix.data)
  /* 원형('주민은')도 검색어로는 남기되 절단형('주민')과 같은 개념이므로 가중치를 낮춘다.
     둘 다 1점이면 주어가 두 배로 세어져, "북한 주민이 굶는다"에서 술어가 밀린다. */
  for (const t of Q.tokens) if (!expanded.has(t)) expanded.set(t, isInflected(t) ? 0.3 : 1)
  for (const [v, w] of vocHit) if (!expanded.has(v)) expanded.set(v, w)
  Q.expanded = [...expanded.keys()]

  // ★ 변별 신호 진단 — posting 을 가진 '희소' 질의 토큰이 하나라도 있는가.
  //   하나도 없으면 이 엔진에 문서를 구분할 능력이 없다. 그 사실을 위로 올린다(화면 문구에만 쓴다).
  Q.specific = [...expanded.keys()].filter(t => ix.df.has(t) && ix.df.get(t) <= ix.N * 0.15)
  Q.genericOnly = Q.specific.length === 0

  // ── 도메인 판정 (분해·복원·확장이 끝난 뒤에 한다) ──────────────
  //  ① 도메인 어휘  ② 주제 라우팅  ③ 엔티티  ④ 희소토큰 2개 공기(共起)
  //  ⑤ 색인에 실존하는 다어절 개념('우라늄공장')  ⑥ 제목에 실린 변별 어휘 하나('고농축우라늄')
  //  ⑤⑥ 이 없으면 단어 하나짜리 질의는 ④를 구조적으로 통과할 수 없다.
  const rare = Q.tokens.filter(t => ix.df.has(t) && ix.df.get(t) <= ix.N * 0.15)
  let coOccur = 0
  if (rare.length >= 2) {
    const cnt = new Map()
    for (const t of rare) for (const i of ix.inv.get(t) || []) {
      const c = (cnt.get(i) || 0) + 1
      cnt.set(i, c); if (c > coOccur) coOccur = c
    }
  }
  /* 3자 이상만 인정하면 '간첩'(24건)·'도발'·'귀순' 같은 2음절 명사가 단독 질의로 못 들어온다.
     한국어 명사는 2음절이 기본형이다. 대신 2음절은 더 희소할 것을 요구한다(0.5% vs 2%). */
  const titleRare = Q.tokens.some(t => {
    const df = ix.df.get(t)
    if (!df || !(ix.titleDf.get(t) || 0)) return false
    if (t.length >= 3) return df <= ix.N * 0.02
    /* 2음절은 '이 코퍼스에서 제목에 쓰이는 주제어인가'로 가른다.
       실측 제목비율 — 간첩 1.00 · 귀순 1.00 · 월북 1.00 · 도발 0.94 · 핵 0.91
                    vs 영화 0.60 · 추천 0.25 · 날씨 0.00
       빈도만으로는 '추천'(df 4)이 '도발'(df 48)보다 희소해 역전된다. 비율이 갈라준다. */
    return df <= ix.N * 0.02 && (ix.titleDf.get(t) || 0) / df >= 0.8
  })
  Q.domainSignal = {
    lex: DOMAIN_RE.test(q), topic: Q.topics.length > 0,
    entity: Q.tokens.some(t => (ix.data.entities || []).some(e => e.name === t)),
    rare: rare.length, coOccur, phrase: joined.length > 0, titleRare,
  }
  Q.inDomain = Q.domainSignal.lex || Q.domainSignal.topic || Q.domainSignal.entity ||
    coOccur >= 2 || Q.domainSignal.phrase || titleRare
  if (!Q.inDomain) return { Q, hits: [] }

  // ★ 변별 토큰의 posting 합집합 — '북한' 하나만 든 인물 카드가 근거로 못 올라오게 한다
  const coveredSet = new Set()
  for (const t of Q.specific) for (const i of ix.inv.get(t) || []) coveredSet.add(i)

  const base = bm25(ix, expanded)
  const maxBase = Math.max(1e-9, ...base.values())
  const hits = []

  for (const [i, raw] of base) {
    const r = ix.docs[i].r
    const rel = raw / maxBase                               // 부스트 전 순수 관련도
    // ★ recency 가 순위를 지배하지 못하게 질의 신호의 동적 범위를 넓힌다.
    //   실측: '북한 핵' 의 BM25 변동폭 1.9% vs recency 변동폭 31%.
    //   단 통계 질의는 면제 — as-of 판정(stale/frozen 우선)이 뒤집힌다(eval 1건이 정확히 여기 걸린다).
    let s = Math.pow(rel, Q.wantsStat ? 1 : 3)

    s *= 1 + (r.priority - 50) / 100                        // 데이터셋 우선순위
    s *= asofWeight(r, Q.askedAt)                           // 시점 감쇠 (frozen 면제)
    if (r.isLatestInDataset) s *= 1.6                       // ★ 최종 시점 레코드 우선
    if (Q.topics.some(t => r.topic === t || r.topic.startsWith(t + '.'))) s *= 1.5
    if (Q.tokens.some(t => r.entities?.includes(t))) s *= 1.25
    if (Q.wantsStat) s *= (r.kind === 'stat' ? 1.9 : r.kind === 'event' ? 0.65 : 1)
    // 시간창 반영 — 창 안이면 가산, 밖이면 감산 (검색어가 아니라 필터 신호)
    if (r.occurredOn) {
      const inFrom = !Q.win.from || r.occurredOn >= Q.win.from
      const inTo   = !Q.win.to   || r.occurredOn <= Q.win.to
      if (inFrom && inTo) s *= (Q.time.slot === 'year' || Q.time.slot === 'range') ? 2.2 : 1.15
      else if (Q.time.slot === 'year' || Q.time.slot === 'range') s *= 0.15
    }
    // '최근/최종' 요청이면 최신순 가산
    if ((Q.win.preferLatest || Q.time.slot === 'recent') && r.occurredOn) {
      const ageY = (Q.askedAt - new Date(r.occurredOn)) / (365.25 * 864e5)
      s *= 1 / (1 + Math.max(0, ageY) / 3)
    }

    // sourceName 은 데이터셋 이름표다. 변별 토큰이 아예 없는 질의에서만,
    // '자기 텍스트'로 질의어를 가진 문서인지 확인한다 (여기서만 expanded 가 작아 비용이 0에 가깝다).
    let own = 1
    if (Q.genericOnly) {
      own = 0
      const dw = ix.docs[i].own
      for (const t of expanded.keys()) if (dw.has(t)) { own = 1; break }
    }
    hits.push({ r, score: s, bm25: raw, rel, own, cover: coveredSet.has(i) ? 1 : 0 })
  }
  hits.sort((a, b) => b.score - a.score)

  // 약한 신호(공기 추정)만으로 들어온 질의는 상위 결과 제목에 질의어가 실제로 있어야 인정한다.
  // 본문 어딘가에 스친 것만으로는 '우리 주제'라고 볼 수 없다.
  const ds = Q.domainSignal
  if (ds && !ds.lex && !ds.topic && !ds.entity) {
    const top = hits.slice(0, 5)
    const rareToks = Q.tokens.filter(t => ix.df.has(t) && ix.df.get(t) <= ix.N * 0.15)
    // 다른 토큰에 포함된 조각은 독립 신호가 아니다 ('홍수피해' 안의 '피해'는 세지 않는다).
    const maximal = rareToks.filter(t => !rareToks.some(o => o !== t && o.includes(t)))
    const need = maximal.length <= 1 ? 1 : 2
    const titled = top.some(h => {
      const inT = rareToks.filter(t => h.r.title.includes(t))
      return inT.filter(t => !inT.some(o => o !== t && o.includes(t))).length >= need
    })
    if (!titled) { Q.inDomain = false; return { Q, hits: [] } }
  }
  return { Q, hits: hits.slice(0, limit) }
}

// ── 단위 체계 ───────────────────────────────────────────────
// 같은 family 안에서만 대조한다. 다르면 대조를 포기한다 (틀린 대조 > 무대조).
const FAMILY = {
  '명': 'person', '인': 'person', '만명': 'person',
  '개': 'count', '곳': 'count', '건': 'count', '개소': 'count', '개사': 'count',
  '달러': 'money', '천달러': 'money', '만달러': 'money', '백만달러': 'money',
  '원': 'krw', '억원': 'krw', '만원': 'krw',
  '톤': 'weight', 'kg': 'weight',
  '%': 'ratio', '퍼센트': 'ratio', '배': 'mult', '회': 'times', '차례': 'times',
}
const SCALE = { '달러': 1, '천달러': 1e3, '만달러': 1e4, '백만달러': 1e6,
  '명': 1, '만명': 1e4, '원': 1, '만원': 1e4, '억원': 1e8 }
const famOf = u => FAMILY[String(u || '').trim()] || null
const toBase = (v, u) => v * (SCALE[String(u || '').trim()] ?? 1)

// ── 수치 주장 대조 ──────────────────────────────────────────
// 분포 가정 없음. 최대/최소/최신과 직접 비교.
// 단위가 안 맞으면 대조하지 않되, 관련 지표는 반드시 보여준다 (빈손 금지).
export function checkNumeric(ix, Q, hits) {
  if (!Q.numeric) return null
  const wantFam = famOf(Q.numeric.unit)
  const recIds = new Set(hits.slice(0, 30).map(h => h.r.id))

  const all = []
  for (const id of recIds) for (const m of ix.mByRec.get(id) || []) all.push(m)
  if (!all.length) return null

  const byMetric = new Map()
  for (const m of all) {
    if (!byMetric.has(m.metric)) byMetric.set(m.metric, [])
    byMetric.get(m.metric).push(m)
  }

  // 질의 토큰과 지표명이 겹치면 우선 (빈도 아님)
  const affinity = name => Q.tokens.reduce((s, t) => s + (name.includes(t) ? 2 : 0), 0)
  const ranked = [...byMetric.entries()]
    .map(([metric, series]) => ({ metric, series, fam: famOf(series[0].unit),
      aff: affinity(metric), n: series.length }))
    .sort((a, b) => b.aff - a.aff || b.n - a.n)

  const comparable = ranked.filter(x => wantFam && x.fam === wantFam)

  // ① 단위 일치 → 정식 대조
  if (comparable.length) {
    const { metric, series } = comparable[0]
    const u = series[0].unit
    const vals = series.map(m => toBase(m.value, u))
    const max = Math.max(...vals), min = Math.min(...vals)
    const latest = series.slice().sort((a, b) =>
      String(b.periodStart || '').localeCompare(String(a.periodStart || '')))[0]
    const v = toBase(Q.numeric.value, Q.numeric.unit)
    return { comparable: true, metric, unit: u, claimed: v, n: series.length,
      max, min, latest: toBase(latest.value, u), latestPeriod: latest.periodStart,
      verdict: v > max ? 'above_max' : v < min ? 'below_min' : 'in_range',
      ratioToMax: max > 0 ? v / max : null }
  }

  // ② 단위 불일치 → 대조 포기. 단 관련 지표 제시 + 역산 시도
  const related = ranked.slice(0, 4).map(x => {
    const last = x.series.slice().sort((a, b) =>
      String(b.periodStart || '').localeCompare(String(a.periodStart || '')))[0]
    return { metric: x.metric, unit: x.series[0].unit, value: last.value, period: last.periodStart }
  })

  // 역산: 비율(%) 지표 + 같은 주제의 모집단(총계) 지표가 있으면 절대수 추정
  let derived = null
  if (wantFam === 'person' || wantFam === 'count') {
    const rate = ranked.find(x => x.fam === 'ratio')
    const base = ranked.find(x => (x.fam === 'person' || x.fam === 'count') &&
      /총|계|전체|합계|누적|인원|규모/.test(x.metric))
    if (rate && base) {
      const r = rate.series.slice(-1)[0], b = base.series.slice(-1)[0]
      derived = { from: `${base.metric} × ${rate.metric}`,
        value: Math.round(b.value * r.value / 100), unit: base.series[0].unit,
        note: `${base.metric} ${b.value.toLocaleString()} × ${rate.metric} ${r.value}% 로 역산한 추정치` }
    }
  }
  return { comparable: false, wantUnit: Q.numeric.unit, claimed: Q.numeric.value,
    reason: wantFam ? '동일 단위 지표 없음' : '단위 인식 실패', related, derived }
}

// ── 수치 조회 (주장 대조가 아님) ─────────────────────────────
// "작년에 탈북이 몇 번 있었대?" → '번' 자료는 없어도 '명' 자료가 있으면
//   그걸 제시하되 반드시 실제 지표명으로 재라벨링한다.
//   대조(comparison)와 달리 단위를 엄격히 요구하지 않는다 — 다만 무엇을 답했는지 정직히 밝힌다.
const UNIT_NEAR = { '번': ['회', '건', '차례', '명', '개'], '회': ['번', '건', '차례'],
  '명': ['인', '만명'], '개': ['곳', '건', '개소'], '곳': ['개', '개소'] }

export function lookupNumeric(ix, Q, hits) {
  if (!Q.isQuant) return null
  const recIds = hits.slice(0, 30).map(h => h.r.id)
  const rows = []
  for (const id of recIds) {
    const rec = ix.docs.find(d => d.r.id === id)?.r
    for (const m of ix.mByRec.get(id) || []) rows.push({ m, rec })
  }
  if (!rows.length) return null

  const inWin = r => {
    const p = r.m.periodStart || r.rec.occurredOn
    if (!p) return false
    return (!Q.win.from || p >= Q.win.from) && (!Q.win.to || p <= Q.win.to)
  }
  const affinity = n => Q.tokens.reduce((s, t) => s + (n.includes(t) ? 2 : 0), 0)

  // 질문 기간 안의 자료 우선, 없으면 전 기간에서 최신
  let pool = rows.filter(inWin)
  const outOfWindow = pool.length === 0
  if (outOfWindow) pool = rows

  pool.sort((a, b) =>
    affinity(b.m.metric) - affinity(a.m.metric) ||
    String(b.m.periodStart || '').localeCompare(String(a.m.periodStart || '')))

  const best = pool[0]
  const near = Q.askedUnit ? (UNIT_NEAR[Q.askedUnit] || []) : []
  const substituted = !!(Q.askedUnit && best.m.unit && best.m.unit !== Q.askedUnit)

  return {
    askedUnit: Q.askedUnit, windowLabel: Q.win.label, outOfWindow,
    metric: best.m.metric, unit: best.m.unit, value: best.m.value,
    period: best.m.periodStart || best.rec.occurredOn,
    dataset: ix.data.datasets[best.rec.datasetId], record: best.rec,
    substituted,
    note: substituted
      ? `질문하신 '${Q.askedUnit}' 단위 자료는 없어, 공식 지표 '${best.m.metric}(${best.m.unit})' 기준으로 답합니다.`
      : null,
  }
}

// ── 집계·분해 ───────────────────────────────────────────────
// "몇 명" → 성별=전체 합계 / "여자가 몇 명" → 성별=여 합계
// "나이 많은 사람이 더 많다며" → 연령대 분포
/* 수량을 묻는 질문인가 — 이 판정이 없으면 '개성쥬악' 같은 오타에도 합계를 지어낸다.
   실측: '개성쥬악' → 「북한이탈주민 재북 현황은 79명입니다」, '델리만쥬…' → 학술회의 기록.
   묻지 않은 숫자를 만들어내는 것은 근거 없는 판정이며, 이 서비스가 해선 안 되는 일이다.
   intent 만으로는 못 가른다 — '남북교역 규모'도 규칙층에선 intent=unknown 이다. */
const COUNT_CUE = /몇|얼마|규모|건수|인원|총|합계|평균|비율|분포|퍼센트|%|많|적|늘|줄|증가|감소|추이/
function asksQuantity(Q) {
  const n = Q.norm || {}
  if (n.aggregate && n.aggregate !== 'none') return true   // 분포·합계를 명시적으로 요구
  if (n.unitFamily) return true                            // '몇 명/얼마' 류가 잡힘
  if (Q.isQuant || Q.numeric != null) return true          // 질문에 수치가 들어 있음
  return COUNT_CUE.test(String(Q.raw ?? Q.q ?? ''))
}

export function aggregate(ix, Q, hits) {
  const n = Q.norm
  if (!asksQuantity(Q)) return null
  const rows = []
  for (const h of hits.slice(0, 40)) {
    for (const m of ix.mByRec.get(h.r.id) || []) {
      if (!m.dims) continue
      rows.push({ m, rec: h.r })
    }
  }
  if (!rows.length) return null

  // 가장 관련 높은 지표 하나로 좁힌다
  const aff = s => Q.tokens.reduce((a, t) => a + (s.includes(t) ? 2 : 0), 0)
  const metric = [...new Set(rows.map(r => r.m.metric))]
    .sort((a, b) => aff(b) - aff(a))[0]
  let pool = rows.filter(r => r.m.metric === metric)

  // 성별 필터 — 지정 없으면 '전체'만 사용해 중복합산 방지
  const g = n.dims?.성별 || '전체'
  const hasTotal = pool.some(r => r.m.dims.성별 === '전체')
  pool = pool.filter(r => r.m.dims.성별 === (hasTotal ? g : (g === '전체' ? '남' : g)) ||
    (!hasTotal && g === '전체'))

  const unit = pool[0]?.m.unit || null
  const dimName = n.dimensionAsked ||
    Object.keys(pool[0]?.m.dims || {}).find(k => k !== '성별') || null

  // 분포
  if (n.aggregate === 'distribution' && dimName) {
    const byDim = new Map()
    for (const r of pool) {
      const k = r.m.dims[dimName]; if (!k) continue
      byDim.set(k, (byDim.get(k) || 0) + r.m.value)
    }
    const items = [...byDim.entries()].map(([k, v]) => ({ key: k, value: v }))
    const total = items.reduce((a, b) => a + b.value, 0)
    items.forEach(i => { i.share = total ? i.value / total : 0 })
    items.sort((a, b) => b.value - a.value)
    return { mode: 'distribution', metric, unit, dimName, genderFilter: g,
      items, total, dataset: ix.data.datasets[pool[0].rec.datasetId], record: pool[0].rec }
  }

  // 합계 / 최대 / 최소
  const vals = pool.map(r => r.m.value)
  if (!vals.length) return null
  const sum = vals.reduce((a, b) => a + b, 0)
  const mx = pool.reduce((a, b) => (a.m.value > b.m.value ? a : b))
  const mn = pool.reduce((a, b) => (a.m.value < b.m.value ? a : b))
  const mode = n.aggregate === 'max' ? 'max' : n.aggregate === 'min' ? 'min' : 'sum'
  return { mode, metric, unit, genderFilter: g, dimName,
    sum, count: vals.length,
    peak: { key: mx.m.dims[dimName], value: mx.m.value },
    low: { key: mn.m.dims[dimName], value: mn.m.value },
    dataset: ix.data.datasets[pool[0].rec.datasetId], record: pool[0].rec }
}

// ── 시점 문구 ───────────────────────────────────────────────
const fmt = d => `${d.getFullYear()}년 ${d.getMonth() + 1}월`
export function asOfNotice(rec, askedAt = new Date()) {
  const end = new Date(rec.coverageEnd)
  const gapDays = Math.floor((askedAt - end) / 864e5)
  if (rec.freshness === 'frozen')
    return { level: 'frozen', gapDays,
      text: `${fmt(end)} 기준이며, 이후 데이터는 존재하지 않습니다. (${rec.frozenReason})` }
  if (rec.freshness === 'live' && gapDays <= 14)
    return { level: 'live', gapDays, text: `${fmt(end)} 기준 최신 자료입니다.` }
  return { level: 'stale', gapDays,
    text: `가장 최근 확인 자료는 ${fmt(end)} 기준입니다. 이후 상황은 확인되지 않습니다.` }
}

// ── 응답 조립 ───────────────────────────────────────────────
// 사다리: frozen_answer > dated_answer > related_only > no_evidence
export function topicNotice(Q) {
  for (const t of Q.topics) {
    const st = TOPIC_STATUS[t]
    if (st) return { topic: t, ...st }
  }
  return null
}

export function answer(ix, q, { groups = 3, perGroup = 3, ov } = {}) {
  const { Q, hits } = search(ix, q, { limit: 300, ov })
  const tn = topicNotice(Q)
  if (!hits.length) return { level: 'no_evidence', Q, groups: [], numeric: null, topicNotice: tn }

  // ── 연혁 모드: 시간순 나열 ────────────────────────────────
  if (Q.listIntent) {
    const N = Q.wantCount || 20
    const dated = hits.filter(h => h.r.occurredOn)
    const inWin = dated.filter(h =>
      (!Q.win.from || h.r.occurredOn >= Q.win.from) && (!Q.win.to || h.r.occurredOn <= Q.win.to))
    const widened = inWin.length < Math.min(5, N)
    const pool = widened ? dated : inWin
    const items = pool
      .sort((a, b) => b.r.occurredOn.localeCompare(a.r.occurredOn))
      .slice(0, N)
      .map(h => ({ r: h.r, ds: ix.data.datasets[h.r.datasetId],
        notice: asOfNotice(h.r, Q.askedAt) }))
    const sources = [...new Set(items.map(i => i.r.datasetId))]
      .map(k => ix.data.datasets[k])
    return { level: 'timeline', Q, items, sources, widened, topicNotice: tn,
      requested: N, available: pool.length, totalHits: hits.length,
      groups: [], numeric: null, lookup: null }
  }

  // ① 변별 토큰을 실제로 담은 문서만 근거 자격. ② 그것도 없으면(변별 토큰 자체가 없는 질의)
  //    최소한 sourceName 이 아닌 '자기 텍스트'로 걸린 문서만. ③ 그마저 없으면 원래대로.
  const covered = hits.filter(h => h.cover > 0)
  const owned = hits.filter(h => h.own > 0)
  const pool = covered.length ? covered : (owned.length ? owned : hits)
  const byDs = new Map()
  for (const h of pool) {
    if (!byDs.has(h.r.datasetId)) byDs.set(h.r.datasetId, [])
    if (byDs.get(h.r.datasetId).length < perGroup) byDs.get(h.r.datasetId).push(h)
  }
  const ordered = [...byDs.entries()]
    .map(([k, hs]) => ({ dsKey: k, ds: ix.data.datasets[k], hits: hs,
      top: Math.max(...hs.map(h => h.score)),
      rel: Math.max(...hs.map(h => h.rel)) }))
    .sort((a, b) => b.top - a.top).slice(0, groups)

  // 1위 대비 관련도가 바닥인 그룹은 근거가 아니다. 반드시 rel(부스트 전)로 잰다.
  const bestRel = Math.max(0, ...ordered.map(g => g.rel))
  const kept = ordered.filter((g, i) => i === 0 || g.rel >= bestRel * REL_FLOOR)

  const out = kept.map(g => ({
    ...g,
    notice: asOfNotice(g.hits[0].r, Q.askedAt),
    measures: g.hits.flatMap(h => ix.mByRec.get(h.r.id) || []).slice(0, 6),
  }))

  const anyFrozen = out.some(g => g.notice.level === 'frozen')
  const anyLive = out.some(g => g.notice.level === 'live')
  return {
    level: anyFrozen ? 'frozen_answer' : anyLive ? 'dated_answer' : 'stale_answer',
    Q, topicNotice: tn, groups: out, numeric: checkNumeric(ix, Q, hits),
    agg: aggregate(ix, Q, hits),
    related: lookupNumeric(ix, Q, hits), totalHits: hits.length,
  }
}

// ── 비동기 진입점 ───────────────────────────────────────────
// 규칙이 확신하면 LLM을 부르지 않는다. 실패하면 규칙 결과로 조용히 되돌아간다.
import { needsLLMNormalize } from './nk-normalize.mjs'
import { needsLLM as needsLLMTime } from './nk-time.mjs'

export async function answerAsync(ix, q, opts = {}) {
  const llm = opts.llm                       // { normalizeWithLLM, timeWithLLM, hasKeys }
  const baseTime = extractTime(q)
  const baseNorm = normalizeByRule(baseTime.cleaned)
  const ov = {}
  const used = []

  if (llm?.hasKeys?.()) {
    const jobs = []
    if (needsLLMTime(baseTime))
      jobs.push(llm.timeWithLLM(q, baseTime).then(t => { if (t?.resolvedBy === 'llm') { ov.time = t; used.push('time') } }))
    if (needsLLMNormalize(baseNorm))
      jobs.push(llm.normalizeWithLLM(q, baseNorm).then(n => { if (n?.resolvedBy === 'llm') { ov.norm = n; used.push('norm') } }))
    if (jobs.length) await Promise.allSettled(jobs)
  }
  const a = answer(ix, q, { ...opts, ov })
  a.llmUsed = used
  return a
}
