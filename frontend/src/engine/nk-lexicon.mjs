// 어휘 답변 — "도시락 북한말로 뭐야" 에 답하는 계층
//
// 왜 별도 계층인가: 낱말 하나를 묻는 질문은 **문서 랭킹으로 풀 수 없다.**
//   실제로 "안녕하세요를 북한말로?" 가 「인민의 **안녕**과 번영」에 걸려
//   자강력제일주의 선전문을 "가장 가까운 공식 기록"으로 내놓은 적이 있다.
//   안녕(인사)과 안녕(평안)은 다른 말인데 글자가 같다 — 어휘 매칭의 원리적 한계다.
//   필요한 것은 문서가 아니라 **대응어 사전**이다.
//
// 자료 (통일부, 2026-08-12 수집)
//   · 남북한 언어비교 21,000여 쌍 — 도시락→곽밥·밥곽, 주스→과실단물·과즙수
//   · 북한 용어사전 — 표제어와 뜻풀이
//
// ★ 가장 중요한 규칙: **없으면 없다고 말한다.**
//   "안녕하세요" 는 이 자료에 없다. 남북 표기가 같아서 대응어 목록에 오르지 않은 것이다.
//   비슷한 낱말을 가져와 답인 척하면 그게 바로 이 서비스가 갈아엎은 실패다.

/* 어휘 질문의 표지. **질문 문법 전체를 맞추려 하지 않는다** —
   "안녕하세요 북한말로" 처럼 의문사가 아예 없는 형태가 흔하다.
   표지어가 있으면 어휘 질문으로 보고, 낱말은 아래에서 따로 뽑는다. */
/* ⚠ '북한에서' 하나만으로는 어휘 질문이 아니다. 그 말이 들어간 보통 문장이 훨씬 많다 —
   "요즘 뉴스보니까 **북한에서** 사람들이 많이 내려온다던데" 가 어휘 질문으로 잡혀
   탈북민 통계 대신 사전을 뒤졌다(wild 세트가 잡아냈다).
   '북한말/북한어/북한식/문화어'는 그 자체로 어휘 표지지만,
   '북(한)에서'는 **말·표현을 묻는 맥락**이 붙어야 표지가 된다. */
const NK_LOC = '북한?에(?:서는?|선)'
const SAY = '(?:뭐|무엇|어떻게|뭐라|어케)'
const WORD_N = '(?:말|단어|낱말|표현|용어|어휘)'
const MARK_NK = new RegExp([
  '북한말', '북한어', '북한식', '문화어',
  `${NK_LOC}\\s*${SAY}`,
  `${NK_LOC}\\s*(?:쓰는|쓰이는|사용하는)?\\s*${WORD_N}`,
].join('|'))
const KO_LOC = '(?:남한?|한국)에(?:서는?|선)'
const MARK_KO = new RegExp([
  '남한말', '한국말', '우리말',
  `${KO_LOC}\\s*${SAY}`,
  `${KO_LOC}\\s*(?:쓰는|쓰이는|사용하는)?\\s*${WORD_N}`,
].join('|'))
/* '무슨 뜻' 계열만 잡으면 가장 흔한 형태를 놓친다 — "노농적위군이 뭐야"(실측).
   다만 '뭐야'를 맨몸으로 잡으면 "북한 요즘 뭐야" 같은 것까지 어휘 질문이 된다.
   **낱말 + 조사 + 뭐야** 라는 모양일 때만 인정한다. 사전에 있는지는 뒤에서 다시 거른다. */
/* 명시형 — 이 표현이 있으면 낱말을 묻는 것이 분명하다. 못 찾아도 '미등재'라고 답한다. */
const EXPLICIT_MEAN = /(무슨\s*뜻|뜻이\s*(뭐|무엇)|무슨\s*말|의미가\s*(뭐|무엇))/
const ASK_MEAN = new RegExp([
  '무슨\\s*뜻', '뜻이\\s*(뭐|무엇)', '무슨\\s*말', '의미가\\s*(뭐|무엇)',
  '[가-힣]{2,}(?:이|가)\\s*(?:뭐야|뭔데|뭡니까|무엇인가|무엇입니까|뭐임)',
  '[가-힣]{2,}\\s*(?:이|가)?\\s*무슨\\s*(?:뜻|말|의미)',
].join('|'))

/* 낱말 뽑기는 **어절 단위**로 한다.
   ⚠ 전역 정규식으로 조사를 지우면 낱말 안쪽을 파먹는다 —
     '도시락'에서 '도'가 조사로 잡혀 '시락'이 됐다(실측). 안쪽은 건드리지 않는다.
   표지 어절은 통째로 버리고, 남은 어절에서 **끝의** 조사만 뗀다. */
const DROP_WORD = /^(북한말로|북한말|북한어로|북한어|북한식으로|북한식|북에서는|북에선|북에서|북한에서는|북한에선|북한에서|문화어로|문화어|남한말로|남한말|한국말로|한국말|우리말로|우리말|뭐라고|뭐라|뭐야|뭐지|뭔가요|무엇|무엇이|어떻게|무슨|뜻|뜻이|뜻이야|의미|의미가|불러|부르나|부르는지|말해|말하나|하나요|해요|해|알려줘|알려|주세요|주라|줘|좀|그럼|그거|이거|저거)[?!.,]*$/
/* 뗄 조사는 **모호하지 않은 것만** 고른다.
   요·에·도·만·과·와 는 낱말 끝에 흔히 오는 글자라 떼면 낱말이 부서진다 —
   '안녕하세요'가 '안녕하세'가 됐다(실측). 필요(要)·중요·주요 도 같은 사고를 낸다.
   은/는/이/가/을/를/의/으로/이라고/라고/에서/이랑 은 낱말 끝 글자로 오는 일이 드물다. */
const TAIL = /(으로|이라고|라고|에서|이랑|은|는|이|가|을|를|의)[?!.,]*$/

export function buildLexicon(raw) {
  const lx = { n: 0, ko: new Map(), nk: new Map(), term: new Map(), source: raw?.source ?? null }
  if (!raw) return lx
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v) }
  for (const [ko, nk] of raw.pairs ?? []) {
    push(lx.ko, ko, nk)          // 남한말 → 북한말
    push(lx.nk, nk, ko)          // 북한말 → 남한말
    lx.n++
  }
  for (const [head, def, cat] of raw.terms ?? []) {
    if (!lx.term.has(head)) lx.term.set(head, { def, cat })
  }
  return lx
}

/* 질문에서 찾을 낱말을 뽑는다.
   껍데기를 벗기고 남은 것이 낱말이다. 여러 개면 가장 긴 것을 쓴다
   (짧은 조각이 우연히 사전에 걸리는 것을 막는다). */
export function wordOf(q, intent, lx) {
  /* 1순위는 LLM 의도분류가 준 subject 다 — 말투가 제각각이라 규칙으로는 다 못 잡는다.
     실측: "안녕하세요 북한말로" 에 분류기는 subject='안녕하세요' 를 정확히 냈다. */
  const fromIntent = String(intent?.subject ?? '').trim()
  /* 조사를 뗀 형태(bare)와 안 뗀 형태(whole)를 나눠 담는다.
     ⚠ 한 바구니에 넣고 길이순으로 고르면 조사가 붙은 쪽이 항상 이긴다 —
       "북한말로 화장실이 뭐야" 에서 '화장실이'가 뽑혔다(실측). 우선순위를 분리한다.
     ⚠ 조사를 떼는 것도 위험하다 — '과실단물'의 '단물'처럼 낱말 끝이 조사와 겹칠 수 있으니
       사전 대조를 먼저 하고, 대조에 실패했을 때만 bare 를 쓴다. */
  const bares = [], wholes = []
  if (fromIntent.length >= 2) bares.push(fromIntent)

  for (const w of String(q ?? '').split(/\s+/)) {
    const t = w.trim()
    if (!t || DROP_WORD.test(t)) continue
    const whole = t.replace(/[?!.,'"]/g, '')
    const bare = whole.replace(TAIL, '')
    if (whole.length >= 2) wholes.push(whole)
    if (bare.length >= 2 && bare !== whole) bares.push(bare)
  }
  const all = [...bares, ...wholes]
  if (!all.length) return ''
  /* ① 사전에 실제로 있는 후보가 있으면 그것이 답이다(조사 유무와 무관하게 정확하다).
     ② 없으면 조사를 뗀 형태 중 가장 긴 것. ③ 그마저 없으면 원형 중 가장 긴 것. */
  if (lx) {
    const hit = all.find(c => lx.ko.has(c) || lx.nk.has(c) || lx.term.has(c))
    if (hit) return hit
  }
  const pick = a => a.slice().sort((x, y) => y.length - x.length)[0]
  return (bares.length ? pick(bares) : pick(wholes)) ?? ''
}

/**
 * 어휘 답변.
 * 찾았으면 대응어를, **못 찾았으면 못 찾았다고** 돌려준다(빈손이 아니라 명시적 부재).
 * 어느 쪽이든 이 계층이 답을 책임지므로, 문서 근거를 억지로 붙이지 않아도 된다.
 */
export function lexiconAnswer(lx, q, { intent = null, limit = 6 } = {}) {
  const s = String(q ?? '')
  /* 우선순위: LLM 의도분류가 있으면 **그것이 결정한다.**
     규칙을 뒤에 또 얹으면 분류기가 person 이라고 한 것까지 어휘로 끌고 온다 —
     "김정은이 뭐야" 가 인물 카드 대신 '대응어 목록에 없습니다'로 답하게 된다(실측).
     분류기가 없을 때만 규칙으로 판정한다. */
  /* 표지를 두 등급으로 나눈다.
     ㉮ 명시형 — '북한말로', '무슨 뜻'. 낱말을 묻는 게 분명하다.
        못 찾으면 **못 찾았다고 답한다**(그게 이 계층의 일이다).
     ㉯ 느슨형 — 'X이 뭐야'. 가장 흔한 형태지만 낱말 질문이 아닐 때가 많다 —
        "김여정 직책이 뭐야"는 인물 질문이다(wild 가 잡았다).
        느슨형은 **사전에 실제로 있을 때만** 어휘로 인정하고, 없으면 검색에 넘긴다. */
  const explicit = MARK_NK.test(s) || MARK_KO.test(s) || EXPLICIT_MEAN.test(s)
  const loose = ASK_MEAN.test(s)
  const isLexQ = intent?.type ? intent.type === 'lexicon' : (explicit || loose)
  if (!isLexQ) return null

  /* ★ 사전이 없어도 **문서로 넘기지 않는다.**
     낱말 질문에 문서를 붙이면 「인민의 안녕」으로 "안녕하세요"에 답하는 사고가 그대로 재발한다.
     전에는 데이터셋이 pending 이라 미연동 안내가 그 역할을 했는데, ready 로 바꾸면서
     그 안전망이 사라졌다(벤치가 4/4 → 0/4 로 떨어져 잡아냈다).
     자료 상태와 무관하게 **질문 유형으로** 막는다. */
  if (!lx?.n) return { kind: 'unavailable', word: wordOf(q, intent, null), source: null }

  const byIntentLex = intent?.type === 'lexicon'
  const word = wordOf(q, intent, lx)
  if (!word || word.length < 2) return null

  /* 방향 — '북한말로 뭐야'(남→북)가 기본이다. 사용자가 남한말을 대고 묻는 경우가 대부분이다.
     '남한말로'라고 명시했거나, 그 낱말이 북한말 쪽에만 있으면 반대로 본다. */
  const toNK = lx.ko.get(word) ?? null
  const toKO = lx.nk.get(word) ?? null
  const wantKO = MARK_KO.test(s)
  const dir = wantKO ? 'toKO' : (toNK ? 'toNK' : (toKO ? 'toKO' : 'toNK'))
  const found = dir === 'toNK' ? toNK : toKO

  const term = lx.term.get(word) ?? null

  /* 느슨형인데 사전에 없으면 어휘 질문이 아니었던 것이다 — 검색이 답하게 둔다. */
  if (!explicit && !byIntentLex && !found?.length && !term) return null

  if (found?.length || term) {
    return {
      kind: 'found', word, dir,
      words: [...new Set(found ?? [])].slice(0, limit),
      term,
      source: lx.source,
    }
  }

  /* ★ 못 찾았을 때. 여기서 비슷한 낱말을 답인 척 내놓으면 안 된다.
     부분일치는 **'혹시 이건가요'로만** 쓰고, 답이 아니라고 분명히 표시한다. */
  const near = []
  for (const [k, v] of lx.ko) {
    if (near.length >= 4) break
    if (k !== word && (k.includes(word) || word.includes(k)) && k.length >= 2) near.push([k, v[0]])
  }
  return { kind: 'missing', word, dir, near, source: lx.source }
}
