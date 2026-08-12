// 리랭킹·의도분류 계층 — 검색과 답변 사이에 빠져 있던 단계
//
// 왜 필요한가: BM25 는 **낱말**을 맞춘다. **뜻**은 보지 않는다.
//   그래서 "안녕하세요를 북한말로?" 가 「인민의 **안녕**」에 걸려
//   자강력제일주의 선전문을 "확인된 가장 가까운 공식 기록"으로 내놓는 일이 실제로 벌어졌다.
//   안녕(인사)과 안녕(평안)은 다른 말인데 글자가 같다. 어휘 매칭으로는 원리적으로 못 가른다.
//
//   정규식을 하나씩 덧대는 방식으로는 수렴하지 않는다. 같은 뿌리에서
//   델리만쥬·제주도·"장성택 상관이 누구야" 가 계속 나온다.
//
// 표준 RAG 파이프라인은 이 문제를 **리랭킹**으로 푼다:
//     질의 이해 → 검색(재현율 우선) → ★리랭킹(정밀도 우선) → 근거기반 생성
//   우리 엔진에는 이 ★ 단계가 통째로 없었다. 이 파일이 그 단계다.
//
// 4원칙은 그대로 지킨다 (CLAUDE.md §5)
//   ① 규칙이 먼저 — 후보는 BM25 가 만든다. LLM 은 후보를 만들지 않는다.
//   ② LLM 은 해석만 — **고르기만 하고 쓰지 않는다.** 출력이 번호와 점수뿐이라
//      근거·수치·판정을 생성할 문법 자체가 없다.
//   ③ 스키마 밖이면 폐기 — 검증에 실패하면 규칙 순위를 그대로 쓴다.
//   ④ 네트워크가 죽어도 동작 — 호출 실패는 전부 조용히 null 이고, 그러면 현행 그대로다.
//
// 출력 스키마가 곧 남용 방지책이기도 하다. 이 엔드포인트로는 자유 문장을 못 얻는다.

/* ── 프롬프트는 서버(프록시)가 고정한다. 클라이언트는 질의와 후보만 보낸다 ── */

export const RERANK_PROMPT = `너는 검색 결과 심사자다. **답을 쓰지 마라. 고르기만 하라.**

질문 하나와 후보 자료 목록(번호·제목)이 주어진다.
각 후보가 **그 질문에 대한 답의 근거가 될 수 있는지**를 0~3으로 매겨라.

  3 = 이 자료가 질문에 직접 답한다
  2 = 직접 답은 아니지만 답의 근거로 쓸 수 있다
  1 = 주제만 겹친다. 물어본 것에는 답하지 않는다
  0 = 무관하다

반드시 지킬 것
· **같은 낱말이 들어 있어도 뜻이 다르면 0이다.**
  예) 질문 "안녕하세요를 북한말로?" · 후보 "인민의 안녕과 번영"
      → 안녕(인사말)과 안녕(평안)은 다른 말이다. 0.
· 질문이 묻는 **대상**과 자료가 말하는 대상이 다르면 0이다.
  예) 질문 "북한이 러시아에 파병했나" · 후보 "북한이탈주민 입국현황" → 0.
· 질문이 **무엇을** 묻는지 보라. 시점·수량·인물관계·용어뜻 중 무엇을 원하는지와
  자료가 주는 것이 어긋나면 2를 넘기지 마라.
· **확신이 없으면 낮게 매겨라.** 빠뜨리는 것보다, 엉뚱한 것을 근거라고 부르는 것이 더 나쁘다.
· 단, **열린 질문에는 주제 겹침이 곧 답이다.** "북한 요즘 뭐함", "최근 어때", "무슨 일 있어"
  처럼 특정 사실을 콕 집지 않는 질문이면, 그 주제의 최근 기록은 2점 이상이다.
  이런 질문에 0~1점만 주면 "아무것도 못 찾았다"가 되는데, 자료는 실제로 있다.

출력은 JSON 하나뿐이다. 설명·문장을 덧붙이지 마라.
{"scores":[{"i":후보번호,"s":0..3}]}`

export const INTENT_PROMPT = `너는 질문 분류기다. **답을 쓰지 마라. 분류만 하라.**

한국어 질문 하나가 주어진다. 사용자가 **무엇을 원하는지**를 아래 중 하나로 고르라.
말투·맞춤법·띄어쓰기는 제각각이다. 표현이 아니라 **뜻**을 보라.

  fact      어떤 사실이 맞는지, 무슨 일이 있었는지
  quantity  숫자·규모·횟수 ("몇 명", "얼마나", "규모가")
  relation  사람과 사람의 관계 — 누구와 다녔나, 누구를 수행했나, 측근·심복·오른팔이
            누구냐, 누구 밑에 있었나, 상관·윗선이 누구냐, 둘이 아는 사이냐 등
  person    특정 인물이 누구인지, 직책·생몰 등 신상
  lexicon   말·용어의 뜻이나 북한식 표현 ("북한말로 뭐라고", "무슨 뜻이야")
  timeline  시간순 나열 ("무슨 일 있었어", "연혁", "쭉 알려줘")
  status    지금도 하고 있는지, 끝났는지
  other     위 어디에도 안 맞음

그리고 질문의 **주어(누구/무엇에 대한 질문인지)** 를 원문 그대로 뽑아라. 없으면 빈 문자열.
relation 이면 관계의 **방향**도 고르라.
  up   = 이 사람이 **누구를 모셨는지**(윗선) — "누구 수행했나", "상관이 누구", "누구 밑에"
  down = 이 사람을 **누가 모셨는지**(아랫선) — "측근", "심복", "오른팔", "수행원", "밑에 누가"
  both = 방향이 분명하지 않음

출력은 JSON 하나뿐이다.
{"type":"...","subject":"...","direction":"up|down|both"}`

/* ── 검증 — 스키마 밖이면 전부 폐기한다 ─────────────────────── */

const TYPES = new Set(['fact', 'quantity', 'relation', 'person', 'lexicon', 'timeline', 'status', 'other'])
const DIRS = new Set(['up', 'down', 'both'])

export function validateScores(raw, n) {
  const arr = raw?.scores
  if (!Array.isArray(arr) || !arr.length) return null
  const out = new Map()
  for (const x of arr) {
    const i = Number(x?.i), s = Number(x?.s)
    if (!Number.isInteger(i) || i < 0 || i >= n) return null      // 범위 밖이면 통째로 폐기
    if (!Number.isFinite(s) || s < 0 || s > 3) return null
    out.set(i, s)
  }
  return out
}

export function validateIntent(raw) {
  const t = String(raw?.type || '')
  if (!TYPES.has(t)) return null
  const d = String(raw?.direction || 'both')
  return {
    type: t,
    subject: String(raw?.subject || '').slice(0, 40),
    direction: DIRS.has(d) ? d : 'both',
  }
}

/* ── 후보 만들기 ────────────────────────────────────────────
   제목만 보낸다. 본문을 보내면 토큰이 폭증하고, 제목이 이 코퍼스에서 가장 변별적이다
   (통일부 채록 제목은 「누가·무엇을·어떻게」가 한 줄에 다 들어 있다). */
export const RERANK_MAX = 12          // 후보 수 상한 — 지연·비용의 상한이기도 하다
export const TITLE_MAX = 80

export function candidatesOf(hits, { max = RERANK_MAX } = {}) {
  const seen = new Set()
  const out = []
  for (const h of hits) {
    if (out.length >= max) break
    if (seen.has(h.r.id)) continue
    seen.add(h.r.id)
    const t = String(h.r.title || '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX)
    if (!t) continue
    out.push({ i: out.length, t, hit: h })
  }
  return out
}

/** 점수를 히트에 도로 붙인다. 점수가 없는 후보는 **버리지 않고** 규칙 순위를 유지한다
    — LLM 이 일부만 답해도 서비스가 무너지지 않게 한다. */
export const KEEP_MIN = 2             // 2점 미만(=주제만 겹침·무관)은 근거에서 뺀다

export function applyScores(cands, scores, { keepMin = KEEP_MIN } = {}) {
  const kept = [], dropped = []
  for (const c of cands) {
    const s = scores.get(c.i)
    if (s === undefined) { kept.push(c.hit); continue }
    c.hit.judge = s
    ;(s >= keepMin ? kept : dropped).push(c.hit)
  }
  return { kept, dropped }
}
