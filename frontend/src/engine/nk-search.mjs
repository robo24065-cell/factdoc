// 사실은ON 검색·응답 엔진 (무튜닝 코어)
//
// 설계: 튜닝이 필요한 요소를 핵심 경로에서 배제한다.
//   BM25(고정 상수) → 결정론 부스트 → as-of 게이트 → 응답
// 벡터 검색은 나중에 RRF로 합류시킬 수 있게 rank 기반으로 구조를 잡아둔다.

import { extractTime, timeWindow, needsLLM } from './nk-time.mjs'
import { normalizeByRule } from './nk-normalize.mjs'
import { TOPIC_STATUS, CUMULATIVE, pendingSourceFor } from '../../../scripts/nk-catalog.mjs'
import { buildGraph, relationAnswer } from './nk-relation.mjs'
import { candidatesOf, KEEP_MIN as JUDGE_KEEP_MIN } from './nk-judge.mjs'
import { buildLexicon, lexiconAnswer } from './nk-lexicon.mjs'

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

  // 식량·기아 — '굶는다'가 공문서의 '식량난·아사'에 닿지 않았다 (코퍼스: 식량 71 · 아사 9 · 식량난 8)
  '굶는': ['식량난', '식량', '아사', '기아'],
  '굶어': ['식량난', '식량', '아사', '기아'],
  '굶주': ['식량난', '아사', '기아'],
  '식량난': ['식량', '아사', '기아', '식량지원'],
  '기아': ['식량난', '아사', '식량'],
  '배고': ['식량난', '식량'],

  // ★ 삶의 조건 — 사용자는 '뭐먹고 사니'로 묻고 공문서는 '생계급여·취업'으로 쓴다
  '뭐먹고': ['생계', '생계급여', '취업', '소득', '일자리'],
  '먹고사': ['생계', '생계급여', '취업', '소득'],
  '먹고': ['생계', '생계급여', '취업', '소득'],
  '사니': ['생계', '정착', '생활'],
  '벌어': ['소득', '임금', '취업'],
  '생계': ['생계급여', '수급', '소득', '취업', '자립'],
  '직업': ['취업', '일자리', '직업훈련', '고용'],
  '취업': ['일자리', '고용', '직업', '자립'],
  '일자리': ['취업', '고용'],
  '소득': ['임금', '생계급여'],

  // ★ 입국 서술어 — '넘어왔어'가 지표명 '입국현황'에 닿지 않아 요지를 잃던 자리
  '넘어와': ['입국', '북한이탈주민', '탈북'],
  '넘어왔': ['입국', '북한이탈주민', '탈북'],
  '넘어온': ['입국', '북한이탈주민', '탈북'],
  '넘어옴': ['입국', '북한이탈주민', '탈북'],

  // ★ 사건 어휘 — '재입북'(df 1)은 '재입북자'(df 2)에, '월북한'(df 2)은 '월북'(df 4)에 닿지 못한다
  '재입북': ['재입북자', '월북', '입북'],
  '월북': ['월북자', '재입북자', '월경', '넘어간'],
  '월북한': ['월북', '월북자', '재입북자'],
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
const LEN_CAP = 3        // 길이 정규화 상한 (평균 대비 배수) — 아래 점수 계산부 주석 참조
const REL_FLOOR = 0.25   // 1위 그룹 대비 부스트 전 관련도가 이보다 낮으면 근거가 아니다

export function buildIndex(data) {
  const docs = data.records.map(r => {
    const tf = new Map()
    const own = new Set()      // ★ 제목+본문 = 이 문서가 '자기 말로' 담고 있는 어휘
    for (const t of tokenize(r.title)) { tf.set(t, (tf.get(t) || 0) + TITLE_W); own.add(t) }
    for (const t of tokenize(r.sourceName)) tf.set(t, (tf.get(t) || 0) + 2)   // own 에 넣지 않는다
    for (const t of tokenize(r.body)) { tf.set(t, (tf.get(t) || 0) + 1); own.add(t) }
    for (const t of tokenize(r.st)) { tf.set(t, (tf.get(t) || 0) + 1); own.add(t) }  // 웹 절단 보완
    /* ★ 길이는 **원본 기준**이어야 한다.
       웹 인덱스는 본문을 자른다(BODY_MAX 220 · 포털동향 150). 그런데 BM25 의 길이 정규화는
       짧은 문서를 우대하므로, **자르는 행위 자체가 그 문서의 순위를 올려 버린다.**
       실측 사고 2026-08-13: 포털동향 42,788건을 150자로 잘라 웹에 실었더니
       그 문서들이 통계 레코드를 300위 밖으로 밀어냈고, "탈북민 여자가 몇 명이야" 의
       집계가 배포본에서만 죽었다(로컬 48/48 · 배포본 40/48).
       len0(원본 토큰 수)을 실어 보내면 절단이 순위를 바꾸지 않는다. */
    const len = [...tf.values()].reduce((a, b) => a + b, 0)
    return { r, tf, own, len: r.len0 ?? len }
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
  /* ★ 지표별 기간분해 유무. 실측: measure 37,912 중 periodStart 보유 37,310(98.4%),
     그런데 dims 를 가진 60건은 0%다. 이 사실이 '연도별 수치는 없습니다'의 근거다.
     metric 이름은 데이터셋을 교차하므로(52종 중 15종) 데이터셋으로 키를 잡는다. */
  const dsOfRec = new Map(data.records.map(r => [r.id, r.datasetId]))
  const periodicMetrics = new Set()
  for (const m of data.measures || []) if (m.periodStart)
    periodicMetrics.add(dsOfRec.get(m.recordId) + '::' + m.metric)
  /* ★ 어느 데이터셋이 '수치'를 갖고 있는가 — 분포·비교 질의를 통계로 보내기 위해 필요하다.
     보도자료·동향은 measure 가 0건이라, 이 신호가 없으면 '탈북은 나이 많은 사람이…' 같은 질의가
     제목에 '탈북'이 흔한 보도자료에 점거당해 집계 경로가 아예 안 열린다(실측: eval 48→44). */
  const measureDatasets = new Set()
  for (const [rid] of mByRec) {
    const d = data.records.find(r => r.id === rid)
    if (d) measureDatasets.add(d.datasetId)
  }
  /* ★ 차원(dims)을 가진 measure 를 데이터셋+지표로 미리 묶는다. 코퍼스 전체 60건뿐이다(실측).
     합계를 랭킹(hits.slice(0,40))에서 모으면 40위에 못 든 행이 빠져 합계가 조용히 잘린다 —
     같은 지표 '북한이탈주민 입국현황'에 33,501 · 32,171 · 24,243 · 14,609 · 1,295 가
     질문 문장에 따라 나오던 자리(실측 7종). */
  const recById = new Map(data.records.map(r => [r.id, r]))
  const dimRows = new Map()
  for (const m of data.measures || []) {
    if (!m.dims) continue
    const rec = recById.get(m.recordId); if (!rec) continue
    const k = rec.datasetId + '::' + m.metric
    if (!dimRows.has(k)) dimRows.set(k, [])
    dimRows.get(k).push({ m, rec })
  }
  /* 관계망 — 문서 랭킹으로는 못 푸는 축. data.graph 가 없으면 조용히 비활성이다
     (그래프 파일을 못 받아도 검색은 그대로 돌아야 한다). */
  const gx = buildGraph(data.graph)
  /* 어휘 사전 — 낱말 질문은 문서 랭킹으로 풀 수 없다(동음이의어).
     없으면 조용히 비활성이고, 그때는 미연동 안내로 되돌아간다. */
  const lx = buildLexicon(data.lexicon)
  return { data, docs, df, titleDf, N, avg, inv, mByRec, measureDatasets, vocByChar,
    periodicMetrics, dimRows, gx, lx }
}

function bm25(ix, weighted) {
  const scores = new Map()
  for (const [t, w] of weighted) {
    const posting = ix.inv.get(t); if (!posting) continue
    /* ★ 조사가 붙은 형태는 별개의 '개념'이 아니다 — idf 를 따로 계산하면
       희귀한 표면형이 희귀한 개념 대접을 받는다.
       실측: '김정은'은 42,788건에 흔해 idf 가 바닥인데 '김정은은'은 드물어 idf 가 크다.
       그래서 "김정은은 누구야" 가 제목에 우연히 '김정은은'이 든 단신 기사에 걸리고
       정작 인물 카드가 밀렸다(코퍼스를 3배로 키우자 드러났다).
       조사형의 df 는 **원형의 df 이상**으로 본다 — 개념의 흔함을 물려받게 한다. */
    const base = t.replace(JOSA, '')
    const dfEff = base !== t && ix.df.has(base)
      ? Math.max(ix.df.get(t), ix.df.get(base))
      : ix.df.get(t)
    const idf = Math.log(1 + (ix.N - dfEff + 0.5) / (dfEff + 0.5))
    for (const i of posting) {
      const d = ix.docs[i], f = d.tf.get(t)
      /* ★ 길이 정규화에 상한을 둔다.
         BM25 의 길이 페널티는 "긴 문서는 이것저것 덧붙여 우연히 걸린다"는 가정에서 나온다.
         그런데 이 코퍼스에서 가장 권위 있는 문서(합의서 원문·개황)가 정확히 그 이유로 깎였다 —
         accord 평균 291토큰 / 코퍼스 평균 80 → 페널티 2.97배.
         합의서의 길이는 군더더기가 아니라 **문서의 실체**다. 7·4 남북공동성명 원문이
         그 성명을 언급한 단신 뉴스보다 아래에 놓이는 것은 이 서비스의 목적에 정면으로 어긋난다.
         상한 3배: 그 이상 길어도 더 깎지 않는다. 짧은 문서 쪽 동작은 그대로 둔다. */
      const dl = Math.min(d.len, ix.avg * LEN_CAP)
      const s = idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * dl / ix.avg))
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
  // 미래 질의는 askedAt 을 미래로 밀지 않는다 — as-of 감쇠가 전부 과대해진다
  const askedAt = (time.slot === 'year' && !win.future) ? new Date(`${time.year}-12-31`)
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
  /* 생사·신상 질의 — 인물 데이터셋이 답을 갖고 있는 유형 */
  const personAsk = /죽었|사망|살아\s*있|생존|숨졌|사망설|건강|나이|몇\s*살|누구(야|니|인가)|직책|무슨\s*일\s*해/.test(q)

  /* ★ 질문 유형 라우팅 — LLM 의도분류를 랭킹 축으로 쓴다.
     지금까지 분류기는 8종을 내놓는데 relation·lexicon 둘만 쓰고 6종을 버렸다.
     실측(실사용 질의 105건): 규칙이 정한 유형과 LLM 유형이 **47건(45%) 어긋난다.**
       fact→status 12 · fact→other 10 · fact→quantity 6 · fact→person 6 · fact→relation 6
     특히 "개성공단 아직 하냐"·"금강산 가는거 되냐"·"이산가족 상봉 아직도 하나" 는
     규칙이 전부 fact 로 보는데 실제로는 **status(지금도 하나?)** 다 —
     as-of 3상태 모델이 정확히 답해야 할 유형인데 그 신호를 못 받고 있었다.

     ⚠ **켜기만 한다. 끄지 않는다.** 분류기가 틀렸을 때 기존에 통과하던 답을
       빼앗지 않기 위해서다. 규칙이 켠 것은 그대로 두고 LLM 이 추가로 켠다. */
  const li = ov.intent?.type
  return { raw: q,
    personAsk: personAsk || li === 'person',
    statusAsk: li === 'status',          // '지금도 하나?' — 최종 관측·종료 공지를 앞세운다
    intentType: li || null,
    tokens, topics, askedAt, time, win, numeric, isQuant, askedUnit, norm,
    wantsStat: wantsStat || li === 'quantity',
    listIntent: listIntent || norm.intent === 'timeline' || li === 'timeline', wantCount,
    askedYear: (time.slot === 'year' && !win.future) ? String(time.year) : null,
    needsLLMTime: needsLLM(time) }
}

// ── as-of 가중 ──────────────────────────────────────────────
// frozen은 감쇠하지 않는다 — 오래됐지만 그게 확정 최종값이므로.
const HALF_LIFE_Y = 6
/* 시점 감쇠가 묻는 것: "이 자료보다 새 판본이 있을 수 있는가?"
   통계는 그렇다 — 2015년 탈북민 수치는 2026년 값이 따로 있다.
   그러나 **체결된 문서는 그렇지 않다.** 1972년 7·4 남북공동성명은 1972년의 낡은
   정보가 아니라 그 날짜로 확정된 문서 자체다. 더 새 판본이란 것이 존재하지 않는다.
   감쇠를 걸면 0.5^(54/6) ≈ 0.002 배가 되어 검색에서 사실상 사라진다 —
   실제로 "판문점선언 내용이 뭐야" 에 합의서 원문 대신 뉴스가 올라왔다.
   frozen 과 같은 이유로 면제한다. */
const NO_DECAY = new Set(['doc.agreement'])
export function asofWeight(rec, askedAt) {
  if (rec.freshness === 'frozen') return 1
  if (NO_DECAY.has(rec.decayClass)) return 1
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

  /* ★ 연도는 내용어가 아니라 필터다. 그러나 삭제도 안 된다(재현율 붕괴, 실측).
     회수만 남기고 변별력은 뺀다. 스윕: 0.05·0.15·0.3 에서 '2020년 탈북민'이 교정되고
     0.5·0.7·1.0 에서는 「남북 항공기 왕래 — 2020」이 1위로 되돌아온다. */
  const YEAR_W = 0.15
  const expanded = expandTokens(seedTokens, ix.data)
  const yearTok = Q.time.yearToken || null
  if (yearTok && ix.df.has(yearTok)) expanded.set(yearTok, YEAR_W)
  /* 원형('주민은')도 검색어로는 남기되 절단형('주민')과 같은 개념이므로 가중치를 낮춘다.
     둘 다 1점이면 주어가 두 배로 세어져, "북한 주민이 굶는다"에서 술어가 밀린다. */
  for (const t of Q.tokens) if (!expanded.has(t)) expanded.set(t, isInflected(t) ? 0.3 : 1)
  for (const [v, w] of vocHit) if (!expanded.has(v)) expanded.set(v, w)
  Q.expanded = [...expanded.keys()]

  // ★ 변별 신호 진단 — posting 을 가진 '희소' 질의 토큰이 하나라도 있는가.
  //   하나도 없으면 이 엔진에 문서를 구분할 능력이 없다. 그 사실을 위로 올린다(화면 문구에만 쓴다).
  Q.specific = [...expanded.keys()].filter(t => ix.df.has(t) && ix.df.get(t) <= ix.N * 0.15)
  Q.genericOnly = Q.specific.length === 0
  /* ★ 변별 토큰이 딱 하나뿐인데 모르는 낱말까지 있으면, 걸린 자료는 '근거'가 아니라 '참고'다.
     '델리만쥬 북한인도 먹어봤을까' → specific=[북한] 하나, unmatched=[델리만쥬] →
     학술회의 기록을 '가장 가까운 공식 기록'이라 부르던 자리.
     정상 질의는 specific 이 4~10개다(실측) — 문턱이 정상 질의를 삼키지 않는다. */
  Q.weakMatch = Q.genericOnly || (Q.specific.length <= 1 && Q.unmatched.length > 0)

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
  /* 변별 토큰을 실제로 담은 문서 집합.
     ★ 조사형은 원형으로도 인정한다. '김정은은'을 담은 문서만 세면
       정작 표제가 '김정은'인 인물 카드가 근거 자격에서 탈락한다 —
       검색 1위였는데 answer() 의 cover 게이트에서 사라졌다(실측).
       조사는 표기의 차이지 다른 낱말이 아니다. */
  const coveredSet = new Set()
  for (const t of Q.specific) {
    for (const i of ix.inv.get(t) || []) coveredSet.add(i)
    const base = t.replace(JOSA, '')
    if (base !== t && base.length >= 2)
      for (const i of ix.inv.get(base) || []) coveredSet.add(i)
  }

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
    /* ★ 분포·차원을 물었으면 답은 반드시 수치 데이터셋에 있다.
       searchPriority 조정으로는 안 고쳐진다(100/78·100/55·100/45·90/40 전부 44/48 고정 — 실측).
       '어느 자료가 답을 갖고 있는가'로 갈라야 한다. */
    if (Q.norm?.dimensionAsked || (Q.norm?.aggregate && Q.norm.aggregate !== 'none')) {
      s *= ix.measureDatasets.has(r.datasetId) ? 3 : 0.25
    }
    /* ★ 보도설명자료는 '주장을 반박한 기록'이다 — 주장 검증에는 최적이고 사실 조회에는 아니다.
       searchPriority 100 을 모든 질의에 적용하면 2,709건이 코퍼스 전체를 점거한다
       (실측: 적재 직후 eval 48→44, wild 75→69. '이산가족 상봉 아직도 하나' 가 회담 자료를 잃었다).
       주장 표지가 있을 때만 앞세우고, 그 밖에는 뒤로 물린다. */
    /* ★ 인물의 생사·직책을 물으면 답은 인물 카드에 있다.
       '김정은 죽었니' 가 「여맹대회 기념촬영」을 헤드라인으로 내놓던 자리다 —
       정작 답('사망 기록 없음')은 근거 2번에 묻혀 있었다. */
    if (Q.personAsk && r.kind === 'entity') s *= 6
    if (r.kind === 'briefing') {
      const isClaim = Q.norm?.intent === 'claim_check' ||
        /다며|다던데|라는데|사실이니|사실인가|맞아|맞나|아니야|진짜|헛소문|가짜/.test(String(Q.raw ?? ''))
      s *= isClaim ? 1.8 : 0.35
    }

    s *= 1 + (r.priority - 50) / 100                        // 데이터셋 우선순위
    s *= asofWeight(r, Q.askedAt)                           // 시점 감쇠 (frozen 면제)
    /* ★ 최종 시점 레코드 우선. '지금도 하나?'(status)를 물었으면 더 세게 —
       그 질문의 답은 **가장 마지막에 관측된 것**이지 아무 시점의 기록이 아니다.
       "개성공단 아직 하냐"·"금강산 가는거 되냐"가 그 유형이다(실측 12건). */
    if (r.isLatestInDataset) s *= Q.statusAsk ? 2.6 : 1.6
    if (Q.topics.some(t => r.topic === t || r.topic.startsWith(t + '.'))) s *= 1.5
    if (Q.tokens.some(t => r.entities?.includes(t))) s *= 1.25
    if (Q.wantsStat) s *= (r.kind === 'stat' ? 1.9 : r.kind === 'event' ? 0.65 : 1)
    /* ★ 수치 주장을 검증하려면 **통계**가 있어야 한다. "3만명씩 온다며"는 보도자료가 아니라
       입국현황 통계에 대조해야 답이 나온다. wantsStat 은 '몇 명이야' 같은 질문형만 잡고
       주장형(Q.numeric)은 놓쳤다 — 그래서 통계가 38위로 밀려 checkNumeric(상위 30위)의
       사정권 밖으로 나갔다(포털동향 42,788건 추가로 IDF 가 흔들리며 드러난 결함).
       주장형은 event 를 깎지 않는다 — 사건에 대한 수치 주장일 수도 있기 때문이다. */
    else if (Q.numeric && r.kind === 'stat') s *= 1.9
    // 시간창 반영 — 창 안이면 가산, 밖이면 감산 (검색어가 아니라 필터 신호)
    if (r.occurredOn) {
      const inFrom = !Q.win.from || r.occurredOn >= Q.win.from
      const inTo   = !Q.win.to   || r.occurredOn <= Q.win.to
      const yearWin = (Q.time.slot === 'year' || Q.time.slot === 'range') && !Q.win.future
      if (inFrom && inTo) s *= yearWin ? 2.2 : 1.15
      else if (yearWin) s *= 0.15
    }
    /* '최근/최종' 요청이면 최신순 가산.
       ★ 감쇠 면제 문서(체결된 합의서 등)는 **명시적으로 '최근'을 물었을 때만** 깎는다.
         preferLatest 는 시간 표현이 없을 때도 켜지는 기본값이라, 그대로 두면
         "판문점선언" 같이 문서를 이름으로 지목한 질의에서도 2018년 원문이 ×0.275 로 깎여
         2026년 기념식 단신에 밀린다(실측: accord 19위, 뉴스 1위).
         감쇠는 asofWeight 와 여기 두 곳에 있는데 한쪽만 면제해서 생긴 구멍이었다. */
    const skipRecency = NO_DECAY.has(r.decayClass) && Q.time.slot !== 'recent'
    if ((Q.win.preferLatest || Q.time.slot === 'recent') && r.occurredOn && !skipRecency) {
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
    /* ★ NaN 방어. 필드 하나가 비면 곱셈이 NaN 이 되고, NaN 비교는 늘 false 라
       **정렬 전체가 무너진다** — 일부가 아니라 전부다.
       실측 사고 2026-08-13: 웹 인덱스의 포털동향 42,788건에 priority 가 없어
       `1 + (undefined - 50)/100` = NaN 이 됐고, 815건 중 86건이 NaN 이 되자
       점수 1.81 짜리가 476위, 0.07 짜리가 1위가 됐다. 배포본에서만 집계·연혁이 죽은 원인이다.
       데이터를 고치는 것과 별개로, 엔진이 이런 입력에 조용히 무너지면 안 된다. */
    hits.push({ r, score: Number.isFinite(s) ? s : 0, bm25: raw, rel, own,
      cover: coveredSet.has(i) ? 1 : 0 })
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
// ── 집계·분해 ───────────────────────────────────────────────
// "몇 명" → 성별=전체 합계 / "여자가 몇 명" → 성별=여 합계
// "나이 많은 사람이 더 많다며" → 연령대 분포
/* ── 질문의 '문법' ─────────────────────────────────────────
   무엇을 찾을지가 아니라 어떻게 묻는지를 나타내는 어휘. 닫힌 낱말집합 + 어미/어두 규칙이다.
   ★ 부분문자열 매칭을 쓰면 안 된다 — '적십자'가 '적'에, '명절'이 '명'에, '게임'이 '임'에 걸린다.
     실측: 비앵커 정규식은 제목 내용어(titleDf>=3) 8,770종 중 434종(4.9%)을 문법어로 삼켰다
     (적십자사·남북적십자회담·군사적·평화적·명단·명령…). 앵커드는 78종(0.9%). */
const ASK_WORDS = new Set([
  '몇', '얼마', '규모', '정도', '어느', '어디', '누가', '누구', '무엇', '뭐', '왜', '어떤', '어때', '언제',
  '통계', '현황', '수치', '추이', '평균', '합계', '총계', '비율', '분포', '구성',
  '목록', '나열', '리스트', '자료', '데이터',
  '제일', '가장', '최다', '최대', '최소', '최고', '최저', '중에', '각각', '대비', '비교', '차이',
  '명', '분', '사람', '인원', '건수', '개수', '가지', '차례', '숫자', '갯수', '사실', '진짜',
])
const ASK_RE = [
  /^(몇|얼마|어느|어디|어떻|어때)/,
  /^(많|적은|적나|작은|높|낮|중에|각각|대비|비교|차이)/,
  /^(제일|가장|최다|최대|최소|최고|최저)([은는이가을를의도만로]|으로)?$/,
  /^(명|분|사람|인원|건수|개수|가지|차례|숫자|갯수)(수|들)?([은는이가을를의도만]|이야|이나|인|인가|인지|씩)?$/,
  /^(있|없)/,
  /^(알려|보여|주세|나열|정리)/,
  /(다며|다던데|라는데|맞아|맞나|카더라|한다며)$/,
  /(입니까|인가요|나요|가요|세요|이야|이니|이냐|되나|줘|셈)$/,
]

/* ★ 잔여 초점 — 이 지표의 어휘로도, 질문 문법으로도, 정규화기가 이미 소비한 규칙으로도
   설명되지 않고 남는 낱말. 남으면 이 지표는 이 질문의 답이 아니다.
   '탈북민'과 '탈북민 재입북'은 토큰 수가 둘 다 2개라 안 갈리고, hits 순위로도 안 갈린다.
   갈라주는 것은 어휘뿐이다 — 이 데이터셋은 '재입북'을 말한 적이 없다. */
function residualFocus(ix, Q, n, metric, dsKey, pool, dimName) {
  // ① 지표가 스스로 말하는 어휘 — 손으로 쓰지 않고 데이터에서 만든다
  const own = new Set()
  const add = s => { for (const t of tokenize(String(s || ''))) own.add(t) }
  add(metric); add(ix.data.datasets[dsKey]?.name); add(dimName)
  for (const r of pool) {
    add(r.rec.title)
    for (const [k, v] of Object.entries(r.m.dims || {})) { add(k); add(v) }
  }
  // ② 이 토큰이 지표 어휘에 닿는가 — 부분문자열 + SYN 다리('탈북민'→'북한이탈주민')
  const reach = t0 => {
    /* 조사형('북한에서')은 확장 씨앗이 아니라 아무 다리도 못 놓는다 — 절단형도 함께 본다 */
    for (const t of new Set([t0, t0.replace(JOSA, '')])) {
      for (const o of own) if (o.length >= 2 && (t.includes(o) || o.includes(t))) return true
      const cand = new Set([t, ...(SYN[t] || [])])
      /* 어간이 토큰의 접두인 경우(넘어왔어→넘어왔)와 토큰이 어간의 접두인 경우(넘어→넘어왔) 둘 다.
         후자는 decomp 가 잘라낸 조각이 다리를 못 찾던 자리다. */
      for (const k of SYN_STEMS) if (t.length >= 2 && (t.startsWith(k) || k.startsWith(t)))
        { cand.add(k); for (const v of SYN[k]) cand.add(v) }
      for (const c of cand) for (const o of own)
        if (o.length >= 2 && (c.includes(o) || o.includes(c))) return true
    }
    return false
  }
  const bridged = new Set(Q.tokens.filter(reach))

  // ③ 정규화기가 이미 소비한 어휘 (성별·차원·집계 규칙이 걸어간 자리)
  const consumed = []
  if (n.dims?.성별 || n.dimensionAsked === '성별') consumed.push(/여자|여성|남자|남성|성별|남녀/)
  if (n.dimensionAsked === '연령대') consumed.push(/나이|연령|고령|젊|어린|노인/)
  if (n.dimensionAsked === '출신지역') consumed.push(/출신|지역|고향/)
  if (n.dimensionAsked === '직업') consumed.push(/직업/)
  if (n.aggregate !== 'none') consumed.push(/총|전체|합|모두|통틀어|최신|마지막|현재|경향/)
  /* nk-normalize 의 PERSON_HINT 가 '사람 수 질의'로 이미 읽어낸 표현은 초점이 아니다.
     '탈북민 총 몇명이나 왔어' 의 '왔어' 가 잔여어로 남아 요지를 잃던 자리. */
  if (n.unitFamily === 'person') consumed.push(/넘어|들어온|들어와|왔|와서|오신|입국|인원/)
  const grammar = t => ASK_WORDS.has(t) || ASK_WORDS.has(t.replace(JOSA, '')) ||
    ASK_RE.some(re => re.test(t)) || consumed.some(re => re.test(t))

  // ④ 잔여 초점
  const explained = [...bridged, ...Q.tokens.filter(grammar)]
  /* 이미 설명된 토큰을 품고 있는 조각은 독립 초점이 아니다 —
     '북한 사람'을 붙여 만든 색인어 '북한사람'이 잔여어로 남던 자리(search 의 joined 복원 산물). */
  const known = Q.tokens.filter(t => ix.df.has(t) && !bridged.has(t) && !grammar(t) &&
    !explained.some(e => e !== t && e.length >= 2 && t.includes(e)))
  /* 색인이 모르는 낱말('자살률')도 이 지표가 답하지 못하는 것이다. df 필터로는 안 보인다. */
  const unknown = Q.tokens.filter(t => !ix.df.has(t) && !grammar(t) &&
    !explained.some(e => e.length >= 2 && (t.includes(e) || e.includes(t))) &&
    !Q.tokens.some(o => o !== t && ix.df.has(o) && o.length >= 2 && t.includes(o)))
  return [...new Set([...known, ...unknown])]
}

export function aggregate(ix, Q, hits) {
  const n = Q.norm
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
  /* ★ 질문이 지목한 차원을 실제로 가진 지표만 그 질문의 답이 될 수 있다.
     코퍼스에 '학력' 차원은 0건인데 연령대 최빈값 9,634 를 '학력' 라벨로 내보내던 자리다. */
  const carries = mt => !!(n.dimensionAsked &&
    rows.some(r => r.m.metric === mt && r.m.dims?.[n.dimensionAsked]))
  const metric = [...new Set(rows.map(r => r.m.metric))]
    .sort((a, b) => (carries(b) - carries(a)) || aff(b) - aff(a))[0]
  if (n.dimensionAsked && !carries(metric)) return null
  let pool = rows.filter(r => r.m.metric === metric)

  /* ★ 합계는 랭킹의 함수가 아니다. 지표가 정해진 뒤에는 그 지표를 가진 행 '전부'를 색인에서 모은다.
     관련성 판정(아래 residualFocus)과 행 수집을 같은 창(hits.slice)으로 겸하면
     문턱을 조일 때마다 합계가 같이 잘린다. 두 축을 분리한다. */
  if (ix.dimRows) {
    const full = []
    for (const k of new Set(pool.map(r => r.rec.datasetId)))
      for (const row of ix.dimRows.get(k + '::' + metric) || []) full.push(row)
    if (full.length) pool = full
  }

  // 성별 필터 — 지정 없으면 '전체'만 사용해 중복합산 방지
  const g = n.dims?.성별 || '전체'
  const hasTotal = pool.some(r => r.m.dims.성별 === '전체')
  pool = pool.filter(r => r.m.dims.성별 === (hasTotal ? g : (g === '전체' ? '남' : g)) ||
    (!hasTotal && g === '전체'))
  if (!pool.length) return null

  /* ★ 시간창 — 여기가 비어 있던 자리다. 근거(groups) 경로에만 걸려 있던 as-of 원칙을 집계에도 건다.
     창 밖이어도 null 을 돌려주지 않는다. 침묵은 답이 아니다.
     가진 것을 주되 '물어본 시점의 것이 아님'을 표식으로 함께 올린다(lookupNumeric 과 같은 계약).
     timeScoped 를 win.from 유무로 재는 것이 핵심이다 — slot 이름으로 재면 'recent'(요즘)가 새어 나간다. */
  const per = r => r.m.periodStart || r.rec.occurredOn || null
  const dated = pool.filter(per)
  const windowed = dated.filter(r => {
    const p = per(r)
    return (!Q.win.from || p >= Q.win.from) && (!Q.win.to || p <= Q.win.to)
  })
  const timeScoped = !!Q.win.from || !!Q.win.future
  let outOfWindow = false
  if (timeScoped) {
    if (windowed.length) pool = windowed
    else outOfWindow = true
  }
  const basis = dated.length ? 'periodic' : 'snapshot'
  const dsKey = pool[0].rec.datasetId
  const dimName = n.dimensionAsked ||
    Object.keys(pool[0]?.m.dims || {}).find(k => k !== '성별') || null
  /* ★ 집계가 '요지'가 될 자격은 질의의 형태가 아니라 관련성으로 정한다. 숫자를 지우지는 않는다 —
     카드로 남기고 요지(헤드라인)에서만 내린다.
     1차 패치(asksQuantity)는 '수량을 원하는가'를 물어 '탈북민 재입북 몇 명이야'를 통과시켰고,
     2차 패치(bareSubject=토큰 2개 이하)는 '탈북민 자살률'·'탈북민 결혼'을 통과시켰다.
     실측: 이 코퍼스에서 dims 를 가진 measure 는 defectorAge·defectorOrigin 60건뿐이라,
     그 중 한 칸만 상위 40위에 들어오면 질문이 무엇이든 33,501 이 만들어진다.
     면제 둘: ① 미래 질의는 '아직 발생하지 않았습니다'가 곧 답이다.
              ② 수치 주장 대조(numeric)는 checkNumeric 이 요지를 소유하므로 무해하다. */
  const residual = residualFocus(ix, Q, n, metric, dsKey, pool, dimName)
  const unsolicited = residual.length > 0 && !Q.win.future && !Q.numeric
  const scope = { windowLabel: Q.win.askedLabel || Q.win.label, timeScoped, outOfWindow, basis,
    unsolicited, residual, future: !!Q.win.future, targetYear: Q.time.year ?? null,
    /* hasPeriodic=false 여야만 '기간별로 나뉘어 있지 않습니다'라고 단정할 수 있다.
       true 면 '해당 기간 자료는 확인되지 않습니다'(모른다)로 물러선다. stale/frozen 과 같은 문법. */
    hasPeriodic: !!ix.periodicMetrics?.has(dsKey + '::' + metric),
    cumulativeSince: (basis === 'snapshot' && CUMULATIVE[dsKey]) ? CUMULATIVE[dsKey].since : null,
    asOfDate: pool.map(per).filter(Boolean).sort().pop() ||
      pool[0].rec.coverageEnd || pool[0].rec.asOf || null }

  const unit = pool[0]?.m.unit || null

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
    return { mode: 'distribution', metric, unit, dimName, genderFilter: g, ...scope,
      items, total, dataset: ix.data.datasets[pool[0].rec.datasetId], record: pool[0].rec }
  }

  // 합계 / 최대 / 최소
  const vals = pool.map(r => r.m.value)
  if (!vals.length) return null
  const sum = vals.reduce((a, b) => a + b, 0)
  const mx = pool.reduce((a, b) => (a.m.value > b.m.value ? a : b))
  const mn = pool.reduce((a, b) => (a.m.value < b.m.value ? a : b))
  const mode = n.aggregate === 'max' ? 'max' : n.aggregate === 'min' ? 'min' : 'sum'
  return { mode, metric, unit, genderFilter: g, dimName, ...scope,
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
  /* ov.searched 가 있으면 검색을 다시 하지 않는다 — answerAsync 가 리랭킹을 위해
     이미 한 번 돌렸기 때문이다. 없으면 지금 돌린다(동기 경로는 그대로다). */
  const { Q, hits: rawHits } = ov?.searched ?? search(ix, q, { limit: 300, ov })
  /* ★ 리랭킹 결과 반영 — BM25 가 낱말로 찾아 온 것을 뜻으로 걸러낸 결과다.
     점수가 매겨지지 않은 후보는 건드리지 않는다(LLM 이 일부만 답해도 무너지지 않게). */
  let hits = rawHits
  if (ov?.scores) {
    const keep = rawHits.filter(h => (ov.scores.get(h.r.id) ?? 9) >= JUDGE_KEEP_MIN)
    /* ★ 전부 지워지면 리랭킹을 통째로 무시한다.
       "북한 요즘 뭐함" 에서 실제로 12건 전부 1점을 받아 빈손이 됐다. 심사 자체는 틀리지 않았다 —
       특정 사실을 콕 집지 않은 질문이라 '주제만 겹친다'가 맞다. 다만 **그 결론이 빈손이면 안 된다.**
       자료는 실제로 있고, 이 서비스가 갈아엎은 실패가 바로 '확인이 어렵습니다'로 도망치는 것이다.
       정밀도를 올리려다 재현율을 0으로 만드는 것은 개선이 아니다.
       이때는 규칙 순위를 그대로 쓰고, 약한 매칭 표시(weakMatch)가 정직함을 대신 책임진다. */
    hits = keep.length ? keep : rawHits
  }
  const tn = topicNotice(Q)
  /* 관계 답변은 검색 결과를 **밀어내지 않고 덧붙는다.** 관계 말투가 아니거나
     그래프에 없는 사람이면 null 이라 기존 동작이 그대로 유지된다.
     근거가 0건이어도 관계는 답할 수 있다 — 문서가 아니라 집계이기 때문이다. */
  /* 관계 답변. 규칙(말투 정규식)이 1차이고, LLM 의도분류가 있으면 그것이 우선한다 —
     "장성택 상관이 누구야"·"김정은 오른팔" 처럼 내가 정규식에 넣지 않은 표현이
     실제로는 훨씬 많기 때문이다(실측: 내가 안 쓴 표현 23종 중 규칙은 12종만 잡았다). */
  const relation = relationAnswer(ix.gx, q, { intent: ov?.intent })
  /* 어휘 답변은 **문서와 무관하게** 성립한다 — 사전을 보는 것이지 문서를 찾는 게 아니다.
     그래서 적중 0건 경로보다 먼저 계산해 두고, 아래 두 반환 모두에서 쓴다. */
  const lexicon = lexiconAnswer(ix.lx, q, { intent: ov?.intent })
  if (!hits.length) return {
    level: lexicon ? 'lexicon_answer' : relation ? 'relation_answer' : 'no_evidence',
    Q, groups: [], numeric: null, topicNotice: tn, relation, lexicon }

  /* ★ 준비된 데이터셋 중 어느 것도 답할 수 없는 질문 유형이면, 문서를 근거로 올리지 않는다.
     어휘 질문이 그렇다 — 코퍼스에 남↔북 대응어가 0건이라 무엇을 찾아도 답이 아니다.
     실측 사고: "안녕하세요 북한말로?" → 「인민의 **안녕**」에 걸려 자강력제일주의 선전문을
     "확인된 가장 가까운 공식 기록"으로 제시했다. 동음이의어를 근거로 둔갑시킨 것이다.
     문서는 버리지 않고 참고로 남기되(refOnly), **답이라고 말하지 않는다.** */
  /* 규칙(어휘 정규식)이 1차, LLM 의도분류가 우선. 규칙이 못 잡는 표현이 실제로 많다 —
     "오징어를 북에서는 뭐라 그러나", "이거 북한식으로 하면" 같은 것들이다.
     의도가 lexicon 이면 어휘 자료의 미연동 안내로 보낸다(그 자료가 답할 질문이므로). */
  /* ★ 어휘 답변이 먼저다. 사전을 실었으면 "자료가 없다"고 말할 이유가 없다.
     찾았으면 대응어를, 없으면 **없다는 사실을** 답한다 — 둘 다 이 계층이 책임진다.
     문서 근거는 붙이지 않는다. 낱말 질문에 문서를 들이밀면 「인민의 안녕」 사고가 재발한다. */
  if (lexicon) {
    return { level: 'lexicon_answer', Q, topicNotice: tn, lexicon, relation,
      groups: [], numeric: null, agg: null, related: null, totalHits: hits.length }
  }

  const pending = pendingSourceFor(q) ??
    (ov?.intent?.type === 'lexicon' ? pendingSourceFor('북한말') : null)
  if (pending?.exclusive) {
    return { level: 'pending_only', Q, topicNotice: tn, pending, relation,
      groups: [], numeric: null, agg: null, related: null, totalHits: hits.length }
  }

  // ── 연혁 모드: 시간순 나열 ────────────────────────────────
  if (Q.listIntent) {
    const N = Q.wantCount || 20
    /* ★ 연혁은 **날짜 있는 기록**만 쓴다. 그런데 코퍼스의 62%(포털동향 42,788건)에
       날짜가 없다 — 응답에 날짜 필드가 아예 없는 API 라서다.
       상위 300만 보면 그중 192건이 날짜 없는 것이라 연혁 후보가 108건으로 쪼그라든다
       (실측 2026-08-13, "북한이 미사일 발사 언제언제 했니").
       연혁을 물었을 때는 더 깊이 본다 — 관련성 순서는 그대로 두고 창만 넓힌다. */
    let scan = hits
    if (hits.filter(h => h.r.occurredOn).length < N * 3) {
      const deep = ov?.searched && ov.searched.hits.length > hits.length
        ? ov.searched.hits : search(ix, q, { limit: 3000, ov }).hits
      const kept = ov?.scores
        ? deep.filter(h => (ov.scores.get(h.r.id) ?? 9) >= JUDGE_KEEP_MIN)
        : deep
      scan = kept.length ? kept : deep
    }
    const dated = scan.filter(h => h.r.occurredOn)
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
      groups: [], numeric: null, lookup: null, relation }
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
    related: lookupNumeric(ix, Q, hits), totalHits: hits.length, relation,
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

  /* ── 리랭킹·의도분류 ────────────────────────────────────────
     표준 RAG 파이프라인의 빠져 있던 단계다: 검색(재현율) → **리랭킹(정밀도)** → 조립.
     BM25 는 낱말만 맞춘다. "안녕하세요를 북한말로?" 가 「인민의 안녕」에 걸리는 것은
     어휘 매칭의 원리적 한계지 버그가 아니다 — 뜻을 보는 단계가 있어야 걸러진다.

     두 호출을 **병렬로** 던진다. 의도분류는 질문만 보고, 리랭킹은 규칙이 이미 만든
     후보만 본다 — 서로를 기다릴 이유가 없다. 그래서 지연은 2회분이 아니라 1회분이다.
     둘 다 실패하면 ov 가 비고, answer() 는 지금까지와 똑같이 동작한다(원칙 ④). */
  if (llm?.hasKeys?.() && (llm.rerankWithLLM || llm.intentWithLLM)) {
    const searched = search(ix, q, { limit: 300, ov })
    ov.searched = searched
    const cands = candidatesOf(searched.hits)
    const [intent, scores] = await Promise.all([
      llm.intentWithLLM?.(q).catch(() => null) ?? null,
      cands.length ? (llm.rerankWithLLM?.(q, cands).catch(() => null) ?? null) : null,
    ])
    if (intent) { ov.intent = intent; used.push('intent') }
    if (scores) {
      // 후보 번호 → 레코드 id 로 옮겨 담는다. answer() 는 id 로만 판단한다.
      const byId = new Map()
      for (const c of cands) { const s = scores.get(c.i); if (s !== undefined) byId.set(c.hit.r.id, s) }
      if (byId.size) { ov.scores = byId; used.push('rerank') }
    }
  }

  const a = answer(ix, q, { ...opts, ov })
  a.llmUsed = used
  return a
}
